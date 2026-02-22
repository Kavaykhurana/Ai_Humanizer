import { GoogleGenAI } from "@google/genai";

// Simple in-memory rate limiter
const rateLimit = new Map<string, { count: number, lastReset: number }>();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 20; // 20 requests per minute

export default async function handler(req: any, res: any) {
  // Rate Limiting Logic
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded) || 'unknown';
  const now = Date.now();
  let record = rateLimit.get(ip as string);
  if (!record || (now - record.lastReset > WINDOW_MS)) {
    record = { count: 0, lastReset: now };
  }
  if (record.count >= MAX_REQUESTS) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }
  record.count++;
  rateLimit.set(ip as string, record);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { apiKey } = req.body;
    if (!apiKey) {
      return res.status(400).json({ error: "API Key is required" });
    }

    const ai = new GoogleGenAI({ apiKey });
    await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: "Hi" }] }],
    });
    
    res.status(200).json({ status: "valid" });
  } catch (error: any) {
    console.error("Verification Error:", error);
    res.status(400).json({ status: "invalid", error: error.message });
  }
}
