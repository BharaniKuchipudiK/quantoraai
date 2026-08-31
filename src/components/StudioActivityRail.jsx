import React from 'react';
import { GitBranch, Play, Terminal, Files } from 'lucide-react';

/**
 * The desk's activity rail.
 *
 * Preview, Terminal and Git used to be three small buttons stacked INSIDE the
 * Files list, mixed in with your actual source files — so the two things you
 * switch between most often were buried in the thing you scroll. They belong in
 * the chrome, next to the other desk-level controls.
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
}) {
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
      role="group"
      aria-label="Desk panels"
      style={{ display: 'flex', alignItems: 'center', gap: '2px' }}
    >
      {entries.map(({ id, label, Icon, active, onClick, title, badge, navAttr }) => (
        <button
          key={id}
          type="button"
          data-quantora-desk-rail={id}
          {...(navAttr ? { [navAttr]: 'true' } : {})}
          data-quantora-desk-rail-active={active ? 'true' : 'false'}
          aria-pressed={active}
          title={title}
          onClick={onClick}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            height: '28px',
            padding: compact ? '0 7px' : '0 9px',
            border: 'none',
            borderRadius: '8px',
            background: active
              ? (isLight ? 'rgba(249,115,22,0.12)' : 'rgba(249,115,22,0.16)')
              : 'transparent',
            color: active ? '#f97316' : subtextColor,
            fontSize: '0.72rem',
            fontWeight: active ? 700 : 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
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
          <Icon size={13} style={{ flexShrink: 0 }} />
          {compact ? null : <span>{label}</span>}
          {badge ? (
            <span
              data-quantora-desk-rail-changes="true"
              style={{ fontSize: '0.66rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
            >
              {addedLines > 0 ? <span style={{ color: '#22c55e' }}>+{addedLines}</span> : null}
              {addedLines > 0 && removedLines > 0 ? ' ' : null}
              {removedLines > 0 ? <span style={{ color: '#f87171' }}>−{removedLines}</span> : null}
              {addedLines === 0 && removedLines === 0 ? (
                <span style={{ color: active ? '#f97316' : subtextColor }}>{changedCount}</span>
              ) : null}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
