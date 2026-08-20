import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import FeedbackWidget from './components/FeedbackWidget.jsx'
import CodeWorkspaceHost from './components/code/CodeWorkspaceHost.jsx'
import PrIntelligenceHost from './components/code/PrIntelligenceHost.jsx'
import { installSpecialistExperience } from './lib/specialist-experience.js'
import { installAgenticWorkspaceUiPolicy } from './lib/agentic-workspace-ui-policy.js'
import { installWorkspaceCardPolish } from './lib/workspace-card-polish.js'
import { installStudioResponsePresentation } from './lib/studio-response-presentation.js'
import { installYoutubeMediaExperience } from './lib/youtube-media-experience.js'
import { installProfilePersonalization } from './lib/profile-personalization.js'
import { installPromptClipboardImagePaste } from './lib/clipboard-image-paste.js'
import { installCodeWorkspaceEntry } from './lib/code-workspace-entry.js'
import './index.css'
import './styles/density.css'
import './styles/studio-toolbar-cleanup.css'
import './styles/conversation-quality.css'

installSpecialistExperience()
installAgenticWorkspaceUiPolicy()
installWorkspaceCardPolish()
installStudioResponsePresentation()
installYoutubeMediaExperience()
installProfilePersonalization()
installPromptClipboardImagePaste()
installCodeWorkspaceEntry()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <FeedbackWidget />
    <CodeWorkspaceHost />
    <PrIntelligenceHost />
  </React.StrictMode>,
)