import { parseVFSFromMarkdown } from '../lib/vfs-parser.js';
import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Sparkles, Send, Play, Code2, Copy, Workflow, RefreshCw, Cpu, Layers, MessageSquare, Terminal, Calculator, Music, Smartphone, Plus, Globe, ChevronDown, ChevronUp, Paperclip, X, Lightbulb, FileText, Image as ImageIcon, Activity, FolderPlus, Smile, Utensils, PieChart, Atom, Sun, Wand2, Trash2, PanelLeft, PanelLeftClose, Info, Settings, Mic, MicOff, Github, Layout, Check, Square } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import LivePreviewCanvas from './LivePreviewCanvas';
import { useChatStream } from '../hooks/useChatStream';
import { usePCLMemory } from '../hooks/usePCLMemory';
import { useStudioSession } from '../hooks/useStudioSession.js';
const LiveIosCalculator = lazy(() => import('./interactive/LiveIosCalculator'));
const LiveBeatMaker = lazy(() => import('./interactive/LiveBeatMaker'));
const LiveQuantumSimulator = lazy(() => import('./interactive/LiveQuantumSimulator'));
// Graphic Brand Logo Renderer for Tech Stack Pills
function TechLogo({ name }) {
  switch (name) {
    case 'React':
      return (
        <svg width="15" height="15" viewBox="-11.5 -10.2 23 20.4" fill="none">
          <circle cx="0" cy="0" r="2.05" fill="#61DAFB"/>
          <g stroke="#61DAFB" strokeWidth="1" fill="none">
            <ellipse rx="11" ry="4.2"/>
            <ellipse rx="11" ry="4.2" transform="rotate(60)"/>
            <ellipse rx="11" ry="4.2" transform="rotate(120)"/>
          </g>
        </svg>
      );
    case 'Next.js':
      return (
        <svg width="15" height="15" viewBox="0 0 180 180" fill="none">
          <circle cx="90" cy="90" r="85" fill="#000" stroke="#888" strokeWidth="8"/>
          <path d="M149.5 157.5L69.1 54H54V126H67.5V70.9L138.2 162.2C142.2 160.8 146 159.2 149.5 157.5Z" fill="#fff"/>
          <rect x="115.5" y="54" width="13.5" height="72" fill="#fff"/>
        </svg>
      );
    case 'Go':
      return (
        <svg width="18" height="11" viewBox="0 0 100 50" fill="none">
          <path d="M 25,5 C 12,5 4,16 4,30 C 4,44 12,55 25,55 C 35,55 42,48 44,38 L 25,38 L 25,28 L 54,28 C 55,31 55,34 55,38 C 55,52 44,62 25,62 C 8,62 0,48 0,30 C 0,12 8,0 25,0 C 37,0 48,8 51,18 L 41,23 C 38,13 31,5 25,5 Z" fill="#00ADD8"/>
          <path d="M 95,30 C 95,48 82,58 66,58 C 50,58 37,48 37,30 C 37,12 50,2 66,2 C 82,2 95,12 95,30 Z M 50,30 C 50,42 56,50 66,50 C 76,50 82,42 82,30 C 82,18 76,10 66,10 C 56,10 50,18 50,30 Z" fill="#00ADD8"/>
        </svg>
      );
    case 'Python':
      return (
        <svg width="15" height="15" viewBox="0 0 110 110" fill="none">
          <path d="M51.6 3C27.8 3 29.1 13.3 29.1 13.3l.1 10.4h23.2v3.3H19.7S3 24.3 3 48.1c0 23.8 14.5 22.9 14.5 22.9h8.7V58.7s-.5-14.8 14.8-14.8h22.8V21.1S55.2 3 51.6 3zm-11 7.2a3.3 3.3 0 1 1 0 6.6 3.3 3.3 0 0 1 0-6.6z" fill="#3776AB"/>
          <path d="M58.4 107c23.8 0 22.5-10.3 22.5-10.3l-.1-10.4H57.6v-3.3h32.7s16.7 2.7 16.7-21.1c0-23.8-14.5-22.9-14.5-22.9h-8.7v12.3s.5 14.8-14.8 14.8H56.2v22.8s-1.4 18.1 2.2 18.1zm11-7.2a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6z" fill="#FFD43B"/>
        </svg>
      );
    case 'Flutter':
      return (
        <svg width="14" height="14" viewBox="0 0 100 100" fill="none">
          <path d="M58 8L15 51L28 64L85 8H58Z" fill="#42A5F5"/>
          <path d="M58 51L34 75L47 88L85 51H58Z" fill="#0D47A1"/>
          <path d="M34 75L58 51H85L47 88.5L34 75Z" fill="#167EE6"/>
        </svg>
      );
    case 'Gemini AI':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M12 0C12 6.627 6.627 12 0 12C6.627 12 17.373 12 24 12C17.373 12 12 6.627 12 0Z" fill="url(#gemini_grad_pill)"/>
          <defs>
            <linearGradient id="gemini_grad_pill" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f97316"/>
              <stop offset="0.5" stopColor="#ec4899"/>
              <stop offset="1" stopColor="#3b82f6"/>
            </linearGradient>
          </defs>
        </svg>
      );
    case 'Angular':
      return (
        <svg width="15" height="15" viewBox="0 0 250 250" fill="none">
          <polygon points="125,30 31.9,63.2 46.1,186.3 125,230 203.9,186.3 218.1,63.2" fill="#DD0031"/>
          <polygon points="125,30 125,52.2 125,153.4 175.3,178.5 188.5,95.7" fill="#C3002F"/>
          <polygon points="125,52.1 74.7,178.5 96.6,178.5 106.8,153.4 143.2,153.4 125,108" fill="#FFFFFF"/>
        </svg>
      );
    case 'Node.js':
      return (
        <svg width="15" height="15" viewBox="0 0 256 289" fill="none">
          <path d="M128 0L0 74v141l128 74 128-74V74L128 0z" fill="#5FA04E"/>
          <path d="M128 141.5V289l128-74V74L128 141.5z" fill="#43853D"/>
        </svg>
      );
    case 'Java':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M18.5 10.5C18.5 10.5 19 8.5 16 8.5C13 8.5 13 10 10.5 10C8 10 7.5 8.5 7.5 8.5M10.5 3C10.5 3 12.5 4.5 10.5 6C8.5 7.5 11.5 9 11.5 9M13.5 13.5C15.5 13.5 18 12.5 18 12.5M12 21C6.477 21 2 19.5 2 17.5C2 15.5 6.477 14 12 14C17.523 14 22 15.5 22 17.5C22 19.5 17.523 21 12 21Z" stroke="#ED8B00" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      );
    case '.NET':
      return (
        <svg width="16" height="14" viewBox="0 0 24 20" fill="none">
          <rect width="24" height="20" rx="4" fill="#512BD4"/>
          <text x="12" y="14" fontSize="10" fontWeight="800" fill="#fff" textAnchor="middle" fontFamily="sans-serif">.NET</text>
        </svg>
      );
    default:
      return <Sparkles size={13} color="#f97316" />;
  }
}

// Interactive Tech Stack Badge Component (Fixed width, no shaking)
function TechBadge({ tech, isLight, textColor, onSelect }) {
  const [hovered, setHovered] = useState(false);
  return (
    <span
      onClick={() => onSelect(`Build a ${tech} application starter template`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={tech}
      style={{
        fontSize: '0.76rem',
        fontWeight: '600',
        padding: '6px 12px',
        borderRadius: '10px',
        background: hovered
          ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.22)')
          : (isLight ? '#ffffff' : 'rgba(255, 255, 255, 0.08)'),
        color: hovered ? '#f97316' : textColor,
        cursor: 'pointer',
        border: hovered
          ? '1px solid #f97316'
          : (isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.12)'),
        whiteSpace: 'nowrap',
        transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        boxShadow: hovered ? '0 4px 12px rgba(249, 115, 22, 0.2)' : 'none'
      }}
    >
      <TechLogo name={tech} />
      <span style={{ fontWeight: '600' }}>{tech}</span>
    </span>
  );
}

// Interactive Quick Suggestion Chip Component (Fixed width, no shaking)
function QuickPromptChip({ chip, isLight, onSelect }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={() => onSelect(chip.prompt)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={chip.label}
      style={{
        background: hovered
          ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.22)')
          : (isLight ? '#ffffff' : 'rgba(255, 255, 255, 0.08)'),
        border: hovered
          ? '1px solid #f97316'
          : (isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.12)'),
        color: hovered ? '#f97316' : (isLight ? '#475569' : '#94a3b8'),
        padding: '6px 14px',
        borderRadius: '20px',
        fontSize: '0.78rem',
        fontWeight: '600',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        boxShadow: hovered ? '0 4px 12px rgba(249, 115, 22, 0.2)' : 'none'
      }}
    >
      {chip.iconType === 'currency' && <Globe size={15} color="#10b981" />}
      {chip.iconType === 'calc' && <Calculator size={15} color="#3b82f6" />}
      {chip.iconType === 'music' && <Music size={15} color="#d946ef" />}
      {chip.iconType === 'quantum' && <Atom size={15} color="#8b5cf6" />}
      {chip.iconType === 'weather' && <Sun size={15} color="#f59e0b" />}
      {chip.iconType === 'joke' && <Smile size={15} color="#f97316" />}
      {chip.iconType === 'recipe' && <Utensils size={15} color="#10b981" />}
      {chip.iconType === 'expense' && <PieChart size={15} color="#8b5cf6" />}

      <span style={{ fontWeight: '600' }}>{chip.label}</span>
    </button>
  );
}

const extractRunnableCode = (text) => {
  if (!text) return null;
  const match = text.match(/```(?:jsx|tsx|html|css|javascript|react|js)?\n([\s\S]*?)```/i);
  if (match) {
    const code = match[1].trim();
    if (code.includes('import React') || code.includes('export default') || code.includes('<html>') || code.includes('<div')) {
      return code;
    }
  }
  return null;
};

const formatModelName = (name) => name ? name.replace(/\s*\(free\)/ig, '').trim() : '';

export default function AiStudio({ onOpenAuth, selectedModel, setSelectedModel, availableModels, onPushToCanvas, user, isLight, dreamNodes, setDreamNodes, setActiveTab, inputText: externalInputText, setInputText: setExternalInputText }) {
  // Chat Sessions & History Management (Claude / ChatGPT / Gemini style)
  const {
    chatSessions,
    activeSessionId,
    setActiveSessionId,
    messages,
    updateActiveMessages,
    handleCreateNewChat,
    handleDeleteChat
  } = useStudioSession({ user, selectedModel });

  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Derive current session and messages
  const activeSession = chatSessions.find(s => s.id === activeSessionId) || chatSessions[0];

  /*
   * Tell the ambient background to step back once there is work on screen.
   *
   * A warm gradient is the right welcome on an empty canvas and the wrong
   * thing behind a long, code-heavy conversation — colour under dense text is
   * exactly the readability problem the old particle field had, just prettier.
   * The greeting message is not content, so it does not count.
   */
  const hasConversation = messages.length > 1;
  React.useEffect(() => {
    const root = document.documentElement;
    if (hasConversation) root.setAttribute('data-workspace', 'active');
    else root.removeAttribute('data-workspace');
    return () => root.removeAttribute('data-workspace');
  }, [hasConversation]);



  // --- Pillar 4: Predictive Code Assist Logic ---
  const handleCodeChange = (e) => {
    const val = e.target.value;
    const pos = e.target.selectionStart;
    setWorkspaceCode(val);
    
    // Update VFS if we are editing a specific file
    if (workspaceActiveTab !== 'preview' && workspaceActiveTab !== 'code' && vfs[workspaceActiveTab]) {
      setVfs(prev => ({
        ...prev,
        [workspaceActiveTab]: { ...prev[workspaceActiveTab], content: val }
      }));
    }
    setCursorPos(pos);
    setGhostText('');
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(async () => {
      try {
        const prefix = val.substring(0, pos);
        const suffix = val.substring(pos);
        const res = await fetch('/api/autocomplete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix, suffix })
        });
        const data = await res.json();
        if (data.completion) {
          setGhostText(data.completion);
        }
      } catch (err) {
        console.error("Autocomplete fetch failed:", err);
      }
    }, 500);
  };

  const handleCodeKeyDown = (e) => {
    if (e.key === 'Tab' && ghostText) {
      e.preventDefault();
      const val = workspaceCode;
      const newCode = val.substring(0, cursorPos) + ghostText + val.substring(cursorPos);
      setWorkspaceCode(newCode);
      setCursorPos(cursorPos + ghostText.length);
      setGhostText('');
    } else if (e.key === 'Escape' && ghostText) {
      setGhostText('');
    }
  };

  // --- Pillar 3: Voice Mode Logic ---
  const toggleVoiceMode = async () => {
    if (isVoiceMode) {
      setIsVoiceMode(false);
      if (mediaRecorderRef.current) {
         mediaRecorderRef.current.stop();
      }
      if (audioWsRef.current) {
         audioWsRef.current.close();
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsVoiceMode(true);
      
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/api/live`;
      const ws = new WebSocket(wsUrl);
      audioWsRef.current = ws;
      
      ws.onopen = () => {
         const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
         mediaRecorderRef.current = mediaRecorder;
         
         mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
               ws.send(event.data);
            }
         };
         
         mediaRecorder.start(250); // Send chunk every 250ms
      };

      ws.onmessage = (event) => {
         console.log("Voice AI Response:", event.data);
      };

      ws.onerror = (e) => {
         console.error("Voice WebSocket Error:", e);
         setIsVoiceMode(false);
      };

      ws.onclose = () => {
         setIsVoiceMode(false);
      };

    } catch (e) {
      console.error("Failed to start voice mode:", e);
      alert("Microphone access denied or unavailable.");
    }
  };



  const [localInputText, setLocalInputText] = useState('');
  const inputText = externalInputText !== undefined ? externalInputText : localInputText;
  const setInputText = setExternalInputText || setLocalInputText;
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCodeMap, setShowCodeMap] = useState({});
  const [cognitiveLevel, setCognitiveLevel] = useState('Balanced');
  const [suggestedModel, setSuggestedModel] = useState(null);
  const [copiedMessageId, setCopiedMessageId] = useState(null);

  const [showScrollUp, setShowScrollUp] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    setShowScrollUp(scrollTop > 100);
    setShowScrollDown(scrollHeight - scrollTop - clientHeight > 10);
  };

  const [showMentionMenu, setShowMentionMenu] = useState(false);

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isGenerating]);

  const handleInputTextChange = (e) => {
    const text = e.target.value;
    setInputText(text);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 400) + 'px';
    
    // Trigger context menu on '@' typed at end or after space
    const mentionMatch = text.match(/(^|\s)@(\w*)$/);
    if (mentionMatch) {
      setShowMentionMenu(true);
    } else {
      setShowMentionMenu(false);
    }
  };

  const handleSelectMention = (mentionType, mentionName) => {
    const newAttachments = [...attachments, {
      name: mentionName,
      size: 'Context',
      type: 'context',
      contextType: mentionType
    }];
    setAttachments(newAttachments);
    
    const newText = inputText.replace(/(^|\s)@(\w*)$/, '$1');
    setInputText(newText);
    setShowMentionMenu(false);
  };

  const [attachments, setAttachments] = useState([]);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [showInBarModelDropdown, setShowInBarModelDropdown] = useState(false);
  const [arenaMode, setArenaMode] = useState(false);
  const [secondModel, setSecondModel] = useState({ id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nvidia Nemotron 3 Ultra' });
  const [showSecondModelDropdown, setShowSecondModelDropdown] = useState(false);
  const [isWorkspaceMode, setIsWorkspaceMode] = useState(false);
  const [workspaceCode, setWorkspaceCode] = useState('');
  const [vfs, setVfs] = useState({});
  const [workspaceActiveTab, setWorkspaceActiveTab] = useState('App.jsx');
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasCode, setCanvasCode] = useState('');
  const [lastProcessedMessageId, setLastProcessedMessageId] = useState(null);
  const [thinkingTime, setThinkingTime] = useState(0);
  const { checkModelHealth, logPreference } = usePCLMemory();
  const [pclIntercept, setPclIntercept] = useState(null);
  
  // Pillar 4: Predictive Code Assist State
  const [ghostText, setGhostText] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const typingTimeoutRef = useRef(null);

  // Pillar 3: Continuous Voice State
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioWsRef = useRef(null);

  const [isGithubModalOpen, setIsGithubModalOpen] = useState(false);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [githubRepoUrl, setGithubRepoUrl] = useState('');
  const [isFetchingGithub, setIsFetchingGithub] = useState(false);
  const [githubError, setGithubError] = useState('');

  const handleImportGithub = async () => {
    if (!githubRepoUrl) {
      setGithubError("Please enter a valid GitHub URL");
      return;
    }
    
    setIsFetchingGithub(true);
    setGithubError('');

    try {
      const response = await fetch('/api/github/fetch-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: githubRepoUrl })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to import repository');
      }

      setAttachments(prev => [...prev, {
        type: 'context',
        name: data.name,
        content: data.content
      }]);
      
      setIsGithubModalOpen(false);
      setGithubRepoUrl('');
    } catch (err) {
      setGithubError(err.message);
    } finally {
      setIsFetchingGithub(false);
    }
  };

  const openCanvasWithCode = (rawText) => {
    let cleanCode = '';
    const htmlMatch = rawText.match(/```html\n([\s\S]*?)```/i) || rawText.match(/```\n([\s\S]*?<html[\s\S]*?)```/i);
    if (htmlMatch && htmlMatch[1]) {
      cleanCode = htmlMatch[1];
    } else {
      cleanCode = rawText.includes('<!DOCTYPE html>') || rawText.includes('<html')
        ? rawText.replace(/```(?:html|javascript|js|css)?\n([\s\S]*?)```/gi, '$1')
        : `<!DOCTYPE html>\n<html>\n<head>\n<style>\nbody { font-family: sans-serif; padding: 24px; background: #0f172a; color: #fff; line-height: 1.6; }\n</style>\n</head>\n<body>\n<h2>Code Execution Preview</h2>\n<pre style="background: #1e293b; padding: 16px; border-radius: 12px; overflow: auto;">${rawText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>\n</body>\n</html>`;
    }
    setPreviewCode(cleanCode);
    setCanvasOpen(true);
  };


  const fileInputRef = useRef(null);
  const inBarModelRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-resize textarea when inputText changes programmatically (e.g., Magic Wand)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 400) + 'px';
    }
  }, [inputText]);

  // Click outside listener for in-bar model dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (inBarModelRef.current && !inBarModelRef.current.contains(event.target)) {
        setShowInBarModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const textColor = isLight ? '#0f172a' : '#ffffff';
  const subtextColor = isLight ? '#475569' : '#94a3b8';
  const bubbleUserBg = isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.12)';
  const bubbleUserBorder = isLight ? '#ffedd5' : 'rgba(249, 115, 22, 0.3)';
  const bubbleAiBg = isLight ? '#ffffff' : 'rgba(255, 255, 255, 0.04)';
  const bubbleAiBorder = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)';

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const newAttachments = files.map(file => ({
      name: file.name,
      size: (file.size / 1024).toFixed(1) + ' KB',
      type: file.type.includes('image') ? 'image' : 'file'
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  const toggleVoiceInput = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser. Please use Google Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true; // Show words as they are spoken
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      // Optional: alert or toast here if we had a toast system
    };
    
    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      if (finalTranscript) {
        setInputText(prev => {
          // Clean up any trailing space before appending
          const base = prev.replace(/\s+$/, '');
          return base ? base + ' ' + finalTranscript : finalTranscript;
        });
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      if (event.error === 'not-allowed') {
        alert("Microphone access blocked! Please click the camera/mic icon in your browser URL bar to allow microphone access.");
      } else {
        alert("Microphone error: " + event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to start speech recognition:", e);
      alert("Could not start microphone. Please ensure no other tab is using it.");
      setIsListening(false);
    }
  };

  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
  const [showHeroCardModal, setShowHeroCardModal] = useState(false);
  const [intentSelectedIndex, setIntentSelectedIndex] = useState(0);

  const handleMagicWandEnhance = async () => {
    if (!inputText.trim()) {
      const samplePrompts = [
        "Build a full-stack AI dashboard with real-time analytics, dark theme, and interactive widgets",
        "Create a Singapore SGD to INR currency exchange app with live charts and historical conversion rates",
        "Build an interactive AI Beat Synthesizer with customizable BPM and multi-track audio controls",
        "Design a sleek iOS-style calculator with currency conversion and history memory",
        "Create an intelligent recipe finder that generates meal plans based on leftover ingredients"
      ];
      setInputText(samplePrompts[Math.floor(Math.random() * samplePrompts.length)]);
      return;
    }

    setIsEnhancingPrompt(true);
    try {
      const res = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: inputText })
      });
      const data = await res.json();
      if (res.ok && data.enhancedPrompt) {
        setInputText(data.enhancedPrompt);
        setShowHeroCardModal(true);
      } else {
        console.error("Magic Wand failed:", data.error);
      }
    } catch (e) {
      console.error("Magic Wand network error:", e);
    } finally {
      setIsEnhancingPrompt(false);
    }
  };

  const [keyInputValue, setKeyInputValue] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');

  // Intelligent Router Logic
  useEffect(() => {
    const text = inputText.toLowerCase();
    if (!text.trim()) {
      setSuggestedModel(null);
      return;
    }
    const isCode = /react|function|const|python|api|bug|error|html|css|javascript|code|app|component/.test(text);
    const isResearch = /analyze|summarize|explain|compare|theory|architecture|research/.test(text);

    if (isCode && selectedModel?.name !== 'Qwen 2.5 Coder 32B') {
      const qwen = availableModels?.find(m => m.name.includes('Qwen 2.5 Coder')) || { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B' };
      setSuggestedModel(qwen);
    } else if (isResearch && selectedModel?.name !== 'DeepSeek V3') {
      const ds = availableModels?.find(m => m.name.includes('DeepSeek V3')) || { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3' };
      setSuggestedModel(ds);
    } else {
      setSuggestedModel(null);
    }
  }, [inputText, selectedModel, availableModels]);

  const saveKeyAndRetry = (keyType) => {
    if (!keyInputValue.trim()) return;
    if (keyType === 'gemini') {
      localStorage.setItem('geminiApiKey', keyInputValue.trim());
    } else {
      localStorage.setItem('openRouterApiKey', keyInputValue.trim());
    }
    setKeyInputValue('');
    updateActiveMessages(prev => prev.filter(m => !m.isKeyPrompt));
    if (lastPrompt) {
      handleSendMessage(lastPrompt);
    }
  };

  const handlePushToDream = (msg) => {
    if (!setDreamNodes || !dreamNodes) return;
    const newNode = {
      id: Date.now().toString(),
      stage: 'dream',
      dreamText: msg.text,
      ideaSpec: null,
      thoughtCode: null,
      actionUrl: null,
      isExecuting: false,
      timestamp: Date.now()
    };
    setDreamNodes([...dreamNodes, newNode]);
    if (setActiveTab) setActiveTab('canvas');
  };

  const { handleSendMessage: streamSendMessage, cancelStream } = useChatStream({
    inputText, setInputText,
    attachments, setAttachments,
    isGenerating, setIsGenerating,
    updateActiveMessages,
    chatSessions, activeSessionId,
    selectedModel,
    arenaMode, secondModel,
    cognitiveLevel,
    canvasCode,
    messages,
    setLastPrompt
  });

  const handleSendMessage = (overrideText = null) => {
    const textToSend = overrideText || inputText;
    if (!textToSend.trim() && !attachments.length) return;
    
    // HUMAN IN THE LOOP: PCL Memory Check
    if (selectedModel && !arenaMode) {
      const health = checkModelHealth(selectedModel.id);
      if (!health.isHealthy) {
        setPclIntercept({ text: textToSend, targetModel: selectedModel, errorType: health.errorType, timeAgo: health.lastFailureMsAgo });
        return; // Intercept!
      }
    }
    
    streamSendMessage(overrideText);
  };
  
  const handlePclDecision = (routeToGemini) => {
    if (!pclIntercept) return;
    if (routeToGemini) {
      // Force change model to Gemini
      const geminiModel = { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' };
      if (setSelectedModel) setSelectedModel(geminiModel);
      streamSendMessage(pclIntercept.text, geminiModel); 
      
    } else {
      streamSendMessage(pclIntercept.text);
    }
    setPclIntercept(null);
  };

  const renderedChatFeed = React.useMemo(() => {
    return messages.slice(1).map(msg => {
      const runnableCode = msg.sender === 'ai' ? extractRunnableCode(msg.text) : null;
      const isActiveGenerating = isGenerating && msg.id === messages[messages.length - 1].id;
      const isFailover = isActiveGenerating && msg.isFailover;
      
      // Hide empty AI message block while generating to avoid redundant avatar above "is thinking..." indicator
      if (msg.sender === 'ai' && !msg.text && isActiveGenerating) {
        return null;
      }
      
      return (
        <div key={msg.id} className="animate-slide-up" style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                {/* Avatar */}
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: msg.sender === 'user' ? '#3b82f6' : (isLight ? '#ffffff' : 'transparent'),
                  border: msg.sender === 'ai' && isLight ? '1px solid var(--border-color)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                  color: msg.sender === 'user' ? '#ffffff' : 'var(--text-primary)',
                  flexShrink: 0
                }}>
                  {msg.sender === 'user' ? (user?.name ? user.name[0] : 'B') : <Sparkles size={18} />}
                </div>

                {/* Content Bubble */}
                <div style={{ flex: 1 }}>
                  {msg.isDual ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', width: '100%' }}>
                      {/* Model A Card */}
                      <div style={{
                        background: isLight ? '#ffffff' : '#0d1127',
                        border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(249, 115, 22, 0.35)',
                        borderRadius: '24px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: isLight ? '0 4px 12px rgba(0,0,0,0.05)' : '0 8px 24px rgba(0,0,0,0.3)'
                      }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingBottom: '8px', borderBottom: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.08)' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f97316', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Cpu size={14} /> {formatModelName(msg.modelA.modelName)}
                            </span>
                            <span style={{ fontSize: '0.7rem', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>
                              ⚡ {msg.modelA.latencyMs}ms
                            </span>
                          </div>
                          <div className="markdown-prose" style={{ width: '100%', overflowX: 'hidden', fontSize: '0.9rem', lineHeight: 1.6, color: textColor }}>
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              components={{
                                code({node, inline, className, children, ...props}) {
                                  const match = /language-(\w+)/.exec(className || '')
                                  return !inline && match ? (
                                    <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" customStyle={{ borderRadius: '8px', margin: '10px 0', fontSize: '0.85rem' }} {...props}>
                                      {String(children).replace(/\n$/, '')}
                                    </SyntaxHighlighter>
                                  ) : (
                                    <code style={{ background: 'rgba(128,128,128,0.2)', padding: '2px 5px', borderRadius: '4px', fontFamily: 'monospace' }} {...props}>{children}</code>
                                  )
                                }
                              }}
                            >
                              {msg.modelA.text?.replace(/<!--\s*quantora-[\s\S]*?-->/g, '')}
                            </ReactMarkdown>
                          </div>
                        </div>
                        <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.7rem', color: subtextColor }}>Engine: {msg.modelA.provider}</span>
                          
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button 
                                  onClick={() => {
                                    navigator.clipboard.writeText(msg.modelA.text);
                                    setCopiedMessageId(`${msg.id}-A`);
                                    setTimeout(() => setCopiedMessageId(null), 2000);
                                  }}
                                  style={{ background: 'transparent', border: 'none', color: copiedMessageId === `${msg.id}-A` ? '#10b981' : subtextColor, cursor: 'pointer', padding: 0 }}
                                  title="Copy response"
                                >
                                  {copiedMessageId === `${msg.id}-A` ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                              </div>
                              <button 
                                onClick={() => {
                                  logPreference(msg.modelA.modelName);
                                  alert('Preference logged to Cognitive Memory!');
                                }}
                                style={{ background: 'transparent', border: '1px solid #3b82f6', color: '#3b82f6', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                👍 Select Model A
                              </button>
                            </div>

                        </div>
                      </div>

                      {/* Model B Card */}
                      <div style={{
                        background: isLight ? '#ffffff' : '#0d1127',
                        border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(59, 130, 246, 0.35)',
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: isLight ? '0 4px 12px rgba(0,0,0,0.05)' : '0 8px 24px rgba(0,0,0,0.3)'
                      }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingBottom: '8px', borderBottom: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.08)' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Cpu size={14} /> {formatModelName(msg.modelB.modelName)}
                            </span>
                            <span style={{ fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>
                              ⚡ {msg.modelB.latencyMs}ms
                            </span>
                          </div>
                          <div className="markdown-prose" style={{ width: '100%', overflowX: 'hidden', fontSize: '0.9rem', lineHeight: 1.6, color: textColor }}>
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              components={{
                                code({node, inline, className, children, ...props}) {
                                  const match = /language-(\w+)/.exec(className || '')
                                  return !inline && match ? (
                                    <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" customStyle={{ borderRadius: '8px', margin: '10px 0', fontSize: '0.85rem' }} {...props}>
                                      {String(children).replace(/\n$/, '')}
                                    </SyntaxHighlighter>
                                  ) : (
                                    <code style={{ background: 'rgba(128,128,128,0.2)', padding: '2px 5px', borderRadius: '4px', fontFamily: 'monospace' }} {...props}>{children}</code>
                                  )
                                }
                              }}
                            >
                              {msg.modelB.text?.replace(/<!--\s*quantora-[\s\S]*?-->/g, '')}
                            </ReactMarkdown>
                          </div>
                        </div>
                        <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.7rem', color: subtextColor }}>Engine: {msg.modelB.provider}</span>
                          
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button 
                                  onClick={() => {
                                    navigator.clipboard.writeText(msg.modelB.text);
                                    setCopiedMessageId(`${msg.id}-B`);
                                    setTimeout(() => setCopiedMessageId(null), 2000);
                                  }}
                                  style={{ background: 'transparent', border: 'none', color: copiedMessageId === `${msg.id}-B` ? '#10b981' : subtextColor, cursor: 'pointer', padding: 0 }}
                                  title="Copy response"
                                >
                                  {copiedMessageId === `${msg.id}-B` ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                              </div>
                              <button 
                                onClick={() => {
                                  logPreference(msg.modelB.modelName);
                                  alert('Preference logged to Cognitive Memory!');
                                }}
                                style={{ background: 'transparent', border: '1px solid #3b82f6', color: '#3b82f6', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                👍 Select Model B
                              </button>
                            </div>

                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="prose" style={{
                      background: msg.sender === 'user' ? (isLight ? '#f0f4f9' : '#1e1f20') : 'transparent',
                      border: 'none',
                      padding: msg.sender === 'user' ? '12px 18px' : '4px 0',
                      borderRadius: '20px',
                      color: textColor,
                      fontSize: '1rem',
                      lineHeight: 1.65,
                      boxShadow: 'none',
                      width: '100%'
                    }}>
                      {/* Render Attachments if present on user message */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                          {msg.attachments.map((att, i) => (
                            <span key={i} style={{ fontSize: '0.75rem', background: isLight ? '#fff' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(249, 115, 22, 0.3)', padding: '4px 10px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#f97316', fontWeight: '600' }}>
                              <Paperclip size={12} /> {att.name} ({att.size})
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Render Ollama Style "Thought for a moment" Header */}
                      {msg.thoughtProcess && (
                        <div style={{ fontSize: '0.8rem', color: subtextColor, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', padding: '12px 16px', background: isLight ? '#f8fafc' : 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                          <Lightbulb size={16} color="#f97316" />
                          <span style={{ fontWeight: 500 }}>Thought for a moment ({msg.thoughtProcess})</span>
                        </div>
                      )}

                      <div className="markdown-prose" style={{ width: '100%', overflowX: 'hidden' }}>
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({node, inline, className, children, ...props}) {
                              const match = /language-(\w+)/.exec(className || '')
                              return !inline && match ? (
                                <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" customStyle={{ borderRadius: '8px', margin: '10px 0', fontSize: '0.85rem' }} {...props}>
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              ) : (
                                <code style={{ background: 'rgba(128,128,128,0.2)', padding: '2px 5px', borderRadius: '4px', fontFamily: 'monospace' }} {...props}>{children}</code>
                              )
                            }
                          }}
                        >
                          {msg.text?.replace(/<!--\s*quantora-[\s\S]*?-->/g, '')}
                        </ReactMarkdown>
                      </div>

                      {/* Minimalist Message Footer */}
                      {msg.sender === 'ai' && !isActiveGenerating && (
                        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                          
                          {runnableCode && (
                            <button
                              onClick={() => {
                                setCanvasCode(runnableCode);
                                setCanvasOpen(true);
                              }}
                              style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '700', boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)' }}
                              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                              onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
                              title="Live Preview"
                            >
                              <Play size={12} fill="currentColor" /> Live Preview
                            </button>
                          )}

                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(msg.text?.replace(/<!--\s*quantora-[\s\S]*?-->/g, ''));
                              setCopiedMessageId(msg.id);
                              setTimeout(() => setCopiedMessageId(null), 2000);
                            }}
                            style={{ background: 'transparent', border: 'none', color: copiedMessageId === msg.id ? '#10b981' : subtextColor, cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: copiedMessageId === msg.id ? 1 : 0.5, transition: 'all 0.2s', padding: 0 }}
                            onMouseEnter={(e) => copiedMessageId !== msg.id && (e.currentTarget.style.opacity = 1)}
                            onMouseLeave={(e) => copiedMessageId !== msg.id && (e.currentTarget.style.opacity = 0.5)}
                            title="Copy to clipboard"
                          >
                            {copiedMessageId === msg.id ? (
                              <Check size={15} />
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            )}
                          </button>

                          <button 
                            style={{ background: 'transparent', border: 'none', color: subtextColor, cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.5, transition: 'opacity 0.2s', padding: 0 }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = 0.5}
                            title="Pin message"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 11.16V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3v5.16a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>
                          </button>
                          
                          <button 
                            style={{ background: 'transparent', border: 'none', color: subtextColor, cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.5, transition: 'opacity 0.2s', padding: 0 }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = 0.5}
                            title="Read aloud"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
                          </button>
                          
                          <span style={{ fontSize: '0.75rem', color: subtextColor, opacity: 0.5, marginLeft: '4px' }}>
                            just now
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Minimalist User Message Footer */}
                  {msg.sender === 'user' && (
                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(msg.text);
                          setCopiedMessageId(msg.id);
                          setTimeout(() => setCopiedMessageId(null), 2000);
                        }}
                        style={{ background: 'transparent', border: 'none', color: copiedMessageId === msg.id ? '#10b981' : subtextColor, cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: copiedMessageId === msg.id ? 1 : 0.4, transition: 'all 0.2s', padding: 0 }}
                        onMouseEnter={(e) => copiedMessageId !== msg.id && (e.currentTarget.style.opacity = 1)}
                        onMouseLeave={(e) => copiedMessageId !== msg.id && (e.currentTarget.style.opacity = 0.4)}
                        title="Copy prompt"
                      >
                        {copiedMessageId === msg.id ? <Check size={14} /> : <Copy size={14} />}
                      </button>

                      <button 
                        onClick={() => {
                          setInputText(msg.text);
                        }}
                        style={{ background: 'transparent', border: 'none', color: subtextColor, cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.4, transition: 'opacity 0.2s', padding: 0 }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = 0.4}
                        title="Edit prompt"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                      </button>
                      
                      <button 
                        onClick={() => alert("Prompt pushed to journey flow.")}
                        style={{ background: 'transparent', border: 'none', color: subtextColor, cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.4, transition: 'opacity 0.2s', padding: 0 }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = 0.4}
                        title="Push to Dream Canvas"
                      >
                        <Workflow size={14} />
                      </button>
                    </div>
                  )}

                  {/* Inline API Key Input Prompt */}
                  {msg.isAuthPrompt && (
                    <div style={{
                      marginTop: '14px',
                      padding: '16px',
                      background: isLight ? '#f8fafc' : 'rgba(15, 23, 42, 0.85)',
                      borderRadius: '12px',
                      border: '1px solid #0ea5e9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      flexWrap: 'wrap'
                    }}>
                      <div style={{ fontSize: '0.85rem', color: subtextColor, flex: 1, minWidth: '200px' }}>
                        Signing in lets you use Quantora's built-in AI without supplying your own key.
                      </div>
                      <button
                        onClick={() => onOpenAuth && onOpenAuth()}
                        style={{
                          background: '#0ea5e9',
                          color: '#ffffff',
                          border: 'none',
                          padding: '10px 20px',
                          borderRadius: '8px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Sign in
                      </button>
                    </div>
                  )}



                  {/* Render Interactive Live Component Sandboxes Directly in Chat */}
                  {msg.componentType === 'calculator' && <Suspense fallback={<div style={{padding: 20, color: '#888'}}>Loading Calculator...</div>}><LiveIosCalculator /></Suspense>}
                  {msg.componentType === 'beat' && <Suspense fallback={<div style={{padding: 20, color: '#888'}}>Loading BeatMaker...</div>}><LiveBeatMaker /></Suspense>}
                  {msg.componentType === 'quantum' && <Suspense fallback={<div style={{padding: 20, color: '#888'}}>Loading Quantum Simulator...</div>}><LiveQuantumSimulator /></Suspense>}

                  {/* Source Code Toggle Button */}
                  {msg.codeSnippet && (
                    <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <button
                        onClick={() => setShowCodeMap({ ...showCodeMap, [msg.id]: !showCodeMap[msg.id] })}
                        style={{ background: 'transparent', border: 'none', color: '#0284c7', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Code2 size={14} /> {showCodeMap[msg.id] ? 'Hide Source Code' : 'Inspect Source Code'}
                      </button>

                      <button
                        onClick={() => onPushToCanvas && onPushToCanvas(msg.codeSnippet)}
                        style={{ background: isLight ? '#f3e8ff' : 'rgba(139, 92, 246, 0.2)', border: isLight ? '1px solid #d8b4fe' : '1px solid rgba(139, 92, 246, 0.4)', color: isLight ? '#7c3aed' : '#a78bfa', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Workflow size={12} /> Push to Canvas
                      </button>
                    </div>
                  )}

                  {/* Optional Source Code Panel */}
                  {showCodeMap[msg.id] && msg.codeSnippet && (
                    <div style={{ marginTop: '10px', padding: '12px 16px', background: isLight ? '#0f172a' : '#070913', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <pre style={{ margin: 0, fontSize: '0.82rem', color: '#38bdf8', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                        {msg.codeSnippet}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
          });
  }, [messages, isLight, textColor, subtextColor, openCanvasWithCode, showCodeMap, keyInputValue, arenaMode, secondModel, onOpenAuth, isGenerating]);

  
  useEffect(() => {
    let interval;
    if (isGenerating) {
      setThinkingTime(0);
      interval = setInterval(() => {
        setThinkingTime(prev => prev + 1);
      }, 1000);
    } else {
      setThinkingTime(0);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  useEffect(() => {
    if (!isGenerating && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.sender === 'ai' && lastMsg.id !== lastProcessedMessageId) {
        setLastProcessedMessageId(lastMsg.id);
        const parsedVfs = parseVFSFromMarkdown(lastMsg.text);
        if (Object.keys(parsedVfs).length > 0) {
           setVfs(parsedVfs);
           // Also set workspaceCode for backward compatibility in case some child components strictly expect string
           setWorkspaceCode(parsedVfs['App.jsx']?.content || parsedVfs[Object.keys(parsedVfs)[0]]?.content || '');
           setWorkspaceActiveTab('preview');
           setIsWorkspaceMode(true);
        } else {
           // Fallback for old single-string generations
           const code = extractRunnableCode(lastMsg.text);
           if (code) {
              setWorkspaceCode(code);
              setVfs({ 'App.jsx': { content: code, language: 'jsx' } });
              setWorkspaceActiveTab('preview');
              setIsWorkspaceMode(true);
           }
        }
      }
    }
  }, [isGenerating, messages, lastProcessedMessageId]);

  return (
    <div style={{
      display: 'flex',
      gap: '20px',
      maxWidth: isWorkspaceMode ? '100%' : '1400px',
      padding: isWorkspaceMode ? '20px' : '0',
      margin: '0 auto',
      flex: 1,
      minHeight: 0,
      width: '100%',
      alignItems: 'stretch',
      position: 'relative',
      transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      {/* Left Navigation Sidebar - Chat History */}
      <div style={{
        width: sidebarOpen ? (isWorkspaceMode ? '220px' : '260px') : '0px',
        opacity: sidebarOpen ? 1 : 0,
        pointerEvents: sidebarOpen ? 'auto' : 'none',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex',
        flexDirection: 'column',
        background: isLight ? '#f0f4f9' : 'var(--bg-secondary)',
        border: 'none',
        borderRadius: isWorkspaceMode ? '16px' : '0 24px 24px 0',
        padding: sidebarOpen ? '20px 16px' : '0px',
        overflow: 'hidden',
        flexShrink: 0
      }}>
        {/* Sidebar Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <button
            onClick={handleCreateNewChat}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
              color: '#ffffff',
              border: 'none',
              padding: '10px 14px',
              borderRadius: '12px',
              fontWeight: '700',
              fontSize: '0.88rem',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(249, 115, 22, 0.25)',
              transition: 'all 0.2s ease'
            }}
          >
            <Plus size={16} />
            <span>New Chat</span>
          </button>

          <button
            onClick={() => setSidebarOpen(false)}
            title="Collapse sidebar"
            style={{
              background: 'transparent',
              border: 'none',
              color: subtextColor,
              padding: '8px',
              cursor: 'pointer',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: '6px'
            }}
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        {/* Specialized Agents Section */}
        <div style={{ fontSize: '0.72rem', fontWeight: '700', color: subtextColor, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', paddingLeft: '4px' }}>
          Specialized Agents
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '2px', marginBottom: '24px' }}>
          {[
            { title: 'Travel Guide AI', icon: <Globe size={15} color="#3b82f6" />, prompt: 'Act as a world-class travel planner. I want to plan a trip.' },
            { title: 'Finance Advisor', icon: <PieChart size={15} color="#10b981" />, prompt: 'Act as a strict, data-driven financial analyst. Help me evaluate my portfolio.' },
            { title: 'Study Tutor', icon: <Lightbulb size={15} color="#f59e0b" />, prompt: 'Act as an encouraging academic tutor using the Socratic method. Teach me something new.' },
            { title: 'Research Analyst', icon: <Layers size={15} color="#8b5cf6" />, prompt: 'Act as a deep-dive research assistant. Let\'s explore a complex topic.' }
          ].map((card, idx) => (
            <div
              key={idx}
              onClick={() => {
                handleSendMessage(card.prompt);
                if (window.innerWidth < 768) setSidebarOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: '500',
                color: textColor,
                border: '1px solid transparent',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.borderColor = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'transparent';
              }}
            >
              <div style={{ flexShrink: 0 }}>{card.icon}</div>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.title}</span>
            </div>
          ))}
        </div>

        {/* History Section Title */}
        <div style={{ fontSize: '0.72rem', fontWeight: '700', color: subtextColor, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', paddingLeft: '4px' }}>
          Chat History
        </div>

        {/* Sessions List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '2px' }}>
          {chatSessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  background: isActive ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.15)') : 'transparent',
                  border: isActive ? (isLight ? '1px solid #ffedd5' : '1px solid rgba(249, 115, 22, 0.3)') : '1px solid transparent',
                  color: isActive ? '#f97316' : textColor,
                  fontSize: '0.85rem',
                  fontWeight: isActive ? '700' : '500',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.05)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', flex: 1 }}>
                  <MessageSquare size={15} color={isActive ? '#f97316' : subtextColor} style={{ flexShrink: 0 }} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {session.title || 'New Chat'}
                  </span>
                </div>

                <button
                  onClick={(e) => handleDeleteChat(e, session.id)}
                  title="Delete chat"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: subtextColor,
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    opacity: isActive ? 1 : 0.6,
                    transition: 'opacity 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                  onMouseLeave={(e) => e.currentTarget.style.color = subtextColor}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Chat Interface (Center or Left if Workspace is Open) */}
      <div style={{
        flex: isWorkspaceMode ? '0 0 42%' : 1,
        display: 'flex',
        flexDirection: 'column',
        maxWidth: isWorkspaceMode ? '42%' : '100%',
        margin: '0 auto',
        padding: isWorkspaceMode ? '0 10px 0 0' : '20px 40px',
        minHeight: 0,
        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Top Header Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
          paddingBottom: '16px',
          borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                title="Open Chat History Sidebar"
                style={{
                  background: isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.08)',
                  border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.12)',
                  color: textColor,
                  padding: '8px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '4px'
                }}
              >
                <PanelLeft size={18} />
              </button>
            )}



            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(249, 115, 22, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={20} color="#f97316" />
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
              <h2 style={{ fontSize: '1.2rem', margin: 0, fontWeight: '700', color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: messages.length <= 1 ? 0 : 1, transition: 'opacity 0.3s ease' }}>
                {activeSession && messages.length > 1 ? activeSession.title : 'New Workspace'}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap', opacity: messages.length <= 1 ? 0 : 1, transition: 'opacity 0.3s ease' }}>
                <span style={{ fontSize: '0.78rem', color: subtextColor, whiteSpace: 'nowrap' }}>
                  Selected Model: <strong style={{ color: '#f97316' }}>{selectedModel ? formatModelName(selectedModel.name) : 'Gemini 3 Flash'}</strong>
                </span>
                <span style={{
                  fontSize: '0.7rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  fontWeight: '600',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                  Live API Engine Active
                </span>
              </div>
            </div>
          </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
          {/* Dual Model Arena Toggle Button */}
          <button
            onClick={() => setArenaMode(!arenaMode)}
            title="Compare two AI models side-by-side in real time"
            style={{
              background: arenaMode ? 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)' : (isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.05)'),
              border: arenaMode ? 'none' : (isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.1)'),
              color: arenaMode ? '#ffffff' : textColor,
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: arenaMode ? '0 4px 12px rgba(249, 115, 22, 0.3)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <Layers size={14} /> {arenaMode ? '⚔️ Arena Mode Active' : '⚔️ Dual Arena Mode'}
          </button>

          {/* Model B Selector Dropdown in Arena Mode */}
          {arenaMode && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowSecondModelDropdown(!showSecondModelDropdown)}
                style={{
                  background: isLight ? '#ffffff' : '#0d1127',
                  border: '1px solid #f97316',
                  color: '#f97316',
                  padding: '6px 12px',
                  borderRadius: '18px',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>VS: {secondModel ? secondModel.name : 'Nvidia Nemotron 3'}</span>
                <ChevronDown size={12} />
              </button>

              {showSecondModelDropdown && (
                <div style={{
                  position: 'absolute',
                  top: '120%',
                  right: 0,
                  width: '240px',
                  background: isLight ? '#ffffff' : '#0d1127',
                  border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(249, 115, 22, 0.4)',
                  borderRadius: '14px',
                  padding: '8px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                  zIndex: 300
                }}>
                  <div style={{ fontSize: '0.7rem', color: subtextColor, padding: '4px 8px', fontWeight: '700', textTransform: 'uppercase' }}>
                    Select Competitor Model (Model B)
                  </div>
                  {availableModels && availableModels.map(m => (
                    <div
                      key={m.id}
                      onClick={() => {
                        setSecondModel(m);
                        setShowSecondModelDropdown(false);
                      }}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        background: secondModel?.id === m.id ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.2)') : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.8rem',
                        color: secondModel?.id === m.id ? '#f97316' : textColor,
                        fontWeight: secondModel?.id === m.id ? '700' : '500'
                      }}
                    >
                      <span>{m.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => updateActiveMessages([])}
            style={{ background: isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.05)', border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.1)', color: subtextColor, padding: '6px 14px', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={13} /> Reset Chat
          </button>
        </div>
      </div>

      {/* Messages Stream / Initial Hero State */}
      <div ref={chatContainerRef} onScroll={handleScroll} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: messages.length <= 1 ? 'center' : 'flex-start', overflowY: 'auto', marginBottom: '24px', position: 'relative' }}>
        {messages.length <= 1 ? (
          /* Clean Hero Empty State */
          <div style={{ 
            textAlign: 'center', 
            padding: '48px 32px 32px 32px', 
            maxWidth: '720px', 
            margin: '40px auto 0 auto', 
            width: '100%',
            background: isLight ? 'linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(248, 250, 252, 0.85))' : 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(40px) saturate(200%)',
            WebkitBackdropFilter: 'blur(40px) saturate(200%)',
            border: isLight ? '1px solid rgba(226, 232, 240, 0.8)' : '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '32px',
            boxShadow: isLight ? '0 32px 64px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(255,255,255,0.6) inset' : '0 32px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.2)'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%)',
              border: '1px solid rgba(249, 115, 22, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px auto',
              boxShadow: '0 8px 24px rgba(249, 115, 22, 0.15)'
            }}>
              <Sparkles size={28} color="#f97316" />
            </div>

            <h1 style={{ fontSize: '2.6rem', fontWeight: '800', margin: '0 0 8px 0', color: textColor, letterSpacing: '-0.03em' }}>
              Hello, {user?.name ? user.name.split(' ')[0] : 'Bharani'}
            </h1>
            <p style={{ fontSize: '1.2rem', fontWeight: '400', margin: '0 0 40px 0', color: subtextColor }}>
              What would you like to build today?
            </p>

            {/* AI Models Highlight Cards */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '16px',
              paddingBottom: '20px',
              width: '100%'
            }}>
              
              {[
                { name: "Gemini 1.5 Pro", desc: "2M Context Window • Advanced Reasoning for complex logic.", icon: <Cpu size={20} color="#f97316"/>, badge: "NEW", color: "#f97316" },
                { name: "Claude 3.5 Sonnet", desc: "Ultra-fast coding via OpenRouter integration.", icon: <Sparkles size={20} color="#8b5cf6"/>, badge: "HOT", color: "#8b5cf6" },
                { name: "Llama 3 70B", desc: "Open-source powerhouse with zero filters.", icon: <Layers size={20} color="#10b981"/>, badge: "UPDATED", color: "#10b981" }
              ].map((model, idx) => (
                <div key={idx} style={{
                  flex: '1 1 200px',
                  maxWidth: '280px',
                  background: isLight ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.05)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: isLight ? '1px solid rgba(255, 255, 255, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: isLight ? '0 8px 32px rgba(31, 38, 135, 0.07)' : '0 8px 32px rgba(0, 0, 0, 0.3)',
                  borderRadius: '16px',
                  padding: '16px',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
                }}
                onMouseEnter={(e) => { 
                  e.currentTarget.style.transform = 'translateY(-3px)'; 
                  e.currentTarget.style.boxShadow = `0 12px 24px ${model.color}33`; 
                  e.currentTarget.style.borderColor = `${model.color}66`;
                }}
                onMouseLeave={(e) => { 
                  e.currentTarget.style.transform = 'none'; 
                  e.currentTarget.style.boxShadow = isLight ? '0 4px 12px rgba(0,0,0,0.03)' : '0 8px 32px rgba(0,0,0,0.2)'; 
                  e.currentTarget.style.borderColor = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)';
                }}
                >
                  <div style={{ position: 'absolute', top: 0, right: 0, background: `${model.color}22`, color: model.color, fontSize: '0.65rem', fontWeight: '800', padding: '4px 10px', borderBottomLeftRadius: '12px' }}>
                    {model.badge}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ background: `${model.color}15`, padding: '8px', borderRadius: '12px', display: 'flex' }}>
                      {model.icon}
                    </div>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', color: textColor, fontWeight: '700' }}>{formatModelName(model.name)}</h3>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: subtextColor, lineHeight: '1.5' }}>
                    {model.desc}
                  </p>
                </div>
              ))}
            </div>



          </div>
        ) : (
          /* Active Chat Thread */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
            {renderedChatFeed}
            {pclIntercept && (
              <div className="animate-slide-up" style={{ 
                margin: '20px 0', 
                padding: '20px', 
                background: isLight ? '#fff' : '#0f172a', 
                border: '1px solid rgba(249, 115, 22, 0.4)', 
                borderRadius: '16px',
                boxShadow: isLight ? '0 10px 25px rgba(0,0,0,0.05)' : '0 10px 25px rgba(0,0,0,0.3)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', color: '#f97316', fontWeight: 'bold' }}>
                  <Sparkles size={20} /> PCL Observation
                </div>
                <div style={{ color: 'var(--text-primary)', marginBottom: '20px', lineHeight: '1.5' }}>
                  I remember that <strong>{pclIntercept.targetModel.name}</strong> experienced severe network latency a few minutes ago. 
                  To prevent you from waiting, would you like me to route this request to our fastest model (<strong>Gemini 3 Flash</strong>) instead?
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    onClick={() => handlePclDecision(true)}
                    style={{ background: '#f97316', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', flex: 1 }}
                  >
                    Route to Gemini Flash
                  </button>
                  <button 
                    onClick={() => handlePclDecision(false)}
                    style={{ background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: 'none', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', flex: 1 }}
                  >
                    Force Proceed with {pclIntercept.targetModel.name}
                  </button>
                </div>
              </div>
            )}
            {isGenerating && (
              <div className="animate-slide-up" style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', marginTop: '4px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Sparkles size={18} className="animate-spin" color="#f97316" />
                </div>
                <div style={{ flex: 1, color: '#f97316', fontSize: '0.9rem', paddingTop: '8px', fontWeight: 500 }}>
                  {(isGenerating && messages[messages.length - 1]?.isFailover) ? 'Original model stalled. Proactively switching to a faster model...' :
                   thinkingTime > 45 ? 'The model is experiencing high latency...' :
                   thinkingTime > 25 ? 'Still working on your request...' :
                   thinkingTime > 10 ? 'This is taking a bit longer than usual...' :
                   `${selectedModel ? formatModelName(selectedModel.name) : 'Model'} is thinking...`}
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Scroll Navigation */}
      <div style={{ position: 'absolute', bottom: '110px', right: '30px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 100 }}>
        {showScrollUp && (
          <button
            onClick={() => chatContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            style={{ background: isLight ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)', color: subtextColor, width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', transition: 'background 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.background = isLight ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,0.7)'}
            onMouseLeave={(e) => e.currentTarget.style.background = isLight ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)'}
            title="Scroll to top"
          >
            <ChevronUp size={18} />
          </button>
        )}
        {showScrollDown && (
          <button
            onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
            style={{ background: isLight ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)', color: subtextColor, width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', transition: 'background 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.background = isLight ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,0.7)'}
            onMouseLeave={(e) => e.currentTarget.style.background = isLight ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)'}
            title="Scroll to bottom"
          >
            <ChevronDown size={18} />
          </button>
        )}
      </div>

      {/* Clean Prompt Console Input Area */}
      <div style={{ position: 'relative', width: '100%', maxWidth: '1000px', margin: '0 auto' }}>
        {/* Prompt Card Container */}
        <div className="floating-input-pill" style={{
          overflow: 'visible',
          position: 'relative',
          padding: '12px 14px',
          background: isLight ? '#f4f4f5' : '#27272a',
          borderRadius: '24px',
          border: isLight ? '1px solid #e4e4e7' : '1px solid #3f3f46',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          {/* Attachment Files Badge Bar (Moved inside pill) */}
          {attachments.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
              {attachments.map((att, index) => (
                <span
                  key={index}
                  style={{
                    fontSize: '0.75rem',
                    background: isLight ? '#ffffff' : 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid #f97316',
                    color: textColor,
                    padding: '4px 10px',
                    borderRadius: '16px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}
                >
                  {att.type === 'context' ? <Layers size={12} color="#8b5cf6" /> : att.type === 'image' ? <ImageIcon size={12} color="#f97316" /> : <FileText size={12} color="#0284c7" />}
                  <span>{att.name}</span>
                  <X
                    size={12}
                    color="#ef4444"
                    style={{ cursor: 'pointer' }}
                    onClick={() => removeAttachment(index)}
                  />
                </span>
              ))}
            </div>
          )}
          {/* Intelligent Router Suggestion Pill */}
          {suggestedModel && !showMentionMenu && (
            <div style={{
              position: 'absolute',
              top: '-35px',
              left: '12px',
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 27, 75, 0.95) 100%)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(249, 115, 22, 0.4)',
              borderRadius: '20px',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
              zIndex: 10
            }}>
              <span style={{ fontSize: '0.75rem', color: '#e2e8f0', fontWeight: '500' }}>
                🧠 Looks like you're {suggestedModel.name.includes('Qwen') ? 'coding' : 'researching'}. Recommend: <strong style={{color: '#f97316'}}>{suggestedModel.name}</strong>
              </span>
              <button 
                onClick={() => { setSelectedModel(suggestedModel); setSuggestedModel(null); }}
                style={{ background: '#f97316', color: '#fff', border: 'none', padding: '3px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}>
                Switch
              </button>
            </div>
          )}

          {/* Context Mention Floating Menu */}
          {showMentionMenu && (
            <div style={{
              position: 'absolute',
              bottom: 'calc(100% + 10px)',
              left: '12px',
              background: isLight ? '#ffffff' : '#0d1127',
              border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(139, 92, 246, 0.4)',
              borderRadius: '16px',
              padding: '8px',
              boxShadow: isLight ? '0 -10px 30px rgba(0,0,0,0.15)' : '0 -15px 40px rgba(0,0,0,0.6)',
              zIndex: 100,
              width: '280px'
            }}>
              <div style={{ fontSize: '0.7rem', color: subtextColor, padding: '6px 10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Tag Context
              </div>
              <div
                onClick={() => handleSelectMention('canvas', '@CanvasCode')}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '0.85rem',
                  color: textColor,
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = isLight ? '#f1f5f9' : 'rgba(139, 92, 246, 0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <Code2 size={16} color="#8b5cf6" />
                <div>
                  <div style={{ fontWeight: '600' }}>Current Canvas Code</div>
                  <div style={{ fontSize: '0.7rem', color: subtextColor }}>Ground AI in sandbox code</div>
                </div>
              </div>
              
              <div
                onClick={() => handleSelectMention('history', '@LastSession')}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '0.85rem',
                  color: textColor,
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = isLight ? '#f1f5f9' : 'rgba(139, 92, 246, 0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <MessageSquare size={16} color="#8b5cf6" />
                <div>
                  <div style={{ fontWeight: '600' }}>Last Session Context</div>
                  <div style={{ fontSize: '0.7rem', color: subtextColor }}>Read previous conversation</div>
                </div>
              </div>
            </div>
          )}



          {/* Text Area Input */}
          <div style={{ position: 'relative', padding: '0' }}>
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={handleInputTextChange}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowMentionsList(false);
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                  e.target.style.height = 'auto';
                }
              }}
              placeholder="Ask Quantora to code an app, analyze data, or generate ideas..."
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: textColor,
                fontSize: '1rem',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                lineHeight: '1.5',
                minHeight: '24px',
                maxHeight: '400px',
                overflow: 'auto'
              }}
            />
          </div>

          {/* Bottom Action Toolbar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 14px 10px 14px',
            background: 'transparent',
            gap: '10px',
            flexWrap: 'wrap'
          }}>
            {/* Left Toolbar Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                multiple
              />

              {/* Attach File */}
              <button
                onClick={toggleVoiceInput}
                title="Voice Input"
                style={{
                  background: isListening ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                  border: 'none',
                  color: isListening ? '#ef4444' : subtextColor,
                  padding: '6px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: isListening ? 'pulse 2s infinite' : 'none'
                }}
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              
              {/* Attachment Dropdown */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setIsAttachmentMenuOpen(!isAttachmentMenuOpen)}
                  title="Attach file, image, or GitHub"
                  style={{
                    background: isAttachmentMenuOpen ? (isLight ? '#f1f5f9' : 'rgba(255,255,255,0.1)') : 'transparent',
                    border: 'none',
                    color: isAttachmentMenuOpen ? textColor : subtextColor,
                    padding: '6px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={e => {
                    if (!isAttachmentMenuOpen) {
                      e.currentTarget.style.background = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.08)';
                      e.currentTarget.style.color = textColor;
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isAttachmentMenuOpen) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = subtextColor;
                    }
                  }}
                >
                  <Paperclip size={18} />
                </button>

                {isAttachmentMenuOpen && (
                  <>
                    {/* Backdrop to close menu */}
                    <div 
                      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }} 
                      onClick={() => setIsAttachmentMenuOpen(false)} 
                    />
                    
                    {/* Dropdown Menu */}
                    <div style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: '0',
                      marginBottom: '8px',
                      background: isLight ? '#ffffff' : '#1e293b',
                      border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                      padding: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      minWidth: '200px',
                      zIndex: 101
                    }}>
                      <button 
                        onClick={() => { fileInputRef.current?.click(); setIsAttachmentMenuOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'transparent', border: 'none', color: textColor, cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s', fontSize: '0.9rem', textAlign: 'left' }}
                        onMouseEnter={e => e.currentTarget.style.background = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <FileText size={16} color="#3b82f6" /> Add a File
                      </button>
                      
                      <button 
                        onClick={() => { 
                          if (fileInputRef.current) {
                            fileInputRef.current.accept = "image/*";
                            fileInputRef.current.click();
                            setTimeout(() => { if (fileInputRef.current) fileInputRef.current.accept = ""; }, 1000);
                          }
                          setIsAttachmentMenuOpen(false); 
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'transparent', border: 'none', color: textColor, cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s', fontSize: '0.9rem', textAlign: 'left' }}
                        onMouseEnter={e => e.currentTarget.style.background = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <ImageIcon size={16} color="#10b981" /> Image
                      </button>

                      <div style={{ height: '1px', background: isLight ? '#e2e8f0' : 'rgba(255,255,255,0.1)', margin: '4px 0' }} />

                      <button 
                        onClick={() => { setIsGithubModalOpen(true); setIsAttachmentMenuOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'transparent', border: 'none', color: textColor, cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s', fontSize: '0.9rem', textAlign: 'left' }}
                        onMouseEnter={e => e.currentTarget.style.background = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <Github size={16} color={isLight ? "#334155" : "#e2e8f0"} /> Connect to Github
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Magic Wand Enhancer */}
              <button
                onClick={handleMagicWandEnhance}
                disabled={isEnhancingPrompt}
                title="AI Magic Wand - Enhance & Expand Prompt"
                style={{
                  background: isEnhancingPrompt ? (isLight ? 'rgba(249, 115, 22, 0.1)' : 'rgba(249, 115, 22, 0.2)') : 'transparent',
                  border: 'none',
                  color: isEnhancingPrompt ? '#f97316' : subtextColor,
                  padding: isEnhancingPrompt ? '4px 12px' : '6px',
                  borderRadius: '12px',
                  cursor: isEnhancingPrompt ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  fontWeight: '600',
                  fontSize: '0.8rem'
                }}
              >
                {isEnhancingPrompt ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Enhancing Prompt...
                  </>
                ) : (
                  <Wand2 size={18} color={subtextColor} />
                )}
              </button>

              {/* Engine Settings Popover */}
              <div ref={inBarModelRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowInBarModelDropdown(!showInBarModelDropdown)}
                  title="Select AI Engine"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: showInBarModelDropdown ? (isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.1)') : 'transparent',
                    border: 'none',
                    color: showInBarModelDropdown ? '#f97316' : subtextColor,
                    padding: '4px 10px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}
                >
                  <Cpu size={15} color={showInBarModelDropdown ? "#f97316" : subtextColor} />
                  <span>{selectedModel ? formatModelName(selectedModel.name).split(' ')[0] : 'Engine'}</span>
                </button>

                {showInBarModelDropdown && (
                  <div style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 10px)',
                    left: 0,
                    width: '300px',
                    maxHeight: '400px',
                    overflowY: 'auto',
                    background: isLight ? '#ffffff' : '#0d1127',
                    border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(249, 115, 22, 0.4)',
                    borderRadius: '16px',
                    padding: '12px',
                    boxShadow: isLight ? '0 -10px 30px rgba(0,0,0,0.15)' : '0 -15px 40px rgba(0,0,0,0.6)',
                    zIndex: 900,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                  }}>
                    {/* Cognitive Effort Control (Inside Popover) */}
                    <div>
                      <div style={{ fontSize: '0.7rem', color: subtextColor, marginBottom: '8px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Cognitive Effort
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', background: isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', padding: '4px', border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.1)' }}>
                        {['Lightning', 'Balanced', 'Deep Think'].map(level => (
                          <button
                            key={level}
                            onClick={() => setCognitiveLevel(level)}
                            style={{
                              flex: 1,
                              background: cognitiveLevel === level ? (isLight ? '#ffffff' : 'rgba(249, 115, 22, 0.2)') : 'transparent',
                              color: cognitiveLevel === level ? '#f97316' : subtextColor,
                              border: 'none',
                              padding: '6px 0',
                              borderRadius: '8px',
                              fontSize: '0.72rem',
                              fontWeight: cognitiveLevel === level ? '700' : '500',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              boxShadow: cognitiveLevel === level && isLight ? '0 2px 6px rgba(0,0,0,0.05)' : 'none'
                            }}
                          >
                            {level === 'Lightning' && '⚡ '}{level === 'Deep Think' && '🧠 '}{level}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* AI Model Control (Inside Popover) */}
                    <div>
                      <div style={{ fontSize: '0.7rem', color: subtextColor, marginBottom: '8px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        AI Model
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {availableModels && availableModels.map(model => {
                          const isAvailable = model.available !== false;
                          
                          return (
                          <div
                            key={model.id}
                            onClick={() => {
                              if (isAvailable) {
                                setSelectedModel(model);
                                setShowInBarModelDropdown(false);
                              }
                            }}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '8px',
                              cursor: isAvailable ? 'pointer' : 'not-allowed',
                              background: selectedModel?.id === model.id ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.15)') : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '0.8rem',
                              color: isAvailable ? (selectedModel?.id === model.id ? '#f97316' : textColor) : subtextColor,
                              fontWeight: selectedModel?.id === model.id ? '700' : '500',
                              opacity: isAvailable ? 1 : 0.6,
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              if (isAvailable && selectedModel?.id !== model.id) {
                                e.currentTarget.style.background = isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.05)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (selectedModel?.id !== model.id) e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: !isAvailable ? 'line-through' : 'none' }}>{formatModelName(model.name)}</span>
                              <span style={{ fontSize: '0.68rem', color: subtextColor, fontWeight: '400' }}>{model.provider || (model.id.startsWith('gemini') ? 'Google' : 'OpenRouter')}</span>
                            </div>
                            {selectedModel?.id === model.id && (
                              <span style={{ fontSize: '0.65rem', background: '#f97316', color: '#fff', padding: '2px 6px', borderRadius: '10px', flexShrink: 0 }}>Active</span>
                            )}
                            {!isAvailable && (
                              <span style={{ fontSize: '0.65rem', background: isLight ? '#cbd5e1' : '#334155', color: isLight ? '#64748b' : '#94a3b8', padding: '2px 6px', borderRadius: '10px', flexShrink: 0 }}>Unavailable</span>
                            )}
                          </div>
                        )})}
                      </div>
                    </div>
                  </div>
                )}
              </div>



              {/* Web Grounding Chip */}
              <button
                onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                title={webSearchEnabled ? "Live Web Search Enabled" : "Enable Web Search Grounding"}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: webSearchEnabled ? 'rgba(2, 132, 199, 0.15)' : (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)'),
                  border: webSearchEnabled ? '1px solid rgba(2, 132, 199, 0.3)' : '1px solid transparent',
                  color: webSearchEnabled ? '#0ea5e9' : subtextColor,
                  padding: '6px 12px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  marginLeft: '8px'
                }}
                onMouseEnter={e => {
                  if (!webSearchEnabled) {
                    e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)';
                  }
                }}
                onMouseLeave={e => {
                  if (!webSearchEnabled) {
                    e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)';
                  }
                }}
              >
                <Globe size={16} /> 
                {webSearchEnabled ? 'Grounded' : 'Web Grounding'}
              </button>
            </div>

            {/* Right Control: Send & Push Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => {
                  if (!inputText.trim()) return;
                  if (setDreamNodes && dreamNodes) {
                    const newNode = {
                      id: Date.now().toString(),
                      stage: 'dream',
                      dreamText: inputText,
                      ideaSpec: null,
                      thoughtCode: null,
                      actionUrl: null,
                      isExecuting: false,
                      timestamp: Date.now()
                    };
                    setDreamNodes([...dreamNodes, newNode]);
                    if (setActiveTab) setActiveTab('canvas');
                  }
                }}
                disabled={!inputText.trim()}
                title="Push raw prompt to Dream Canvas"
                style={{
                  background: inputText.trim() ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                  border: inputText.trim() ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid transparent',
                  color: inputText.trim() ? '#8b5cf6' : (isLight ? '#94a3b8' : 'rgba(255, 255, 255, 0.45)'),
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  cursor: inputText.trim() ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease'
                }}
              >
                <Workflow size={16} />
              </button>

              {isGenerating ? (
                <button
                  onClick={() => cancelStream()}
                  title="Stop generating"
                  style={{
                    background: isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: isLight ? '#64748b' : '#94a3b8',
                    width: '38px',
                    height: '38px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                    boxShadow: 'none'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#ef4444';
                    e.currentTarget.style.background = isLight ? '#fee2e2' : 'rgba(239, 68, 68, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = isLight ? '#64748b' : '#94a3b8';
                    e.currentTarget.style.background = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)';
                  }}
                >
                  <Square size={14} fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!inputText.trim() && !attachments.length}
                  style={{
                    background: (inputText.trim() || attachments.length) ? '#f97316' : (isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)'),
                    border: 'none',
                    color: (inputText.trim() || attachments.length)
                      ? '#ffffff'
                      : (isLight ? '#94a3b8' : 'rgba(255, 255, 255, 0.45)'),
                    width: '38px',
                    height: '38px',
                    borderRadius: '12px',
                    cursor: (inputText.trim() || attachments.length) ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                    fontWeight: 'bold',
                    boxShadow: (inputText.trim() || attachments.length) ? '0 4px 14px rgba(249, 115, 22, 0.35)' : 'none'
                  }}
                >
                  <Send size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

      </div>
      </div>

      {/* Live Preview Canvas Overlay Modal */}
      {canvasOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '1200px',
            height: '90vh',
            background: isLight ? '#f8fafc' : '#0d1127',
            borderRadius: '20px',
            border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(249, 115, 22, 0.5)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <LivePreviewCanvas 
              code={canvasCode} 
              isLight={isLight} 
              onClose={() => setCanvasOpen(false)} 
            />
          </div>
        </div>
      )}

      {/* Right Panel: Interactive Code Canvas (Pillar 1) */}
      {isWorkspaceMode && (
        <div style={{
          flex: 1,
          background: isLight ? '#ffffff' : '#0d1127',
          border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: isLight ? '0 10px 40px rgba(0,0,0,0.05)' : '0 20px 60px rgba(0,0,0,0.4)',
          animation: 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          position: 'relative'
        }}>
          {/* Canvas Header (File Tabs) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: isLight ? '#f8fafc' : '#0a0d1e',
            borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)',
            padding: '0 16px',
            height: '48px',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', gap: '4px', height: '100%' }}>
              {(Object.keys(vfs).length > 0 ? ['preview', ...Object.keys(vfs)] : ['preview', 'code']).map(tab => (
                <button
                  key={tab}
                  onClick={() => setWorkspaceActiveTab(tab)}
                  style={{
                    background: workspaceActiveTab === tab ? (isLight ? '#ffffff' : '#0d1127') : 'transparent',
                    border: 'none',
                    color: workspaceActiveTab === tab ? '#f97316' : subtextColor,
                    padding: '0 16px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: workspaceActiveTab === tab ? '600' : '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    height: '100%',
                    borderTop: workspaceActiveTab === tab ? '2px solid #f97316' : '2px solid transparent',
                    borderLeft: workspaceActiveTab === tab && isLight ? '1px solid #e2e8f0' : '1px solid transparent',
                    borderRight: workspaceActiveTab === tab && isLight ? '1px solid #e2e8f0' : '1px solid transparent',
                    borderBottom: 'none',
                    transition: 'all 0.2s ease',
                    marginTop: 'auto'
                  }}
                >
                  {tab === 'preview' ? <Play size={14} /> : <Code2 size={14} />}
                  {tab === 'preview' ? 'Preview' : tab === 'code' ? 'Code' : tab}
                </button>
              ))}
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {workspaceActiveTab === 'code' && (
                 <button 
                   onClick={() => setWorkspaceActiveTab('preview')}
                   style={{ background: 'transparent', border: '1px solid rgba(249, 115, 22, 0.3)', color: '#f97316', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                   <Play size={12} /> Preview App
                 </button>
              )}
              <button 
                onClick={() => setIsWorkspaceMode(false)}
                style={{ background: 'transparent', border: 'none', color: subtextColor, cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Workspace Content Area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: workspaceActiveTab === 'preview' ? (isLight ? '#f8fafc' : '#0f172a') : '#0d1127', position: 'relative', overflow: 'hidden' }}>
             {workspaceActiveTab === 'preview' ? (
                <LivePreviewCanvas 
                  code={workspaceCode} 
                  isLight={isLight} 
                  onClose={() => setIsWorkspaceMode(false)}
                  showHeader={false}
                />
             ) : (
               <>
                 {/* Line Numbers */}
                 <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '48px', background: '#0a0d1e', borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '24px', color: 'rgba(255,255,255,0.2)', fontSize: '0.85rem', fontFamily: 'monospace', userSelect: 'none', zIndex: 10 }}>
                    {(function(){
                      const currentText = (workspaceActiveTab !== 'preview' && workspaceActiveTab !== 'code' && vfs[workspaceActiveTab]) ? vfs[workspaceActiveTab].content : workspaceCode;
                      return Array.from({ length: Math.max(20, (currentText.match(/\n/g) || []).length + 2) }).map((_, i) => (
                        <div key={i} style={{ lineHeight: '1.6' }}>{i + 1}</div>
                      ));
                    })()}
                 </div>
                 
                 {/* Textarea for actual input */}
                 
                 <textarea
                    value={(workspaceActiveTab !== 'preview' && workspaceActiveTab !== 'code' && vfs[workspaceActiveTab]) ? vfs[workspaceActiveTab].content : workspaceCode}
                    onChange={handleCodeChange}
                    onKeyDown={handleCodeKeyDown}
                    spellCheck="false"
                    style={{
                      position: 'absolute',
                      top: '24px',
                      left: '60px',
                      width: 'calc(100% - 84px)',
                      height: 'calc(100% - 48px)',
                      background: 'transparent',
                      color: 'transparent',
                      caretColor: '#e2e8f0',
                      border: 'none',
                      outline: 'none',
                      resize: 'none',
                      fontFamily: '"Fira Code", monospace',
                      fontSize: '0.9rem',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-wrap',
                      zIndex: 2,
                      margin: 0,
                      padding: 0
                    }}
                 />
                 
                 {/* Syntax Highlighted & Ghost Text Layer */}
                 <pre style={{
                    position: 'absolute',
                    top: '24px',
                    left: '60px',
                    width: 'calc(100% - 84px)',
                    pointerEvents: 'none',
                    margin: 0,
                    padding: 0,
                    fontFamily: '"Fira Code", monospace',
                    fontSize: '0.9rem',
                    lineHeight: '1.6',
                    color: '#e2e8f0',
                    outline: 'none',
                    whiteSpace: 'pre-wrap',
                    zIndex: 1
                 }}>
                    {workspaceCode}
                    {ghostText && <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>{ghostText}</span>}
                    {!workspaceCode && <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>{'// Quantora FX Interactive Canvas\n// Start typing or tell Quantora to build something...'}</span>}
                 </pre>
               </>
             )}
          </div>
        </div>
      )}

      {/* GitHub Import Modal */}
      {isGithubModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            background: isLight ? '#ffffff' : '#0f172a',
            border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '24px',
            width: '90%',
            maxWidth: '480px',
            padding: '32px',
            boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
            position: 'relative'
          }}>
            <button
              onClick={() => setIsGithubModalOpen(false)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'transparent',
                border: 'none',
                color: subtextColor,
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              <X size={20} />
            </button>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(249, 115, 22, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f97316' }}>
                <Github size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800', color: textColor }}>Import Repository</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: subtextColor }}>Load codebase context directly into AI Studio.</p>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: textColor, marginBottom: '8px' }}>GitHub Repository URL</label>
              <input
                type="text"
                value={githubRepoUrl}
                onChange={(e) => setGithubRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                disabled={isFetchingGithub}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.2)',
                  background: isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.05)',
                  color: textColor,
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#f97316'}
                onBlur={(e) => e.target.style.borderColor = isLight ? '#cbd5e1' : 'rgba(255, 255, 255, 0.2)'}
              />
              {githubError && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '8px', fontWeight: '500' }}>{githubError}</div>}
            </div>

            <button
              onClick={handleImportGithub}
              disabled={isFetchingGithub || !githubRepoUrl}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                background: isFetchingGithub ? '#94a3b8' : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                color: '#fff',
                border: 'none',
                fontWeight: '700',
                fontSize: '1rem',
                cursor: (isFetchingGithub || !githubRepoUrl) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: (isFetchingGithub || !githubRepoUrl) ? 'none' : '0 4px 14px rgba(249, 115, 22, 0.3)',
                transition: 'all 0.2s ease'
              }}
            >
              {isFetchingGithub ? (
                <><RefreshCw size={18} className="animate-spin" /> Fetching Codebase...</>
              ) : (
                <><Github size={18} /> Import to Context</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Magic Wand Blocking Loader Overlay */}
      {isEnhancingPrompt && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: isLight ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(36px) saturate(200%)',
          WebkitBackdropFilter: 'blur(36px) saturate(200%)',
          zIndex: 3000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={{
            background: isLight ? 'rgba(255,255,255,0.95)' : 'rgba(15, 23, 42, 0.9)',
            border: isLight ? '1px solid rgba(226,232,240,1)' : '1px solid rgba(255,255,255,0.1)',
            padding: '48px 64px',
            borderRadius: '24px',
            boxShadow: isLight ? '0 40px 80px rgba(0,0,0,0.06)' : '0 40px 80px rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px',
            minWidth: '400px'
          }}>
            <Wand2 size={56} color="#f97316" className="animate-spin" style={{ animationDuration: '4s' }} />
            <h3 style={{ margin: 0, fontSize: '1.75rem', fontWeight: '800', color: textColor, letterSpacing: '-0.02em' }}>
              Synthesizing Architecture
            </h3>
            <p style={{ margin: 0, color: subtextColor, fontSize: '1.1rem', fontWeight: '400' }}>
              Orchestrating multi-model pipelines for your prompt.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
