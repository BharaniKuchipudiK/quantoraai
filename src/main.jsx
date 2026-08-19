import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import FeedbackWidget from './components/FeedbackWidget.jsx'
import { installSpecialistExperience } from './lib/specialist-experience.js'
import './index.css'
import './styles/density.css'
import './styles/studio-toolbar-cleanup.css'
import './styles/conversation-quality.css'

installSpecialistExperience()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <FeedbackWidget />
  </React.StrictMode>,
)
