import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Send, Play, Code2, Copy, Workflow, RefreshCw, Cpu, Layers, MessageSquare, Terminal, Calculator, Music, Smartphone, Plus, Globe, ChevronDown, Paperclip, X, Lightbulb, FileText, Image as ImageIcon, Activity, FolderPlus, Smile, Utensils, PieChart, Atom, Sun, Wand2, Trash2, PanelLeft, PanelLeftClose, Info, Settings, Mic, MicOff, Github, Layout } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import LivePreviewCanvas from './LivePreviewCanvas';
// Interactive iOS Calculator Sub-Component
function LiveIosCalculator() {
  const [display, setDisplay] = useState('0');
  const [prevVal, setPrevVal] = useState(null);
  const [operator, setOperator] = useState(null);

  const handleNum = (n) => {
    setDisplay(d => (d === '0' ? String(n) : d + n));
  };

  const handleOp = (op) => {
    setPrevVal(parseFloat(display));
    setOperator(op);
    setDisplay('0');
  };

  const handleEqual = () => {
    if (prevVal === null || !operator) return;
    const current = parseFloat(display);
    let res = 0;
    if (operator === '+') res = prevVal + current;
    if (operator === '-') res = prevVal - current;
    if (operator === '×') res = prevVal * current;
    if (operator === '÷') res = current !== 0 ? prevVal / current : 'Error';
    setDisplay(String(res));
    setPrevVal(null);
    setOperator(null);
  };

  const handleClear = () => {
    setDisplay('0');
    setPrevVal(null);
    setOperator(null);
  };


  return (
    <div style={{ maxWidth: '280px', background: '#000000', borderRadius: '32px', padding: '20px', color: '#fff', boxShadow: '0 20px 40px rgba(0,0,0,0.6)', border: '4px solid #1c1c1e', margin: '14px 0' }}>
      <div style={{ fontSize: '2.4rem', textAlign: 'right', marginBottom: '16px', padding: '0 8px', fontFamily: 'sans-serif', fontWeight: '300', minHeight: '50px' }}>
        {display}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
        <button onClick={handleClear} style={{ background: '#a5a5a5', color: '#000', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer' }}>AC</button>
        <button onClick={() => setDisplay(d => String(parseFloat(d) * -1))} style={{ background: '#a5a5a5', color: '#000', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer' }}>±</button>
        <button onClick={() => setDisplay(d => String(parseFloat(d) / 100))} style={{ background: '#a5a5a5', color: '#000', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer' }}>%</button>
        <button onClick={() => handleOp('÷')} style={{ background: '#ff9f0a', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.4rem', fontWeight: 'bold', cursor: 'pointer' }}>÷</button>

        <button onClick={() => handleNum(7)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>7</button>
        <button onClick={() => handleNum(8)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>8</button>
        <button onClick={() => handleNum(9)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>9</button>
        <button onClick={() => handleOp('×')} style={{ background: '#ff9f0a', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.4rem', fontWeight: 'bold', cursor: 'pointer' }}>×</button>

        <button onClick={() => handleNum(4)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>4</button>
        <button onClick={() => handleNum(5)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>5</button>
        <button onClick={() => handleNum(6)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>6</button>
        <button onClick={() => handleOp('-')} style={{ background: '#ff9f0a', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.4rem', fontWeight: 'bold', cursor: 'pointer' }}>-</button>

        <button onClick={() => handleNum(1)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>1</button>
        <button onClick={() => handleNum(2)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>2</button>
        <button onClick={() => handleNum(3)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>3</button>
        <button onClick={() => handleOp('+')} style={{ background: '#ff9f0a', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.4rem', fontWeight: 'bold', cursor: 'pointer' }}>+</button>

        <button onClick={() => handleNum(0)} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '26px', gridColumn: 'span 2', fontSize: '1.3rem', textAlign: 'left', paddingLeft: '22px', cursor: 'pointer' }}>0</button>
        <button onClick={() => handleNum('.')} style={{ background: '#333333', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.3rem', cursor: 'pointer' }}>.</button>
        <button onClick={handleEqual} style={{ background: '#ff9f0a', color: '#fff', border: 'none', height: '52px', borderRadius: '50%', fontSize: '1.4rem', fontWeight: 'bold', cursor: 'pointer' }}>=</button>
      </div>
    </div>
  );
}

// Interactive AI Beat Synthesizer Sub-Component
function LiveBeatMaker() {
  const [bpm, setBpm] = useState(124);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activePads, setActivePads] = useState([]);

  const togglePad = (id) => {
    setActivePads(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  return (
    <div style={{ padding: '20px', background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)', borderRadius: '20px', color: '#fff', margin: '14px 0', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h4 style={{ margin: 0, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Music size={18} /> Interactive AI Beat Synthesizer
        </h4>
        <span style={{ fontSize: '0.78rem', background: '#334155', padding: '4px 10px', borderRadius: '9999px' }}>{bpm} BPM</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
        {['Kick', 'Snare', 'Hi-Hat', 'Clap', 'Synth A', 'Bass B', 'Pad C', 'Vocal FX'].map((pad, i) => (
          <button
            key={i}
            onClick={() => togglePad(i)}
            style={{
              padding: '16px 8px',
              borderRadius: '12px',
              background: activePads.includes(i) ? 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)' : '#1e293b',
              border: 'none',
              color: '#fff',
              fontWeight: '600',
              fontSize: '0.82rem',
              cursor: 'pointer',
              boxShadow: activePads.includes(i) ? '0 0 15px rgba(249, 115, 22, 0.6)' : 'none'
            }}
          >
            {pad}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={() => setIsPlaying(!isPlaying)} style={{ flex: 1, padding: '10px', borderRadius: '10px', background: '#f97316', border: 'none', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>
          {isPlaying ? '⏸ Pause Rhythm' : '▶ Play Synthesized Beat'}
        </button>
        <button onClick={() => setBpm(b => (b >= 160 ? 90 : b + 10))} style={{ padding: '10px 16px', borderRadius: '10px', background: '#334155', border: 'none', color: '#fff', cursor: 'pointer' }}>
          Tempo Shift
        </button>
      </div>
    </div>
  );
}

// Interactive Quantum Simulator Sub-Component
function LiveQuantumSimulator() {
  const [prob00, setProb00] = useState(50);
  const [prob11, setProb11] = useState(50);
  const [hasHadamard, setHasHadamard] = useState(true);

  const toggleHadamard = () => {
    if (hasHadamard) {
      setHasHadamard(false);
      setProb00(100);
      setProb11(0);
    } else {
      setHasHadamard(true);
      setProb00(50);
      setProb11(50);
    }
  };

  return (
    <div style={{ padding: '20px', background: 'linear-gradient(135deg, #070913 0%, #0d1127 100%)', borderRadius: '20px', color: '#fff', margin: '14px 0', border: '1px solid rgba(6, 182, 212, 0.4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <h4 style={{ margin: 0, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Cpu size={18} /> Interactive Quantum Entanglement Simulator
        </h4>
        <span style={{ fontSize: '0.75rem', background: 'rgba(52, 211, 153, 0.2)', color: '#34d399', padding: '3px 8px', borderRadius: '6px' }}>
          Bell State |Φ+⟩ Active
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontFamily: 'monospace', color: '#a78bfa', fontWeight: 'bold' }}>|q₀⟩ Wire:</span>
          <button onClick={toggleHadamard} style={{ background: hasHadamard ? '#8b5cf6' : '#334155', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}>
            {hasHadamard ? 'H (Hadamard Active)' : '+ Add Hadamard Gate'}
          </button>
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
          <span>Superposition Outcome State |00⟩ & |11⟩:</span>
          <strong style={{ color: '#34d399' }}>{prob00}% / {prob11}%</strong>
        </div>
        <div style={{ height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${prob00}%`, background: '#38bdf8', transition: 'width 0.4s ease' }} />
          <div style={{ width: `${prob11}%`, background: '#a78bfa', transition: 'width 0.4s ease' }} />
        </div>
      </div>
    </div>
  );
}

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

export default function AiStudio({ onOpenAuth, selectedModel, setSelectedModel, availableModels, onPushToCanvas, user, isLight, dreamNodes, setDreamNodes, setActiveTab, inputText: externalInputText, setInputText: setExternalInputText }) {
  // Chat Sessions & History Management (Claude / ChatGPT / Gemini style)
  const defaultGreetingMsg = {
    id: 1,
    sender: 'ai',
    modelUsed: selectedModel ? selectedModel.name : 'Gemini 3 Flash',
    text: `Hello ${user?.name ? user.name.split(' ')[0] : 'Creator'}! What would you like to create or ask today?`,
    type: 'greeting'
  };

  const [chatSessions, setChatSessions] = useState(() => {
    try {
      const saved = localStorage.getItem('quantora_chat_sessions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return [
      {
        id: 'session-1',
        title: 'New Chat',
        createdAt: Date.now(),
        messages: [defaultGreetingMsg]
      }
    ];
  });

  const [activeSessionId, setActiveSessionId] = useState(() => {
    return chatSessions[0]?.id || 'session-1';
  });

  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Derive current session and messages
  const activeSession = chatSessions.find(s => s.id === activeSessionId) || chatSessions[0] || {
    id: 'session-1',
    title: 'New Chat',
    messages: [defaultGreetingMsg]
  };
  const messages = activeSession.messages || [defaultGreetingMsg];

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

  // Function to update current active session's messages
  const updateActiveMessages = (updater) => {
    setChatSessions(prevSessions => {
      const updated = prevSessions.map(session => {
        if (session.id === activeSessionId) {
          const newMsgs = typeof updater === 'function' ? updater(session.messages) : updater;

          let newTitle = session.title;
          const firstUserMsg = newMsgs.find(m => m.sender === 'user');
          if (firstUserMsg && (session.title === 'New Chat' || session.title === 'Welcome to Quantora')) {
            newTitle = firstUserMsg.text.slice(0, 32) + (firstUserMsg.text.length > 32 ? '...' : '');
          }

          return {
            ...session,
            title: newTitle,
            messages: newMsgs
          };
        }
        return session;
      });

      try {
        localStorage.setItem('quantora_chat_sessions', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  const handleCreateNewChat = () => {
    const newId = 'session-' + Date.now();
    const newSession = {
      id: newId,
      title: 'New Chat',
      createdAt: Date.now(),
      messages: [defaultGreetingMsg]
    };

    setChatSessions(prev => {
      const updated = [newSession, ...prev];
      try {
        localStorage.setItem('quantora_chat_sessions', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
    setActiveSessionId(newId);
  };

  const handleDeleteChat = (e, sessionId) => {
    e.stopPropagation();
    setChatSessions(prev => {
      const filtered = prev.filter(s => s.id !== sessionId);
      const fallback = filtered.length > 0 ? filtered : [{
        id: 'session-' + Date.now(),
        title: 'New Chat',
        createdAt: Date.now(),
        messages: [defaultGreetingMsg]
      }];
      if (activeSessionId === sessionId) {
        setActiveSessionId(fallback[0].id);
      }
      try {
        localStorage.setItem('quantora_chat_sessions', JSON.stringify(fallback));
      } catch (err) {
        console.error(err);
      }
      return fallback;
    });
  };

  const [localInputText, setLocalInputText] = useState('');
  const inputText = externalInputText !== undefined ? externalInputText : localInputText;
  const setInputText = setExternalInputText || setLocalInputText;
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCodeMap, setShowCodeMap] = useState({});
  const [cognitiveLevel, setCognitiveLevel] = useState('Balanced');
  const [suggestedModel, setSuggestedModel] = useState(null);

  const [showMentionMenu, setShowMentionMenu] = useState(false);

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
  const [workspaceActiveTab, setWorkspaceActiveTab] = useState('App.jsx');
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasCode, setCanvasCode] = useState('');

  const [isGithubModalOpen, setIsGithubModalOpen] = useState(false);
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
  const [isMagicWandModalOpen, setIsMagicWandModalOpen] = useState(false);
  const [magicWandResultText, setMagicWandResultText] = useState('');

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
        setMagicWandResultText(data.enhancedPrompt);
        setIsMagicWandModalOpen(true);
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

  const handleSendMessage = async (textToSend) => {
    let text = textToSend || inputText;
    if (!text.trim() && !attachments.length) return;
    if (isGenerating) return;

    // Inject Context Chips
    const contextChips = attachments.filter(a => a.type === 'context');
    if (contextChips.length > 0) {
      let contextString = "";
      for (const chip of contextChips) {
        if (chip.contextType === 'canvas') {
          contextString += `\n\n[CONTEXT: CURRENT CANVAS CODE]\n\`\`\`\n${previewCode}\n\`\`\``;
        } else if (chip.contextType === 'history') {
           const prevSession = chatSessions.find(s => s.id !== activeSessionId);
           if (prevSession) {
             const stringifiedHistory = prevSession.messages.map(m => `${m.sender.toUpperCase()}: ${m.text}`).join('\n');
             contextString += `\n\n[CONTEXT: PREVIOUS SESSION (${prevSession.title})]\n${stringifiedHistory.substring(0, 5000)}...`;
           }
        }
      }
      text = text + contextString;
    }

    setLastPrompt(text.trim());

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: text.trim(),
      attachments: [...attachments]
    };

    updateActiveMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputText('');
    setAttachments([]);
    setIsGenerating(true);

    const targetModel = selectedModel || { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' };

    const geminiApiKey = localStorage.getItem('geminiApiKey');
    const openRouterApiKey = localStorage.getItem('openRouterApiKey');

    const cleanMessages = messages.filter(m => m.id !== 1 && !m.isKeyPrompt && !m.text?.includes('⚠️ **API Key Required'));

    // 1. Dual Model Arena Execution Mode
    if (arenaMode) {
      const modelA = targetModel;
      const modelB = secondModel || { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nvidia Nemotron 3 Ultra' };

      const dualMsgId = Date.now() + 1;
      const dualMsg = {
        id: dualMsgId, sender: 'ai', type: 'arena_battle', isDual: true, prompt: text,
        modelA: { modelName: modelA.name, text: '', provider: modelA.name, latencyMs: 0 },
        modelB: { modelName: modelB.name, text: '', provider: modelB.name, latencyMs: 0 }
      };
      updateActiveMessages(prev => [...prev, dualMsg]);

      const streamSingleModel = async (mod, isModelA) => {
        try {
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, modelId: mod.id, modelName: mod.name, history: cleanMessages, userKey: geminiApiKey, openRouterKey: openRouterApiKey })
          });
          
          if (!res.ok) throw new Error('API Error');
          
          const data = await res.json();
          
          updateActiveMessages(prev => prev.map(m => {
            if (m.id === dualMsgId) {
              const updatedModelInfo = { 
                modelName: mod.name, 
                text: data.text || "No response received.", 
                provider: data.provider || mod.name, 
                latencyMs: data.latencyMs || 0 
              };
              return {
                ...m,
                modelA: isModelA ? updatedModelInfo : m.modelA,
                modelB: !isModelA ? updatedModelInfo : m.modelB
              };
            }
            return m;
          }));
          
        } catch (e) {
          updateActiveMessages(prev => prev.map(m => m.id === dualMsgId ? { ...m, [isModelA ? 'modelA' : 'modelB']: { ...m[isModelA ? 'modelA' : 'modelB'], text: `Connection error: ${e.message}` } } : m));
        }
      };

      try {
        await Promise.all([streamSingleModel(modelA, true), streamSingleModel(modelB, false)]);
      } catch (err) {
        console.error('Arena Execution Error:', err);
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // 2. Standard Single Model Execution Mode
    const aiMsgId = Date.now() + 1;
    const initialAiMsg = {
      id: aiMsgId,
      sender: 'ai',
      modelUsed: targetModel.name,
      text: '',
      componentType: 'formatted_text',
      thoughtProcess: `Connecting to ${targetModel.name}...`,
      latencyMs: 0,
      provider: targetModel.name,
      liveConnected: true
    };
    updateActiveMessages(prev => [...prev, initialAiMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: text,
          modelId: targetModel.id,
          modelName: targetModel.name,
          history: cleanMessages,
          openRouterKey: openRouterApiKey,
          cognitiveLevel: cognitiveLevel
        })
      });

      if (res.ok) {
        const data = await res.json();
        
        // Final sync
        updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
          ...m,
          text: data.text || "No response received.",
          latencyMs: data.latencyMs || 0,
          provider: data.provider || targetModel.name,
          thoughtProcess: `Processed live via ${data.provider || targetModel.name} (${data.latencyMs || 0}ms)`
        } : m));

      } else {
        const errData = await res.json().catch(() => ({}));

        /*
         * "You need to sign in" and "you need an API key" are different
         * problems with different fixes. Collapsing both into the key prompt
         * told signed-out users to paste a key they did not need, which read
         * as the key handling being broken.
         */
        if (res.status === 401 && errData.requiresAuth) {
          updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            text: `🔒 **Please sign in to continue.**\n\n${errData.error || "Sign in to use Quantora's built-in AI."}`,
            isAuthPrompt: true,
            thoughtProcess: 'Sign-in required'
          } : m));
        } else if (res.status === 429) {
          updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            text: `⏳ **Slow down a moment.** ${errData.error || 'Too many requests.'}`,
            thoughtProcess: 'Rate limited'
          } : m));
        } else {
          const reqKey = errData.requiresKey || (targetModel.id.startsWith('gemini') ? 'gemini' : 'openrouter');
          const errText = errData.error || `API Key required for ${targetModel.name}.`;

          updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            text: `⚠️ **API Key Required**: ${errText}\n\nPlease enter your API Key below to start chatting directly with **${targetModel.name}**.`,
            isKeyPrompt: true,
            keyType: reqKey,
            thoughtProcess: `Live API Key required for ${targetModel.name}`
          } : m));
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
        ...m,
        text: `⚠️ **Connection Error**: Unable to reach ${targetModel.name}. Please check your connection or enter an API Key in the Privacy Vault.`,
        isKeyPrompt: true,
        keyType: targetModel.id.startsWith('gemini') ? 'gemini' : 'openrouter',
        thoughtProcess: `Network connection error for ${targetModel.name}`
      } : m));
    } finally {
      setIsGenerating(false);
    }
  };

  const renderedChatFeed = React.useMemo(() => {
    return messages.slice(1).map(msg => (
              <div key={msg.id} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
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
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: isLight ? '0 4px 12px rgba(0,0,0,0.05)' : '0 8px 24px rgba(0,0,0,0.3)'
                      }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingBottom: '8px', borderBottom: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.08)' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f97316', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Cpu size={14} /> {msg.modelA.modelName}
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
                              {msg.modelA.text}
                            </ReactMarkdown>
                          </div>
                        </div>
                        <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.7rem', color: subtextColor }}>Engine: {msg.modelA.provider}</span>
                          {msg.modelA.text?.includes('```') && (
                            <button
                              onClick={() => openCanvasWithCode(msg.modelA.text)}
                              style={{ background: 'rgba(249, 115, 22, 0.15)', border: '1px solid rgba(249, 115, 22, 0.4)', color: '#f97316', padding: '4px 8px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Play size={10} /> Live Sandbox
                            </button>
                          )}
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
                              <Cpu size={14} /> {msg.modelB.modelName}
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
                              {msg.modelB.text}
                            </ReactMarkdown>
                          </div>
                        </div>
                        <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.7rem', color: subtextColor }}>Engine: {msg.modelB.provider}</span>
                          {msg.modelB.text?.includes('```') && (
                            <button
                              onClick={() => openCanvasWithCode(msg.modelB.text)}
                              style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.4)', color: '#3b82f6', padding: '4px 8px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Play size={10} /> Live Sandbox
                            </button>
                          )}
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
                        <div style={{ fontSize: '0.78rem', color: subtextColor, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', paddingBottom: '8px', borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)' }}>
                          <Lightbulb size={14} color="#f97316" />
                          <span>Thought for a moment ({msg.thoughtProcess})</span>
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
                          {msg.text}
                        </ReactMarkdown>
                      </div>

                      {/* Standard Message Action Buttons */}
                      <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {msg.sender === 'ai' && msg.text?.includes('```') && (
                          <button
                            onClick={() => openCanvasWithCode(msg.text)}
                            style={{ background: 'rgba(249, 115, 22, 0.15)', border: '1px solid rgba(249, 115, 22, 0.4)', color: '#f97316', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          >
                            <Play size={13} /> Open Live Canvas Mode
                          </button>
                        )}
                        <button
                          onClick={() => handlePushToDream(msg)}
                          style={{ background: 'rgba(139, 92, 246, 0.15)', border: '1px solid rgba(139, 92, 246, 0.4)', color: '#8b5cf6', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          <Workflow size={13} /> Push to Dream Canvas
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Live Model Connection Diagnostic Footer */}
                  {msg.sender === 'ai' && !msg.isKeyPrompt && msg.provider && (
                    <div style={{
                      marginTop: '14px',
                      paddingTop: '10px',
                      borderTop: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      fontSize: '0.75rem',
                      color: subtextColor,
                      flexWrap: 'wrap',
                      opacity: 0.25,
                      transition: 'opacity 0.2s ease',
                      cursor: 'default'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = 0.25}
                    >
                      <Info size={14} />
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        color: '#10b981',
                        fontWeight: '700',
                        background: 'rgba(16, 185, 129, 0.1)',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: '1px solid rgba(16, 185, 129, 0.25)'
                      }}>
                        <Activity size={12} color="#10b981" /> Live AI Verified
                      </span>
                      <span>Engine: <strong style={{ color: textColor }}>{msg.provider}</strong></span>
                      {msg.latencyMs && (
                        <>
                          <span>•</span>
                          <span>Response Time: <strong style={{ color: '#f97316' }}>{msg.latencyMs}ms</strong></span>
                        </>
                      )}
                      <span>•</span>
                      <span style={{ opacity: 0.8 }}>No Mock / Pre-set SOP Data</span>
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

                  {msg.isKeyPrompt && (
                    <div style={{
                      marginTop: '14px',
                      padding: '16px',
                      background: isLight ? '#f8fafc' : 'rgba(15, 23, 42, 0.85)',
                      borderRadius: '12px',
                      border: '1px solid #f97316',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 'bold', color: textColor, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sparkles size={16} color="#f97316" /> Save {msg.keyType === 'gemini' ? 'Google Gemini' : 'OpenRouter'} API Key to chat live:
                      </div>
                      <div style={{ fontSize: '0.72rem', color: subtextColor, lineHeight: 1.5 }}>
                        Stored unencrypted in this browser's local storage, and sent to Quantora's
                        server only to make your request. Anyone with access to this browser profile
                        can read it — use a key you can revoke.
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="password"
                          placeholder={msg.keyType === 'gemini' ? 'Paste Gemini Key (AIzaSy...)' : 'Paste OpenRouter Key (sk-or-v1...)'}
                          value={keyInputValue}
                          onChange={(e) => setKeyInputValue(e.target.value)}
                          style={{
                            flex: 1,
                            padding: '10px 14px',
                            borderRadius: '8px',
                            border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.2)',
                            background: isLight ? '#ffffff' : '#1e293b',
                            color: textColor,
                            fontSize: '0.85rem'
                          }}
                        />
                        <button
                          onClick={() => saveKeyAndRetry(msg.keyType)}
                          style={{
                            background: '#f97316',
                            color: '#ffffff',
                            border: 'none',
                            padding: '10px 18px',
                            borderRadius: '8px',
                            fontWeight: 'bold',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          Save Key & Retry
                        </button>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: subtextColor }}>
                        {msg.keyType === 'gemini' ? (
                          <span>Free Key Link: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: '#f97316', textDecoration: 'underline', fontWeight: 'bold' }}>aistudio.google.com/app/apikey</a></span>
                        ) : (
                          <span>Free Key Link: <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style={{ color: '#f97316', textDecoration: 'underline', fontWeight: 'bold' }}>openrouter.ai/keys</a></span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Render Interactive Live Component Sandboxes Directly in Chat */}
                  {msg.componentType === 'calculator' && <LiveIosCalculator />}
                  {msg.componentType === 'beat' && <LiveBeatMaker />}
                  {msg.componentType === 'quantum' && <LiveQuantumSimulator />}

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
            ));
  }, [messages, isLight, textColor, subtextColor, openCanvasWithCode, showCodeMap, keyInputValue, arenaMode, secondModel, onOpenAuth]);

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

        {/* Starter Templates Section */}
        <div style={{ fontSize: '0.72rem', fontWeight: '700', color: subtextColor, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', paddingLeft: '4px' }}>
          Starter Templates
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '2px', marginBottom: '24px' }}>
          {[
            { title: 'Task Manager App', icon: <FileText size={15} color="#f97316" />, prompt: 'Build a full-stack task manager app with category filters and status tracking' },
            { title: 'iOS Calculator', icon: <Calculator size={15} color="#3b82f6" />, prompt: 'Build an interactive iOS style calculator app' },
            { title: 'AI Beat Synthesizer', icon: <Music size={15} color="#ec4899" />, prompt: 'Build an interactive AI Beat Synthesizer with customizable BPM' },
            { title: 'Quantum Simulator', icon: <Atom size={15} color="#8b5cf6" />, prompt: 'Build an interactive Quantum Circuit & Bell state entanglement simulator' }
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
        flex: isWorkspaceMode ? '0 0 35%' : 1,
        display: 'flex',
        flexDirection: 'column',
        maxWidth: isWorkspaceMode ? '35%' : '800px',
        margin: isWorkspaceMode ? '0' : '0 auto',
        padding: isWorkspaceMode ? '0' : '20px',
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

            <button
              onClick={() => setIsWorkspaceMode(!isWorkspaceMode)}
              title={isWorkspaceMode ? "Close Code Canvas" : "Open Code Canvas"}
              style={{
                background: isWorkspaceMode ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' : (isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.05)'),
                color: isWorkspaceMode ? '#fff' : subtextColor,
                border: 'none',
                padding: '6px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                fontWeight: '600',
                transition: 'all 0.2s ease',
                boxShadow: isWorkspaceMode ? '0 4px 12px rgba(249, 115, 22, 0.3)' : 'none'
              }}
            >
              <Layout size={14} />
              <span className="hidden md:inline">Workspace</span>
            </button>

            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(249, 115, 22, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={20} color="#f97316" />
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
              <h2 style={{ fontSize: '1.2rem', margin: 0, fontWeight: '700', color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeSession ? activeSession.title : 'Quantora Open AI Studio'}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', color: subtextColor, whiteSpace: 'nowrap' }}>
                  Selected Model: <strong style={{ color: '#f97316' }}>{selectedModel ? selectedModel.name : 'Gemini 3 Flash'}</strong>
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: messages.length <= 1 ? 'center' : 'flex-start', overflowY: 'auto', marginBottom: '24px' }}>
        {messages.length <= 1 ? (
          /* Clean Hero Empty State */
          <div style={{ textAlign: 'center', padding: '40px 20px 24px 20px', maxWidth: '720px', margin: '0 auto', width: '100%' }}>
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
            <p style={{ fontSize: '1.2rem', fontWeight: '400', margin: '0 0 32px 0', color: subtextColor }}>
              What would you like to build today?
            </p>

          </div>
        ) : (
          /* Active Chat Thread */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {renderedChatFeed}
          </div>
        )}

        {isGenerating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#f97316', fontSize: '0.88rem', paddingLeft: '50px', marginTop: '16px' }}>
            <Sparkles size={16} className="animate-spin" /> {selectedModel ? selectedModel.name : 'Qwen 2.5 Coder'} is thinking...
          </div>
        )}
      </div>

      {/* Clean Prompt Console Input Area */}
      <div style={{ position: 'relative', width: '100%', maxWidth: '820px', margin: '0 auto' }}>
        {/* Attachment Files Badge Bar */}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px', paddingLeft: '4px' }}>
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

        {/* Prompt Card Container */}
        <div className="floating-input-pill" style={{
          overflow: 'visible',
          position: 'relative',
          padding: '4px'
        }}>
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
          <div style={{ position: 'relative', padding: '12px 18px' }}>
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={handleInputTextChange}
              onKeyDown={(e) => {
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
              
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Attach file or code"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: subtextColor,
                  padding: '6px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Paperclip size={18} />
              </button>

              <button
                onClick={() => setIsGithubModalOpen(true)}
                title="Import from GitHub repository"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: subtextColor,
                  padding: '6px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Github size={18} />
              </button>

              {/* Magic Wand Enhancer */}
              <button
                onClick={handleMagicWandEnhance}
                title="AI Magic Wand - Enhance & Expand Prompt"
                style={{
                  background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%)',
                  border: isLight ? '1px solid rgba(249, 115, 22, 0.3)' : '1px solid rgba(249, 115, 22, 0.4)',
                  color: '#f97316',
                  padding: '5px 12px',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.78rem',
                  fontWeight: '600'
                }}
              >
                <Wand2 size={14} color="#f97316" className={isEnhancingPrompt ? "animate-spin" : ""} />
                <span>Magic Wand</span>
              </button>

              {/* Engine Settings Popover */}
              <div ref={inBarModelRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowInBarModelDropdown(!showInBarModelDropdown)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: isLight ? '#ffffff' : 'rgba(255, 255, 255, 0.08)',
                    border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.15)',
                    color: textColor,
                    padding: '5px 12px',
                    borderRadius: '20px',
                    fontSize: '0.78rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  <Settings size={13} color="#f97316" />
                  <span>Engine</span>
                  <ChevronDown size={12} color={subtextColor} />
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
                        {availableModels && availableModels.map(model => (
                          <div
                            key={model.id}
                            onClick={() => {
                              setSelectedModel(model);
                              setShowInBarModelDropdown(false);
                            }}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              background: selectedModel?.id === model.id ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.15)') : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '0.8rem',
                              color: selectedModel?.id === model.id ? '#f97316' : textColor,
                              fontWeight: selectedModel?.id === model.id ? '700' : '500',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              if (selectedModel?.id !== model.id) e.currentTarget.style.background = isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.05)';
                            }}
                            onMouseLeave={(e) => {
                              if (selectedModel?.id !== model.id) e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{model.name}</span>
                              <span style={{ fontSize: '0.68rem', color: subtextColor, fontWeight: '400' }}>{model.provider || (model.id.startsWith('gemini') ? 'Google' : 'OpenRouter')}</span>
                            </div>
                            {selectedModel?.id === model.id && (
                              <span style={{ fontSize: '0.65rem', background: '#f97316', color: '#fff', padding: '2px 6px', borderRadius: '10px', flexShrink: 0 }}>Active</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Sleek Firebase-style Language Icons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '4px', borderLeft: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.15)', paddingLeft: '10px' }}>
                {['React', 'Java', 'Python'].map(lang => (
                  <button
                    key={lang}
                    onClick={() => {
                      const newText = inputText ? `${inputText} using ${lang}` : `Build a ${lang} app that `;
                      setInputText(newText);
                      if (textareaRef.current) {
                        textareaRef.current.style.height = 'auto';
                        setTimeout(() => {
                           textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 400) + 'px';
                        }, 50);
                      }
                    }}
                    title={`${lang}`}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: subtextColor,
                      padding: '6px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.color = textColor;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = subtextColor;
                    }}
                  >
                    {lang === 'React' && <Atom size={16} />}
                    {lang === 'Java' && <Code2 size={16} />}
                    {lang === 'Python' && <Activity size={16} />}
                  </button>
                ))}
              </div>

              {/* Web Grounding Toggle */}
              <button
                onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                title={webSearchEnabled ? "Live Web Search Enabled" : "Enable Web Search Grounding"}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: webSearchEnabled ? 'rgba(2, 132, 199, 0.15)' : 'transparent',
                  border: webSearchEnabled ? '1px solid rgba(2, 132, 199, 0.4)' : 'none',
                  color: webSearchEnabled ? '#0284c7' : subtextColor,
                  padding: '5px 10px',
                  borderRadius: '20px',
                  fontSize: '0.78rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                <Globe size={13} />
                <span>Web Grounding</span>
              </button>
            </div>

            {/* Right Control: Send & Push Buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
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
                  width: '38px',
                  height: '38px',
                  borderRadius: '12px',
                  cursor: inputText.trim() ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease'
                }}
              >
                <Workflow size={16} />
              </button>

              <button
                onClick={() => handleSendMessage()}
                disabled={(!inputText.trim() && !attachments.length) || isGenerating}
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
                <Send size={16} />
              </button>
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
              code={previewCode} 
              isLight={isLight} 
              onClose={() => setCanvasOpen(false)} 
            />
          </div>
        </div>
      )}

      {/* Right Panel: Interactive Code Canvas (Pillar 1) */}
      {isWorkspaceMode && (
        <div style={{
          flex: '0 0 calc(65% - 20px)',
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
              {['App.jsx', 'styles.css', 'package.json'].map(tab => (
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
                  {tab.includes('.jsx') ? <Code2 size={14} /> : <FileText size={14} />}
                  {tab}
                </button>
              ))}
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button style={{ background: 'transparent', border: '1px solid rgba(249, 115, 22, 0.3)', color: '#f97316', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Play size={12} /> Preview App
              </button>
              <button 
                onClick={() => setIsWorkspaceMode(false)}
                style={{ background: 'transparent', border: 'none', color: subtextColor, cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Canvas Editor Area */}
          <div style={{ flex: 1, overflow: 'auto', background: '#0d1127', padding: '24px', position: 'relative' }}>
             {/* Line Numbers */}
             <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '48px', background: '#0a0d1e', borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '24px', color: 'rgba(255,255,255,0.2)', fontSize: '0.85rem', fontFamily: 'monospace', userSelect: 'none' }}>
                {Array.from({ length: Math.max(20, (workspaceCode.match(/\n/g) || []).length + 2) }).map((_, i) => (
                  <div key={i} style={{ lineHeight: '1.6' }}>{i + 1}</div>
                ))}
             </div>
             <pre style={{
                margin: 0,
                marginLeft: '36px',
                paddingLeft: '16px',
                fontFamily: '"Fira Code", monospace',
                fontSize: '0.9rem',
                lineHeight: '1.6',
                color: '#e2e8f0',
                outline: 'none',
                whiteSpace: 'pre-wrap'
             }}>
                {workspaceActiveTab === 'App.jsx' ? (workspaceCode || '// Quantora FX Interactive Canvas\n// Tell Quantora to build something, and the code will appear here.') : `// ${workspaceActiveTab} content`}
             </pre>
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

      {/* Magic Wand Modal */}
      {isMagicWandModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(8px)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.2s ease',
          padding: '24px'
        }}>
          <div style={{
            background: isLight ? '#ffffff' : '#0d1127',
            border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(249, 115, 22, 0.4)',
            borderRadius: '24px',
            width: '100%',
            maxWidth: '640px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '24px 32px', borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', gap: '12px', background: 'linear-gradient(90deg, rgba(249, 115, 22, 0.1), transparent)' }}>
              <Wand2 size={24} color="#f97316" />
              <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800', color: textColor }}>Enhanced Specification</h3>
              <button
                onClick={() => setIsMagicWandModalOpen(false)}
                style={{ position: 'absolute', top: '24px', right: '24px', background: 'transparent', border: 'none', color: subtextColor, cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
              <p style={{ color: subtextColor, marginBottom: '20px', fontSize: '0.95rem' }}>Review and adjust the enhanced prompt before sending to the AI. Answer any clarifying questions added at the bottom.</p>
              <textarea
                value={magicWandResultText}
                onChange={(e) => setMagicWandResultText(e.target.value)}
                style={{
                  width: '100%',
                  height: '300px',
                  padding: '16px',
                  borderRadius: '12px',
                  border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.2)',
                  background: isLight ? '#f8fafc' : 'rgba(0,0,0,0.3)',
                  color: textColor,
                  fontSize: '0.95rem',
                  fontFamily: 'monospace',
                  lineHeight: '1.6',
                  outline: 'none',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ padding: '24px 32px', borderTop: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.1)', background: isLight ? '#f8fafc' : 'rgba(0,0,0,0.2)' }}>
              <button
                onClick={() => {
                  setInputText(magicWandResultText);
                  setIsMagicWandModalOpen(false);
                  if (textareaRef.current) {
                    textareaRef.current.style.height = 'auto';
                    setTimeout(() => {
                       textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 400) + 'px';
                    }, 50);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                  color: '#fff',
                  border: 'none',
                  fontWeight: '700',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(249, 115, 22, 0.3)',
                  transition: 'all 0.2s ease'
                }}
              >
                <Sparkles size={18} /> Apply to Prompt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
