import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import FeedbackWidget from './components/FeedbackWidget.jsx'
import { installSpecialistExperience } from './lib/specialist-experience.js'
import { installAgenticWorkspaceUiPolicy } from './lib/agentic-workspace-ui-policy.js'
import { installWorkspaceCardPolish } from './lib/workspace-card-polish.js'
import { installStudioResponsePresentation } from './lib/studio-response-presentation.js'
import { installYoutubeMediaExperience } from './lib/youtube-media-experience.js'
import { installProfileMenuBridge } from './lib/profile-menu-bridge.js'
import { installProfilePersonalization } from './lib/profile-personalization.js'
import { installStudioRegressionRecovery } from './lib/studio-regression-recovery.jsx'
import { installPromptClipboardImagePaste } from './lib/clipboard-image-paste.js'
import './index.css'
import './styles/density.css'
import './styles/studio-toolbar-cleanup.css'
import './styles/conversation-quality.css'

installSpecialistExperience()
installAgenticWorkspaceUiPolicy()
installWorkspaceCardPolish()
installStudioResponsePresentation()
installYoutubeMediaExperience()
installProfileMenuBridge()
installProfilePersonalization()
installStudioRegressionRecovery()
installPromptClipboardImagePaste()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <FeedbackWidget />
  </React.StrictMode>,
)