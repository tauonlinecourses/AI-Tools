/**
 * One-shot (non-streaming) client for the platform AI gateway (/api/ai).
 *
 * Sends a single user prompt, consumes the SSE stream to completion, and
 * returns the full text. Use this for tools that need a complete response
 * (e.g. JSON) rather than a chat UI.
 */
export async function completeViaGateway(args: {
  toolId: string;
  prompt: string;
}): Promise<string> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      toolId: args.toolId,
      messages: [
        {
          id: "prompt",
          role: "user",
          parts: [{ type: "text", text: args.prompt }],
        },
      ],
    }),
  });

  if (!res.ok || !res.body) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new Error(`AI request failed (${res.status}): ${errorText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  const handleLine = (line: string) => {
    if (!line.startsWith("data: ")) return;
    const payload = line.slice(6).trim();
    if (!payload || payload === "[DONE]") return;

    let event: { type?: string; delta?: string; errorText?: string };
    try {
      event = JSON.parse(payload);
    } catch {
      return;
    }

    if (event.type === "text-delta" && typeof event.delta === "string") {
      text += event.delta;
    } else if (event.type === "error") {
      throw new Error(
        `AI request failed (502): ${JSON.stringify({
          error: "AI stream error",
          details: event.errorText ?? "Unknown stream error",
        })}`,
      );
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      handleLine(buffer.slice(0, newlineIndex).trimEnd());
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf("\n");
    }
  }
  handleLine(buffer.trimEnd());

  return text;
}
