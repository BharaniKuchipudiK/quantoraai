import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Send, Play, Code2, Copy, Workflow, RefreshCw, Cpu, Layers, MessageSquare, Terminal, Calculator, Music, Smartphone, Plus, Globe, ChevronDown, Paperclip, X, Lightbulb, FileText, Image as ImageIcon, Activity, FolderPlus, Smile, Utensils, PieChart, Atom, Sun, Wand2, Trash2, PanelLeft, PanelLeftClose, Info, Settings, Mic, MicOff, Github, Layout, ThumbsUp, ThumbsDown, Loader, Plane, BookOpen, DollarSign, Search, Check, Compass, SlidersHorizontal } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import LivePreviewCanvas from './LivePreviewCanvas';
import ModelDashboard from './ModelDashboard';
import { chooseBestFreeModel, classifyTask, rankFreeModels } from '../lib/model-routing.js';
import { loadArenaPreferences, recordArenaWin } from '../lib/arena-preferences.js';
import {
  extractContextFromAssistantText,
  captureUserAnswerAsContext,
  hasSessionMemory,
  mergeSessionContext,
} from '../lib/session-context.js';
import {
  extractChoicesFromAssistantText,
  stripPartialAssistantMarkers,
} from '../lib/studio-choices.js';
import StudioChoiceCards from './StudioChoiceCards';
import StudioChromeBar from './StudioChromeBar';
import {
  STUDIO_DOMAINS,
  STUDIO_OUTPUT_MODES,
  getDomainById,
  getOutputModeLabel,
  getPromptPlaceholder,
} from '../lib/studio-domains.js';

const DOMAIN_ICONS = {
  travel: Plane,
  education: BookOpen,
  finance: DollarSign,
  research: Search,
};

const OUTPUT_MODE_ICONS = {
  ask: MessageSquare,
  build: Layout,
  plan: Workflow,
};

function StudioGlossRow({ icon: Icon, iconColor, title, description, selected, onClick, badge }) {
  return (
    <button type="button" className={`studio-gloss-row${selected ? ' is-selected' : ''}`} onClick={onClick}>
      <span className="studio-gloss-row__icon" style={{ color: iconColor }}>
        <Icon size={17} strokeWidth={2} />
      </span>
      <span className="studio-gloss-row__copy">
        <span className="studio-gloss-row__title">
          {title}
          {badge ? <span className="studio-gloss-row__badge">{badge}</span> : null}
        </span>
        {description ? <span className="studio-gloss-row__desc">{description}</span> : null}
      </span>
      <span className={`studio-gloss-row__radio${selected ? ' is-selected' : ''}`} aria-hidden="true" />
    </button>
  );
}

function StudioToolsMenu({ isLight, studioDomain, studioMode, onSelectDomain, onSelectMode }) {
  return (
    <div className={`studio-gloss-popover${isLight ? ' is-light' : ' is-dark'}`} role="menu" aria-label="Focus and response settings">
      <div className="studio-gloss-popover__section">
        <div className="studio-gloss-popover__heading">Focus</div>
        <StudioGlossRow
          icon={Compass}
          iconColor="#64748b"
          title="General"
          description="No specific domain bias"
          selected={!studioDomain}
          onClick={() => onSelectDomain(null)}
        />
        {STUDIO_DOMAINS.map(({ id, label, description }) => (
          <StudioGlossRow
            key={id}
            icon={DOMAIN_ICONS[id]}
            iconColor={studioDomain === id ? '#f97316' : '#64748b'}
            title={label}
            description={description}
            selected={studioDomain === id}
            onClick={() => onSelectDomain(id)}
          />
        ))}
      </div>
      <div className="studio-gloss-popover__divider" />
      <div className="studio-gloss-popover__section">
        <div className="studio-gloss-popover__heading">Response</div>
        {STUDIO_OUTPUT_MODES.map(({ id, label, description }) => (
          <StudioGlossRow
            key={id}
            icon={OUTPUT_MODE_ICONS[id]}
            iconColor={studioMode === id ? '#f97316' : '#64748b'}
            title={label}
            description={description}
            selected={studioMode === id}
            onClick={() => onSelectMode(id)}
          />
        ))}
      </div>
    </div>
  );
}

function extractHtmlFromResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  const trimmed = rawText.trim();
  const htmlFence = trimmed.match(/```html\s*\n?([\s\S]*?)```/i);
  if (htmlFence?.[1]) return htmlFence[1].trim();
  const genericFence = trimmed.match(/```\s*\n?([\s\S]*?<(?:!DOCTYPE|html)[\s\S]*?)```/i);
  if (genericFence?.[1]) return genericFence[1].trim();
  if (/<!DOCTYPE html>/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) {
    return trimmed.replace(/```(?:html|javascript|js|css)?\s*\n?([\s\S]*?)```/gi, '$1').trim();
  }
  return '';
}

function hasPreviewableContent(rawText) {
  if (!rawText || typeof rawText !== 'string') return false;
  return Boolean(extractHtmlFromResponse(rawText) || /```/.test(rawText));
}

function preparePreviewHtml(rawText, imageMap = new Map()) {
  let html = extractHtmlFromResponse(rawText);
  if (!html && (/<!DOCTYPE html>/i.test(rawText) || /<html[\s>]/i.test(rawText))) {
    html = rawText.replace(/```(?:html|javascript|js|css)?\s*\n?([\s\S]*?)```/gi, '$1').trim();
  }
  if (!html) return '';
  if (imageMap.size) {
    for (const [token, dataUrl] of imageMap) html = html.split(token).join(dataUrl);
  }
  return html;
}

function getLivePreviewButtonMeta(msg, { isGenerating, streamingMessageId }) {
  if (!hasPreviewableContent(msg.text)) return null;
  if (isGenerating && msg.id === streamingMessageId) {
    return { disabled: true, label: 'Building…', title: 'Still generating the response' };
  }
  const status = msg.previewStatus;
  if (!status) {
    return { disabled: false, label: 'Open Live Preview', title: 'Open the sandbox preview' };
  }
  if (status === 'running' || status === 'verifying' || status === 'healing') {
    return { disabled: true, label: 'Verifying preview…', title: 'Running sandbox checks before preview opens' };
  }
  if (status === 'clean') {
    return { disabled: false, label: 'Open Live Preview', title: 'Verified — runs clean' };
  }
  if (status === 'degraded') {
    return { disabled: false, label: 'Open Live Preview', title: 'Preview ready — styling may be incomplete' };
  }
  if (status === 'failed') {
    return { disabled: false, label: 'Open Live Preview', title: 'Preview may have runtime errors' };
  }
  return { disabled: false, label: 'Open Live Preview', title: 'Open the sandbox preview' };
}

function LivePreviewActionButton({ msg, meta, onOpen, compact = false }) {
  if (!meta) return null;
  const iconSize = compact ? 10 : 13;
  return (
    <button
      type="button"
      disabled={meta.disabled}
      title={meta.title}
      onClick={() => !meta.disabled && onOpen(msg.text)}
      style={{
        background: meta.disabled ? 'rgba(148, 163, 184, 0.12)' : 'rgba(249, 115, 22, 0.15)',
        border: meta.disabled ? '1px solid rgba(148, 163, 184, 0.35)' : '1px solid rgba(249, 115, 22, 0.4)',
        color: meta.disabled ? '#94a3b8' : '#f97316',
        padding: compact ? '4px 8px' : '6px 12px',
        borderRadius: '8px',
        fontSize: compact ? '0.72rem' : '0.78rem',
        fontWeight: '700',
        cursor: meta.disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? '4px' : '6px',
        opacity: meta.disabled ? 0.85 : 1,
      }}
    >
      {meta.disabled ? <Loader size={iconSize} className="animate-spin" /> : <Play size={iconSize} />}
      {meta.label}
    </button>
  );
}
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

/*
 * Conservative build-intent detector. Returns true only for clear "make me a
 * runnable thing" requests, so /api/chat's BUILD MODE (single self-contained
 * HTML document) engages for exactly those — and normal chat, including
 * questions *about* building, is left untouched. Questions are excluded up
 * front to avoid turning "how do I build an app?" into a generated artifact.
 */
function detectBuildIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  if (/^(how|what|why|when|where|which|who|should|can you explain|explain|is |are |does |do |tell me|help me understand)/.test(t)) return false;
  const verb = /\b(build|create|make|generate|design|develop|code|prototype|clone|scaffold)\b/;
  const noun = /\b(app|application|web ?site|website|landing page|web ?page|page|ui|interface|component|dashboard|game|tool|calculator|form|portfolio|site|widget|animation|simulator|editor|tracker|generator|clone)\b/;
  return verb.test(t) && noun.test(t);
}

/** Plan mode is for software architecture — route life/travel planning to Ask. */
function isSoftwarePlanningRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  const softwareSignals = /\b(app|website|web app|pwa|api|feature|architecture|tech stack|database|frontend|backend|saas|platform|codebase|microservice|fullstack|full-stack|software|system design)\b/;
  const lifePlanning = /\b(trip|travel|vacation|holiday|itinerary|flight|hotel|visit|tour|getaway|wedding|meal plan|workout plan|career path)\b|\bplan a (trip|vacation|holiday|visit)\b/;
  if (lifePlanning.test(t) && !softwareSignals.test(t)) return false;
  return softwareSignals.test(t);
}

// Syntax-highlighted code block with a one-click Copy button in the corner.
function CopyableCodeBlock({ code, language }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) { /* clipboard unavailable */ }
  };
  return (
    <div style={{ position: 'relative', margin: '10px 0' }}>
      <button
        onClick={onCopy}
        title="Copy code"
        style={{
          position: 'absolute', top: '8px', right: '8px', zIndex: 2,
          background: copied ? 'rgba(16,185,129,0.9)' : 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.2)', color: '#fff',
          borderRadius: '6px', padding: '4px 9px', fontSize: '0.7rem', fontWeight: 700,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px'
        }}
      >
        <Copy size={12} /> {copied ? 'Copied' : 'Copy'}
      </button>
      <SyntaxHighlighter style={vscDarkPlus} language={language} PreTag="div" customStyle={{ borderRadius: '8px', margin: 0, fontSize: '0.85rem', paddingTop: '34px' }}>
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

// Workspace (Code Canvas) is hidden: Quantora is outcome-first — conversation
// + live preview, not a code editor. Flip to true to bring back a dev mode.
const SHOW_WORKSPACE = false;

// Downscale an uploaded image to a bounded dimension and return a JPEG data URI.
// Keeps embedded photos small enough to inline directly into the generated,
// self-contained HTML (so the site — and its published copy — carry the real
// images, not placeholders) without bloating the document.
function downscaleImageToDataUrl(file, maxDim = 1000, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round((height * maxDim) / width); width = maxDim; }
          else { width = Math.round((width * maxDim) / height); height = maxDim; }
        }
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (err) { reject(err); }
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AiStudio({ onOpenAuth, selectedModel, setSelectedModel, availableModels, modelDashboard, onPushToCanvas, user, isLight, dreamNodes, setDreamNodes, setActiveTab, inputText: externalInputText, setInputText: setExternalInputText, isAdmin, onModelsRefresh }) {
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
  const [showModelDashboard, setShowModelDashboard] = useState(false);

  useEffect(() => {
    if (!showModelDashboard) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setShowModelDashboard(false);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showModelDashboard]);

  // Derive current session and messages
  const activeSession = chatSessions.find(s => s.id === activeSessionId) || chatSessions[0] || {
    id: 'session-1',
    title: 'New Chat',
    messages: [defaultGreetingMsg]
  };
  const messages = activeSession.messages || [defaultGreetingMsg];
  const pendingChoiceMessage = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.sender === 'ai' && m.choiceSet?.choices?.length && !m.choiceUsed && !m.isDual) {
        return m;
      }
    }
    return null;
  }, [messages]);
  const studioMode = activeSession.studioMode || 'ask';
  const studioDomain = activeSession.studioDomain || null;
  const boundRepo = activeSession.boundRepo || null;
  const conversationContext = activeSession.conversationContext || {};
  const repoContextCache = useRef({});

  const setStudioMode = (mode) => {
    updateActiveSession({ studioMode: mode });
  };

  const setStudioDomain = (domain) => {
    updateActiveSession({ studioDomain: domain });
  };

  const activeDomainMeta = getDomainById(studioDomain);

  const [dismissedModelSpotlights, setDismissedModelSpotlights] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('quantora_dismissed_model_spotlights') || '[]');
    } catch {
      return [];
    }
  });

  const spotlightModel = React.useMemo(() => {
    const list = modelDashboard?.models || [];
    return list.find(
      (m) => (m.isNew || m.isUpdated) && m.status === 'available' && !dismissedModelSpotlights.includes(m.id),
    ) || null;
  }, [modelDashboard, dismissedModelSpotlights]);

  const dismissModelSpotlight = (modelId) => {
    setDismissedModelSpotlights((prev) => {
      const next = [...prev, modelId];
      try {
        localStorage.setItem('quantora_dismissed_model_spotlights', JSON.stringify(next));
      } catch { /* best effort */ }
      return next;
    });
  };

  const updateActiveSession = (updates) => {
    setChatSessions(prevSessions => {
      const updated = prevSessions.map(session => {
        if (session.id !== activeSessionId) return session;
        return { ...session, ...updates };
      });
      try {
        localStorage.setItem('quantora_chat_sessions', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  const fetchRepoPreview = async (repoUrl, task = 'Understand this codebase and its architecture') => {
    const response = await fetch('/api/github/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetStage: 'repository-preview',
        repoUrl: repoUrl.trim(),
        task: task.trim()
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to load repository');
    }
    return { url: repoUrl.trim(), name: data.name, content: data.content, relevantFiles: data.relevantFiles || [] };
  };

  const bindRepoToSession = async (repoUrl, task) => {
    if (!repoUrl?.trim()) {
      setGithubError('Please enter a valid GitHub URL');
      return;
    }
    setIsFetchingGithub(true);
    setGithubError('');
    try {
      const bound = await fetchRepoPreview(repoUrl, task || githubChangeRequest.trim() || 'Understand this codebase');
      repoContextCache.current[activeSessionId] = bound.content;
      updateActiveSession({ boundRepo: { url: bound.url, name: bound.name, relevantFiles: bound.relevantFiles } });
      if (task?.trim() || githubChangeRequest.trim()) {
        setInputText(prev => prev.trim() ? prev : (task?.trim() || githubChangeRequest.trim()));
      }
      setIsGithubModalOpen(false);
      setGithubRepoUrl('');
      setGithubChangeRequest('');
    } catch (err) {
      setGithubError(err.message);
    } finally {
      setIsFetchingGithub(false);
    }
  };

  const clearBoundRepo = () => {
    delete repoContextCache.current[activeSessionId];
    updateActiveSession({ boundRepo: null });
  };

  const parsePlanSpec = (text) => {
    if (!text || typeof text !== 'string') return null;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced?.[1] || text).trim();
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && parsed.title) return parsed;
    } catch {
      const objectMatch = candidate.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          const parsed = JSON.parse(objectMatch[0]);
          if (parsed && typeof parsed === 'object' && parsed.title) return parsed;
        } catch {
          return null;
        }
      }
    }
    return null;
  };

  const handleBuildFromPlan = (planSpec) => {
    const specText = typeof planSpec === 'string' ? planSpec : JSON.stringify(planSpec, null, 2);
    setStudioMode('build');
    handleSendMessage(
      `Build this application based on the architecture plan below. Follow the tech stack and features closely.\n\n${specText}`,
      { studioMode: 'build' }
    );
  };

  useEffect(() => {
    const repo = activeSession.boundRepo;
    if (!repo?.url || repoContextCache.current[activeSessionId]) return;
    fetchRepoPreview(repo.url)
      .then((bound) => {
        repoContextCache.current[activeSessionId] = bound.content;
      })
      .catch((err) => console.error('Failed to refresh repo context:', err));
  }, [activeSessionId, activeSession.boundRepo?.url]);

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

  // --- Pillar 4: Predictive Code Assist Logic ---
  const handleCodeChange = (e) => {
    const val = e.target.value;
    const pos = e.target.selectionStart;
    setWorkspaceCode(val);
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

  const handleCreateNewChat = () => {
    const newId = 'session-' + Date.now();
    const newSession = {
      id: newId,
      title: 'New Chat',
      createdAt: Date.now(),
      messages: [defaultGreetingMsg],
      studioMode: 'ask',
      studioDomain: null,
      boundRepo: null,
      conversationContext: {}
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
  const [activeGeneratingModel, setActiveGeneratingModel] = useState(null);
  const [expandedMessageDetails, setExpandedMessageDetails] = useState({});
  const [showCodeMap, setShowCodeMap] = useState({});
  const [cognitiveLevel, setCognitiveLevel] = useState('Balanced');
  const [suggestedModel, setSuggestedModel] = useState(null);
  const [autoSelectEnabled, setAutoSelectEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('quantora_auto_select_free_model');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('quantora_auto_select_free_model', String(autoSelectEnabled));
    } catch { /* preference persistence is best effort */ }
  }, [autoSelectEnabled]);

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
  const [showStudioToolsMenu, setShowStudioToolsMenu] = useState(false);
  const studioToolsMenuRef = useRef(null);
  useEffect(() => {
    if (!showStudioToolsMenu) return undefined;
    const onDocClick = (event) => {
      if (studioToolsMenuRef.current && !studioToolsMenuRef.current.contains(event.target)) {
        setShowStudioToolsMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showStudioToolsMenu]);

  const [arenaMode, setArenaMode] = useState(false);
  const [arenaPrefs, setArenaPrefs] = useState(() => loadArenaPreferences());
  const [arenaHintDismissed, setArenaHintDismissed] = useState(() => {
    try { return localStorage.getItem('quantora_arena_hint_dismissed') === '1'; } catch { return false; }
  });
  const [secondModel, setSecondModel] = useState({ id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B' });
  const [showSecondModelDropdown, setShowSecondModelDropdown] = useState(false);
  const [isWorkspaceMode, setIsWorkspaceMode] = useState(false);

  useEffect(() => {
    if (isWorkspaceMode) setSidebarOpen(false);
  }, [isWorkspaceMode]);

  const [workspaceCode, setWorkspaceCode] = useState('');
  const [workspaceActiveTab, setWorkspaceActiveTab] = useState('App.jsx');
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasFullscreen, setCanvasFullscreen] = useState(false);
  const closePreviewModal = useCallback(() => {
    setCanvasOpen(false);
    setCanvasFullscreen(false);
  }, []);

  const togglePreviewFullscreen = useCallback(() => {
    setCanvasFullscreen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!canvasOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closePreviewModal();
    };
    const onPreviewMessage = (event) => {
      const data = event.data;
      if (data?.__quantora === true && data.kind === 'preview-close-request') {
        closePreviewModal();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('message', onPreviewMessage);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('message', onPreviewMessage);
    };
  }, [canvasOpen, closePreviewModal]);
  const [canvasCode, setCanvasCode] = useState('');
  const [streamingMessageId, setStreamingMessageId] = useState(null);
  const [backgroundVerify, setBackgroundVerify] = useState(null);
  const backgroundVerifyRef = useRef(null);
  useEffect(() => { backgroundVerifyRef.current = backgroundVerify; }, [backgroundVerify]);
  // The HTML shown in the Live Canvas preview. Was referenced throughout but
  // never declared — clicking "Open Live Canvas Mode" threw a ReferenceError,
  // so the canvas never opened. Declaring it restores the whole preview flow.
  const [previewCode, setPreviewCode] = useState('');
  // Guided build intake is active from a fresh "build me a site" request until a
  // site is produced. It persists the designer-style Q&A across turns; once a
  // preview exists we drop it so further messages behave normally.
  const [guidedSession, setGuidedSession] = useState(false);
  // Conversational iteration: once a site exists, the next message refines it in
  // place instead of building from scratch. Auto-on when a site appears; the
  // user can switch it off to start fresh.
  const [refineActive, setRefineActive] = useState(true);
  // Photos uploaded during the intake persist here (data URIs) so they survive
  // the per-send attachment reset and are still available when the build runs.
  const [sessionImages, setSessionImages] = useState([]);
  useEffect(() => {
    if (previewCode && previewCode.trim()) {
      setGuidedSession(false); // a site now exists — intake is over
      setRefineActive(true);   // and further messages refine it
      setSessionImages([]);    // photos are now embedded in the site
    }
  }, [previewCode]);

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
  const [githubChangeRequest, setGithubChangeRequest] = useState('');
  const [isFetchingGithub, setIsFetchingGithub] = useState(false);
  const [githubError, setGithubError] = useState('');

  const handleImportGithub = async () => {
    await bindRepoToSession(githubRepoUrl, githubChangeRequest.trim());
  };

  const openCanvasWithCode = (rawText) => {
    const cleanCode = extractHtmlFromResponse(rawText) || (rawText.includes('<!DOCTYPE html>') || rawText.includes('<html')
      ? rawText.replace(/```(?:html|javascript|js|css)?\s*\n?([\s\S]*?)```/gi, '$1').trim()
      : `<!DOCTYPE html>\n<html>\n<head>\n<style>\nbody { font-family: sans-serif; padding: 24px; background: #0f172a; color: #fff; line-height: 1.6; }\n</style>\n</head>\n<body>\n<h2>Code Execution Preview</h2>\n<pre style="background: #1e293b; padding: 16px; border-radius: 12px; overflow: auto;">${rawText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>\n</body>\n</html>`);
    setPreviewCode(cleanCode);
    setCanvasFullscreen(false);
    setCanvasOpen(true);
    setBackgroundVerify(null);
  };

  const queuePreviewVerification = (messageId, html) => {
    if (!html?.trim()) return;
    setPreviewCode(html);
    setBackgroundVerify({ messageId, code: html });
    updateActiveMessages((prev) => prev.map((m) => (
      m.id === messageId ? { ...m, previewStatus: 'verifying' } : m
    )));
  };

  const handleBackgroundVerificationStatus = React.useCallback((status) => {
    const job = backgroundVerifyRef.current;
    if (!job) return;
    updateActiveMessages((prev) => prev.map((m) => (
      m.id === job.messageId ? { ...m, previewStatus: status } : m
    )));
    if (status === 'clean' || status === 'degraded' || status === 'failed') {
      setBackgroundVerify(null);
    }
  }, []);

  useEffect(() => {
    if (!backgroundVerify) return undefined;
    const job = backgroundVerify;
    const timer = setTimeout(() => {
      updateActiveMessages((prev) => prev.map((m) => (
        m.id === job.messageId && ['verifying', 'running', 'healing'].includes(m.previewStatus)
          ? { ...m, previewStatus: 'degraded' }
          : m
      )));
      setBackgroundVerify(null);
    }, 30000);
    return () => clearTimeout(timer);
  }, [backgroundVerify]);


  const fileInputRef = useRef(null);
  const inBarModelRef = useRef(null);
  const textareaRef = useRef(null);
  const messageViewportRef = useRef(null);
  const shouldFollowLatestRef = useRef(true);
  const scrollFrameRef = useRef(null);

  const scrollToLatest = (behavior = 'auto') => {
    if (!shouldFollowLatestRef.current || !messageViewportRef.current) return;
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      const viewport = messageViewportRef.current;
      if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    });
  };

  const handleMessageScroll = () => {
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    const distanceFromLatest = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    shouldFollowLatestRef.current = distanceFromLatest < 96;
  };

  // Follow new and streaming content only while the reader remains near the
  // latest message. Sending a prompt deliberately re-enables this behaviour.
  useEffect(() => {
    scrollToLatest();
  }, [messages, isGenerating]);

  useEffect(() => {
    shouldFollowLatestRef.current = true;
    scrollToLatest();
  }, [activeSessionId]);

  useEffect(() => () => {
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
  }, []);

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

  // Shared ingestion for both the paperclip picker and pasted/dropped images.
  const ingestFiles = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    const processed = await Promise.all(list.map(async (file) => {
      const att = {
        name: file.name || (file.type.includes('image') ? `pasted-image.${(file.type.split('/')[1] || 'png')}` : 'file'),
        size: (file.size / 1024).toFixed(1) + ' KB',
        type: file.type.includes('image') ? 'image' : 'file'
      };
      // Capture the actual image (downscaled) so the build can embed it as a
      // real product/gallery photo instead of a placeholder.
      if (att.type === 'image') {
        try { att.dataUrl = await downscaleImageToDataUrl(file); } catch (err) { /* keep as metadata only */ }
      }
      return att;
    }));
    setAttachments(prev => [...prev, ...processed]);
    // Persist the actual photos across the intake (attachments reset each send).
    const newImages = processed.filter(a => a.dataUrl).map(a => a.dataUrl);
    if (newImages.length) setSessionImages(prev => [...prev, ...newImages].slice(-8));
  };

  const handleFileUpload = async (e) => {
    await ingestFiles(e.target.files);
  };

  // Paste an image straight into the prompt (Cmd/Ctrl+V) — the way Claude and
  // ChatGPT accept screenshots. We only intercept when the clipboard carries an
  // actual image file; plain-text pastes fall through to the textarea untouched.
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles = [];
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length) {
      e.preventDefault(); // don't paste the binary blob as text
      await ingestFiles(imageFiles);
    }
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
  // Prompt Engineer review card: { original, prompt, tier, model } | null.
  // Enhancement is shown here for the user to edit/finalize before it lands in
  // the input — never silently overwritten.
  const [enhanceResult, setEnhanceResult] = useState(null);

  const runEnhance = async (sourcePrompt, depth) => {
    const source = (sourcePrompt || '').trim();
    if (!source) return;
    setIsEnhancingPrompt(true);
    try {
      const res = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: source, depth })
      });
      const data = await res.json();
      if (res.ok && data.enhancedPrompt) {
        let model = null;
        try { model = chooseBestFreeModel(availableModels, data.enhancedPrompt)?.model || null; } catch (e) {}
        setEnhanceResult({ original: source, prompt: data.enhancedPrompt, tier: data.tier || 'Enrich', model });
      } else {
        console.error("Magic Wand failed:", data.error);
      }
    } catch (e) {
      console.error("Magic Wand network error:", e);
    } finally {
      setIsEnhancingPrompt(false);
    }
  };

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
    // Enhance from the current input at auto depth, then open the review card.
    runEnhance(inputText, 'auto');
  };

  // Apply the (possibly edited) enhancement to the input, adopt the suggested
  // model, and close the card.
  const applyEnhancement = () => {
    if (!enhanceResult) return;
    setInputText(enhanceResult.prompt);
    if (enhanceResult.model) {
      setSelectedModel(enhanceResult.model);
      setAutoSelectEnabled(false);
    }
    setEnhanceResult(null);
  };

  const [keyInputValue, setKeyInputValue] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');

  // Preview the same deterministic free-model choice that will be used when
  // the message is sent. Debounced and length-gated so the banner doesn't
  // flicker on every keystroke or fire on a two-word fragment like "Can you".
  useEffect(() => {
    if (!autoSelectEnabled) { setSuggestedModel(null); return; }
    const trimmed = inputText.trim();
    if (trimmed.length < 15) { setSuggestedModel(null); return; }
    const timer = setTimeout(() => {
      setSuggestedModel(chooseBestFreeModel(availableModels, trimmed));
    }, 600);
    return () => clearTimeout(timer);
  }, [inputText, availableModels, autoSelectEnabled]);

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

  const handleSendMessage = async (textToSend, options = {}) => {
    let text = textToSend || inputText;
    const pendingImages = attachments.filter((a) => a.type === 'image');
    if (!text.trim() && !attachments.length) return;
    if (pendingImages.length && !pendingImages.some((a) => a.dataUrl)) {
      updateActiveMessages((prev) => [...prev, {
        id: Date.now(),
        sender: 'ai',
        text: '⚠️ **Image not ready** — the photo could not be processed. Try pasting again or use the paperclip to attach a JPG/PNG.',
        type: 'system',
      }]);
      return;
    }
    if (isGenerating) return;
    const effectiveStudioMode = options.studioMode || studioMode;
    const visibleText = text.trim()
      || (pendingImages.length ? 'Describe what you see in the attached image(s).' : "Review the attached repository context.");
    const apiStudioMode = effectiveStudioMode === 'plan' && !isSoftwarePlanningRequest(visibleText)
      ? 'ask'
      : effectiveStudioMode;

    const repoContent = repoContextCache.current[activeSessionId];
    if (repoContent && boundRepo?.name) {
      text = `${text}\n\n${repoContent}`;
    }

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
        } else if (chip.contextType === 'repository' && chip.content) {
          contextString += `\n\n${chip.content}`;
        }
      }
      text = text + contextString;
    }

    setLastPrompt(text.trim());

    const taskCategory = pendingImages.length ? 'vision' : classifyTask(visibleText);
    const autoChoice = autoSelectEnabled ? chooseBestFreeModel(availableModels, visibleText, arenaPrefs) : null;
    const targetModel = autoChoice?.model || selectedModel || { id: 'gemini-flash-latest', name: 'Gemini Flash', pricingKind: 'free-tier', available: true };
    setActiveGeneratingModel({ id: targetModel.id, name: targetModel.name });
    const rankedFreeFallbacks = rankFreeModels(availableModels, visibleText, arenaPrefs)
      .filter((model) => model.id !== targetModel.id);

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: visibleText,
      attachments: [...attachments]
    };

    shouldFollowLatestRef.current = true;
    updateActiveMessages(prev => [...prev, userMsg]);
    scrollToLatest('smooth');
    if (!textToSend) setInputText('');
    setAttachments([]);
    setIsGenerating(true);

    let sessionContextForRequest = conversationContext;
    if (options.choiceSelected) {
      sessionContextForRequest = mergeSessionContext(conversationContext, { facts: [visibleText] });
      updateActiveSession({ conversationContext: sessionContextForRequest });
    } else {
      const answerFact = captureUserAnswerAsContext(visibleText, [...messages, userMsg]);
      if (answerFact) {
        sessionContextForRequest = mergeSessionContext(conversationContext, { facts: [answerFact] });
        updateActiveSession({ conversationContext: sessionContextForRequest });
      }
    }

    try {
      const modRes = await fetch('/api/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text.trim() })
      });
      const modData = await modRes.json();
      
      if (modData.flagged) {
        updateActiveMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'ai',
          text: `🚨 **Policy Violation Detected**\n\n${modData.reason}\n\n*Flagged Pattern: \`${modData.matchedPattern}\`*`,
          isError: true
        }]);
        setIsGenerating(false);
        setActiveGeneratingModel(null);
        return;
      }
    } catch (e) {
      console.error("Moderation API failed, failing open...", e);
    }

    const geminiApiKey = localStorage.getItem('geminiApiKey');
    const openRouterApiKey = localStorage.getItem('openRouterApiKey');

    const cleanMessages = messages.filter(m => m.id !== 1 && !m.isKeyPrompt && !m.text?.includes('⚠️ **API Key Required'));

    const arenaImageUrls = userMsg.attachments
      ?.filter((a) => a.type === 'image' && a.dataUrl)
      .map((a) => a.dataUrl)
      .slice(0, 4) || [];

    // 1. Dual Model Arena Execution Mode
    if (arenaMode) {
      const modelA = targetModel;
      const modelB = secondModel || { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B' };
      const arenaTaskCategory = arenaImageUrls.length ? 'vision' : taskCategory;

      const dualMsgId = Date.now() + 1;
      const dualMsg = {
        id: dualMsgId, sender: 'ai', type: 'arena_battle', isDual: true, prompt: text,
        taskCategory: arenaTaskCategory,
        modelA: { modelId: modelA.id, modelName: modelA.name, text: '', provider: modelA.name, latencyMs: 0, requestId: null },
        modelB: { modelId: modelB.id, modelName: modelB.name, text: '', provider: modelB.name, latencyMs: 0, requestId: null }
      };
      updateActiveMessages(prev => [...prev, dualMsg]);

      const streamSingleModel = async (mod, isModelA) => {
        try {
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: visibleText,
              modelId: mod.id,
              modelName: mod.name,
              history: cleanMessages,
              userKey: geminiApiKey,
              openRouterKey: openRouterApiKey,
              taskCategory: arenaTaskCategory,
              attachedImages: arenaImageUrls,
              studioMode: arenaImageUrls.length ? 'ask' : studioMode,
            })
          });
          
          if (!res.ok) throw new Error('API Error');
          
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let currentText = "";
          let finalProvider = mod.name;
          let finalLatency = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (dataStr === '[DONE]') break;
                try {
                  const parsed = JSON.parse(dataStr);
                  if (parsed.text) {
                    currentText += parsed.text;
                    updateActiveMessages(prev => prev.map(m => {
                      if (m.id === dualMsgId) {
                        const updatedModelInfo = {
                          modelId: mod.id,
                          modelName: mod.name,
                          text: currentText,
                          provider: finalProvider,
                          latencyMs: finalLatency,
                          requestId: parsed.requestId || null,
                        };
                        return { ...m, modelA: isModelA ? updatedModelInfo : m.modelA, modelB: !isModelA ? updatedModelInfo : m.modelB };
                      }
                      return m;
                    }));
                  }
                  if (parsed.provider) {
                    finalProvider = parsed.provider;
                    finalLatency = parsed.latencyMs || 0;
                    updateActiveMessages(prev => prev.map(m => {
                      if (m.id === dualMsgId) {
                        const updatedModelInfo = {
                          modelId: mod.id,
                          modelName: mod.name,
                          text: currentText,
                          provider: finalProvider,
                          latencyMs: finalLatency,
                          requestId: parsed.requestId || m[isModelA ? 'modelA' : 'modelB']?.requestId || null,
                        };
                        return { ...m, modelA: isModelA ? updatedModelInfo : m.modelA, modelB: !isModelA ? updatedModelInfo : m.modelB };
                      }
                      return m;
                    }));
                  }
                } catch (e) {}
              }
            }
          }
          
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
        setActiveGeneratingModel(null);
      }
      return;
    }

    // 2. Standard Single Model Execution Mode
    const aiMsgId = Date.now() + 1;
    setStreamingMessageId(aiMsgId);
    const initialAiMsg = {
      id: aiMsgId,
      sender: 'ai',
      modelUsed: targetModel.name,
      text: '',
      componentType: 'formatted_text',
      thoughtProcess: `Connecting to ${targetModel.name}...`,
      routingNote: autoChoice?.model
        ? `Quantora chose ${targetModel.name} because ${autoChoice.reason}.`
        : null,
      taskCategory,
      latencyMs: 0,
      provider: targetModel.name,
      liveConnected: true
    };
    updateActiveMessages(prev => [...prev, initialAiMsg]);

    try {
      const sessionImages = userMsg.attachments
        ? userMsg.attachments.filter((a) => a.type === 'image' && a.dataUrl).map((a) => a.dataUrl)
        : [];

      const imageDataUrls = sessionImages.slice(0, 4);
      const isVisionQuestion = imageDataUrls.length > 0 && !detectBuildIntent(visibleText);

      /*
       * Vision: send pasted/attached images whenever the user included them.
       * Previously blocked in Build mode — so screenshots attached but the model
       * could not see them. Prefer Gemini when images are present (reliable vision).
       */
      const attachedImages = imageDataUrls;
      let visionModel = targetModel;
      if (imageDataUrls.length > 0) {
        const geminiVision = availableModels?.find(
          (m) => typeof m.id === 'string' && m.id.startsWith('gemini') && m.available !== false,
        );
        if (geminiVision) visionModel = geminiVision;
      }

      const candidateModels = imageDataUrls.length > 0
        ? [visionModel].filter((m) => m?.id?.startsWith('gemini'))
        : [
            visionModel,
            ...rankedFreeFallbacks.filter((m) => m.id !== visionModel.id),
          ].slice(0, 3);
      /*
       * Conversational iteration: if a site already exists and this isn't a
       * fresh "build me a new X", treat the message as an edit — hand the model
       * the current document and ask for the COMPLETE updated one back. The user
       * sees only their words in chat; the code rides in the API payload, and
       * the returned HTML flows into the preview via the auto-open.
       */
      const isRefine = refineActive && Boolean(previewCode && previewCode.trim()) && !detectBuildIntent(text);
      const apiMessage = isRefine
        ? `${text}\n\n[You are editing the existing app below. Apply the requested change and return the COMPLETE updated, self-contained HTML document — not a diff, not an explanation.]\n\`\`\`html\n${previewCode}\n\`\`\``
        : text;
      const autoBuildMode = isRefine || isWorkspaceMode || detectBuildIntent(text);
      let buildMode = isVisionQuestion
        ? false
        : apiStudioMode === 'build'
          ? true
          : apiStudioMode === 'ask' || apiStudioMode === 'plan'
            ? false
            : autoBuildMode;
      /*
       * Guided build: a fresh "make me a website/app" request (no site yet)
       * starts a designer-style intake — Quantora asks for the essentials and
       * confirms before building. Persists across the follow-up answers (which
       * don't read as build intent on their own) until a site is produced.
       */
      const startingGuided = !isVisionQuestion && detectBuildIntent(text) && !previewCode && !isWorkspaceMode && apiStudioMode !== 'build';
      const guidedBuild = !isVisionQuestion && (startingGuided || guidedSession) && !previewCode && apiStudioMode !== 'build' && apiStudioMode !== 'plan';
      if (guidedBuild && !guidedSession) setGuidedSession(true);

      /*
       * Photo uploads: inline the user's real images into the build via stable
       * placeholder tokens, then swap the actual (downscaled) data URIs back in
       * after generation — so the model never has to echo huge base64 strings,
       * yet the rendered/published site carries the real photos.
       */
      const imageMap = new Map();
      let outboundMessage = apiMessage;
      if (sessionImages.length && (buildMode || guidedBuild)) {
        const tokens = sessionImages.map((dataUrl, i) => {
          const token = `{{QUANTORA_IMAGE_${i + 1}}}`;
          imageMap.set(token, dataUrl);
          return token;
        });
        outboundMessage += `\n\n[The user uploaded ${tokens.length} photo(s) to use in the site. When you build, use them as the real product/gallery images by putting these EXACT placeholder strings inside <img src="..."> attributes (one per image, reused where it makes sense): ${tokens.join(', ')}. Do not substitute stock image URLs for these.]`;
      }

      if (imageDataUrls.length > 0 && candidateModels.length === 0) {
        updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
          ...m,
          text: '⚠️ **Vision requires Gemini** — attach images are supported, but no Gemini model is available. Sign in or check that Gemini Flash is approved in the model list.',
          thoughtProcess: 'Vision routing failed',
        } : m));
        setIsGenerating(false);
        setActiveGeneratingModel(null);
        setStreamingMessageId(null);
        return;
      }

      let res = null;
      let errData = {};
      let respondingModel = imageDataUrls.length > 0 ? visionModel : targetModel;
      let fallbackFrom = null;

      for (let index = 0; index < candidateModels.length; index += 1) {
        const candidate = candidateModels[index];
        respondingModel = candidate;
        const hasAnotherCandidate = index < candidateModels.length - 1;
        try {
          res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: outboundMessage,
              modelId: candidate.id,
              modelName: candidate.name,
              history: cleanMessages,
              userKey: geminiApiKey,
              openRouterKey: openRouterApiKey,
              cognitiveLevel,
              buildMode,
              guidedBuild,
              taskCategory,
              fallbackFrom,
              studioMode: isVisionQuestion ? 'ask' : apiStudioMode,
              sessionContext: sessionContextForRequest,
              studioDomain,
              attachedImages,
              choiceSelected: options.choiceSelected === true,
            })
          });
        } catch (networkError) {
          if (!hasAnotherCandidate) throw networkError;
          fallbackFrom ||= targetModel.id;
          continue;
        }

        if (res.ok) {
          respondingModel = candidate;
          setActiveGeneratingModel({ id: candidate.id, name: candidate.name });
          if (candidate.id !== targetModel.id) {
            fallbackFrom ||= targetModel.id;
            updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m,
              modelUsed: candidate.name,
              provider: candidate.name,
              routingNote: `${targetModel.name} was unavailable, so Quantora continued with ${candidate.name}.`,
              thoughtProcess: `Fallback connected to ${candidate.name}...`,
              fallbackFrom: targetModel.id,
            } : m));
          }
          break;
        }

        errData = await res.json().catch(() => ({}));
        const retryable = res.status >= 500
          || [400, 404, 408, 409, 422].includes(res.status)
          || Boolean(errData.requiresKey);
        if (!hasAnotherCandidate || !retryable || errData.requiresAuth || res.status === 429) break;

        fallbackFrom ||= targetModel.id;
        const nextModel = candidateModels[index + 1];
        updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
          ...m,
          thoughtProcess: `${candidate.name} is unavailable; trying ${nextModel.name}...`,
        } : m));
      }

      if (!res) throw new Error('Quantora could not reach an available AI provider.');

      if (res.ok) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let currentText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6);
              if (dataStr === '[DONE]') break;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.text) {
                  currentText += parsed.text;
                  const visibleText = stripPartialAssistantMarkers(currentText);
                  updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                    ...m,
                    text: visibleText,
                    thoughtProcess: 'Generating live...'
                  } : m));
                }
                if (parsed.provider) {
                  updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                    ...m,
                    provider: parsed.provider,
                    modelUsed: respondingModel.name,
                    modelId: parsed.modelId || respondingModel.id,
                    requestId: parsed.requestId || m.requestId,
                    latencyMs: parsed.latencyMs || 0,
                    thoughtProcess: `Processed live via ${parsed.provider} (${parsed.latencyMs || 0}ms)`
                  } : m));
                }
              } catch (e) {}
            }
          }
        }

        const { displayText: afterChoices, choiceSet } = extractChoicesFromAssistantText(currentText);
        const { displayText, contextUpdate } = extractContextFromAssistantText(afterChoices);
        if (displayText !== currentText) {
          updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            text: displayText,
            ...(choiceSet ? { choiceSet } : {}),
          } : m));
        } else if (choiceSet) {
          updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, choiceSet } : m));
        }
        if (contextUpdate && (contextUpdate.goal || contextUpdate.understanding || contextUpdate.facts?.length)) {
          setChatSessions(prevSessions => {
            const updated = prevSessions.map(session => {
              if (session.id !== activeSessionId) return session;
              return {
                ...session,
                conversationContext: mergeSessionContext(session.conversationContext, contextUpdate),
              };
            });
            try {
              localStorage.setItem('quantora_chat_sessions', JSON.stringify(updated));
            } catch (e) {
              console.error(e);
            }
            return updated;
          });
        }

        if (apiStudioMode === 'plan') {
          const planSpec = parsePlanSpec(currentText);
          if (planSpec) {
            updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, planSpec, type: 'plan_spec' } : m));
          }
        }

        // Store preview HTML and verify in the background — do not auto-open the modal.
        const finalHtml = preparePreviewHtml(displayText, imageMap);
        if (finalHtml) {
          queuePreviewVerification(aiMsgId, finalHtml);
        }

      } else {
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
          const errText = errData.error || `The backend server encountered an error with ${respondingModel.name}.`;

          updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            text: `⚠️ **Server Error**: ${errText}\n\nQuantora is unable to process this request at the moment. Please try again later or select a different model.`,
            thoughtProcess: `Error processing request via ${respondingModel.name}`
          } : m));
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
        ...m,
        text: `⚠️ **Connection Error**: Unable to reach Quantora's AI gateway for ${targetModel.name}. Please check your connection and try again.`,
        thoughtProcess: `Network connection error for ${targetModel.name}`
      } : m));
    } finally {
      setIsGenerating(false);
      setActiveGeneratingModel(null);
      setStreamingMessageId(null);
    }
  };

  const submitModelFeedback = async (message, outcome) => {
    if (!message?.requestId || !message?.modelId || message.qualityFeedback) return;
    if (message.id) {
      updateActiveMessages(prev => prev.map(item => item.id === message.id ? { ...item, qualityFeedback: outcome } : item));
    }
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'feedback',
          requestId: message.requestId,
          modelId: message.modelId,
          taskCategory: message.taskCategory || 'general',
          outcome,
        }),
      });
    } catch (error) {
      console.warn('Anonymous model feedback could not be recorded:', error);
    }
  };

  const handleArenaPreference = useCallback(async (msg, side) => {
    if (msg.arenaWinner) return;
    const winner = side === 'a' ? msg.modelA : msg.modelB;
    const loser = side === 'a' ? msg.modelB : msg.modelA;
    if (!winner?.modelId) return;

    const task = msg.taskCategory || classifyTask(msg.prompt || '');
    const nextPrefs = recordArenaWin(task, winner.modelId, loser?.modelId);
    setArenaPrefs(nextPrefs);

    updateActiveMessages((prev) => prev.map((m) => (
      m.id === msg.id ? { ...m, arenaWinner: side } : m
    )));

    if (winner.requestId) {
      submitModelFeedback(
        { requestId: winner.requestId, modelId: winner.modelId, taskCategory: task },
        'helpful',
      );
    }
    if (loser?.requestId) {
      submitModelFeedback(
        { requestId: loser.requestId, modelId: loser.modelId, taskCategory: task },
        'not_helpful',
      );
    }

    const winnerModel = availableModels?.find((m) => m.id === winner.modelId);
    if (winnerModel) {
      setSelectedModel(winnerModel);
      setAutoSelectEnabled(false);
    }
  }, [availableModels, setSelectedModel]);

  const renderedChatFeed = React.useMemo(() => {
    return messages.slice(1).map(msg => {
      const isUser = msg.sender === 'user';
      return (
              <div
                key={msg.id}
                className={`chat-message-row${isUser ? ' chat-message-row--user' : ' chat-message-row--ai'}`}
                style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}
              >
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
                <div
                  className={isUser ? 'chat-message-body chat-message-body--user' : 'chat-message-body chat-message-body--ai'}
                  style={{ flex: isUser ? '0 0 auto' : 1, minWidth: isUser ? undefined : 0 }}
                >
                  {msg.isDual ? (
                    <div style={{ width: '100%' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', width: '100%' }}>
                      {/* Model A Card */}
                      <div style={{
                        background: isLight ? '#ffffff' : '#0d1127',
                        border: msg.arenaWinner === 'a'
                          ? '2px solid #f97316'
                          : (isLight ? '1px solid #cbd5e1' : '1px solid rgba(249, 115, 22, 0.35)'),
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: msg.arenaWinner === 'a'
                          ? '0 0 0 1px rgba(249,115,22,0.35), 0 8px 24px rgba(249,115,22,0.15)'
                          : (isLight ? '0 4px 12px rgba(0,0,0,0.05)' : '0 8px 24px rgba(0,0,0,0.3)'),
                        opacity: msg.arenaWinner === 'b' ? 0.72 : 1,
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
                                    <CopyableCodeBlock code={String(children).replace(/\n$/, '')} language={match[1]} />
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
                        <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.7rem', color: subtextColor }}>Engine: {msg.modelA.provider}</span>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            {msg.modelA.text && !isGenerating && (
                              <button
                                type="button"
                                onClick={() => handleArenaPreference(msg, 'a')}
                                disabled={Boolean(msg.arenaWinner)}
                                style={{
                                  background: msg.arenaWinner === 'a' ? 'rgba(249,115,22,0.2)' : 'rgba(249,115,22,0.1)',
                                  border: '1px solid rgba(249,115,22,0.45)',
                                  color: '#f97316',
                                  padding: '4px 10px',
                                  borderRadius: '8px',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  cursor: msg.arenaWinner ? 'default' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <ThumbsUp size={12} /> {msg.arenaWinner === 'a' ? 'Preferred' : 'Prefer this'}
                              </button>
                            )}
                            {hasPreviewableContent(msg.modelA.text) && (
                              <LivePreviewActionButton
                                msg={{ ...msg, text: msg.modelA.text, id: `${msg.id}-a`, previewStatus: msg.modelAPreviewStatus }}
                                meta={getLivePreviewButtonMeta(
                                  { ...msg, text: msg.modelA.text, id: `${msg.id}-a`, previewStatus: msg.modelAPreviewStatus },
                                  { isGenerating, streamingMessageId }
                                )}
                                onOpen={openCanvasWithCode}
                                compact
                              />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Model B Card */}
                      <div style={{
                        background: isLight ? '#ffffff' : '#0d1127',
                        border: msg.arenaWinner === 'b'
                          ? '2px solid #3b82f6'
                          : (isLight ? '1px solid #cbd5e1' : '1px solid rgba(59, 130, 246, 0.35)'),
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: msg.arenaWinner === 'b'
                          ? '0 0 0 1px rgba(59,130,246,0.35), 0 8px 24px rgba(59,130,246,0.15)'
                          : (isLight ? '0 4px 12px rgba(0,0,0,0.05)' : '0 8px 24px rgba(0,0,0,0.3)'),
                        opacity: msg.arenaWinner === 'a' ? 0.72 : 1,
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
                                    <CopyableCodeBlock code={String(children).replace(/\n$/, '')} language={match[1]} />
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
                        <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.7rem', color: subtextColor }}>Engine: {msg.modelB.provider}</span>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            {msg.modelB.text && !isGenerating && (
                              <button
                                type="button"
                                onClick={() => handleArenaPreference(msg, 'b')}
                                disabled={Boolean(msg.arenaWinner)}
                                style={{
                                  background: msg.arenaWinner === 'b' ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.1)',
                                  border: '1px solid rgba(59,130,246,0.45)',
                                  color: '#3b82f6',
                                  padding: '4px 10px',
                                  borderRadius: '8px',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  cursor: msg.arenaWinner ? 'default' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <ThumbsUp size={12} /> {msg.arenaWinner === 'b' ? 'Preferred' : 'Prefer this'}
                              </button>
                            )}
                            {hasPreviewableContent(msg.modelB.text) && (
                              <LivePreviewActionButton
                                msg={{ ...msg, text: msg.modelB.text, id: `${msg.id}-b`, previewStatus: msg.modelBPreviewStatus }}
                                meta={getLivePreviewButtonMeta(
                                  { ...msg, text: msg.modelB.text, id: `${msg.id}-b`, previewStatus: msg.modelBPreviewStatus },
                                  { isGenerating, streamingMessageId }
                                )}
                                onOpen={openCanvasWithCode}
                                compact
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    {msg.arenaWinner && (
                      <p style={{ margin: '10px 0 0', fontSize: '0.74rem', color: subtextColor, textAlign: 'center' }}>
                        Saved — Auto-select will prefer {(msg.arenaWinner === 'a' ? msg.modelA : msg.modelB).modelName} for similar {msg.taskCategory || 'general'} questions.
                      </p>
                    )}
                    </div>
                  ) : (
                    <div className={`prose chat-message-bubble${isUser ? ' chat-message-bubble--user' : ' chat-message-bubble--ai'}`} style={{
                      background: isUser ? (isLight ? '#f0f4f9' : '#1e1f20') : 'transparent',
                      border: 'none',
                      padding: isUser ? '12px 18px' : '4px 0',
                      borderRadius: '20px',
                      color: textColor,
                      fontSize: '1rem',
                      lineHeight: 1.65,
                      boxShadow: 'none',
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

                      {(msg.routingNote || msg.thoughtProcess) && (
                        <div style={{ marginBottom: '9px' }}>
                          {!expandedMessageDetails[msg.id] ? (
                            <button
                              type="button"
                              onClick={() => setExpandedMessageDetails((prev) => ({ ...prev, [msg.id]: true }))}
                              style={{ background: 'transparent', border: 'none', color: subtextColor, fontSize: '0.74rem', cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: '2px' }}
                            >
                              Details
                            </button>
                          ) : (
                            <>
                              {msg.routingNote && (
                                <div style={{ marginBottom: '9px', padding: '7px 10px', borderRadius: '9px', background: isLight ? '#fff7ed' : 'rgba(249,115,22,0.1)', color: isLight ? '#9a3412' : '#fdba74', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Sparkles size={13} /> {msg.routingNote}
                                </div>
                              )}
                              {msg.thoughtProcess && (
                                <div style={{ fontSize: '0.78rem', color: subtextColor, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', paddingBottom: '8px', borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)' }}>
                                  <Lightbulb size={14} color="#f97316" />
                                  <span>Thought for a moment ({msg.thoughtProcess})</span>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => setExpandedMessageDetails((prev) => ({ ...prev, [msg.id]: false }))}
                                style={{ background: 'transparent', border: 'none', color: subtextColor, fontSize: '0.74rem', cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: '2px' }}
                              >
                                Hide details
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      <div className="markdown-prose" style={{ width: isUser ? 'auto' : '100%', overflowX: 'hidden' }}>
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({node, inline, className, children, ...props}) {
                              const match = /language-(\w+)/.exec(className || '')
                              return !inline && match ? (
                                <CopyableCodeBlock code={String(children).replace(/\n$/, '')} language={match[1]} />
                              ) : (
                                <code style={{ background: 'rgba(128,128,128,0.2)', padding: '2px 5px', borderRadius: '4px', fontFamily: 'monospace' }} {...props}>{children}</code>
                              )
                            }
                          }}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      </div>

                      {/* Choice cards render in floating dock above prompt */}

                      {/* Plan / code actions */}
                      <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {msg.sender === 'ai' && msg.planSpec && (
                          <button
                            onClick={() => handleBuildFromPlan(msg.planSpec)}
                            style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          >
                            <Code2 size={13} /> Build this →
                          </button>
                        )}
                        {msg.sender === 'ai' && hasPreviewableContent(msg.text) && (
                          <LivePreviewActionButton
                            msg={msg}
                            meta={getLivePreviewButtonMeta(msg, { isGenerating, streamingMessageId })}
                            onOpen={openCanvasWithCode}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/*
                   * Quiet feedback row. We deliberately drop the old
                   * "Engine / Response Time / Live AI Verified / No Mock"
                   * diagnostic strip — no serious assistant (Claude, Cursor,
                   * ChatGPT) surfaces engine names or latency to the user. All
                   * that remains is an unobtrusive thumbs up/down, which still
                   * feeds the model-quality flywheel.
                   */}
                  {msg.sender === 'ai' && !msg.isKeyPrompt && msg.requestId && (
                    <div style={{
                      marginTop: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.75rem',
                      color: subtextColor,
                      opacity: 0.35,
                      transition: 'opacity 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = 0.35}
                    >
                      <button type="button" onClick={() => submitModelFeedback(msg, 'helpful')} aria-label="Mark this response helpful" title="Helpful" style={{ border: 'none', background: 'transparent', color: msg.qualityFeedback === 'helpful' ? '#059669' : subtextColor, cursor: msg.qualityFeedback ? 'default' : 'pointer', padding: '2px', display: 'inline-flex' }}><ThumbsUp size={14} /></button>
                      <button type="button" onClick={() => submitModelFeedback(msg, 'not_helpful')} aria-label="Mark this response not helpful" title="Not helpful" style={{ border: 'none', background: 'transparent', color: msg.qualityFeedback === 'not_helpful' ? '#dc2626' : subtextColor, cursor: msg.qualityFeedback ? 'default' : 'pointer', padding: '2px', display: 'inline-flex' }}><ThumbsDown size={14} /></button>
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
            );
    });
  }, [messages, isLight, textColor, subtextColor, openCanvasWithCode, showCodeMap, keyInputValue, arenaMode, secondModel, onOpenAuth, expandedMessageDetails, isGenerating, streamingMessageId, autoSelectEnabled, activeGeneratingModel, selectedModel, handleArenaPreference]);

  return (
    <div className="ai-studio-shell" style={{
      display: 'flex',
      gap: '20px',
      maxWidth: isWorkspaceMode ? '100%' : '1800px',
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
      <div className={`ai-studio-sidebar ${sidebarOpen ? 'is-open' : ''}`} style={{
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
            { title: 'Analyze my repository', icon: <Github size={15} color="#24292f" />, action: 'github', mode: 'ask' },
            { title: 'Plan before you build', icon: <Layout size={15} color="#8b5cf6" />, prompt: 'Help me plan a new web app. Ask one clarifying question, then output the architecture plan.', mode: 'plan' },
            { title: 'Task Manager App', icon: <FileText size={15} color="#f97316" />, prompt: 'Build a full-stack task manager app with category filters and status tracking', mode: 'build' },
            { title: 'Quantum Simulator', icon: <Atom size={15} color="#8b5cf6" />, prompt: 'Build an interactive Quantum Circuit & Bell state entanglement simulator', mode: 'build' }
          ].map((card, idx) => (
            <div
              key={idx}
              onClick={() => {
                if (card.mode) setStudioMode(card.mode);
                if (card.action === 'github') {
                  setIsGithubModalOpen(true);
                } else if (card.prompt) {
                  handleSendMessage(card.prompt, { studioMode: card.mode || studioMode });
                }
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

        {/* Live model catalogue and lifecycle dashboard */}
        <button
          onClick={() => setShowModelDashboard(true)}
          aria-haspopup="dialog"
          style={{
            border: showModelDashboard ? '1px solid rgba(249, 115, 22, 0.35)' : '1px solid transparent',
            background: showModelDashboard ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.12)') : 'transparent',
            borderRadius: '9px',
            padding: '8px 10px',
            marginBottom: '16px',
            color: showModelDashboard ? '#f97316' : textColor,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.78rem',
            fontWeight: '700',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={15} /> Model Dashboard
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#059669', fontSize: '0.65rem' }}>{modelDashboard?.summary?.available ?? availableModels?.filter((model) => model.available !== false).length ?? 0} ready</span>
            <ChevronDown size={13} style={{ transform: 'rotate(-90deg)' }} />
          </span>
        </button>

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
                  {session.boundRepo?.name && (
                    <Github size={11} color={isActive ? '#f97316' : subtextColor} style={{ flexShrink: 0, opacity: 0.8 }} title={session.boundRepo.name} />
                  )}
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

      {showModelDashboard && createPortal((
        <div className="model-drawer-backdrop" onMouseDown={() => setShowModelDashboard(false)}>
          <section
            className={`model-drawer ${isLight ? 'is-light' : 'is-dark'}`}
            role="dialog"
            aria-modal="true"
            aria-label="AI model catalogue"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="model-drawer-header">
              <div>
                <div className="model-drawer-title"><Activity size={18} /> Model Dashboard</div>
                <div className="model-drawer-subtitle">
                  {isAdmin ? 'Choose a ready model or approve newly discovered free options.' : 'Choose a ready model for chat and build.'}
                </div>
              </div>
              <button className="model-drawer-close" onClick={() => setShowModelDashboard(false)} aria-label="Close AI models">
                <X size={18} />
              </button>
            </div>
            <ModelDashboard
              data={modelDashboard}
              availableModels={availableModels}
              selectedModel={selectedModel}
              autoSelectEnabled={autoSelectEnabled}
              onToggleAutoSelect={setAutoSelectEnabled}
              onSelectModel={(model) => {
                setAutoSelectEnabled(false);
                setSelectedModel(availableModels?.find((candidate) => candidate.id === model.id) || model);
                setShowModelDashboard(false);
              }}
              isLight={isLight}
              isAdmin={isAdmin}
              onModelsRefresh={onModelsRefresh}
            />
          </section>
        </div>
      ), document.body)}

      {/* Main Chat Interface (Center or Left if Workspace is Open) */}
      <div className="ai-studio-main" style={{
        flex: isWorkspaceMode ? '0 0 42%' : 1,
        display: 'flex',
        flexDirection: 'column',
        maxWidth: isWorkspaceMode ? '42%' : '100%',
        margin: '0 auto',
        padding: isWorkspaceMode ? '0 10px 0 0' : 'clamp(6px, 1vw, 12px) clamp(12px, 1.6vw, 24px)',
        minHeight: 0,
        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        <StudioChromeBar
          isLight={isLight}
          textColor={textColor}
          subtextColor={subtextColor}
          sidebarOpen={sidebarOpen}
          onOpenSidebar={() => setSidebarOpen(true)}
          sessionTitle={activeSession?.title}
          showSessionMeta={messages.length > 1}
          isGenerating={isGenerating}
          activeGeneratingModel={activeGeneratingModel}
          autoSelectEnabled={autoSelectEnabled}
          selectedModel={selectedModel}
          hasMemory={hasSessionMemory(conversationContext)}
          memoryLabel={conversationContext.goal || conversationContext.understanding || 'Remembering context'}
          arenaMode={arenaMode}
          onToggleArena={() => setArenaMode(!arenaMode)}
          secondModel={secondModel}
          showSecondModelDropdown={showSecondModelDropdown}
          onToggleSecondModelDropdown={() => setShowSecondModelDropdown(!showSecondModelDropdown)}
          onResetChat={() => updateActiveMessages([])}
          arenaDropdown={showSecondModelDropdown && (
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
              zIndex: 300,
            }}>
              <div style={{ fontSize: '0.7rem', color: subtextColor, padding: '4px 8px', fontWeight: '700', textTransform: 'uppercase' }}>
                Select competitor (Model B)
              </div>
              {availableModels && availableModels.map((m) => {
                const isAvailable = m.available !== false;
                return (
                  <div
                    key={m.id}
                    onClick={() => {
                      if (!isAvailable) return;
                      setSecondModel(m);
                      setShowSecondModelDropdown(false);
                    }}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      cursor: isAvailable ? 'pointer' : 'not-allowed',
                      background: secondModel?.id === m.id ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.2)') : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.8rem',
                      color: !isAvailable ? subtextColor : (secondModel?.id === m.id ? '#f97316' : textColor),
                      fontWeight: secondModel?.id === m.id ? '700' : '500',
                      opacity: isAvailable ? 1 : 0.6,
                    }}
                  >
                    <span style={{ textDecoration: !isAvailable ? 'line-through' : 'none' }}>{m.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        />

        {arenaMode && !arenaHintDismissed && (
          <div className="studio-arena-hint" role="note">
            <div style={{ flex: 1 }}>
              <strong>Arena mode</strong> — compare two models on the same prompt, side by side.
              <div className="studio-arena-hint__steps">
                <span className="studio-arena-hint__step"><span>1</span> Turn Arena on</span>
                <span className="studio-arena-hint__step"><span>2</span> Pick Model B via VS dropdown</span>
                <span className="studio-arena-hint__step"><span>3</span> Send one prompt — both answer in parallel</span>
              </div>
            </div>
            <button
              type="button"
              className="studio-arena-hint__dismiss"
              onClick={() => {
                setArenaHintDismissed(true);
                try { localStorage.setItem('quantora_arena_hint_dismissed', '1'); } catch { /* best effort */ }
              }}
            >
              Got it
            </button>
          </div>
        )}

      {/* Messages Stream / Initial Hero State */}
      <div
        ref={messageViewportRef}
        onScroll={handleMessageScroll}
        className={`ai-studio-messages ${messages.length <= 1 ? 'ai-studio-messages--empty' : ''}`}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: messages.length <= 1 ? 'center' : 'flex-start', overflowY: 'auto', marginBottom: '12px', scrollBehavior: 'smooth' }}
      >
        {messages.length <= 1 ? (
          /* Clean Hero Empty State */
          <div className="ai-studio-empty-state" style={{
            textAlign: 'center',
            padding: '32px 28px 24px',
            maxWidth: '720px',
            margin: '0 auto',
            width: '100%',
            background: isLight ? 'linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(248, 250, 252, 0.85))' : 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(40px) saturate(200%)',
            WebkitBackdropFilter: 'blur(40px) saturate(200%)',
            border: isLight ? '1px solid rgba(226, 232, 240, 0.8)' : '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '32px',
            boxShadow: isLight ? '0 32px 64px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(255,255,255,0.6) inset' : '0 32px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.2)'
          }}>
            <div className="ai-studio-empty-icon" style={{
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

            <h1 className="ai-studio-empty-title" style={{ fontSize: '2.4rem', fontWeight: '800', margin: '0 0 6px 0', color: textColor, letterSpacing: '-0.03em' }}>
              Hello, {user?.name ? user.name.split(' ')[0] : 'Bharani'}
            </h1>
            <p className="ai-studio-empty-subtitle" style={{ fontSize: '1.1rem', fontWeight: '400', margin: '0 0 24px 0', color: subtextColor }}>
              What would you like to build today?
            </p>

            {/* AI Models Highlight Cards */}
            <div className="ai-studio-model-cards" style={{
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
                <div key={idx} className="ai-studio-model-card" style={{
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
                    <h3 style={{ margin: 0, fontSize: '0.95rem', color: textColor, fontWeight: '700' }}>{model.name}</h3>
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
          <div className="ai-studio-thread" style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1120px', margin: '0 auto', width: '100%' }}>
            {renderedChatFeed}
            {isGenerating && (
              <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: isLight ? '#ffffff' : 'transparent',
                  border: isLight ? '1px solid var(--border-color)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Sparkles size={18} color="#f97316" className="animate-spin" />
                </div>
                <div style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '16px',
                  background: isLight ? '#ffffff' : '#0d1127',
                  border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#f97316',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <Loader size={15} className="animate-spin" />
                  {autoSelectEnabled
                    ? 'Working on your request…'
                    : `${activeGeneratingModel?.name || selectedModel?.name || 'Qwen 2.5 Coder'} is thinking…`}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Clean Prompt Console Input Area */}
      <div className="ai-studio-prompt" style={{ position: 'relative', width: '100%', maxWidth: '1120px', margin: '0 auto', flexShrink: 0 }}>
        {boundRepo?.name && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', paddingLeft: '4px' }}>
            <span style={{
              fontSize: '0.75rem',
              background: isLight ? '#f0fdf4' : 'rgba(34, 197, 94, 0.12)',
              border: isLight ? '1px solid #bbf7d0' : '1px solid rgba(34, 197, 94, 0.35)',
              color: isLight ? '#166534' : '#86efac',
              padding: '5px 12px',
              borderRadius: '999px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: '600'
            }}>
              <Github size={13} />
              {boundRepo.name}
              <span style={{ opacity: 0.7, fontWeight: '500' }}>· repo context active</span>
              <button type="button" onClick={clearBoundRepo} title="Disconnect repository" style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex' }}>
                <X size={12} />
              </button>
            </span>
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
                {att.type === 'context' ? <Layers size={12} color="#8b5cf6" /> : att.type === 'image' ? <ImageIcon size={12} color="#f97316" /> : <FileText size={12} color="#0284c7" />}
                <span>{att.name}</span>
                {att.type === 'image' && att.dataUrl && (
                  <span style={{ fontSize: '0.65rem', opacity: 0.75 }}>· vision</span>
                )}
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

        {spotlightModel && (
          <div className="model-spotlight-card" style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            marginBottom: '10px',
            padding: '12px 14px',
            borderRadius: '16px',
            background: isLight
              ? 'linear-gradient(135deg, #faf5ff 0%, #fff7ed 100%)'
              : 'linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(249,115,22,0.1) 100%)',
            border: isLight ? '1px solid #e9d5ff' : '1px solid rgba(167,139,250,0.35)',
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              background: isLight ? '#ffffff' : 'rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Sparkles size={18} color="#a855f7" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {spotlightModel.isUpdated ? 'Model updated' : 'New model'}
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: textColor, marginTop: '2px' }}>
                {spotlightModel.name}
              </div>
              <div style={{ fontSize: '0.78rem', color: subtextColor, marginTop: '4px', lineHeight: 1.45 }}>
                {spotlightModel.description || spotlightModel.specialty || 'Now available in Quantora\'s free model lineup.'}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (spotlightModel.selectable !== false) {
                    setSelectedModel(availableModels?.find((c) => c.id === spotlightModel.id) || spotlightModel);
                    setAutoSelectEnabled(false);
                  }
                  dismissModelSpotlight(spotlightModel.id);
                }}
                style={{
                  marginTop: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: '#f97316',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Try it →
              </button>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismissModelSpotlight(spotlightModel.id)}
              style={{ background: 'transparent', border: 'none', color: subtextColor, cursor: 'pointer', padding: '2px' }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Prompt Card Container */}
        <div className="floating-input-pill" style={{
          overflow: 'visible',
          position: 'relative',
          padding: '4px'
        }}>
          {/* Intelligent Router Suggestion Pill */}
          {suggestedModel?.model && !showMentionMenu && (
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
                🧠 Auto Select: <strong style={{color: '#f97316'}}>{suggestedModel.model.name}</strong> is the best ready free model for this request.
              </span>
              <button
                onClick={() => { setSelectedModel(suggestedModel.model); setAutoSelectEnabled(false); setSuggestedModel(null); }}
                title={`Switch to ${suggestedModel.model.name} and pin it`}
                style={{ background: '#f97316', color: '#fff', border: 'none', borderRadius: '10px', padding: '3px 10px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                Change
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



          {/* Prompt Engineer review card — edit & finalize before it hits the input. */}
          {enhanceResult && (
            <div style={{ margin: '0 18px 8px', borderRadius: '14px', border: '1px solid rgba(249,115,22,0.35)', background: isLight ? '#fffaf5' : 'rgba(249,115,22,0.06)', boxShadow: isLight ? '0 8px 24px rgba(0,0,0,0.06)' : '0 8px 30px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: isLight ? '1px solid #f1e4d6' : '1px solid rgba(255,255,255,0.08)' }}>
                <Wand2 size={15} color="#f97316" />
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: textColor }}>Prompt Engineer</span>
                <span style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#f97316', background: 'rgba(249,115,22,0.14)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: '999px', padding: '2px 8px' }}>{enhanceResult.tier}</span>
                {enhanceResult.model && (
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', color: subtextColor }}>
                    <Cpu size={12} color="#f97316" /> Suggested: <strong style={{ color: textColor }}>{enhanceResult.model.name}</strong>
                  </span>
                )}
              </div>
              <textarea
                value={enhanceResult.prompt}
                onChange={(e) => setEnhanceResult(r => ({ ...r, prompt: e.target.value }))}
                rows={Math.min(10, Math.max(3, (enhanceResult.prompt.match(/\n/g) || []).length + 2))}
                style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', resize: 'vertical', background: 'transparent', color: textColor, fontSize: '0.9rem', lineHeight: 1.5, padding: '12px 14px', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderTop: isLight ? '1px solid #f1e4d6' : '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
                <button disabled={isEnhancingPrompt} onClick={() => runEnhance(enhanceResult.original, 'lighter')} style={{ background: 'transparent', border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.15)', color: subtextColor, borderRadius: '8px', padding: '5px 10px', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer' }}>↓ Lighter</button>
                <button disabled={isEnhancingPrompt} onClick={() => runEnhance(enhanceResult.original, 'deeper')} style={{ background: 'transparent', border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.15)', color: subtextColor, borderRadius: '8px', padding: '5px 10px', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer' }}>↑ Deeper</button>
                {isEnhancingPrompt && <span style={{ fontSize: '0.72rem', color: subtextColor }}>Re-thinking…</span>}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                  <button onClick={() => setEnhanceResult(null)} style={{ background: 'transparent', border: 'none', color: subtextColor, fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer' }}>Discard</button>
                  <button onClick={applyEnhancement} style={{ background: '#f97316', border: 'none', color: '#fff', borderRadius: '8px', padding: '6px 14px', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>Use it</button>
                </span>
              </div>
            </div>
          )}

          {/* Refine mode: next message edits the existing site in place instead of rebuilding. */}
          {refineActive && previewCode && previewCode.trim() && !isGenerating && (
            <div style={{ margin: '0 18px 2px', display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 12px', borderRadius: '10px', background: isLight ? 'rgba(249,115,22,0.08)' : 'rgba(249,115,22,0.14)', border: '1px solid rgba(249,115,22,0.3)', fontSize: '0.76rem' }}>
              <Wand2 size={14} color="#f97316" />
              <span style={{ color: isLight ? '#9a3412' : '#fdba74', fontWeight: 600 }}>
                Refine mode — your next message updates the live site.
              </span>
              <button type="button" onClick={() => setRefineActive(false)} title="Start a new build instead of editing the current site" style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: isLight ? '#9a3412' : '#fdba74', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline' }}>New build</button>
            </div>
          )}

          {pendingChoiceMessage && (
            <div className="studio-choice-dock">
              <StudioChoiceCards
                variant="floating"
                choiceSet={pendingChoiceMessage.choiceSet}
                isLight={isLight}
                disabled={isGenerating}
                onSelect={(choice) => {
                  updateActiveMessages((prev) => prev.map((m) => (
                    m.id === pendingChoiceMessage.id ? { ...m, choiceUsed: true } : m
                  )));
                  handleSendMessage(choice.value, { choiceSelected: true });
                }}
              />
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
                if (e.key === 'Escape') {
                  setShowMentionsList(false);
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                  e.target.style.height = 'auto';
                }
              }}
              onPaste={handlePaste}
              placeholder={getPromptPlaceholder({
                studioMode,
                studioDomain,
                boundRepoName: boundRepo?.name,
              })}
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
                minHeight: '56px',
                maxHeight: '400px',
                overflow: 'auto'
              }}
            />
          </div>

          {/* Bottom Action Toolbar — single Fellow-style row */}
          <div className="studio-prompt-toolbar">
            <div className="studio-prompt-toolbar__left">
              <div ref={studioToolsMenuRef} className="studio-tools-anchor">
                <button
                  type="button"
                  className={`studio-tool-trigger${(studioDomain || studioMode !== 'ask') ? ' is-active' : ''}${showStudioToolsMenu ? ' is-open' : ''}`}
                  onClick={() => setShowStudioToolsMenu((v) => !v)}
                  title="Focus area and response type"
                  aria-expanded={showStudioToolsMenu}
                  aria-haspopup="menu"
                >
                  <SlidersHorizontal size={17} strokeWidth={2.2} />
                  {(studioDomain || studioMode !== 'ask') && (
                    <span className="studio-tool-trigger__label">
                      {activeDomainMeta ? activeDomainMeta.label : getOutputModeLabel(studioMode)}
                    </span>
                  )}
                </button>
                {showStudioToolsMenu && (
                  <StudioToolsMenu
                    isLight={isLight}
                    studioDomain={studioDomain}
                    studioMode={studioMode}
                    onSelectDomain={(domain) => { setStudioDomain(domain); setShowStudioToolsMenu(false); }}
                    onSelectMode={(mode) => { setStudioMode(mode); setShowStudioToolsMenu(false); }}
                  />
                )}
              </div>

              <span className="studio-prompt-toolbar__sep" aria-hidden="true" />

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                multiple
              />

              <button
                type="button"
                className={`studio-prompt-icon-btn${isListening ? ' is-recording' : ''}`}
                onClick={toggleVoiceInput}
                title="Voice Input"
                style={isListening ? { color: '#ef4444', background: 'rgba(239, 68, 68, 0.15)', animation: 'pulse 2s infinite' } : undefined}
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              
              {/* Attachment Dropdown */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className={`studio-prompt-icon-btn${isAttachmentMenuOpen ? ' is-active' : ''}`}
                  onClick={() => setIsAttachmentMenuOpen(!isAttachmentMenuOpen)}
                  title="Attach file, image, or GitHub"
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
                type="button"
                className={`studio-prompt-icon-btn${isEnhancingPrompt ? ' is-active' : ''}`}
                onClick={handleMagicWandEnhance}
                disabled={isEnhancingPrompt}
                title="AI Magic Wand - Enhance & Expand Prompt"
              >
                {isEnhancingPrompt ? <RefreshCw size={16} className="animate-spin" /> : <Wand2 size={18} />}
              </button>
            </div>

            <div className="studio-prompt-toolbar__right">
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
                  <span>{autoSelectEnabled ? 'Auto' : (selectedModel ? selectedModel.name.split(' ')[0] : 'Engine')}</span>
                  <ChevronDown size={13} color={showInBarModelDropdown ? "#f97316" : subtextColor} />
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
                      {/* Explicit Auto-Select toggle: on = pick best free model
                          per request; off = use the model chosen below. Picking
                          any model also flips this off. */}
                      <div
                        onClick={() => setAutoSelectEnabled(v => !v)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', marginBottom: '6px', borderRadius: '8px', cursor: 'pointer', background: autoSelectEnabled ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.15)') : (isLight ? '#f1f5f9' : 'rgba(255,255,255,0.05)') }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: autoSelectEnabled ? '#f97316' : textColor }}>Auto-Select</span>
                          <span style={{ fontSize: '0.66rem', color: subtextColor }}>Best ready free model per request</span>
                        </div>
                        <div style={{ width: '34px', height: '20px', borderRadius: '999px', background: autoSelectEnabled ? '#f97316' : (isLight ? '#cbd5e1' : '#334155'), position: 'relative', transition: 'all 0.2s', flexShrink: 0 }}>
                          <div style={{ position: 'absolute', top: '2px', left: autoSelectEnabled ? '16px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'all 0.2s' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {availableModels && availableModels.map(model => {
                          const isAvailable = model.available !== false;
                          
                          return (
                          <div
                            key={model.id}
                            onClick={() => {
                              if (isAvailable) {
                                setAutoSelectEnabled(false);
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
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: !isAvailable ? 'line-through' : 'none' }}>{model.name}</span>
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

              <button
                type="button"
                className={`studio-send-btn${(inputText.trim() || attachments.length) ? ' is-ready' : ''}`}
                onClick={() => handleSendMessage()}
                disabled={(!inputText.trim() && !attachments.length) || isGenerating}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>

      </div>
      </div>

      {/* Background sandbox verification — runs before the preview button unlocks. */}
      {backgroundVerify && !canvasOpen && (
        <div style={{ position: 'fixed', left: '-10000px', top: 0, width: '480px', height: '480px', overflow: 'hidden', pointerEvents: 'none' }} aria-hidden="true">
          <LivePreviewCanvas
            headless
            verifyOnly
            code={backgroundVerify.code}
            isLight={isLight}
            onVerificationStatusChange={handleBackgroundVerificationStatus}
            onClose={() => setBackgroundVerify(null)}
          />
        </div>
      )}

      {/* Live Preview — fixed overlay above app chrome (z-index 20000). */}
      {canvasOpen && createPortal((
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Live Preview"
          className={`preview-overlay${canvasFullscreen ? ' preview-overlay--fullscreen' : ''}`}
          style={{
            background: canvasFullscreen ? (isLight ? '#f8fafc' : '#0d1127') : undefined,
          }}
        >
          <div className={`preview-overlay-panel${canvasFullscreen ? ' preview-overlay-panel--fullscreen' : ''}`} style={{
            background: isLight ? '#f8fafc' : '#0d1127',
            borderRadius: canvasFullscreen ? 0 : '20px',
            border: canvasFullscreen ? 'none' : (isLight ? '1px solid #cbd5e1' : '1px solid rgba(249, 115, 22, 0.5)'),
            boxShadow: canvasFullscreen ? 'none' : '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          }}>
            <div
              className="preview-overlay-chrome"
              style={{
              borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)',
              background: isLight ? '#ffffff' : '#1e293b',
            }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: isLight ? '#334155' : '#e2e8f0' }}>
                Live Preview
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={togglePreviewFullscreen}
                  style={{
                    background: 'transparent',
                    border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.15)',
                    color: isLight ? '#64748b' : '#cbd5e1',
                    borderRadius: '10px',
                    padding: '6px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {canvasFullscreen ? 'Exit full screen' : 'Full screen'}
                </button>
                <button
                  type="button"
                  onClick={closePreviewModal}
                  title="Close preview (Esc)"
                  aria-label="Close preview"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                    border: 'none',
                    color: '#ffffff',
                    borderRadius: '10px',
                    padding: '8px 14px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(249, 115, 22, 0.35)',
                  }}
                >
                  <X size={16} /> Close
                </button>
              </div>
            </div>
            <div className="preview-overlay-body">
              <LivePreviewCanvas
                code={previewCode}
                isLight={isLight}
                isFullscreen={canvasFullscreen}
                hideHeader
                onToggleFullscreen={togglePreviewFullscreen}
                onClose={closePreviewModal}
              />
            </div>
          </div>
        </div>
      ), document.body)}

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
              <button
                onClick={() => { try { navigator.clipboard.writeText(workspaceCode || ''); } catch (e) {} }}
                title="Copy code"
                style={{ background: 'transparent', border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.15)', color: subtextColor, padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Copy size={12} /> Copy
              </button>
              <button
                onClick={() => { if (workspaceCode && workspaceCode.trim()) openCanvasWithCode(workspaceCode); }}
                title="Render this code in the Live Canvas"
                style={{ background: 'transparent', border: '1px solid rgba(249, 115, 22, 0.3)', color: '#f97316', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: workspaceCode && workspaceCode.trim() ? 'pointer' : 'not-allowed', opacity: workspaceCode && workspaceCode.trim() ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: '4px' }}
              >
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

          {/* Canvas Editor Area (Pillar 4: Predictive Assist) */}
          <div style={{ flex: 1, overflow: 'auto', background: '#0d1127', padding: '24px', position: 'relative' }}>
             {/* Line Numbers */}
             <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '48px', background: '#0a0d1e', borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '24px', color: 'rgba(255,255,255,0.2)', fontSize: '0.85rem', fontFamily: 'monospace', userSelect: 'none', zIndex: 10 }}>
                {Array.from({ length: Math.max(20, (workspaceCode.match(/\n/g) || []).length + 2) }).map((_, i) => (
                  <div key={i} style={{ lineHeight: '1.6' }}>{i + 1}</div>
                ))}
             </div>
             
             {/* Textarea for actual input */}
             <textarea
                value={workspaceCode}
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
                <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800', color: textColor }}>Connect Repository</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: subtextColor }}>Bind this repo to the chat — every message will include relevant codebase context.</p>
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
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: textColor, marginBottom: '8px' }}>Focus area <span style={{ fontWeight: 500, color: subtextColor }}>(optional)</span></label>
              <textarea
                value={githubChangeRequest}
                onChange={(e) => setGithubChangeRequest(e.target.value)}
                placeholder="For example: Explain the auth flow, or review the API layer"
                disabled={isFetchingGithub}
                rows={4}
                maxLength={2000}
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: '12px', resize: 'vertical',
                  border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.2)',
                  background: isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.05)', color: textColor,
                  fontSize: '0.95rem', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box'
                }}
              />
              <div style={{ marginTop: '8px', fontSize: '0.78rem', color: '#10b981', fontWeight: '600' }}>
                Read-only preview — Quantora will not modify your repository.
              </div>
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
                <><RefreshCw size={18} className="animate-spin" /> Connecting repository...</>
              ) : (
                <><Github size={18} /> Connect to this chat</>
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
