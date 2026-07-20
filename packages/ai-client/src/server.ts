import OpenAI from 'openai';

export type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type ChatRequest = {
  messages: Message[];
  model?: string;
  systemPrompt?: string;
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

  const { messages, model = 'gpt-4o', systemPrompt } = body;

  if (!messages || !Array.isArray(messages)) {
    return new Response('messages must be an array', { status: 400 });
  }

  const fullMessages: Message[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // server env only — never VITE_*
  });

  const completion = await client.chat.completions.create({
    model,
    messages: fullMessages,
  });

  const content = completion.choices[0]?.message?.content ?? '';

  return Response.json({ content });
}
