import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ToolAuthGate } from '@workspace/auth/ToolAuthGate'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToolAuthGate toolId="video-curator">
      <App />
    </ToolAuthGate>
  </StrictMode>,
)
