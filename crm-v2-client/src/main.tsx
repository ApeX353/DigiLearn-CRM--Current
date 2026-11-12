import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installRecentErrorCapture } from './lib/diagnostics/recent-errors'
import { startClientEventReporter } from './lib/diagnostics/reporter'
import { primeApiCommit } from './lib/diagnostics/client-context'
import { installUiTrail } from './lib/diagnostics/ui-trail'

// Browser-side diagnostics: remember recent errors (window errors, unhandled
// rejections, failed requests, and in production builds console.error), ship
// the ones worth a record to the API in small batches, know which API build
// we are talking to so a bug report can say so, and follow which screen,
// dialog and button the user is on so every request can say where it came
// from (labels only, never field values).
installUiTrail()
installRecentErrorCapture({ tapConsole: import.meta.env.PROD })
startClientEventReporter()
primeApiCommit(import.meta.env.VITE_PUBLIC_API_URL as string | undefined)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
