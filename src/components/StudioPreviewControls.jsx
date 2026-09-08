import React from 'react';
import { Download, FileCode, Monitor, Smartphone, Tablet, Wand2 } from 'lucide-react';

const VIEWPORTS = [
  ['mobile', Smartphone],
  ['tablet', Tablet],
  ['desktop', Monitor],
];

/**
 * Preview's own controls, rendered in the desk header.
 *
 * These used to live in a second strip under the header, alongside a status
 * pill that repeated the desk's run label and Share/Publish buttons that
 * repeated its Publish menu. The strip is gone; only the three controls that
 * had nowhere else to live moved up here.
 *
 * Rendered only while Preview is the active tab — a viewport switcher above an
 * open editor is a control that does nothing.
 */
export default function StudioPreviewControls({
  chrome,
  onDownload,
  onImprove,
  onViewport,
  /**
   * The pages Preview could run, conventional entry first, and the one it is
   * running. Empty unless the desk genuinely holds two or more HTML pages, so
   * an ordinary single-page build gains no control it does not need.
   */
  entryChoices = [],
  activeEntry = '',
  onSelectEntry,
  isLight,
  textColor,
  subtextColor,
  compact = false,
}) {
  if (!chrome) return null;
  const { viewport, isOfficeDoc, officeLabel, downloading, canImprove, improving } = chrome;

  const iconButton = (extra = {}) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    height: '26px',
    padding: '0 7px',
    border: 'none',
    borderRadius: '7px',
    background: 'transparent',
    color: subtextColor,
    cursor: 'pointer',
    fontSize: '0.71rem',
    fontWeight: 700,
    fontFamily: 'inherit',
    ...extra,
  });

  return (
    <div
      data-quantora-desk-preview-controls="true"
      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
    >
      {/*
       * WHICH PAGE AM I LOOKING AT.
       *
       * A desk holding two HTML pages renders one of them and used to say
       * nothing about which. A build that shipped its new page as hello.html
       * alongside an older index.html showed the OLD page, and the only route
       * to the new one was asking the model in chat — a paid turn to repoint an
       * iframe. Naming the running page is most of the fix; being able to
       * change it is the rest, and it costs nothing.
       *
       * Absent entirely below two pages: a control that offers no choice is
       * noise on every ordinary build.
       */}
      {entryChoices.length > 1 ? (
        <label
          data-quantora-desk-preview-entry={activeEntry || ''}
          title="Which page Preview is running"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            height: '26px',
            padding: '0 6px',
            borderRadius: '7px',
            background: isLight ? '#f1f5f9' : 'rgba(0,0,0,0.25)',
            color: subtextColor,
            fontSize: '0.71rem',
            fontWeight: 700,
          }}
        >
          <FileCode size={12} aria-hidden="true" />
          <select
            data-quantora-desk-preview-entry-select="true"
            aria-label="Page Preview is running"
            value={activeEntry || ''}
            onChange={(event) => onSelectEntry?.(event.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              color: textColor,
              font: 'inherit',
              cursor: 'pointer',
              maxWidth: compact ? '96px' : '150px',
            }}
          >
            {entryChoices.map((path) => (
              <option key={path} value={path}>{path}</option>
            ))}
          </select>
        </label>
      ) : null}

      {/* An Office artifact has one fixed page shape; a viewport switcher would lie about it. */}
      {isOfficeDoc ? null : (
        <div
          data-quantora-canvas-device-switcher="true"
          style={{
            display: 'flex',
            background: isLight ? '#f1f5f9' : 'rgba(0,0,0,0.25)',
            borderRadius: '7px',
            padding: '2px',
          }}
        >
          {VIEWPORTS.map(([name, Icon]) => {
            const active = viewport === name;
            return (
              <button
                key={name}
                type="button"
                data-quantora-desk-viewport={name}
                aria-pressed={active}
                title={`${name[0].toUpperCase()}${name.slice(1)} width`}
                onClick={() => onViewport?.(name)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '4px',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  background: active ? (isLight ? '#ffffff' : '#334155') : 'transparent',
                  color: active ? '#f97316' : subtextColor,
                }}
              >
                <Icon size={13} />
              </button>
            );
          })}
        </div>
      )}

      {canImprove ? (
        <button
          type="button"
          data-quantora-desk-improve="true"
          disabled={improving}
          onClick={() => onImprove?.()}
          title="Fix the issues found in this preview"
          style={iconButton({
            border: '1px solid rgba(249,115,22,0.35)',
            color: '#f97316',
            cursor: improving ? 'wait' : 'pointer',
          })}
        >
          <Wand2 size={12} />
          {compact ? null : (improving ? 'Improving…' : 'Improve')}
        </button>
      ) : null}

      <button
        type="button"
        data-quantora-desk-download="true"
        disabled={downloading}
        onClick={() => onDownload?.()}
        title={isOfficeDoc ? `Download as .${String(officeLabel || '').toLowerCase()}` : 'Download as HTML'}
        style={iconButton({ cursor: downloading ? 'wait' : 'pointer' })}
        onMouseEnter={(event) => { event.currentTarget.style.color = textColor; }}
        onMouseLeave={(event) => { event.currentTarget.style.color = subtextColor; }}
      >
        <Download size={14} />
        {isOfficeDoc && !compact ? (downloading ? '…' : officeLabel) : null}
      </button>
    </div>
  );
}
