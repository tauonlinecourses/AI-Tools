import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { YoutubeTranscriptTooManyRequestError } from 'youtube-transcript'
import { YoutubeTranscriptError, loadYoutubeTranscriptFromUrl } from './server/youtubeTranscriptCore'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Prefer server-only OPENAI_API_KEY. Fallbacks cover common misnamed local vars.
  const apiKey = env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || env.VITE_OPENAI_KEY

  return {
    server: {
      port: 5174,
      strictPort: true,
    },
    plugins: [
      react(),
      {
        name: 'local-api',
        configureServer(server) {
          server.middlewares.use('/api/chat', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Method not allowed' }))
              return
            }

            // Bridge local .env.local key names into process.env for the shared handler.
            if (apiKey) process.env.OPENAI_API_KEY ||= apiKey

            let raw = ''
            req.on('data', (chunk) => (raw += chunk))
            req.on('end', async () => {
              try {
                // Load the shared handler through Vite's SSR pipeline so its TypeScript
                // source is transformed on the fly (a top-level import would make Node
                // try to strip types from a file under node_modules and fail).
                const { handler } = (await server.ssrLoadModule('@workspace/ai-client/server')) as {
                  handler: (request: Request) => Promise<Response>
                }
                const request = new Request('http://localhost/api/chat', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: raw || '{}',
                })
                const response = await handler(request)
                res.statusCode = response.status
                response.headers.forEach((value, key) => res.setHeader(key, value))
                res.end(await response.text())
              } catch (err: unknown) {
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                const message = err instanceof Error ? err.message : String(err)
                res.end(JSON.stringify({ error: 'Server error', details: message }))
              }
            })
          })

          server.middlewares.use('/api/youtube-transcript', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Method not allowed' }))
              return
            }

            let raw = ''
            req.on('data', (chunk) => (raw += chunk))
            req.on('end', async () => {
              let body: unknown = null
              try {
                body = JSON.parse(raw || '{}')
              } catch {
                body = null
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
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'Missing url' }))
                return
              }

              try {
                const langOpt = typeof lang === 'string' && lang.trim() ? lang.trim() : undefined
                const { items, title, videoId } = await loadYoutubeTranscriptFromUrl(
                  url,
                  langOpt ? { lang: langOpt } : undefined
                )
                res.statusCode = 200
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ items, title, videoId }))
              } catch (err: unknown) {
                if (err instanceof YoutubeTranscriptError) {
                  const tooMany = err instanceof YoutubeTranscriptTooManyRequestError
                  res.statusCode = tooMany ? 429 : 400
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ error: err.message }))
                  return
                }
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                const message = err instanceof Error ? err.message : String(err)
                res.end(JSON.stringify({ error: 'Server error', details: message }))
              }
            })
          })
        },
      },
    ],
  }
})
