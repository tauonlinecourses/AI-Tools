/// <reference types="node" />
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { YoutubeTranscriptTooManyRequestError } from 'youtube-transcript'
import { AuthError, requireToolAccessFromRequest } from '@workspace/auth/server'
import { YoutubeTranscriptError, loadYoutubeTranscriptFromUrl } from '../server/youtubeTranscriptCore.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await requireToolAccessFromRequest(req, 'video-curator')
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message })
    }
    return res.status(401).json({ error: 'Unauthorized' })
  }

  let body: unknown = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = null
    }
  }

  const url =
    body && typeof body === 'object' && body !== null && 'url' in body
      ? (body as { url?: unknown }).url
      : undefined

  const lang =
    body && typeof body === 'object' && body !== null && 'lang' in body
      ? (body as { lang?: unknown }).lang
      : undefined

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url' })
  }

  try {
    const langOpt = typeof lang === 'string' && lang.trim() ? lang.trim() : undefined
    const { items, title, videoId } = await loadYoutubeTranscriptFromUrl(
      url,
      langOpt ? { lang: langOpt } : undefined
    )
    return res.status(200).json({ items, title, videoId })
  } catch (err: unknown) {
    if (err instanceof YoutubeTranscriptError) {
      const tooMany = err instanceof YoutubeTranscriptTooManyRequestError
      return res.status(tooMany ? 429 : 400).json({ error: err.message })
    }
    return res.status(500).json({
      error: 'Server error',
    })
  }
}
