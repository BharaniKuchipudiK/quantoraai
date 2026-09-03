import React, { useEffect, useRef } from 'react';
import { FileCode, GitBranch, Play, Plus, Terminal, X } from 'lucide-react';
import { PINNED_DESK_TAB, deskTabKind, deskTabLabel } from '../lib/desk-tabs.js';

const KIND_ICON = {
  preview: Play,
  terminal: Terminal,
  git: GitBranch,
  file: FileCode,
};

/**
 * The desk's open tabs.
 *
 * Preview is pinned and has no close button — it is where the desk lives, and a
 * strip you can empty is a strip you can get lost in. Everything else closes.
 */
export default function StudioTabBar({
  tabs = [],
  activeTab = PINNED_DESK_TAB,
  onSelect,
  onClose,
  onOpenFinder,
  isLight,
  textColor,
  subtextColor,
}) {
  const activeRef = useRef(null);

  // A tab opened by the keyboard, or by a build writing a new file, is useless
  // if it lands off-screen. Keep the active tab in view whenever it changes.
  useEffect(() => {
    const node = activeRef.current;
    if (!node || typeof node.scrollIntoView !== 'function') return;
    node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTab, tabs.length]);

  const border = isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.08)';

  return (
    <div
      data-quantora-desk-tabstrip="true"
      role="tablist"
      aria-label="Open desk tabs"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: '2px',
        flexShrink: 0,
        minHeight: '36px',
        padding: '0 6px',
        background: isLight ? '#f1f5f9' : '#070913',
        borderBottom: border,
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollbarWidth: 'thin',
      }}
    >
      {tabs.map((tab) => {
        const active = tab === activeTab;
        const pinned = tab === PINNED_DESK_TAB;
        const Icon = KIND_ICON[deskTabKind(tab)] || FileCode;
        return (
          /*
           * The chrome lives on the wrapper and the label is its own <button>,
           * with close as a sibling rather than a child. Nesting a close button
           * inside the tab button would be invalid HTML, and it is also what
           * lets the tab stay a real button — which is what assistive tech and
           * the desk's browser gates both look for.
           */
          <div
            key={tab}
            ref={active ? activeRef : null}
            data-quantora-desk-tab={tab}
            data-quantora-desk-tab-active={active ? 'true' : 'false'}
            onMouseDown={(event) => {
              /*
               * Autoscroll is initiated on mousedown, so preventing it on
               * auxclick is too late — the tab closed and the page was left in
               * autoscroll with the four-way cursor stuck on.
               */
              if (event.button === 1 && !pinned) event.preventDefault();
            }}
            onAuxClick={(event) => {
              // Middle-click closes, the way every editor does.
              if (event.button === 1 && !pinned) {
                event.preventDefault();
                onClose?.(tab);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              paddingRight: pinned ? '4px' : '6px',
              background: active ? (isLight ? '#ffffff' : '#0d1127') : 'transparent',
              borderTop: '2px solid transparent',
              borderBottom: active ? '1px solid transparent' : border,
              borderLeft: active ? border : '1px solid transparent',
              borderRight: active ? border : '1px solid transparent',
              borderRadius: '8px 8px 0 0',
              marginBottom: active ? '-1px' : 0,
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              title={tab}
              onClick={() => onSelect?.(tab)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                maxWidth: '175px',
                height: '32px',
                padding: '0 6px 0 12px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontSize: '0.74rem',
                fontFamily: 'inherit',
                fontWeight: active ? 700 : 500,
                color: active ? textColor : subtextColor,
              }}
            >
              <Icon size={12} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {deskTabLabel(tab)}
              </span>
            </button>
            {pinned ? null : (
              <button
                type="button"
                data-quantora-desk-tab-close={tab}
                aria-label={`Close ${deskTabLabel(tab)}`}
                onClick={() => onClose?.(tab)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  width: '18px',
                  height: '18px',
                  padding: 0,
                  border: 'none',
                  borderRadius: '5px',
                  background: 'transparent',
                  color: active ? textColor : subtextColor,
                  cursor: 'pointer',
                  opacity: 0.7,
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = isLight ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.14)';
                  event.currentTarget.style.opacity = '1';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'transparent';
                  event.currentTarget.style.opacity = '0.7';
                }}
              >
                <X size={11} />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        data-quantora-desk-tab-add="true"
        aria-label="Open a file"
        title="Open a file  (Ctrl/Cmd + P)"
        onClick={() => onOpenFinder?.()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          alignSelf: 'center',
          width: '24px',
          height: '24px',
          marginLeft: '4px',
          padding: 0,
          border: 'none',
          borderRadius: '7px',
          background: 'transparent',
          color: subtextColor,
          cursor: 'pointer',
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = isLight ? 'rgba(15,23,42,0.07)' : 'rgba(255,255,255,0.09)';
          event.currentTarget.style.color = textColor;
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = 'transparent';
          event.currentTarget.style.color = subtextColor;
        }}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
