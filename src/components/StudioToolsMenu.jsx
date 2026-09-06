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
  X,
} from 'lucide-react';
import { rememberOfficeToolSelection } from '../lib/office-intent.js';
import { requestStudySurface } from '../lib/study-surface-navigation.js';
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
  const compactStudy = studioDomain === 'education';
  const normalizedTopic = String(topic || '').trim();
  const hasStudyTopic = Boolean(normalizedTopic && normalizedTopic.toLowerCase() !== 'this topic');

  useLayoutEffect(() => {
    if (!isOpen || typeof window === 'undefined') return undefined;
    const place = () => {
      const node = anchorRef?.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const width = compactStudy ? 292 : 320;
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      setPos({
        left,
        bottom: Math.max(12, window.innerHeight - rect.top + 10),
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [isOpen, anchorRef, compactStudy]);

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

  const selectTool = (selection) => {
    const item = selection && typeof selection === 'object' ? selection : null;
    const toolId = item?.id || String(selection || '');
    if (compactStudy && item?.requiresTopic && !hasStudyTopic) return;
    if (compactStudy && item?.surface && requestStudySurface(item.surface)) {
      onClose?.();
      return;
    }
    rememberOfficeToolSelection(toolId);
    onSelectTool(toolId);
    if (compactStudy) onClose?.();
  };

  const HoverItem = ({ item }) => {
    const Icon = ICONS[item.icon] || Sparkles;
    return (
      <div
        data-quantora-plus-item={item.id}
        onClick={() => selectTool(item)}
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
      </div>
    );
  };

  const StudyAction = ({ item }) => {
    const Icon = ICONS[item.icon] || Sparkles;
    const isWide = item.id === 'new-topic' || item.id === 'study-notebook';
    const disabled = Boolean(item.requiresTopic && !hasStudyTopic);
    const title = disabled ? 'Start a Study topic first.' : item.subtitle;
    return (
      <button
        type="button"
        data-quantora-plus-item={item.id}
        data-quantora-study-surface={item.surface || undefined}
        data-quantora-study-requires-topic={item.requiresTopic ? 'true' : undefined}
        title={title}
        aria-label={item.title}
        disabled={disabled}
        onClick={() => selectTool(item)}
        style={{
          gridColumn: isWide ? '1 / -1' : 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: '9px',
          minHeight: isWide ? '42px' : '54px',
          padding: '9px 10px',
          borderRadius: '12px',
          border: isLight ? '1px solid rgba(15,23,42,0.10)' : '1px solid rgba(148,163,184,0.18)',
          background: isWide
            ? (isLight ? '#f8fafc' : 'rgba(148,163,184,0.08)')
            : (isLight ? '#fff' : 'rgba(255,255,255,0.035)'),
          color: textColor,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.48 : 1,
          textAlign: 'left',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ display: 'inline-flex', width: '24px', height: '24px', borderRadius: '8px', alignItems: 'center', justifyContent: 'center', background: isLight ? '#fff7ed' : 'rgba(249,115,22,0.12)', flex: '0 0 auto' }}>
          <Icon size={15} color={isLight ? '#c2410c' : '#fdba74'} />
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '0.80rem', fontWeight: 750, lineHeight: 1.15 }}>{item.title}</span>
        </span>
      </button>
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
        role={compactStudy ? 'dialog' : undefined}
        aria-label={compactStudy ? 'Study actions' : undefined}
        style={{
          position: 'fixed',
          left: pos.left,
          bottom: pos.bottom,
          width: compactStudy ? '292px' : '320px',
          maxHeight: compactStudy ? 'min(52vh, 340px)' : 'min(70vh, 520px)',
          overflowY: 'auto',
          background: bg,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border,
          borderRadius: compactStudy ? '16px' : '20px',
          boxShadow: shadow,
          zIndex: 40001,
          padding: compactStudy ? '10px' : '16px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: compactStudy ? '9px' : '16px',
        }}
      >
        {compactStudy ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '30px', padding: '0 2px 0 4px' }}>
              <div style={{ color: textColor, fontSize: '0.80rem', fontWeight: 800 }}>Study actions</div>
              <button
                type="button"
                aria-label="Close Study actions"
                onClick={onClose}
                style={{ border: 'none', background: 'transparent', color: subtextColor, width: '30px', height: '30px', borderRadius: '9px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '7px' }}>
              {(groups[0]?.items || []).map((item) => <StudyAction key={item.id} item={item} />)}
            </div>
          </>
        ) : groups.map((group) => (
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
              {group.items.map((item) => <HoverItem key={item.id} item={item} />)}
            </div>
          </div>
        ))}
      </div>
    </>,
    document.body,
  );
}
