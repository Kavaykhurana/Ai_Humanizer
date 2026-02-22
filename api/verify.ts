import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
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
