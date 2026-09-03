import React from 'react';
import { GitBranch, Play, Terminal, Files } from 'lucide-react';

const BUTTON_BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  border: 'none',
  borderRadius: '8px',
  fontSize: '0.72rem',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const BADGE_BASE = { fontSize: '0.58rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1 };

/**
 * The desk's activity rail.
 *
 * Preview, Terminal and Git used to be three small buttons stacked INSIDE the
 * Files list, mixed in with your actual source files — so the two things you
 * switch between most often were buried in the thing you scroll. They belong in
 * a quiet icon strip on the desk, not in the title bar.
 *
 * Every entry here opens a tab. Nothing here is a mode you can get stuck in.
 */
export default function StudioActivityRail({
  activeTab,
  onOpenTab,
  filesOpen = true,
  onToggleFiles,
  changedCount = 0,
  addedLines = 0,
  removedLines = 0,
  isLight,
  textColor,
  subtextColor,
  compact = false,
  orientation = 'horizontal',
}) {
  const vertical = orientation === 'vertical';
  const iconOnly = vertical || compact;
  const entries = [
    {
      id: 'files',
      label: 'Files',
      Icon: Files,
      active: filesOpen,
      onClick: onToggleFiles,
      title: filesOpen ? 'Hide the file tree  (Ctrl/Cmd + B)' : 'Show the file tree  (Ctrl/Cmd + B)',
    },
    {
      id: 'preview',
      label: 'Preview',
      Icon: Play,
      active: activeTab === 'preview',
      onClick: () => onOpenTab?.('preview'),
      title: 'Preview',
    },
    {
      id: 'terminal',
      label: 'Terminal',
      Icon: Terminal,
      active: activeTab === 'terminal',
      onClick: () => onOpenTab?.('terminal'),
      title: 'Terminal  (Ctrl/Cmd + `)',
      navAttr: 'data-quantora-studio-terminal-nav',
    },
    {
      id: 'git',
      label: changedCount > 0 ? 'Changes' : 'Git',
      Icon: GitBranch,
      active: activeTab === 'git',
      onClick: () => onOpenTab?.('git'),
      title: changedCount > 0
        ? `${changedCount} changed file${changedCount === 1 ? '' : 's'} this turn`
        : 'Git',
      badge: changedCount > 0,
      navAttr: 'data-quantora-studio-git-nav',
    },
  ];

  return (
    <div
      data-quantora-desk-activity-rail="true"
      data-quantora-desk-activity-rail-orientation={orientation}
      role="group"
      aria-label="Desk panels"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      style={{
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: 'center',
        gap: vertical ? '4px' : '2px',
        width: vertical ? '40px' : undefined,
        height: vertical ? '100%' : undefined,
        flexShrink: 0,
        padding: vertical ? '8px 4px' : 0,
        background: vertical ? (isLight ? '#f8fafc' : '#070913') : 'transparent',
        borderRight: vertical
          ? (isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.08)')
          : 'none',
      }}
    >
      {entries.map(({ id, label, Icon, active, onClick, title, badge, navAttr }) => (
        <button
          key={id}
          type="button"
          data-quantora-desk-rail={id}
          {...(navAttr ? { [navAttr]: 'true' } : {})}
          data-quantora-desk-rail-active={active ? 'true' : 'false'}
          aria-pressed={active}
          aria-label={label}
          title={title}
          onClick={onClick}
          style={{
            ...BUTTON_BASE,
            flexDirection: vertical ? 'column' : 'row',
            width: vertical ? '32px' : undefined,
            minHeight: vertical ? '36px' : '28px',
            height: vertical ? undefined : '28px',
            padding: iconOnly ? (vertical ? '6px 0' : '0 7px') : '0 9px',
            background: active
              ? (isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.10)')
              : 'transparent',
            color: active ? textColor : subtextColor,
            fontWeight: active ? 700 : 600,
          }}
          onMouseEnter={(event) => {
            if (active) return;
            event.currentTarget.style.background = isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.08)';
            event.currentTarget.style.color = textColor;
          }}
          onMouseLeave={(event) => {
            if (active) return;
            event.currentTarget.style.background = 'transparent';
            event.currentTarget.style.color = subtextColor;
          }}
        >
          <Icon size={15} style={{ flexShrink: 0 }} />
          {iconOnly ? null : <span>{label}</span>}
          {badge ? (
            <span
              data-quantora-desk-rail-changes="true"
              style={BADGE_BASE}
            >
              {addedLines > 0 ? <span style={{ color: '#22c55e' }}>+{addedLines}</span> : null}
              {addedLines > 0 && removedLines > 0 ? ' ' : null}
              {removedLines > 0 ? <span style={{ color: '#f87171' }}>−{removedLines}</span> : null}
              {addedLines === 0 && removedLines === 0 ? (
                <span style={{ color: active ? textColor : subtextColor }}>{changedCount}</span>
              ) : null}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
