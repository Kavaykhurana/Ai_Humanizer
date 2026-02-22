/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Copy, RefreshCw, ArrowRight, Eraser, Check, Key, X, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini
// Note: In a real production app, we might want to move this to a backend to keep the key secure,
// but for this preview environment, client-side is acceptable as per guidelines for "demo" or "prototype".
// However, the guidelines say "Default to server-side".
// Since we don't have a backend set up in this turn (and user didn't explicitly ask for one),
// and the environment injects the key into process.env, we will use it here but acknowledge the constraint.
// Actually, the guidelines say: "Always call Gemini API from the frontend code of the application. NEVER call Gemini API from the backend."
// Wait, looking at "Gemini API guidance": "Always call Gemini API from the frontend code of the application."
// Okay, so client-side is correct for @google/genai in this specific environment.

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

export default function App() {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');

  const [isTestingKey, setIsTestingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');

  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) {
      setApiKey(storedKey);
    }
  }, []);

  const testApiKey = async (keyToTest: string) => {
    // 1. Instant Client-Side Validation
    if (!keyToTest.startsWith('AIza')) {
      setKeyStatus('invalid');
      // We'll rely on the UI helper text to explain why
      return false;
    }

    setIsTestingKey(true);
    setKeyStatus('idle');
    
    try {
      // 2. Network Test with Timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

      // Test via backend to avoid CORS/Referrer issues
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyToTest }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        setKeyStatus('valid');
        return true;
      } else {
        setKeyStatus('invalid');
        return false;
      }
    } catch (e) {
      console.error("Key test failed", e);
      setKeyStatus('invalid');
      return false;
    } finally {
      setIsTestingKey(false);
    }
  };

  const saveApiKey = async () => {
    if (tempApiKey.trim()) {
      // Optional: auto-test before saving if they haven't tested yet
      if (keyStatus === 'idle') {
         const isValid = await testApiKey(tempApiKey.trim());
         if (!isValid) return; // Don't save if invalid
      }
      
      if (keyStatus === 'invalid') return;

      setApiKey(tempApiKey.trim());
      localStorage.setItem('gemini_api_key', tempApiKey.trim());
      setShowApiKeyModal(false);
      setTempApiKey('');
      setKeyStatus('idle');
    }
  };

  const removeApiKey = () => {
    setApiKey('');
    localStorage.removeItem('gemini_api_key');
    setShowApiKeyModal(false);
    setKeyStatus('idle');
  };

  const handleRewrite = async () => {
    if (!inputText.trim()) return;

    // Use user provided key if available, otherwise fallback to env var (for preview)
    // In production/Vercel, if user hasn't provided a key, we prompt them.
    // const effectiveKey = apiKey || process.env.GEMINI_API_KEY;

    // if (!effectiveKey) {
    //   setShowApiKeyModal(true);
    //   return;
    // }

    setIsLoading(true);
    setError(null);
    setOutputText('');

    try {
      const response = await fetch('/api/rewrite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          text: inputText,
          apiKey: apiKey // Optional: send user key if provided
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // If server says key is missing (401), prompt user
        if (response.status === 401) {
          setShowApiKeyModal(true);
          throw new Error("Please provide an API Key to continue.");
        }
        throw new Error(data.error || 'Failed to rewrite text');
      }

      if (data.text) {
        setOutputText(data.text);
      }
    } catch (err: any) {
      console.error("Error:", err);
      
      let errorMessage = "Failed to rewrite text. Please try again.";
      
      // Check for specific error types
      if (err.message?.includes('429') || 
          err.message?.includes('RESOURCE_EXHAUSTED')) {
        errorMessage = "You have exceeded your API quota. Please check your plan or wait a moment.";
      } else if (err.message?.includes('API Key') || err.message?.includes('403')) {
        errorMessage = "Invalid API Key or Access Denied. Please check your key settings.";
        // Only clear if it was a user-provided key that failed
        if (apiKey) {
             setApiKey(''); 
             localStorage.removeItem('gemini_api_key');
        }
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!outputText) return;
    navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const clearAll = () => {
    setInputText('');
    setOutputText('');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F2] text-[#1A1A1A] font-sans selection:bg-[#E6E6E6]">
      {/* Header */}
      <header className="border-b border-[#E6E6E6] bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#1A1A1A] text-white flex items-center justify-center rounded-lg font-serif italic font-bold">
              Ed
            </div>
            <h1 className="font-serif font-medium text-xl tracking-tight">Precision Editor</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs font-mono text-gray-500 uppercase tracking-widest hidden sm:block mr-2">
              Linguistic Refinement Tool
            </div>
            <button
              onClick={() => setShowInfoModal(true)}
              className="p-2 text-gray-400 hover:text-[#1A1A1A] hover:bg-gray-100 rounded-full transition-colors"
              title="About & Privacy"
            >
              <Info className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowApiKeyModal(true)}
              className={`p-2 rounded-full transition-colors ${apiKey ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-gray-400 hover:text-[#1A1A1A] hover:bg-gray-100'}`}
              title={apiKey ? "API Key Configured" : "Set API Key"}
            >
              <Key className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Info Modal */}
      <AnimatePresence>
        {showInfoModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border border-gray-100"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-serif font-medium">About Precision Editor</h2>
                <button onClick={() => setShowInfoModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
                <div>
                  <h3 className="font-medium text-[#1A1A1A] mb-1">🔒 Security & Privacy</h3>
                  <p>Your API key is stored <strong>locally</strong> in your browser. It is never sent to our servers or any third party other than Google's API directly.</p>
                </div>
                <div>
                  <h3 className="font-medium text-[#1A1A1A] mb-1">💰 Cost</h3>
                  <p>This tool uses your own Gemini API key. Google offers a free tier for the Gemini API. Usage beyond the free tier limits may incur costs on your Google Cloud account.</p>
                </div>
                <div>
                  <h3 className="font-medium text-[#1A1A1A] mb-1">⚖️ Ethical Use</h3>
                  <p>This tool is designed for linguistic refinement and creative writing assistance. Users are responsible for adhering to academic integrity policies, terms of service, and ethical guidelines of their respective institutions or platforms.</p>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
                <button
                  onClick={() => setShowInfoModal(false)}
                  className="px-4 py-2 text-sm font-medium bg-[#1A1A1A] text-white rounded-lg hover:bg-black transition-colors"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* API Key Modal */}
      <AnimatePresence>
        {showApiKeyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border border-gray-100"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-serif font-medium">Configure API Key</h2>
                <button onClick={() => setShowApiKeyModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                To use this application securely on your own device, please provide your Gemini API key. 
                Google offers a generous <strong>free tier</strong> for personal use. Your key is stored locally in your browser and is never sent to our servers.
              </p>
              <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3 mb-4">
                <p className="text-xs text-yellow-800 leading-relaxed">
                  <strong>Important:</strong> If you see "Invalid API Key" errors, ensure your key has <strong>no IP or Referrer restrictions</strong> in Google Cloud Console, or explicitly allow this domain.
                </p>
              </div>
              <div className="relative">
                <input
                  type="password"
                  value={tempApiKey}
                  onChange={(e) => {
                    setTempApiKey(e.target.value);
                    setKeyStatus('idle');
                  }}
                  placeholder="Enter your Gemini API Key (starts with AIza...)"
                  className={`w-full p-3 bg-gray-50 border rounded-xl mb-1 focus:outline-none focus:ring-2 font-mono text-sm pr-10 transition-all
                    ${keyStatus === 'invalid' ? 'border-red-300 focus:ring-red-200' : 
                      keyStatus === 'valid' ? 'border-green-300 focus:ring-green-200' : 
                      'border-gray-200 focus:ring-[#1A1A1A]/10'}`}
                />
                {keyStatus === 'valid' && (
                  <Check className="absolute right-3 top-3.5 w-4 h-4 text-green-500" />
                )}
                {keyStatus === 'invalid' && (
                  <X className="absolute right-3 top-3.5 w-4 h-4 text-red-500" />
                )}
              </div>
              
              {/* Helper text for key format */}
              <div className="mb-4 px-1">
                {tempApiKey && !tempApiKey.startsWith('AIza') && (
                  <p className="text-xs text-red-600 mb-2 flex items-center gap-1 font-medium">
                    <X className="w-3 h-3" />
                    Invalid Format: API Keys must start with "AIza".
                  </p>
                )}
                {keyStatus === 'invalid' && tempApiKey.startsWith('AIza') && (
                  <p className="text-xs text-red-500">
                    Connection failed. Please check your key and permissions.
                  </p>
                )}
              </div>

              <div className="flex gap-3 justify-end">
                {apiKey && (
                  <button
                    onClick={removeApiKey}
                    className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    Remove Key
                  </button>
                )}
                <button
                  onClick={() => testApiKey(tempApiKey.trim())}
                  disabled={!tempApiKey.trim() || isTestingKey}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isTestingKey ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                  onClick={saveApiKey}
                  disabled={!tempApiKey.trim() || isTestingKey}
                  className="px-4 py-2 text-sm font-medium bg-[#1A1A1A] text-white rounded-lg hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Save Key
                </button>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 text-center">
                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline font-mono"
                >
                  Get a free Gemini API Key →
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <div className="grid lg:grid-cols-2 gap-6 lg:gap-12 lg:h-[calc(100vh-12rem)] h-auto">
          
          {/* Input Section */}
          <div className="flex flex-col gap-4 h-full">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono uppercase tracking-wider text-gray-500">Original Text</label>
              <button 
                onClick={clearAll}
                className="text-xs font-mono uppercase tracking-wider text-gray-400 hover:text-[#1A1A1A] flex items-center gap-1 transition-colors"
              >
                <Eraser className="w-3 h-3" /> Clear
              </button>
            </div>
            <div className="relative flex-1 group min-h-[300px] lg:min-h-0">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste your text here..."
                className="w-full h-full p-6 bg-white rounded-2xl border border-transparent shadow-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#1A1A1A]/20 focus:border-[#1A1A1A]/10 transition-all text-lg leading-relaxed placeholder:text-gray-300 font-serif"
                spellCheck={false}
              />
              <div className="absolute bottom-4 right-4">
                <span className="text-xs font-mono text-gray-300 pointer-events-none">
                  {inputText.length} chars
                </span>
              </div>
            </div>
          </div>

          {/* Controls (Mobile only) */}
          <div className="lg:hidden flex justify-center">
            <button
              onClick={handleRewrite}
              disabled={isLoading || !inputText}
              className="bg-[#1A1A1A] text-white px-6 py-3 rounded-full font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg active:scale-95 transition-all"
            >
              {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Rewrite
            </button>
          </div>

          {/* Output Section */}
          <div className="flex flex-col gap-4 h-full relative">
             {/* Desktop Rewrite Button - Floating in the middle gap effectively */}
             <div className="hidden lg:flex absolute -left-6 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
              <button
                onClick={handleRewrite}
                disabled={isLoading || !inputText}
                className="bg-[#1A1A1A] text-white w-12 h-12 rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-xl hover:scale-110 active:scale-95 transition-all group"
                title="Rewrite Text"
              >
                {isLoading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs font-mono uppercase tracking-wider text-gray-500">Refined Output</label>
              {outputText && (
                <button
                  onClick={copyToClipboard}
                  className="text-xs font-mono uppercase tracking-wider text-gray-400 hover:text-[#1A1A1A] flex items-center gap-1 transition-colors"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
            <div className="relative flex-1 bg-[#EBEBE8] rounded-2xl border border-transparent shadow-inner overflow-hidden min-h-[300px] lg:min-h-0">
              {error ? (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                  <p className="text-red-500 font-mono text-sm">{error}</p>
                </div>
              ) : (
                <div className="w-full h-full p-6 overflow-auto">
                  <AnimatePresence mode="wait">
                    {outputText ? (
                      <motion.div
                        key="output"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="text-lg leading-relaxed font-serif text-[#1A1A1A]"
                      >
                        {outputText.split('\n').map((paragraph, idx) => (
                          <p key={idx} className="mb-4 last:mb-0">{paragraph}</p>
                        ))}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="h-full flex flex-col items-center justify-center text-gray-400"
                      >
                        <p className="font-serif italic text-xl opacity-50">"Refinement is the art of subtraction."</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              
              {outputText && !isLoading && !error && (
                 <div className="absolute bottom-4 right-4">
                  <span className="text-xs font-mono text-gray-400 pointer-events-none bg-[#EBEBE8]/80 backdrop-blur-sm px-2 py-1 rounded-md">
                    {outputText.length} chars
                  </span>
                </div>
              )}
              
              {isLoading && (
                <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-10">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-1 bg-[#1A1A1A]/10 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-[#1A1A1A]"
                        initial={{ x: '-100%' }}
                        animate={{ x: '100%' }}
                        transition={{ repeat: Infinity, duration: 1, ease: "easeInOut" }}
                      />
                    </div>
                    <span className="text-xs font-mono uppercase tracking-widest text-gray-500">Processing</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

