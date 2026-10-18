import OpenAI from 'openai';

export type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type ChatRequest = {
  messages: Message[];
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  responseFormat?: { type: 'text' | 'json_object' };
};

/** Models used by apps in this monorepo. Reject anything else. */
const ALLOWED_MODELS = new Set(['gpt-4o', 'gpt-4o-mini']);
const DEFAULT_MODEL = 'gpt-4o';
const MAX_TOKENS = 4096;
const MAX_MESSAGES = 40;
const MAX_CHARS_PER_MESSAGE = 16_000;
const MAX_TOTAL_CHARS = 64_000;

// Read server env at request time without depending on @types/node in consumers.
function getServerEnv(): Record<string, string | undefined> {
  return (
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env ?? {}
  );
}

function messageContentLength(content: unknown): number {
  return typeof content === 'string' ? content.length : 0;
}

function validateMessages(
  messages: Message[],
  systemPrompt: string | undefined
): Response | null {
  if (messages.length === 0) {
    return new Response('messages must be a non-empty array', { status: 400 });
  }
  if (messages.length > MAX_MESSAGES) {
    return Response.json(
      { error: `Too many messages (max ${MAX_MESSAGES})` },
      { status: 413 }
    );
  }

  let totalChars = systemPrompt ? systemPrompt.length : 0;
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') {
      return new Response('each message must be an object', { status: 400 });
    }
    const len = messageContentLength(msg.content);
    if (typeof msg.content !== 'string') {
      return new Response('each message content must be a string', { status: 400 });
    }
    if (len > MAX_CHARS_PER_MESSAGE) {
      return Response.json(
        { error: `Message too long (max ${MAX_CHARS_PER_MESSAGE} chars)` },
        { status: 413 }
      );
    }
    totalChars += len;
  }

  if (systemPrompt && systemPrompt.length > MAX_CHARS_PER_MESSAGE) {
    return Response.json(
      { error: `systemPrompt too long (max ${MAX_CHARS_PER_MESSAGE} chars)` },
      { status: 413 }
    );
  }

  if (totalChars > MAX_TOTAL_CHARS) {
    return Response.json(
      { error: `Payload too large (max ${MAX_TOTAL_CHARS} chars across messages)` },
      { status: 413 }
    );
  }

  return null;
}

function logChatMetric(fields: {
  status: number;
  model: string;
  messageCount: number;
  latencyMs: number;
}): void {
  // Vercel captures stdout. Never log prompt contents.
  console.log(
    JSON.stringify({
      event: 'ai_chat',
      status: fields.status,
      model: fields.model,
      messageCount: fields.messageCount,
      latencyMs: fields.latencyMs,
    })
  );
}

export async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const started = Date.now();
  let model = DEFAULT_MODEL;
  let messageCount = 0;

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const {
    messages,
    model: requestedModel = DEFAULT_MODEL,
    systemPrompt,
    temperature,
    responseFormat,
  } = body;
  model = requestedModel;
  messageCount = Array.isArray(messages) ? messages.length : 0;

  if (!messages || !Array.isArray(messages)) {
    return new Response('messages must be an array', { status: 400 });
  }

  if (!ALLOWED_MODELS.has(model)) {
    return Response.json(
      {
        error: `Model not allowed. Allowed: ${[...ALLOWED_MODELS].join(', ')}`,
      },
      { status: 400 }
    );
  }

  const sizeError = validateMessages(messages, systemPrompt);
  if (sizeError) {
    return sizeError;
  }

  if (!getServerEnv().OPENAI_API_KEY) {
    return Response.json(
      { error: 'Missing OPENAI_API_KEY on server.' },
      { status: 500 }
    );
  }

  const apiKey = getServerEnv().OPENAI_API_KEY;
  const fullMessages: Message[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  try {
    const client = new OpenAI({
      apiKey, // server env only — never VITE_*
    });

    const completion = await client.chat.completions.create({
      model,
      messages: fullMessages,
      max_tokens: MAX_TOKENS,
      ...(temperature !== undefined ? { temperature } : {}),
      ...(responseFormat ? { response_format: responseFormat } : {}),
    });

    const content = completion.choices[0]?.message?.content ?? '';
    logChatMetric({
      status: 200,
      model,
      messageCount,
      latencyMs: Date.now() - started,
    });

    return Response.json({ content });
  } catch (err) {
    const status =
      typeof (err as { status?: unknown })?.status === 'number'
        ? (err as { status: number }).status
        : 500;
    const details = err instanceof Error ? err.message : String(err);
    logChatMetric({
      status,
      model,
      messageCount,
      latencyMs: Date.now() - started,
    });
    return Response.json(
      { error: `OpenAI API error: ${status}`, details },
      { status }
    );
  }
}
