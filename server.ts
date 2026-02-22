import express from "express";
import { createServer as createViteServer } from "vite";
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Simple in-memory rate limiter
  const rateLimit = new Map<string, { count: number, lastReset: number }>();
  const WINDOW_MS = 60 * 1000; // 1 minute
  const MAX_REQUESTS = 20; // 20 requests per minute per IP

  const rateLimiterMiddleware = (req: any, res: any, next: any) => {
    // Use X-Forwarded-For if behind proxy (like Vercel), else socket address
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded) || req.socket.remoteAddress || 'unknown';
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
    next();
  };

  app.use(express.json());
  app.use('/api/', rateLimiterMiddleware); // Apply to all API routes

  // API Route for verifying text
  app.post("/api/verify", async (req, res) => {
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
      
      res.json({ status: "valid" });
    } catch (error: any) {
      console.error("Verification Error:", error);
      res.status(400).json({ status: "invalid", error: error.message });
    }
  });

  // API Route for rewriting text
  app.post("/api/rewrite", async (req, res) => {
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
        res.json({ text: responseText });

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
          
          res.json({ text: result.text });
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
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static file serving (for Vercel, this part is handled by Vercel's build output usually, 
    // but for local testing of build)
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
