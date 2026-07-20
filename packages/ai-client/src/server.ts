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

export async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const { messages, model = 'gpt-4o', systemPrompt, temperature, responseFormat } = body;

  if (!messages || !Array.isArray(messages)) {
    return new Response('messages must be an array', { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: 'Missing OPENAI_API_KEY on server.' },
      { status: 500 }
    );
  }

  const fullMessages: Message[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // server env only — never VITE_*
  });

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: fullMessages,
      ...(temperature !== undefined ? { temperature } : {}),
      ...(responseFormat ? { response_format: responseFormat } : {}),
    });

    const content = completion.choices[0]?.message?.content ?? '';

    return Response.json({ content });
  } catch (err) {
    const status =
      typeof (err as { status?: unknown })?.status === 'number'
        ? (err as { status: number }).status
        : 500;
    const details = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `OpenAI API error: ${status}`, details },
      { status }
    );
  }
}
