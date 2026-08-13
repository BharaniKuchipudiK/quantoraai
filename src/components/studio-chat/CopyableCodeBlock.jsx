import React, { useState } from 'react';
import { Copy } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export default function CopyableCodeBlock({ code, language }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div style={{ position: 'relative', margin: '10px 0' }}>
      <button
        type="button"
        onClick={onCopy}
        title="Copy code"
        style={{
          position: 'absolute', top: '8px', right: '8px', zIndex: 2,
          background: copied ? 'rgba(16,185,129,0.9)' : 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.2)', color: '#fff',
          borderRadius: '6px', padding: '4px 9px', fontSize: '0.7rem', fontWeight: 700,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
        }}
      >
        <Copy size={12} />
        {' '}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <SyntaxHighlighter
        style={vscDarkPlus}
        language={language}
        PreTag="div"
        customStyle={{ borderRadius: '8px', margin: 0, fontSize: '0.85rem', paddingTop: '34px' }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
