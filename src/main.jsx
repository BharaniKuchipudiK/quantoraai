import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import FeedbackWidget from './components/FeedbackWidget.jsx'
import ProductTelemetry from './components/ProductTelemetry.jsx'
import { installPromptClipboardImagePaste } from './lib/clipboard-image-paste.js'
import { clearLegacyPersistentSecrets } from './lib/client-secrets.js'
import './index.css'
import './styles/quantora-monochrome.css'
import './styles/density.css'
import './styles/studio-toolbar-cleanup.css'
import './styles/conversation-quality.css'
import './styles/live-preview-clean.css'

// Clipboard paste is an input event capability. Studio layout, advisor policy,
// media, profile, Arena, Fork and project preview are all React-owned now; no
// post-render MutationObserver recovery layers are installed at boot.
clearLegacyPersistentSecrets()
installPromptClipboardImagePaste()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <FeedbackWidget />
    <ProductTelemetry />
  </React.StrictMode>,
)
