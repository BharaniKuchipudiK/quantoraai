import React, { useEffect, useMemo, useState } from 'react';
import { OFFICE_KIND } from '../lib/office-intent.js';
import { getVerifiedOfficePreviewState } from '../lib/office-artifact-cache.js';

/*
 * Format-aware preview for generated Office artifacts.
 *
 * PowerPoint and Word render the canonical server-produced HTML preview inside
 * Office chrome. Excel parses every server-rendered worksheet and exposes real
 * worksheet tabs, so the preview no longer hides sheets that are present in the
 * downloaded workbook. The artifact-verification badge means this exact preview
 * is fingerprint-bound to the server-compiled Office artifact. It deliberately
 * does NOT imply that business facts, figures or citations were independently
 * verified; content review remains an explicit human responsibility.
 *
 * SECURITY/UX INVARIANT: presentation intent alone is never enough to activate
 * Office chrome. The current HTML must carry a matching canonical Office manifest
 * whose fingerprint matches the preview. This prevents stale/generic canvas HTML
 * from masquerading as the presentation currently being briefed or generated.
 */

const colLabel = (index) => {
  let n = index + 1;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
};

function VerificationBadge({ verified, dark = false }) {
  if (!verified) return null;
  return (
    <span
      title="Preview and downloadable Office artifact are fingerprint-bound and structurally verified. Business facts and citations still require content review."
      style={{
        marginLeft: 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '3px 8px',
        borderRadius: '999px',
        border: dark ? '1px solid rgba(52,211,153,.45)' : '1px solid rgba(16,185,129,.35)',
        background: dark ? 'rgba(16,185,129,.12)' : 'rgba(16,185,129,.08)',
        color: dark ? '#6ee7b7' : '#047857',
        fontSize: '0.68rem',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true">✓</span>
      Artifact verified · review content
    </span>
  );
}

function tableRows(table) {
  if (!table) return [];
  return Array.from(table.rows).map((tr) => ({
    cells: Array.from(tr.cells).map((cell) => ({
      text: cell.textContent.trim(),
      header: cell.tagName === 'TH' || tr.classList.contains('header-row'),
    })),
  }));
}

function parseSheets(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  const sheetSections = Array.from(doc.querySelectorAll('[data-sheet-name]'));

  if (sheetSections.length) {
    return sheetSections.map((section, index) => {
      const table = section.querySelector('table');
      return {
        name: section.getAttribute('data-sheet-name') || section.querySelector('h2')?.textContent?.trim() || `Sheet${index + 1}`,
        rows: tableRows(table),
        hasTable: Boolean(table),
        note: section.querySelector('.preview-note')?.textContent?.trim() || '',
      };
    });
  }

  const table = doc.querySelector('table');
  if (table) return [{ name: 'Sheet1', rows: tableRows(table), hasTable: true, note: '' }];

  const lines = Array.from(doc.querySelectorAll('h1, h2, h3, p, li'))
    .map((el) => el.textContent.trim())
    .filter(Boolean);
  return [{
    name: 'Sheet1',
    rows: lines.map((line) => ({ cells: [{ text: line, header: false }] })),
    hasTable: false,
    note: 'Text-only legacy preview',
  }];
}

function ExcelGrid({ html, isLight, verified }) {
  const sheets = useMemo(() => parseSheets(html), [html]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, sheets.length - 1)));
  }, [sheets.length]);

  const active = sheets[activeIndex] || { name: 'Sheet1', rows: [], hasTable: false, note: '' };
  const rows = active.rows || [];
  const maxCols = Math.max(1, ...rows.map((row) => row.cells.length));
  const headerBg = isLight ? '#f1f5f9' : '#1e293b';
  const gridLine = isLight ? '#d4d4d8' : '#334155';
  const cornerBg = isLight ? '#e2e8f0' : '#0f172a';
  const cellBg = isLight ? '#ffffff' : '#0b1220';
  const text = isLight ? '#1f2937' : '#e2e8f0';
  const muted = isLight ? '#64748b' : '#94a3b8';
  const accent = '#107c41';

  const th = {
    position: 'sticky', top: 0, zIndex: 2, background: headerBg, color: muted,
    fontSize: '0.7rem', fontWeight: 600, textAlign: 'center', padding: '4px 8px',
    border: `1px solid ${gridLine}`, minWidth: '90px', whiteSpace: 'nowrap',
  };
  const rowNumStyle = {
    position: 'sticky', left: 0, zIndex: 1, background: headerBg, color: muted,
    fontSize: '0.7rem', fontWeight: 600, textAlign: 'center', padding: '4px 8px',
    border: `1px solid ${gridLine}`, minWidth: '40px',
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: cellBg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: `1px solid ${gridLine}`, background: headerBg, flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: accent }} />
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: text }}>Spreadsheet preview</span>
        <span style={{ fontSize: '0.72rem', color: muted }}>
          {active.hasTable ? `${rows.length} preview rows × ${maxCols} cols` : 'text layout'}
        </span>
        {sheets.length > 1 && <span style={{ fontSize: '0.72rem', color: muted }}>• {sheets.length} worksheets</span>}
        <VerificationBadge verified={verified} dark={!isLight} />
        {active.note && <span style={{ fontSize: '0.7rem', color: muted, width: '100%' }}>{active.note}</span>}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ ...th, ...rowNumStyle, top: 0, zIndex: 3, minWidth: '40px', background: cornerBg }} />
              {Array.from({ length: maxCols }).map((_, column) => (
                <th key={column} style={th}>{colLabel(column)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td style={rowNumStyle}>{rowIndex + 1}</td>
                {Array.from({ length: maxCols }).map((_, column) => {
                  const cell = row.cells[column];
                  const isHeaderCell = rowIndex === 0 && active.hasTable;
                  return (
                    <td key={column} style={{
                      border: `1px solid ${gridLine}`, padding: '5px 8px', fontSize: '0.8rem',
                      color: text, background: isHeaderCell ? headerBg : cellBg,
                      fontWeight: isHeaderCell || cell?.header ? 700 : 400,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '260px',
                    }}>{cell?.text || ''}</td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', padding: '6px 8px 0', background: headerBg, borderTop: `1px solid ${gridLine}`, overflowX: 'auto', flexShrink: 0 }}>
        {sheets.map((sheet, index) => {
          const selected = index === activeIndex;
          return (
            <button
              key={`${sheet.name}-${index}`}
              onClick={() => setActiveIndex(index)}
              title={`Preview worksheet ${sheet.name}`}
              style={{
                border: `1px solid ${selected ? accent : gridLine}`,
                borderBottom: selected ? `3px solid ${accent}` : `1px solid ${gridLine}`,
                background: selected ? cellBg : headerBg,
                color: selected ? text : muted,
                borderRadius: '5px 5px 0 0',
                padding: '5px 12px',
                fontSize: '0.72rem',
                fontWeight: selected ? 700 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {sheet.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const STAGE = {
  [OFFICE_KIND.POWERPOINT]: { label: 'Presentation preview', backdrop: (light) => (light ? '#0f172a' : '#020617'), dot: '#c43e1c', aspect: '16 / 9', maxW: '900px', pad: '24px' },
  [OFFICE_KIND.WORD]: { label: 'Document preview', backdrop: (light) => (light ? '#e2e8f0' : '#1e293b'), dot: '#2b579a', aspect: null, maxW: '820px', pad: '24px' },
  [OFFICE_KIND.PDF]: { label: 'PDF preview', backdrop: (light) => (light ? '#cbd5e1' : '#111827'), dot: '#b30b00', aspect: null, maxW: '820px', pad: '24px' },
};

function DocStage({ kind, isLight, children, verified }) {
  const stage = STAGE[kind];
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: stage.backdrop(isLight) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', flexShrink: 0 }}>
        <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: stage.dot }} />
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#e2e8f0', mixBlendMode: 'difference' }}>{stage.label}</span>
        <VerificationBadge verified={verified} dark />
      </div>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: stage.pad }}>
        <div style={{
          width: '100%', maxWidth: stage.maxW,
          aspectRatio: stage.aspect || undefined,
          height: stage.aspect ? undefined : '100%',
          background: '#ffffff', borderRadius: '4px', overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)', position: 'relative', flexShrink: 0,
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function PendingOfficePreview({ kind, isLight, reason }) {
  const label = kind === OFFICE_KIND.POWERPOINT
    ? 'Presentation'
    : kind === OFFICE_KIND.EXCEL
      ? 'Spreadsheet'
      : 'Document';
  const detail = reason === 'fingerprint-mismatch'
    ? 'The previous preview no longer matches its verified Office artifact.'
    : reason === 'kind-mismatch'
      ? 'The available Office artifact belongs to a different document type.'
      : 'The current conversation has not produced a verified Office artifact yet.';

  const card = (
    <div style={{
      width: '100%', height: '100%', minHeight: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '36px', background: '#ffffff', color: '#142433', textAlign: 'center',
      fontFamily: 'Aptos, "Segoe UI", Arial, sans-serif',
    }}>
      <div style={{ maxWidth: '500px' }}>
        <div style={{
          width: '44px', height: '44px', margin: '0 auto 18px', borderRadius: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#eff6ff', color: '#2563eb', fontSize: '20px', fontWeight: 800,
        }}>Q</div>
        <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '9px' }}>{label} preview pending</div>
        <div style={{ fontSize: '13px', lineHeight: 1.55, color: '#64748b' }}>{detail}</div>
        <div style={{ fontSize: '12px', lineHeight: 1.5, color: '#334155', marginTop: '13px' }}>
          Quantora will show this panel only after generation and fingerprint verification. Stale or generic HTML is never presented as an Office artifact.
        </div>
      </div>
    </div>
  );

  if (kind === OFFICE_KIND.POWERPOINT || kind === OFFICE_KIND.WORD) {
    return <DocStage kind={kind} isLight={isLight} verified={false}>{card}</DocStage>;
  }

  return <div style={{ width: '100%', height: '100%', background: isLight ? '#e2e8f0' : '#0b1220', padding: '24px' }}>{card}</div>;
}

export default function OfficePreview({ kind, html, isLight, children }) {
  const reviewState = useMemo(() => getVerifiedOfficePreviewState(html, kind), [html, kind]);

  if (kind === OFFICE_KIND.PDF) {
    return <DocStage kind={kind} isLight={isLight} verified={false}>{children}</DocStage>;
  }

  if ([OFFICE_KIND.POWERPOINT, OFFICE_KIND.WORD, OFFICE_KIND.EXCEL].includes(kind) && !reviewState.verified) {
    return <PendingOfficePreview kind={kind} isLight={isLight} reason={reviewState.reason} />;
  }

  if (kind === OFFICE_KIND.EXCEL) {
    return <ExcelGrid html={html} isLight={isLight} verified={reviewState.verified} />;
  }
  if (kind === OFFICE_KIND.POWERPOINT || kind === OFFICE_KIND.WORD) {
    return <DocStage kind={kind} isLight={isLight} verified={reviewState.verified}>{children}</DocStage>;
  }
  return children;
}
