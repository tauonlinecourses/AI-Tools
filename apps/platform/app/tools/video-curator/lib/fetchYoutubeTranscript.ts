import type { SrtItem } from './parseSrt'
import { fetchYoutubeTranscriptAction } from '../actions'

export type YoutubeTranscriptImportResult = {
  items: SrtItem[]
  title?: string
  videoId: string
}

/**
 * Fetches YouTube auto captions via the tool's server action and maps them
 * to `SrtItem[]`. (Replaces the old `POST /api/youtube-transcript` route.)
 */
export async function fetchYoutubeTranscriptAsSrtItems(
  url: string,
  options?: { lang?: string }
): Promise<YoutubeTranscriptImportResult> {
  const trimmed = url.trim()
  if (!trimmed) {
    throw new Error('Paste a YouTube URL or video ID.')
  }

  const result = await fetchYoutubeTranscriptAction(trimmed, options?.lang?.trim() || undefined)

  if (!result.ok) {
    throw new Error(result.error || `Request failed (${result.status})`)
  }

  if (!result.videoId) {
    throw new Error('Server response missing videoId.')
  }

  if (result.items.length === 0) {
    throw new Error('No transcript segments in server response.')
  }

  const items: SrtItem[] = result.items.map((seg, index) => ({
    index,
    startTime: seg.startTime,
    endTime: seg.endTime,
    text: seg.text,
  }))

  return { items, title: result.title, videoId: result.videoId }
}
