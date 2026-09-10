import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './ui/styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline support for the deployed PWA. Absent in the single-file build, which
// is already fully self-contained — so a miss here is not an error.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href).catch(() => {})
  })
}
