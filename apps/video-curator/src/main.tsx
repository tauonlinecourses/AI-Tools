import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ToolAuthGate } from '@workspace/auth/ToolAuthGate'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from '@workspace/ui'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToolAuthGate toolId="video-curator">
        <App />
      </ToolAuthGate>
    </ErrorBoundary>
  </StrictMode>,
)
