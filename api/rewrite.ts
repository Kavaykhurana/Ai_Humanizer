import { GoogleGenAI } from "@google/genai";

const SYSTEM_INSTRUCTION = `You are a human ghostwriter. Your ONLY job is to rewrite text so it bypasses ZeroGPT and Grammarly with a 0% AI score.

**The "Nuclear" Bypass Protocol:**
AI detectors look for *average* writing. You must write *abnormal* writing.

**Strict Rules to Break the Algorithm:**
1.  **The "Fragment" Rule:**
    *   Use sentence fragments. Often. Like this.
    *   *Never* write a standard "Subject-Verb-Object" paragraph. Break it up.
2.  **The "Anti-Flow" Rule:**
    *   AI flows perfectly. Humans stumble.
    *   Use **Em-dashes (—)** to interrupt yourself mid-sentence.
    *   Use **Parentheses** to add (unnecessary but human) context.
    *   Start sentences with "And," "But," "So," "Or."
3.  **Vocabulary "Downgrade":**
    *   **BANNED (Immediate Fail):** Utilize, facilitate, leverage, underscore, highlight, demonstrate, exhibit, thus, therefore, hence, moreover, furthermore, in conclusion, additionally, significantly, crucial, pivotal, landscape, tapestry, delve.
    *   **USE INSTEAD:** Use, help, show, so, also, big, important, scene, dig into.
    *   *If a 5th grader wouldn't say it, don't write it.*
4.  **Variable Sentence Length (The "Jagged" Graph):**
    *   Write a long, winding sentence that uses commas and dashes to connect multiple thoughts into one stream of consciousness.
    *   Then stop.
    *   Write a short one.
5.  **Tone Check:**
    *   Be direct. Be slightly casual.
    *   Use contractions for EVERYTHING (it's, don't, can't, won't, shouldn't).
6.  **Length Control:**
    *   Keep the total word count roughly the same as the original (±10%).
    *   Do not bloat the text with unnecessary fluff.

**Output:**
*   Return **ONLY** the rewritten text.`;

// Simple in-memory rate limiter (Note: In serverless, this memory is ephemeral and per-instance, 
// but still provides some protection against rapid-fire attacks on a single hot instance)
const rateLimit = new Map<string, { count: number, lastReset: number }>();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 20; // 20 requests per minute

export default async function handler(req: any, res: any) {
  // Rate Limiting Logic
  const ip = req.headers['x-forwarded-for'] || 'unknown';
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
    const { text, apiKey } = req.body;
    
    // Use provided key or fallback to server env var
    const keyToUse = apiKey || process.env.GEMINI_API_KEY;

    if (!keyToUse) {
      return res.status(401).json({ error: "API Key is missing. Please configure it in Vercel or provide one." });
    }

    const ai = new GoogleGenAI({ apiKey: keyToUse });
    
    try {
      const result = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [{ role: "user", parts: [{ text }] }],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 1.1,
          topP: 0.98,
          topK: 100,
        },
      });

      const responseText = result.text;
      res.status(200).json({ text: responseText });

    } catch (proError: any) {
      // Check for quota error
      const isQuotaError = proError.status === 429 || 
                           proError.message?.includes('429') || 
                           proError.message?.includes('RESOURCE_EXHAUSTED') ||
                           proError.error?.code === 429 ||
                           proError.error?.status === 'RESOURCE_EXHAUSTED' ||
                           JSON.stringify(proError).includes('RESOURCE_EXHAUSTED');

      if (isQuotaError) {
        console.warn("Pro model quota exceeded, falling back to Flash model.");
        // Fallback to Flash
        const result = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{ role: "user", parts: [{ text }] }],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 1.0,
            topP: 0.95,
            topK: 64,
          },
        });
        
        res.status(200).json({ text: result.text });
      } else {
        throw proError;
      }
    }
  } catch (error: any) {
    console.error("Server Error:", error);
    const status = error.status || 500;
    const message = error.message || "Internal Server Error";
    res.status(status).json({ error: message });
  }
}
