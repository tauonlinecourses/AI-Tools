// ─── Types ───────────────────────────────────────────────────────────────────

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface CallOptions {
  model?:       string;
  maxTokens?:   number;
  systemPrompt?: string;
  temperature?: number;
}

export interface AIResponse {
  text:  string;
  error: null;
}

export interface AIError {
  text:  null;
  error: string;
}

export type AIResult = AIResponse | AIError;

// ─── Core call ───────────────────────────────────────────────────────────────

export async function callAI(
  messages: Message[],
  options: CallOptions = {}
): Promise<AIResult> {
  const {
    model       = "claude-sonnet-4-6",
    maxTokens   = 2048,
    systemPrompt,
    temperature = 0.7,
  } = options;

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  if (!apiKey) {
    return { text: null, error: "VITE_ANTHROPIC_API_KEY is not set" };
  }

  try {
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":            "application/json",
        "x-api-key":               apiKey,
        "anthropic-version":       "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        text:  null,
        error: (err as { error?: { message?: string } }).error?.message
          ?? `API error ${response.status}`,
      };
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    return { text, error: null };
  } catch (err) {
    return {
      text:  null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ─── Convenience helper — single prompt ──────────────────────────────────────

export async function prompt(
  userMessage: string,
  options: CallOptions = {}
): Promise<AIResult> {
  return callAI([{ role: "user", content: userMessage }], options);
}
