import { useState, useCallback } from "react";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CallOptions {
  model?:        string;
  maxTokens?:    number;
  systemPrompt?: string;
  temperature?:  number;
}

export interface AIResponse { text: string; error: null; }
export interface AIError    { text: null;   error: string; }
export type AIResult = AIResponse | AIError;

export type AskOptions = {
  messages: Message[];
  model?: string;
  systemPrompt?: string;
};

/**
 * Low-level fetch call to /api/chat. Use useAI() in components instead.
 */
export async function aiChat(options: AskOptions): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });

  if (!res.ok) {
    const error = await res.text().catch(() => res.statusText);
    throw new Error(`AI request failed (${res.status}): ${error}`);
  }

  const data = await res.json();
  return data.content as string;
}

/**
 * React hook. Use this in all tool components.
 *
 * const { ask, loading, error } = useAI();
 * const result = await ask({ messages: [{ role: 'user', content: prompt }] });
 */
export function useAI() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async (options: AskOptions): Promise<string | null> => {
    setLoading(true);
    setError(null);
    try {
      return await aiChat(options);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { ask, loading, error };
}

/**
 * Legacy wrapper, preserved so existing `@workspace/ai-client` (index.ts)
 * imports keep working. Routes through the secure /api/chat endpoint —
 * the API key never reaches the browser.
 */
export async function callAI(
  messages: Message[],
  options: CallOptions = {}
): Promise<AIResult> {
  const { model, systemPrompt } = options;

  try {
    const text = await aiChat({ messages, model, systemPrompt });
    return { text, error: null };
  } catch (err) {
    return {
      text:  null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function prompt(
  userMessage: string,
  options: CallOptions = {}
): Promise<AIResult> {
  return callAI([{ role: "user", content: userMessage }], options);
}
