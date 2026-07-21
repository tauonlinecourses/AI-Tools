import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getToolConfig } from "@/agents/registry";

/**
 * The single AI gateway. Every tool's client hook POSTs { toolId, messages }
 * here; the model, system prompt, and temperature come from the tool's
 * registered ai.config — never from the client.
 *
 * OPENAI_API_KEY is read only here, implicitly, by the @ai-sdk/openai
 * provider. It must never appear in client code or carry a NEXT_PUBLIC_ prefix.
 */
export async function POST(req: Request) {
  // FUTURE: auth check (Supabase) goes here

  const body = (await req.json()) as {
    toolId?: string;
    messages?: UIMessage[];
  };

  if (!body.toolId || !Array.isArray(body.messages)) {
    return Response.json(
      { error: "Request must include a toolId and a messages array." },
      { status: 400 },
    );
  }

  const config = getToolConfig(body.toolId);
  if (!config) {
    return Response.json(
      { error: `Unknown toolId: ${body.toolId}` },
      { status: 400 },
    );
  }

  // FUTURE: per-user usage logging goes here
  // FUTURE: rate limiting goes here

  const result = streamText({
    model: openai(config.model),
    system: config.system,
    temperature: config.temperature,
    messages: await convertToModelMessages(body.messages),
    abortSignal: req.signal,
  });

  return result.toUIMessageStreamResponse();
}
