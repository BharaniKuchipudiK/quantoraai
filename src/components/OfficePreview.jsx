import React, { useMemo } from 'react';
import { OFFICE_KIND } from '../lib/office-intent.js';

/*
 * Format-faithful preview for generated Office artifacts (Roadmap: MS Office
 * integration). Renders the artifact the way its target file will look — a
 * spreadsheet grid for Excel, a slide stage for PowerPoint, a paper page for
 * Word/PDF — so the user previews before the (explicit) download.
 *
 * PowerPoint/Word/PDF reuse the real, CSP-correct preview iframe (`children`)
 * wrapped in format chrome. Excel is rendered as a native React grid parsed
 * from the artifact's <table>, which reads far more like a spreadsheet than the
 * raw HTML table does.
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

function parseTable(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  const table = doc.querySelector('table');
  if (table && table.rows.length) {
    const rows = Array.from(table.rows).map((tr) => ({
      cells: Array.from(tr.cells).map((c) => ({ text: c.textContent.trim(), header: c.tagName === 'TH' })),
    }));
    return { rows, hasTable: true };
  }
  const lines = Array.from(doc.querySelectorAll('h1, h2, h3, p, li'))
    .map((el) => el.textContent.trim())
    .filter(Boolean);
  return { rows: lines.map((l) => ({ cells: [{ text: l }] })), hasTable: false };
}

function ExcelGrid({ html, isLight }) {
  const { rows, hasTable } = useMemo(() => parseTable(html), [html]);
  const maxCols = Math.max(1, ...rows.map((r) => r.cells.length));
  const headerBg = isLight ? '#f1f5f9' : '#1e293b';
  const gridLine = isLight ? '#d4d4d8' : '#334155';
  const cornerBg = isLight ? '#e2e8f0' : '#0f172a';
  const cellBg = isLight ? '#ffffff' : '#0b1220';
  const text = isLight ? '#1f2937' : '#e2e8f0';
  const muted = isLight ? '#64748b' : '#94a3b8';
  const accent = '#107c41'; // Excel green

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: `1px solid ${gridLine}`, background: headerBg, flexShrink: 0 }}>
        <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: accent }} />
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: text }}>Spreadsheet preview</span>
        <span style={{ fontSize: '0.72rem', color: muted }}>
          {hasTable ? `${rows.length} rows × ${maxCols} cols` : 'text layout — export creates a single column'}
        </span>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ ...th, ...rowNumStyle, top: 0, zIndex: 3, minWidth: '40px', background: cornerBg }} />
              {Array.from({ length: maxCols }).map((_, c) => (
                <th key={c} style={th}>{colLabel(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                <td style={rowNumStyle}>{r + 1}</td>
                {Array.from({ length: maxCols }).map((_, c) => {
                  const cell = row.cells[c];
                  const isHeaderCell = r === 0 && hasTable;
                  return (
                    <td key={c} style={{
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
    </div>
  );
}

const STAGE = {
  [OFFICE_KIND.POWERPOINT]: { label: 'Presentation preview', backdrop: (l) => (l ? '#0f172a' : '#020617'), dot: '#c43e1c', aspect: '16 / 9', maxW: '900px', pad: '24px' },
  [OFFICE_KIND.WORD]: { label: 'Document preview', backdrop: (l) => (l ? '#e2e8f0' : '#1e293b'), dot: '#2b579a', aspect: null, maxW: '820px', pad: '24px' },
  [OFFICE_KIND.PDF]: { label: 'PDF preview', backdrop: (l) => (l ? '#cbd5e1' : '#111827'), dot: '#b30b00', aspect: null, maxW: '820px', pad: '24px' },
};

function DocStage({ kind, isLight, children }) {
  const s = STAGE[kind];
  const text = isLight ? '#334155' : '#cbd5e1';
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: s.backdrop(isLight) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', flexShrink: 0 }}>
        <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: s.dot }} />
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: isLight ? '#e2e8f0' : '#e2e8f0', mixBlendMode: 'difference' }}>{s.label}</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: s.pad }}>
        <div style={{
          width: '100%', maxWidth: s.maxW,
          aspectRatio: s.aspect || undefined,
          height: s.aspect ? undefined : '100%',
          background: '#ffffff', borderRadius: '4px', overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)', position: 'relative', flexShrink: 0,
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function OfficePreview({ kind, html, isLight, children }) {
  if (kind === OFFICE_KIND.EXCEL) return <ExcelGrid html={html} isLight={isLight} />;
  if (kind === OFFICE_KIND.POWERPOINT || kind === OFFICE_KIND.WORD || kind === OFFICE_KIND.PDF) {
    return <DocStage kind={kind} isLight={isLight}>{children}</DocStage>;
  }
  return children;
}
