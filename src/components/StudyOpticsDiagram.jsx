import React from 'react';

function Ray({ x1, y1, x2, y2, color, dashed = false }) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      strokeDasharray={dashed ? '6 5' : undefined}
    />
  );
}

export default function StudyOpticsDiagram({ spec, isLight = false }) {
  if (!spec || spec.kind !== 'concave-mirror') return null;

  const ink = isLight ? '#334155' : '#e2e8f0';
  const muted = isLight ? '#64748b' : '#94a3b8';
  const panel = isLight ? '#f8fafc' : '#111827';
  const rayA = '#0ea5e9';
  const rayB = '#f97316';

  return (
    <figure
      data-quantora-study-optics="concave-mirror"
      style={{ margin: '4px 0 18px', maxWidth: '520px' }}
    >
      <div style={{
        borderRadius: '18px',
        overflow: 'hidden',
        border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,0.20)',
        background: panel,
        boxShadow: isLight ? '0 8px 28px rgba(15,23,42,0.05)' : '0 8px 28px rgba(0,0,0,0.12)',
      }}>
        <svg
          viewBox="0 0 440 220"
          width="100%"
          role="img"
          aria-label="Concave mirror ray diagram showing reflected rays crossing to form an inverted real image"
        >
          <rect width="440" height="220" rx="18" fill={panel} />

          <line x1="30" y1="120" x2="400" y2="120" stroke={muted} strokeWidth="2" />
          <text x="32" y="141" fill={muted} fontSize="11">principal axis</text>

          <line x1="76" y1="120" x2="76" y2="58" stroke={ink} strokeWidth="4" />
          <polygon points="76,48 68,62 84,62" fill={ink} />
          <text x="76" y="157" textAnchor="middle" fill={muted} fontSize="11">object</text>

          <circle cx="166" cy="120" r="4" fill={muted} />
          <text x="166" y="142" textAnchor="middle" fill={muted} fontSize="12" fontWeight="700">C</text>
          <circle cx="244" cy="120" r="4" fill={muted} />
          <text x="244" y="142" textAnchor="middle" fill={muted} fontSize="12" fontWeight="700">F</text>

          <path d="M326 32 Q366 120 326 208" fill="none" stroke={ink} strokeWidth="4" />
          <text x="352" y="26" textAnchor="middle" fill={muted} fontSize="11">concave mirror</text>

          <Ray x1="76" y1="58" x2="334" y2="58" color={rayA} />
          <Ray x1="334" y1="58" x2="244" y2="120" color={rayA} />
          <Ray x1="244" y1="120" x2="197" y2="152" color={rayA} />

          <Ray x1="76" y1="58" x2="244" y2="120" color={rayB} />
          <Ray x1="244" y1="120" x2="334" y2="153" color={rayB} />
          <Ray x1="334" y1="153" x2="197" y2="153" color={rayB} />

          <circle cx="197" cy="153" r="5" fill={ink} />
          <line x1="197" y1="120" x2="197" y2="153" stroke={ink} strokeWidth="4" />
          <polygon points="197,163 189,149 205,149" fill={ink} />
          <text x="197" y="185" textAnchor="middle" fill={muted} fontSize="11">inverted image</text>

          <text x="220" y="208" textAnchor="middle" fill={muted} fontSize="11">
            reflected rays cross → top becomes bottom
          </text>
        </svg>
      </div>
      <figcaption style={{
        marginTop: '7px',
        paddingLeft: '2px',
        fontSize: '0.78rem',
        lineHeight: 1.45,
        fontFamily: 'var(--font-body)',
        color: muted,
      }}>
        {spec.caption}
      </figcaption>
    </figure>
  );
}
