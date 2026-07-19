import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Prefer server-only var name. Allow legacy VITE_OPENAI_KEY as fallback.
  const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing OPENAI_API_KEY on server' })
  }

  let body: unknown = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = null
    }
  }

  const prompt =
    body && typeof body === 'object' && body !== null && 'prompt' in body
      ? (body as { prompt?: unknown }).prompt
      : undefined

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing prompt' })
  }

  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are a transcript segmentation engine. You only output valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    const text = await upstream.text()
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `OpenAI API error: ${upstream.status}`,
        details: text,
      })
    }

    const data = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: unknown } }>
    }
    const content = data?.choices?.[0]?.message?.content

    if (!content || typeof content !== 'string') {
      return res.status(502).json({ error: 'OpenAI response missing content' })
    }

    return res.status(200).json({ content })
  } catch (err: unknown) {
    return res.status(500).json({
      error: 'Server error',
      details: err instanceof Error ? err.message : String(err),
    })
  }
}

