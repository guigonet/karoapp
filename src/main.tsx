import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { DebugBalloon } from './DebugBalloon'
import { DialogHost } from './Dialog'
import { TermsGate } from './Terms'
import { debugOn } from './lib/ai'
import './styles.css'

const debug = debugOn()
if (debug) document.body.classList.add('debug')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TermsGate>
      <App />
      {debug && <DebugBalloon />}
      <DialogHost />
    </TermsGate>
  </StrictMode>,
)
