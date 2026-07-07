import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { GapProvider } from './lib/store.jsx'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GapProvider>
      <App />
    </GapProvider>
  </StrictMode>,
)
