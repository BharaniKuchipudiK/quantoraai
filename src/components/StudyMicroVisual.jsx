import React from 'react';
import {
  studyBeforeAfterSpec,
  studyFractionSpec,
} from '../lib/study-pictures.js';

const STUDY_VISUAL_FONT = 'var(--font-study-body), Nunito, sans-serif';

function splitLabel(value = '', max = 22) {
  const text = String(value || '').trim();
  if (!text || text.length <= max) return [text];
  const words = text.split(/\s+/);
  if (words.length === 1) return [text.slice(0, max), `${text.slice(max, (max * 2) - 1)}…`];
  const lines = ['', ''];
  for (const word of words) {
    const target = lines[0].length < max ? 0 : 1;
    const candidate = `${lines[target]} ${word}`.trim();
    if (candidate.length <= max || !lines[target]) lines[target] = candidate;
    else if (target === 0) lines[1] = word;
    else lines[1] = `${lines[1].slice(0, Math.max(0, max - 1))}…`;
  }
  return lines.filter(Boolean).slice(0, 2);
}

export function StudyMicroFrame({ isLight = false, label, kind, children }) {
  return (
    <figure
      data-quantora-study-micro-visual={kind}
      style={{
        margin: '10px 0 14px',
        maxWidth: '420px',
        width: '100%',
      }}
    >
      <svg
        viewBox="0 0 360 132"
        width="100%"
        height="132"
        role="img"
        aria-label={label}
        style={{ display: 'block', fontFamily: STUDY_VISUAL_FONT }}
      >
        <rect
          x="1"
          y="1"
          width="358"
          height="130"
          rx="16"
          fill={isLight ? '#f8fafc' : '#111827'}
          stroke={isLight ? '#cbd5e1' : '#334155'}
        />
        {children}
      </svg>
    </figure>
  );
}

export function StudyMicroArrow({ x1, y1, x2, y2, isLight = false }) {
  const color = isLight ? '#475569' : '#94a3b8';
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 8;
  return (
    <g aria-hidden="true">
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <polygon
        points={`${x2},${y2} ${x2 - head * Math.cos(angle - 0.45)},${y2 - head * Math.sin(angle - 0.45)} ${x2 - head * Math.cos(angle + 0.45)},${y2 - head * Math.sin(angle + 0.45)}`}
        fill={color}
      />
    </g>
  );
}

export function StudyFractionBar({ fraction, x, y, width = 116, isLight = false }) {
  const denominator = Number(fraction?.denominator || 0);
  const numerator = Number(fraction?.numerator || 0);
  if (!Number.isInteger(denominator) || denominator < 1) return null;
  const cellWidth = width / denominator;
  const ink = isLight ? '#334155' : '#e2e8f0';
  const empty = isLight ? '#e2e8f0' : '#334155';
  const fill = '#f97316';
  return (
    <g>
      <text x={x + width / 2} y={y - 11} textAnchor="middle" fill={ink} fontSize="14" fontWeight="800">
        {numerator}/{denominator}
      </text>
      {Array.from({ length: denominator }, (_, index) => (
        <rect
          key={index}
          x={x + (index * cellWidth)}
          y={y}
          width={cellWidth}
          height="28"
          fill={index < numerator ? fill : empty}
          stroke={ink}
          strokeWidth="1.25"
        />
      ))}
    </g>
  );
}

function FractionModel({ caption, isLight }) {
  const spec = studyFractionSpec(caption);
  if (!spec) return null;
  const hasRight = Boolean(spec.right);
  return (
    <StudyMicroFrame
      isLight={isLight}
      kind="fraction-model"
      label={hasRight
        ? `Equivalent fraction model: ${spec.left.numerator}/${spec.left.denominator} equals ${spec.right.numerator}/${spec.right.denominator}`
        : `Fraction model: ${spec.left.numerator}/${spec.left.denominator}`}
    >
      <StudyFractionBar fraction={spec.left} x={hasRight ? 38 : 122} y={58} width={hasRight ? 112 : 116} isLight={isLight} />
      {hasRight ? (
        <>
          <text x="180" y="80" textAnchor="middle" fill={isLight ? '#334155' : '#e2e8f0'} fontSize="20" fontWeight="800">=</text>
          <StudyFractionBar fraction={spec.right} x={210} y={58} width={112} isLight={isLight} />
        </>
      ) : null}
      <text x="180" y="116" textAnchor="middle" fill={isLight ? '#64748b' : '#94a3b8'} fontSize="11">
        Each bar is divided into equal parts; shaded parts show the numerator.
      </text>
    </StudyMicroFrame>
  );
}

function BeforeAfter({ caption, isLight }) {
  const spec = studyBeforeAfterSpec(caption);
  if (!spec) return null;
  const beforeLines = splitLabel(spec.before);
  const afterLines = splitLabel(spec.after);
  const ink = isLight ? '#334155' : '#e2e8f0';
  const muted = isLight ? '#64748b' : '#94a3b8';
  return (
    <StudyMicroFrame
      isLight={isLight}
      kind="before-after"
      label={`Before and after transformation: ${spec.before} becomes ${spec.after}`}
    >
      <text x="78" y="28" textAnchor="middle" fill={muted} fontSize="10" fontWeight="800">BEFORE</text>
      <rect x="18" y="38" width="120" height="58" rx="12" fill={isLight ? '#fff7ed' : '#431407'} stroke="#f97316" />
      {beforeLines.map((line, index) => (
        <text key={line} x="78" y={68 + (index * 16)} textAnchor="middle" fill={ink} fontSize="12" fontWeight="700">{line}</text>
      ))}
      <StudyMicroArrow x1={150} y1={67} x2={207} y2={67} isLight={isLight} />
      <text x="282" y="28" textAnchor="middle" fill={muted} fontSize="10" fontWeight="800">AFTER</text>
      <rect x="222" y="38" width="120" height="58" rx="12" fill={isLight ? '#eff6ff' : '#172554'} stroke="#0ea5e9" />
      {afterLines.map((line, index) => (
        <text key={line} x="282" y={68 + (index * 16)} textAnchor="middle" fill={ink} fontSize="12" fontWeight="700">{line}</text>
      ))}
      <text x="180" y="116" textAnchor="middle" fill={muted} fontSize="11">One meaningful state change, shown inline with the explanation.</text>
    </StudyMicroFrame>
  );
}

export default function StudyMicroVisual({ kind, caption = '', isLight = false }) {
  if (kind === 'fraction-model') return <FractionModel caption={caption} isLight={isLight} />;
  if (kind === 'before-after') return <BeforeAfter caption={caption} isLight={isLight} />;
  return null;
}
