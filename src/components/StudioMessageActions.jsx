import React, { useState } from 'react';
import { RefreshCw, List, Copy, MoreHorizontal, Check } from 'lucide-react';

export default function StudioMessageActions({ text, onRegenerate, onSummarize }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (text) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginTop: '8px',
      opacity: 0.6,
      transition: 'opacity 0.2s ease',
    }}
    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
    onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
    >
      <button 
        onClick={onSummarize}
        title="Summarize"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'inherit',
          borderRadius: '4px'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(128, 128, 128, 0.1)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <List size={14} />
      </button>

      <button 
        onClick={onRegenerate}
        title="Regenerate"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'inherit',
          borderRadius: '4px'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(128, 128, 128, 0.1)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <RefreshCw size={14} />
      </button>

      <button 
        onClick={handleCopy}
        title="Copy"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'inherit',
          borderRadius: '4px'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(128, 128, 128, 0.1)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
      </button>

      <button 
        title="More"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'inherit',
          borderRadius: '4px'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(128, 128, 128, 0.1)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
}
