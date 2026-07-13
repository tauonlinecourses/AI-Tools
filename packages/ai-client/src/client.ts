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

export async function callAI(
  messages: Message[],
  options: CallOptions = {}
): Promise<AIResult> {
  const {
    model        = "gpt-4o-mini",
    maxTokens    = 2048,
    systemPrompt,
    temperature  = 0.7,
  } = options;

  const allMessages: Message[] = [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    ...messages,
  ];

  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: allMessages,
  };

  try {
    const isDev = import.meta.env.DEV;
    let response: Response;

    if (isDev) {
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
      if (!apiKey) return { text: null, error: "VITE_OPENAI_API_KEY is not set in .env.local" };

      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } else {
      response = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        text:  null,
        error: (err as { error?: { message?: string } }).error?.message
          ?? `API error ${response.status}`,
      };
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    return { text: data.choices[0]?.message?.content ?? "", error: null };
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
