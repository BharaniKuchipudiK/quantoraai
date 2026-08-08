import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Send, Play, Code2, Copy, Workflow, RefreshCw, Cpu, Layers, MessageSquare, Terminal, Calculator, Music, Smartphone, Plus, Globe, ChevronDown, Paperclip, X, Lightbulb, FileText, Image as ImageIcon, Activity, FolderPlus, Smile, Utensils, PieChart, Atom, Sun, Wand2 } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

export default function AiStudio({ selectedModel, setSelectedModel, availableModels, onPushToCanvas, user, isLight }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'ai',
      modelUsed: selectedModel ? selectedModel.name : 'Qwen 2.5 Coder 32B',
      text: `Hello ${user?.name ? user.name.split(' ')[0] : 'Creator'}! I'm connected to freely available open models (Qwen 2.5 Coder, DeepSeek V3, Llama 3.3, Gemma 2). What would you like to create or ask today?`,
      type: 'greeting'
    }
  ]);

  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCodeMap, setShowCodeMap] = useState({});

  const [attachments, setAttachments] = useState([]);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [showInBarModelDropdown, setShowInBarModelDropdown] = useState(false);
  const [arenaMode, setArenaMode] = useState(false);
  const [secondModel, setSecondModel] = useState({ id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nvidia Nemotron 3 Ultra' });
  const [showSecondModelDropdown, setShowSecondModelDropdown] = useState(false);
  const [activeSandboxCode, setActiveSandboxCode] = useState(null);

  const fileInputRef = useRef(null);
  const inBarModelRef = useRef(null);

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
  const inputBg = isLight ? '#ffffff' : 'rgba(255, 255, 255, 0.07)';
  const inputBorder = isLight ? '#cbd5e1' : 'rgba(249, 115, 22, 0.4)';
  const chipBg = isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.05)';
  const chipBorder = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)';
  const chipText = isLight ? '#334155' : '#e2e8f0';

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

  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);

  const handleMagicWandEnhance = () => {
    setIsEnhancingPrompt(true);
    setTimeout(() => {
      if (!inputText.trim()) {
        const samplePrompts = [
          "Build a full-stack AI dashboard with real-time analytics, dark theme, and interactive widgets",
          "Create a Singapore SGD to INR currency exchange app with live charts and historical conversion rates",
          "Build an interactive AI Beat Synthesizer with customizable BPM and multi-track audio controls",
          "Design a sleek iOS-style calculator with currency conversion and history memory",
          "Create an intelligent recipe finder that generates meal plans based on leftover ingredients"
        ];
        setInputText(samplePrompts[Math.floor(Math.random() * samplePrompts.length)]);
      } else {
        setInputText(`Build a comprehensive, production-ready web app for: ${inputText.trim()} with clean UI, responsive layout, dark/light theme toggle, and interactive features.`);
      }
      setIsEnhancingPrompt(false);
    }, 400);
  };

  const quickPrompts = [
    { label: 'SGD to INR Currency', iconType: 'currency', prompt: 'Build a SGD to INR currency exchange calculator with live rates' },
    { label: 'Calculator App', iconType: 'calc', prompt: 'Build an interactive iOS style calculator app' },
    { label: 'AI Beat Synthesizer', iconType: 'music', prompt: 'Build an interactive AI Beat Synthesizer with customizable BPM' },
    { label: 'Explain Quantum (5yo)', iconType: 'quantum', prompt: 'Explain quantum computing simply like I am 5 years old' },
    { label: 'Singapore Weather', iconType: 'weather', prompt: 'Build a Singapore weather forecast widget' },
    { label: 'Joke Generator', iconType: 'joke', prompt: 'Build a full-stack AI joke generator app with custom categories' },
    { label: 'Recipe Maker', iconType: 'recipe', prompt: 'Build an interactive recipe maker web app with ingredient search' },
    { label: 'Expense Tracker', iconType: 'expense', prompt: 'Build a modern expense tracker app with budget analytics' }
  ];

  const [keyInputValue, setKeyInputValue] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');

  const saveKeyAndRetry = (keyType) => {
    if (!keyInputValue.trim()) return;
    if (keyType === 'gemini') {
      localStorage.setItem('geminiApiKey', keyInputValue.trim());
    } else {
      localStorage.setItem('openRouterApiKey', keyInputValue.trim());
    }
    setKeyInputValue('');
    setMessages(prev => prev.filter(m => !m.isKeyPrompt));
    if (lastPrompt) {
      handleSendMessage(lastPrompt);
    }
  };

  const handleSendMessage = async (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim() && !attachments.length) return;
    if (isGenerating) return;

    setLastPrompt(text.trim());

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: text.trim(),
      attachments: [...attachments]
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputText('');
    setAttachments([]);
    setIsGenerating(true);

    const targetModel = selectedModel || { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B' };

    const geminiApiKey = localStorage.getItem('geminiApiKey');
    const openRouterApiKey = localStorage.getItem('openRouterApiKey');

    const cleanMessages = messages.filter(m => m.id !== 1 && !m.isKeyPrompt && !m.text?.includes('⚠️ **API Key Required'));

    // 1. Dual Model Arena Execution Mode
    if (arenaMode) {
      const modelA = targetModel;
      const modelB = secondModel || { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nvidia Nemotron 3 Ultra' };

      const callSingleModel = async (mod) => {
        const start = Date.now();
        try {
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: text,
              modelId: mod.id,
              modelName: mod.name,
              history: cleanMessages,
              userKey: geminiApiKey,
              openRouterKey: openRouterApiKey
            })
          });
          const data = await res.json().catch(() => ({}));
          return {
            ok: res.ok,
            modelName: mod.name,
            text: data.text || data.error || 'Failed to generate response.',
            provider: data.provider || mod.name,
            latencyMs: data.latencyMs || (Date.now() - start)
          };
        } catch (e) {
          return {
            ok: false,
            modelName: mod.name,
            text: `Connection error: ${e.message}`,
            provider: mod.name,
            latencyMs: Date.now() - start
          };
        }
      };

      try {
        const [resA, resB] = await Promise.all([
          callSingleModel(modelA),
          callSingleModel(modelB)
        ]);

        const dualMsg = {
          id: Date.now() + 1,
          sender: 'ai',
          isDual: true,
          modelA: resA,
          modelB: resB
        };
        setMessages(prev => [...prev, dualMsg]);
      } catch (err) {
        console.error('Arena Execution Error:', err);
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // 2. Standard Single Model Execution Mode
    try {
      // Call server /api/chat endpoint for real model inference
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
          userKey: geminiApiKey,
          openRouterKey: openRouterApiKey
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.text) {
          const aiMsg = {
            id: Date.now() + 1,
            sender: 'ai',
            modelUsed: targetModel.name,
            text: data.text,
            componentType: 'formatted_text',
            thoughtProcess: `Processed live via ${data.provider || targetModel.name}${data.latencyMs ? ` (${data.latencyMs}ms)` : ''}`,
            latencyMs: data.latencyMs,
            provider: data.provider || targetModel.name,
            liveConnected: data.liveConnected !== false
          };
          setMessages(prev => [...prev, aiMsg]);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        const reqKey = errData.requiresKey || (targetModel.id.startsWith('gemini') ? 'gemini' : 'openrouter');
        const errText = errData.error || `API Key required for ${targetModel.name}.`;

        const aiMsg = {
          id: Date.now() + 1,
          sender: 'ai',
          modelUsed: targetModel.name,
          text: `⚠️ **API Key Required**: ${errText}\n\nPlease enter your API Key below to start chatting directly with **${targetModel.name}**.`,
          isKeyPrompt: true,
          keyType: reqKey,
          componentType: 'formatted_text',
          thoughtProcess: `Live API Key required for ${targetModel.name}`
        };
        setMessages(prev => [...prev, aiMsg]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      const aiMsg = {
        id: Date.now() + 1,
        sender: 'ai',
        modelUsed: targetModel.name,
        text: `⚠️ **Connection Error**: Unable to reach ${targetModel.name}. Please check your connection or enter an API Key in the Privacy Vault.`,
        isKeyPrompt: true,
        keyType: targetModel.id.startsWith('gemini') ? 'gemini' : 'openrouter',
        componentType: 'formatted_text',
        thoughtProcess: `Network connection error for ${targetModel.name}`
      };
      setMessages(prev => [...prev, aiMsg]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={{
      maxWidth: '960px',
      margin: '0 auto',
      padding: '24px 20px',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 'calc(100vh - 120px)',
      justifyContent: 'space-between'
    }}>
      {/* Top Header Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(249, 115, 22, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={20} color="#f97316" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.2rem', margin: 0, fontWeight: '700', color: textColor }}>Quantora Open AI Studio</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '0.78rem', color: subtextColor }}>
                Selected Model: <strong style={{ color: '#f97316' }}>{selectedModel ? selectedModel.name : 'Qwen 2.5 Coder 32B'}</strong>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            onClick={() => setMessages([messages[0]])}
            style={{ background: isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.05)', border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.1)', color: subtextColor, padding: '6px 14px', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={13} /> Reset Chat
          </button>
        </div>
      </div>

      {/* Messages Stream */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
        {messages.map(msg => (
          <div key={msg.id} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            {/* Avatar */}
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: msg.sender === 'user' ? 'linear-gradient(135deg, #f97316 0%, #8b5cf6 100%)' : (isLight ? '#f1f5f9' : '#1e293b'),
              border: isLight ? '1px solid #e2e8f0' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              color: '#ffffff',
              flexShrink: 0
            }}>
              {msg.sender === 'user' ? (user?.name ? user.name[0] : 'B') : <Sparkles size={18} color="#f97316" />}
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
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.6, color: textColor }}>{msg.modelA.text}</div>
                    </div>
                    <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: subtextColor }}>Engine: {msg.modelA.provider}</span>
                      {msg.modelA.text?.includes('```') && (
                        <button
                          onClick={() => setActiveSandboxCode(msg.modelA.text)}
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
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.6, color: textColor }}>{msg.modelB.text}</div>
                    </div>
                    <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: subtextColor }}>Engine: {msg.modelB.provider}</span>
                      {msg.modelB.text?.includes('```') && (
                        <button
                          onClick={() => setActiveSandboxCode(msg.modelB.text)}
                          style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.4)', color: '#3b82f6', padding: '4px 8px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Play size={10} /> Live Sandbox
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{
                  background: msg.sender === 'user' ? bubbleUserBg : bubbleAiBg,
                  border: msg.sender === 'user' ? `1px solid ${bubbleUserBorder}` : `1px solid ${bubbleAiBorder}`,
                  padding: '18px 22px',
                  borderRadius: '18px',
                  color: textColor,
                  fontSize: '0.95rem',
                  lineHeight: 1.65,
                  boxShadow: isLight ? '0 4px 14px rgba(0, 0, 0, 0.04)' : '0 4px 14px rgba(0, 0, 0, 0.2)'
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

                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>

                  {/* Standard Message Action Buttons */}
                  {msg.sender === 'ai' && msg.text?.includes('```') && (
                    <div style={{ marginTop: '12px' }}>
                      <button
                        onClick={() => setActiveSandboxCode(msg.text)}
                        style={{ background: 'rgba(249, 115, 22, 0.15)', border: '1px solid rgba(249, 115, 22, 0.4)', color: '#f97316', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Play size={13} /> Run Live Interactive Code Sandbox
                      </button>
                    </div>
                  )}
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
                    flexWrap: 'wrap'
                  }}>
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
                        <span>Free Key Link: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: '#f97316', textDecoration: 'underline', fontWeight: 'bold' }}>aistudio.google.com/app/apikey</a></span>
                      ) : (
                        <span>Free Key Link: <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={{ color: '#f97316', textDecoration: 'underline', fontWeight: 'bold' }}>openrouter.ai/keys</a></span>
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
          ))}

        {isGenerating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#f97316', fontSize: '0.88rem', paddingLeft: '50px' }}>
            <Sparkles size={16} className="animate-spin" /> {selectedModel ? selectedModel.name : 'Qwen 2.5 Coder'} is thinking...
          </div>
        )}
      </div>

      {/* Ollama & Gemini Hybrid Input Console - Google Firebase Studio Style */}
      <div style={{ position: 'relative' }}>
        {/* Welcome Greeting Header (Firebase Studio Style) */}
        {messages.length <= 1 && (
          <div style={{ marginBottom: '28px' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: '800', margin: '0 0 6px 0', color: textColor, letterSpacing: '-0.025em' }}>
              Hello, {user?.name ? user.name.split(' ')[0] : 'Creator'}
            </h1>
            <h2 style={{ fontSize: '1.4rem', fontWeight: '500', margin: 0, color: subtextColor }}>
              What do you want to build?
            </h2>
          </div>
        )}

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
                {att.type === 'image' ? <ImageIcon size={12} color="#f97316" /> : <FileText size={12} color="#0284c7" />}
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

        {/* Section Label */}
        {messages.length <= 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', padding: '0 4px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: '600', color: subtextColor, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} color="#f97316" /> Prototype an app with AI
            </span>
            <span style={{ fontSize: '0.72rem', color: subtextColor, opacity: 0.8 }}>
              Press <kbd style={{ padding: '2px 5px', background: isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', fontSize: '0.68rem', fontFamily: 'monospace' }}>TAB</kbd> to autocomplete
            </span>
          </div>
        )}

        {/* Firebase Studio Style Prompt Container Card */}
        <div style={{
          background: isLight ? '#ffffff' : '#0d1127',
          border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          boxShadow: isLight ? '0 10px 30px rgba(0, 0, 0, 0.05)' : '0 16px 40px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          transition: 'all 0.2s ease',
          position: 'relative'
        }}>
          {/* Multi-line Text Area Input */}
          <div style={{ position: 'relative', padding: '16px 16px 8px 16px' }}>
            <textarea
              rows={3}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && !inputText) {
                  e.preventDefault();
                  setInputText('An app that helps users manage and share their tasks');
                } else if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="An app that helps users manage and share their tasks..."
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: textColor,
                fontSize: '0.98rem',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                lineHeight: '1.5'
              }}
            />

            {!inputText && (
              <span
                onClick={() => setInputText('An app that helps users manage and share their tasks')}
                style={{
                  position: 'absolute',
                  top: '18px',
                  right: '20px',
                  fontSize: '0.7rem',
                  fontWeight: '700',
                  color: subtextColor,
                  background: isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.1)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.15)',
                  cursor: 'pointer'
                }}
              >
                TAB
              </span>
            )}
          </div>

          {/* Embedded Bottom Action Toolbar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderTop: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.06)',
            background: isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.02)',
            gap: '10px',
            flexWrap: 'wrap'
          }}>
            {/* Left Toolbar Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Hidden File Input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                multiple
              />

              {/* Attach File Button */}
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
                  justifyContent: 'center',
                  transition: 'color 0.2s ease'
                }}
              >
                <Paperclip size={18} />
              </button>

              {/* AI Magic Wand Prompt Enhancer Button */}
              <button
                onClick={handleMagicWandEnhance}
                title="AI Magic Wand - Enhance & Expand Prompt"
                style={{
                  background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%)',
                  border: isLight ? '1px solid rgba(249, 115, 22, 0.3)' : '1px solid rgba(249, 115, 22, 0.4)',
                  color: '#f97316',
                  padding: '5px 11px',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.76rem',
                  fontWeight: '700',
                  transition: 'all 0.22s ease',
                  boxShadow: '0 2px 8px rgba(249, 115, 22, 0.15)'
                }}
              >
                <Wand2 size={14} color="#f97316" className={isEnhancingPrompt ? "animate-spin" : ""} />
                <span>Magic Wand</span>
              </button>

              {/* Model Selector Pill inside toolbar */}
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
                    fontSize: '0.76rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  <Cpu size={13} color="#f97316" />
                  <span>{selectedModel ? selectedModel.name : 'Qwen 2.5 Coder 32B'}</span>
                  <ChevronDown size={12} color={subtextColor} />
                </button>

                {/* Dropdown Popup */}
                {showInBarModelDropdown && (
                  <div style={{
                    position: 'absolute',
                    bottom: '130%',
                    left: 0,
                    width: '260px',
                    background: isLight ? '#ffffff' : '#0d1127',
                    border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(249, 115, 22, 0.4)',
                    borderRadius: '14px',
                    padding: '8px',
                    boxShadow: isLight ? '0 10px 30px rgba(0,0,0,0.15)' : '0 15px 40px rgba(0,0,0,0.6)',
                    zIndex: 250
                  }}>
                    <div style={{ fontSize: '0.7rem', color: subtextColor, padding: '4px 8px', fontWeight: '700', textTransform: 'uppercase' }}>
                      Select Live AI Engine
                    </div>
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
                          background: selectedModel?.id === model.id ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.2)') : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '0.8rem',
                          color: selectedModel?.id === model.id ? '#f97316' : textColor,
                          fontWeight: selectedModel?.id === model.id ? '700' : '500'
                        }}
                      >
                        <span>{model.name}</span>
                        <span style={{ fontSize: '0.62rem', background: 'rgba(16, 185, 129, 0.15)', color: '#059669', padding: '1px 5px', borderRadius: '4px' }}>
                          Active
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Grounding Toggle */}
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
                  fontSize: '0.76rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                <Globe size={13} />
                <span>Web Grounding</span>
              </button>
            </div>

            {/* Right Toolbar Controls: Quick Idea Chips + Send Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* Quick Suggestion Chips (Icons only, text on hover) */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {quickPrompts.map((chip, i) => (
                  <QuickPromptChip
                    key={i}
                    chip={chip}
                    isLight={isLight}
                    onSelect={handleSendMessage}
                  />
                ))}
              </div>

              {/* Up Arrow Send Button */}
              <button
                onClick={() => handleSendMessage()}
                disabled={(!inputText.trim() && !attachments.length) || isGenerating}
                style={{
                  background: (inputText.trim() || attachments.length) ? '#f97316' : (isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)'),
                  border: 'none',
                  color: '#ffffff',
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  cursor: (inputText.trim() || attachments.length) ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  fontWeight: 'bold',
                  boxShadow: (inputText.trim() || attachments.length) ? '0 4px 12px rgba(249, 115, 22, 0.3)' : 'none'
                }}
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* "Start coding an app" Section (Firebase Studio / Project IDX Style) */}
        {messages.length <= 1 && (
          <div style={{ marginTop: '28px' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: '600', color: subtextColor, marginBottom: '10px' }}>
              Start coding or choose a technology stack
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
              background: isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.5)',
              border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              padding: '12px 18px'
            }}>
              <button
                onClick={() => handleSendMessage("Create a new full-stack app workspace")}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: textColor,
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Plus size={16} color="#f97316" /> New Workspace
              </button>
              <span style={{ color: isLight ? '#cbd5e1' : 'rgba(255,255,255,0.15)' }}>|</span>
              <button
                onClick={() => handleSendMessage("Help me import a Git repository into Quantora Studio")}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: textColor,
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <FolderPlus size={16} color="#3b82f6" /> Import Repo
              </button>

              <span style={{ color: isLight ? '#cbd5e1' : 'rgba(255,255,255,0.15)' }}>|</span>

              {/* Tech Stack Badges with Graphic Logos (Icons only, text on hover) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', flex: 1, paddingBottom: '2px' }}>
                {['Next.js', 'React', 'Go', 'Python', 'Flutter', 'Gemini AI', 'Angular', 'Node.js', 'Java', '.NET'].map((tech, idx) => (
                  <TechBadge
                    key={idx}
                    tech={tech}
                    isLight={isLight}
                    textColor={textColor}
                    onSelect={handleSendMessage}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Code Sandbox Overlay Modal */}
      {activeSandboxCode && (
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
            maxWidth: '920px',
            height: '82vh',
            background: isLight ? '#ffffff' : '#0d1127',
            borderRadius: '20px',
            border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(249, 115, 22, 0.5)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '14px 20px',
              background: isLight ? '#f8fafc' : '#1e293b',
              borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', color: textColor, fontSize: '0.95rem' }}>
                <Play size={18} color="#f97316" /> Interactive Code Sandbox Preview
              </div>
              <button
                onClick={() => setActiveSandboxCode(null)}
                style={{ background: 'transparent', border: 'none', color: subtextColor, cursor: 'pointer', padding: '4px', borderRadius: '50%' }}
              >
                <X size={20} />
              </button>
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              <iframe
                title="Sandbox Preview"
                srcDoc={
                  activeSandboxCode.includes('<!DOCTYPE html>') || activeSandboxCode.includes('<html')
                    ? activeSandboxCode.replace(/```html|```js|```/g, '')
                    : `<!DOCTYPE html><html><head><style>body{font-family:sans-serif;padding:24px;background:#0f172a;color:#fff;line-height:1.6;}</style></head><body><h2>Code Execution Preview</h2><pre style="background:#1e293b;padding:16px;border-radius:12px;overflow:auto;">${activeSandboxCode.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></body></html>`
                }
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
