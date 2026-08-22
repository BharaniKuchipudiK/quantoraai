import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  CreditCard,
  FileBadge,
  FilePieChart,
  FileText,
  Globe,
  HelpCircle,
  Building2,
  MapPin,
  Mic,
  Plane,
  Plus,
  Route,
  Search,
  Sparkles,
  Table,
} from 'lucide-react';
import { rememberOfficeToolSelection } from '../lib/office-intent.js';
import { studioToolsMenuGroups } from '../lib/studio-tools-menu.js';

const ICONS = {
  globe: Globe,
  search: Search,
  mic: Mic,
  plane: Plane,
  slides: FilePieChart,
  table: Table,
  word: FileText,
  pdf: FileBadge,
  plus: Plus,
  spark: Sparkles,
  hotel: Building2,
  pin: MapPin,
  route: Route,
  book: BookOpen,
  cards: CreditCard,
  quiz: HelpCircle,
};

export default function StudioToolsMenu({
  isOpen,
  onClose,
  onSelectTool,
  isLight,
  studioDomain = null,
  topic = '',
  anchorRef = null,
}) {
  const [pos, setPos] = useState({ left: 16, bottom: 88 });

  useLayoutEffect(() => {
    if (!isOpen || typeof window === 'undefined') return undefined;
    const place = () => {
      const node = anchorRef?.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const width = 320;
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      setPos({
        left,
        bottom: Math.max(12, window.innerHeight - rect.top + 10),
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [isOpen, anchorRef]);

  if (!isOpen || typeof document === 'undefined') return null;

  const groups = studioToolsMenuGroups(studioDomain, topic);
  const storyType = studioDomain === 'travel' || studioDomain === 'education';
  const textColor = isLight ? '#0f172a' : '#ffffff';
  const subtextColor = isLight ? '#64748b' : '#a8b3c7';
  const bg = isLight ? 'rgba(255, 255, 255, 0.995)' : 'rgba(15, 23, 42, 0.985)';
  const border = isLight ? '1px solid rgba(15, 23, 42, 0.14)' : '1px solid rgba(148, 163, 184, 0.28)';
  const shadow = isLight
    ? '0 24px 56px rgba(15,23,42,0.18), 0 2px 8px rgba(15,23,42,0.08)'
    : '0 28px 64px rgba(0,0,0,0.72), 0 0 0 1px rgba(255,255,255,0.06)';

  const selectTool = (toolId) => {
    rememberOfficeToolSelection(toolId);
    onSelectTool(toolId);
  };

  const HoverItem = ({ item }) => {
    const Icon = ICONS[item.icon] || Sparkles;
    return (
      <div
        data-quantora-plus-item={item.id}
        onClick={() => selectTool(item.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 14px',
          cursor: 'pointer',
          gap: '14px',
          transition: 'background 0.2s',
          borderRadius: '12px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = isLight ? 'rgba(15,23,42,0.055)' : 'rgba(255,255,255,0.075)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px' }}>
          <Icon size={20} color={item.iconColor || subtextColor} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontSize: '0.92rem',
              fontWeight: '600',
              color: textColor,
              fontFamily: storyType ? 'var(--font-story), var(--font-heading), sans-serif' : 'inherit',
            }}>
              {item.title}
            </span>
            {item.badge && (
              <span style={{
                fontSize: '0.65rem',
                background: isLight ? '#f1f5f9' : '#1e293b',
                color: subtextColor,
                padding: '2px 6px',
                borderRadius: '10px',
                fontWeight: '600',
              }}>
                {item.badge}
              </span>
            )}
          </div>
          <span style={{ fontSize: '0.75rem', color: subtextColor }}>{item.subtitle}</span>
        </div>
        <div style={{
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          border: `2px solid ${isLight ? '#cbd5e1' : '#64748b'}`,
          boxSizing: 'border-box',
        }} />
      </div>
    );
  };

  return createPortal(
    <>
      <div
        data-quantora-studio-tools-backdrop="true"
        onMouseDown={(event) => {
          event.preventDefault();
          onClose();
        }}
        style={{ position: 'fixed', inset: 0, zIndex: 40000 }}
      />
      <div
        data-quantora-studio-tools-menu="true"
        data-quantora-plus-domain={studioDomain || 'studio'}
        style={{
          position: 'fixed',
          left: pos.left,
          bottom: pos.bottom,
          width: '320px',
          maxHeight: 'min(70vh, 520px)',
          overflowY: 'auto',
          background: bg,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border,
          borderRadius: '20px',
          boxShadow: shadow,
          zIndex: 40001,
          padding: '16px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {groups.map((group) => (
          <div key={group.heading}>
            <div style={{
              fontSize: '0.7rem',
              fontWeight: '700',
              color: subtextColor,
              padding: '0 14px 6px',
              letterSpacing: '0.04em',
            }}>
              {group.heading}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {group.items.map((item) => (
                <HoverItem key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>,
    document.body,
  );
}
