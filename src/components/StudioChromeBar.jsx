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
    return localStorage.getItem(CHROME_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeStudioChromeCollapsed(collapsed) {
  try {
    localStorage.setItem(CHROME_STORAGE_KEY, collapsed ? '1' : '0');
  } catch { /* best effort */ }
}

/**
 * Collapsible studio header — expanded for session context, compact for chat real estate.
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
  showSecondModelDropdown,
  onToggleSecondModelDropdown,
  onSelectSecondModel,
  availableModels,
  onResetChat,
  arenaDropdown,
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
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="studio-chrome__actions">
          {!collapsed && (
            <>
              <button
                type="button"
                className={`studio-chrome__pill${arenaMode ? ' is-active' : ''}`}
                onClick={onToggleArena}
                title="Compare two models side-by-side"
              >
                <Layers size={14} />
                {arenaMode ? 'Arena on' : 'Arena'}
              </button>
              {arenaMode && (
                <div className="studio-chrome__arena-select">
                  <button
                    type="button"
                    className="studio-chrome__pill is-outline"
                    onClick={onToggleSecondModelDropdown}
                  >
                    VS: {secondModel?.name?.split(' ')[0] || 'Model B'}
                    <ChevronDown size={12} />
                  </button>
                  {showSecondModelDropdown && arenaDropdown}
                </div>
              )}
            </>
          )}

          <div className="studio-chrome__overflow-wrap">
            <button
              type="button"
              className="studio-chrome__icon-btn"
              onClick={() => setOverflowOpen((v) => !v)}
              aria-expanded={overflowOpen}
              title="More actions"
            >
              <MoreHorizontal size={17} />
            </button>
            {overflowOpen && (
              <>
                <div className="studio-chrome__backdrop" onClick={() => setOverflowOpen(false)} />
                <div className="studio-chrome__overflow-menu">
                  {collapsed && (
                    <button type="button" onClick={() => { onToggleArena(); setOverflowOpen(false); }}>
                      {arenaMode ? 'Disable arena mode' : 'Enable arena mode'}
                    </button>
                  )}
                  <button type="button" onClick={() => { onResetChat(); setOverflowOpen(false); }}>
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
