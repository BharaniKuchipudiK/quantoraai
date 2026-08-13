import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Layers,
  MoreHorizontal,
  PanelLeft,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

const CHROME_STORAGE_KEY = 'quantora_studio_chrome_collapsed';

export function readStudioChromeCollapsed() {
  try {
    const stored = localStorage.getItem(CHROME_STORAGE_KEY);
    if (stored === null) return true;
    return stored === '1';
  } catch {
    return true;
  }
}

export function writeStudioChromeCollapsed(collapsed) {
  try {
    localStorage.setItem(CHROME_STORAGE_KEY, collapsed ? '1' : '0');
  } catch { /* best effort */ }
}

/**
 * Collapsible studio header — expanded for session context, compact for chat real estate.
 * Arena mode lives in the overflow menu (power feature, not default chrome).
 */
export default function StudioChromeBar({
  isLight,
  textColor,
  subtextColor,
  sidebarOpen,
  onOpenSidebar,
  sessionTitle,
  showSessionMeta,
  isGenerating,
  activeGeneratingModel,
  autoSelectEnabled,
  selectedModel,
  hasMemory,
  memoryLabel,
  arenaMode,
  onToggleArena,
  secondModel,
  onSelectSecondModel,
  availableModels,
  onResetChat,
}) {
  const [collapsed, setCollapsed] = useState(() => readStudioChromeCollapsed());
  const [overflowOpen, setOverflowOpen] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      writeStudioChromeCollapsed(next);
      return next;
    });
  };

  const closeOverflow = () => setOverflowOpen(false);

  const modelLabel = isGenerating
    ? (activeGeneratingModel?.name || 'Preparing…')
    : autoSelectEnabled
      ? 'Auto-select'
      : (selectedModel?.name || 'Gemini Flash');

  return (
    <div className={`studio-chrome${collapsed ? ' is-collapsed' : ''}${isLight ? ' is-light' : ' is-dark'}`}>
      <div className="studio-chrome__main">
        <div className="studio-chrome__left">
          {!sidebarOpen && (
            <button type="button" className="studio-chrome__icon-btn" onClick={onOpenSidebar} title="Open chat history">
              <PanelLeft size={17} />
            </button>
          )}

          {collapsed ? (
            <div className="studio-chrome__compact-title" style={{ color: textColor }} title={sessionTitle}>
              {sessionTitle || 'New chat'}
            </div>
          ) : (
            <>
              <div className="studio-chrome__brand" aria-hidden="true">
                <Sparkles size={18} color="#f97316" />
              </div>
              <div className="studio-chrome__meta">
                <h2 className="studio-chrome__title" style={{ color: textColor }}>
                  {showSessionMeta ? (sessionTitle || 'New Workspace') : 'New Workspace'}
                </h2>
                {showSessionMeta && (
                  <div className="studio-chrome__submeta">
                    <span style={{ color: subtextColor }}>
                      {isGenerating ? 'Active model' : autoSelectEnabled ? 'Routing' : 'Selected model'}:{' '}
                      <strong style={{ color: '#f97316' }}>{modelLabel}</strong>
                    </span>
                    <span className="studio-chrome__ready-pill">Ready</span>
                    {hasMemory && (
                      <span className="studio-chrome__memory-pill" title={memoryLabel}>{memoryLabel}</span>
                    )}
                    {arenaMode && (
                      <span className="studio-chrome__arena-pill" title="Arena mode — comparing two models">
                        Arena
                      </span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="studio-chrome__actions">
          <div className="studio-chrome__overflow-wrap">
            <button
              type="button"
              className={`studio-chrome__icon-btn${arenaMode ? ' is-active' : ''}`}
              onClick={() => setOverflowOpen((v) => !v)}
              aria-expanded={overflowOpen}
              title={arenaMode ? 'More actions (Arena on)' : 'More actions'}
            >
              <MoreHorizontal size={17} />
            </button>
            {overflowOpen && (
              <>
                <div className="studio-chrome__backdrop" onClick={closeOverflow} />
                <div className={`studio-chrome__overflow-menu${arenaMode ? ' is-wide' : ''}`}>
                  <button
                    type="button"
                    className={arenaMode ? 'is-active' : ''}
                    onClick={() => { onToggleArena(); if (arenaMode) closeOverflow(); }}
                  >
                    <Layers size={14} />
                    {arenaMode ? 'Disable arena mode' : 'Compare models (Arena)'}
                  </button>

                  {arenaMode && (
                    <div className="studio-chrome__overflow-section">
                      <div className="studio-chrome__overflow-label">Model B</div>
                      <div className="studio-chrome__overflow-models">
                        {(availableModels || []).map((m) => {
                          const isAvailable = m.available !== false;
                          const isSelected = secondModel?.id === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              disabled={!isAvailable}
                              className={isSelected ? 'is-selected' : ''}
                              onClick={() => {
                                if (!isAvailable) return;
                                onSelectSecondModel?.(m);
                              }}
                            >
                              <span style={{ textDecoration: !isAvailable ? 'line-through' : 'none' }}>{m.name}</span>
                              {isSelected && <span className="studio-chrome__overflow-check">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button type="button" onClick={() => { onResetChat(); closeOverflow(); }}>
                    <RefreshCw size={14} /> Reset chat
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            className="studio-chrome__icon-btn"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand header' : 'Collapse header for more space'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
          </button>
        </div>
      </div>
    </div>
  );
}
