import React from 'react';
import { Download, FileCode, Wand2 } from 'lucide-react';

/**
 * Preview's compact primary controls, rendered in the desk header.
 *
 * Responsive viewport simulation remains an underlying Preview capability, but
 * phone/tablet/desktop switches no longer compete with daily actions in the
 * primary toolbar. If we expose responsive testing again, it belongs in a
 * secondary Preview/Canvas menu rather than permanent chrome.
 */
export default function StudioPreviewControls({
  chrome,
  onDownload,
  onImprove,
  entryChoices = [],
  activeEntry = '',
  onSelectEntry,
  isLight,
  textColor,
  subtextColor,
  compact = false,
}) {
  if (!chrome) return null;
  const { isOfficeDoc, officeLabel, downloading, canImprove, improving } = chrome;

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
      data-quantora-primary-device-switcher="hidden"
      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
    >
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
