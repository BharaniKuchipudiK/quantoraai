import React, { useState } from 'react';
import { Smartphone, Tablet, Monitor, Download, X } from 'lucide-react';

export default function LivePreviewCanvas({ code, isLight, onClose }) {
  const [viewport, setViewport] = useState('desktop');

  const viewportStyles = {
    mobile: { width: '375px', height: '667px' },
    tablet: { width: '768px', height: '1024px' },
    desktop: { width: '100%', height: '100%' }
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'artifact.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      background: isLight ? '#f8fafc' : '#0f172a',
      borderLeft: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)'
    }}>
      {/* Canvas Header / Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)',
        background: isLight ? '#ffffff' : '#1e293b'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: '600', color: isLight ? '#334155' : '#cbd5e1' }}>
            Live Preview
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Viewport Toggles */}
          <div style={{ 
            display: 'flex', 
            background: isLight ? '#f1f5f9' : 'rgba(0,0,0,0.2)', 
            borderRadius: '8px', 
            padding: '2px' 
          }}>
            <button onClick={() => setViewport('mobile')} style={{
              padding: '6px', borderRadius: '6px', cursor: 'pointer', border: 'none',
              background: viewport === 'mobile' ? (isLight ? '#ffffff' : '#334155') : 'transparent',
              color: viewport === 'mobile' ? '#3b82f6' : (isLight ? '#64748b' : '#94a3b8'),
              boxShadow: viewport === 'mobile' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}><Smartphone size={16} /></button>
            <button onClick={() => setViewport('tablet')} style={{
              padding: '6px', borderRadius: '6px', cursor: 'pointer', border: 'none',
              background: viewport === 'tablet' ? (isLight ? '#ffffff' : '#334155') : 'transparent',
              color: viewport === 'tablet' ? '#3b82f6' : (isLight ? '#64748b' : '#94a3b8'),
              boxShadow: viewport === 'tablet' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}><Tablet size={16} /></button>
            <button onClick={() => setViewport('desktop')} style={{
              padding: '6px', borderRadius: '6px', cursor: 'pointer', border: 'none',
              background: viewport === 'desktop' ? (isLight ? '#ffffff' : '#334155') : 'transparent',
              color: viewport === 'desktop' ? '#3b82f6' : (isLight ? '#64748b' : '#94a3b8'),
              boxShadow: viewport === 'desktop' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}><Monitor size={16} /></button>
          </div>

          <button onClick={handleDownload} title="Export to HTML" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: isLight ? '#64748b' : '#94a3b8', display: 'flex', alignItems: 'center'
          }}>
            <Download size={18} />
          </button>

          <button onClick={onClose} title="Close Canvas" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: isLight ? '#64748b' : '#94a3b8', display: 'flex', alignItems: 'center'
          }}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'auto',
        padding: viewport === 'desktop' ? '0' : '20px'
      }}>
        <div style={{
          ...viewportStyles[viewport],
          background: '#ffffff',
          borderRadius: viewport === 'desktop' ? '0' : '12px',
          overflow: 'hidden',
          boxShadow: viewport === 'desktop' ? 'none' : '0 10px 40px rgba(0,0,0,0.2)',
          transition: 'all 0.3s ease'
        }}>
          <iframe
            srcDoc={code}
            style={{ width: '100%', height: '100%', border: 'none' }}
            sandbox="allow-scripts allow-forms allow-same-origin"
            title="Live Preview Canvas"
          />
        </div>
      </div>
    </div>
  );
}
