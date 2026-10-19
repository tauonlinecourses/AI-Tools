import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { PLATFORM_ENV, vercelApiPlugin } from '../../packages/dev-api/src/index'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // Force a single React copy. The app runs React 19 while the shared workspace
    // packages (@workspace/ui, @workspace/ai-client) resolve React 18 from their own
    // node_modules; bundling both triggers React error #525 at runtime.
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    server: {
      port: 5174,
      strictPort: true,
    },
    plugins: [
      react(),
      vercelApiPlugin({
        env,
        bridge: [
          ...PLATFORM_ENV,
          ['OPENAI_API_KEY', 'VITE_OPENAI_API_KEY'],
          ['OPENAI_API_KEY', 'VITE_OPENAI_KEY'],
        ],
      }),
    ],
  }
})
