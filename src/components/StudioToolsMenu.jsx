import React from 'react';
import { Globe, Search, Mic, Plane, FilePieChart, Table, FileText, FileBadge } from 'lucide-react';

export default function StudioToolsMenu({ isOpen, onClose, onSelectTool, isLight }) {
  if (!isOpen) return null;

  const textColor = isLight ? '#0f172a' : '#ffffff';
  const subtextColor = isLight ? '#64748b' : '#94a3b8';
  const bg = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.85)';
  const border = isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.1)';
  const shadow = isLight 
    ? '0 20px 40px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.05)' 
    : '0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)';

  const HoverItem = ({ icon: Icon, title, subtitle, iconColor, onClick, badge }) => (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 14px',
        cursor: 'pointer',
        gap: '14px',
        transition: 'background 0.2s',
        borderRadius: '12px'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px' }}>
        {typeof Icon === 'string' ? (
          <span style={{ fontSize: '18px' }}>{Icon}</span>
        ) : (
          <Icon size={20} color={iconColor || subtextColor} />
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.92rem', fontWeight: '600', color: textColor }}>{title}</span>
          {badge && (
            <span style={{ 
              fontSize: '0.65rem', 
              background: isLight ? '#f1f5f9' : '#1e293b', 
              color: subtextColor, 
              padding: '2px 6px', 
              borderRadius: '10px', 
              fontWeight: '600' 
            }}>
              {badge}
            </span>
          )}
        </div>
        <span style={{ fontSize: '0.75rem', color: subtextColor }}>{subtitle}</span>
      </div>
      <div style={{
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        border: `2px solid ${isLight ? '#cbd5e1' : '#475569'}`,
        boxSizing: 'border-box'
      }} />
    </div>
  );

  return (
    <>
      <div 
        onClick={onClose} 
        style={{ position: 'fixed', inset: 0, zIndex: 999 }} 
      />
      <div style={{
        position: 'absolute',
        bottom: 'calc(100% + 12px)',
        left: '20px',
        width: '320px',
        background: bg,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border,
        borderRadius: '20px',
        boxShadow: shadow,
        zIndex: 1000,
        padding: '16px 8px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        animation: 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        
        {/* GENERAL SECTION */}
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: '700', color: subtextColor, padding: '0 14px 6px', letterSpacing: '0.04em' }}>
            GENERAL
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <HoverItem 
              icon={Globe} 
              title="Search" 
              subtitle="Auto-browse the web, YouTube & X" 
              onClick={() => onSelectTool('Search')}
            />
            <HoverItem 
              icon={Search} 
              title="Deep Research" 
              subtitle="In-depth, multi-source research" 
              badge="Beta"
              onClick={() => onSelectTool('Deep Research')}
            />
            <HoverItem 
              icon={Mic} 
              title="Podcast" 
              subtitle="Turn content into a podcast" 
              onClick={() => onSelectTool('Podcast')}
            />
            <HoverItem 
              icon={Plane} 
              title="Travel" 
              subtitle="Plan trips, find flights & hotels" 
              badge="Beta"
              onClick={() => onSelectTool('Travel')}
            />
          </div>
        </div>

        {/* OFFICE SECTION */}
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: '700', color: subtextColor, padding: '0 14px 6px', letterSpacing: '0.04em' }}>
            OFFICE
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <HoverItem 
              icon={FilePieChart} 
              iconColor="#ef4444" 
              title="PowerPoint" 
              subtitle="Create & edit presentations" 
              badge="Beta"
              onClick={() => onSelectTool('PowerPoint')}
            />
            <HoverItem 
              icon={Table} 
              iconColor="#10b981" 
              title="Excel" 
              subtitle="Create & edit spreadsheets" 
              badge="Beta"
              onClick={() => onSelectTool('Excel')}
            />
            <HoverItem 
              icon={FileText} 
              iconColor="#3b82f6" 
              title="Word" 
              subtitle="Create & edit documents" 
              badge="Beta"
              onClick={() => onSelectTool('Word')}
            />
            <HoverItem 
              icon={FileBadge} 
              iconColor="#ef4444" 
              title="PDF" 
              subtitle="Create & edit PDFs" 
              badge="Beta"
              onClick={() => onSelectTool('PDF')}
            />
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
