import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { DebugBalloon } from './DebugBalloon'
import { debugOn } from './lib/ai'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {debugOn() && <DebugBalloon />}
  </StrictMode>,
)
