import React from 'react';
import { studyPhysicsVisualVariant, studyVisualKind } from '../lib/study-pictures.js';

function Frame({ isLight, children, label }) {
  return (
    <svg viewBox="0 0 360 180" width="100%" height="100%" role="img" aria-label={label}>
      <rect width="360" height="180" rx="18" fill={isLight ? '#f8fafc' : '#111827'} />
      {children}
    </svg>
  );
}

function Arrow({ x1, y1, x2, y2, label, color }) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="4" strokeLinecap="round" />
      <polygon points={`${x2},${y2} ${x2 - 10 * Math.cos(angle - 0.45)},${y2 - 10 * Math.sin(angle - 0.45)} ${x2 - 10 * Math.cos(angle + 0.45)},${y2 - 10 * Math.sin(angle + 0.45)}`} fill={color} />
      {label ? <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} textAnchor="middle" fill={color} fontSize="12" fontWeight="700">{label}</text> : null}
    </g>
  );
}

/** Caption-routed teaching diagrams; no generic decorative scene is shown. */
function PictureArt({ isLight, caption, kind }) {
  const ink = isLight ? '#334155' : '#e2e8f0';
  const muted = isLight ? '#64748b' : '#94a3b8';
  const physicsVariant = kind === 'physics-motion' ? studyPhysicsVisualVariant(caption) : null;
  return (
    <Frame isLight={isLight} label={`${kind.replace(/-/g, ' ')} diagram: ${caption}`}>
      {kind === 'physics-motion' && physicsVariant === 'braking-inertia' ? (
        <>
          <line x1="24" y1="137" x2="336" y2="137" stroke={muted} strokeWidth="2.5" />
          <rect x="86" y="77" width="188" height="52" rx="14" fill={isLight ? '#e2e8f0' : '#334155'} stroke={ink} strokeWidth="2.5" />
          <path d="M126 77 L148 50 L220 50 L244 77" fill={isLight ? '#dbeafe' : '#1e3a5f'} stroke={ink} strokeWidth="2.5" />
          <circle cx="132" cy="132" r="16" fill={isLight ? '#475569' : '#cbd5e1'} />
          <circle cx="232" cy="132" r="16" fill={isLight ? '#475569' : '#cbd5e1'} />
          <circle cx="180" cy="67" r="10" fill="#fbbf24" />
          <line x1="180" y1="77" x2="180" y2="105" stroke="#fbbf24" strokeWidth="6" strokeLinecap="round" />
          <Arrow x1="180" y1="40" x2="305" y2="40" label="" color="#f97316" />
          <text x="242" y="27" textAnchor="middle" fill="#f97316" fontSize="12" fontWeight="700">velocity continues</text>
          <Arrow x1="180" y1="108" x2="64" y2="108" label="" color="#0ea5e9" />
          <text x="102" y="97" textAnchor="middle" fill="#0ea5e9" fontSize="12" fontWeight="700">seatbelt force</text>
          <text x="180" y="163" textAnchor="middle" fill={muted} fontSize="11">the force changes velocity — not inertia by itself</text>
        </>
      ) : null}
      {kind === 'physics-motion' && physicsVariant === 'free-body' ? (
        /*
         * A real free-body diagram, not a box with decoration. Every force is
         * drawn FROM the same point — the body's centre — because that is the
         * whole idea the diagram exists to teach, and the previous version drew
         * them from an offset that quietly taught the wrong thing. Friction
         * opposes the applied force; normal and weight are equal and opposite
         * and are drawn that length, so the picture is consistent with the
         * physics rather than merely decorated with its vocabulary.
         */
        <>
          <line x1="24" y1="132" x2="336" y2="132" stroke={ink} strokeWidth="2.5" />
          {[36, 60, 84, 108, 132, 156, 180, 204, 228, 252, 276, 300, 324].map((x) => (
            <line key={x} x1={x} y1="132" x2={x - 9} y2="141" stroke={muted} strokeWidth="1.5" />
          ))}
          <rect x="152" y="96" width="56" height="36" rx="5" fill={isLight ? '#e2e8f0' : '#334155'} stroke={ink} strokeWidth="2" />
          <text x="180" y="119" textAnchor="middle" fill={ink} fontSize="13" fontWeight="700">m</text>

          <Arrow x1="180" y1="114" x2="180" y2="40" label="" color="#0ea5e9" />
          <text x="187" y="44" fill="#0ea5e9" fontSize="12" fontWeight="700">N (normal)</text>

          <Arrow x1="180" y1="114" x2="180" y2="172" label="" color="#e879f9" />
          <text x="187" y="168" fill="#e879f9" fontSize="12" fontWeight="700">W = mg</text>

          <Arrow x1="180" y1="114" x2="292" y2="114" label="" color="#f97316" />
          <text x="252" y="102" textAnchor="middle" fill="#f97316" fontSize="12" fontWeight="700">F applied</text>

          <Arrow x1="180" y1="114" x2="86" y2="114" label="" color="#94a3b8" />
          {/* Left of the block, not over it: the label sat at x=140 with the
              block starting at 152, so a ~50px word crossed its edge. */}
          <text x="120" y="102" textAnchor="middle" fill={muted} fontSize="12" fontWeight="700">friction</text>

          <circle cx="180" cy="114" r="3.5" fill={ink} />
          <text x="180" y="16" textAnchor="middle" fill={muted} fontSize="11">every force acts from the same point</text>
        </>
      ) : null}
      {kind === 'algebra-balance' ? (
        <>
          <line x1="180" y1="42" x2="180" y2="138" stroke={ink} strokeWidth="5" />
          <line x1="82" y1="68" x2="278" y2="68" stroke={ink} strokeWidth="5" />
          <path d="M52 72 L112 72 L100 118 L64 118 Z" fill="none" stroke="#0ea5e9" strokeWidth="3" />
          <path d="M248 72 L308 72 L296 118 L260 118 Z" fill="none" stroke="#f97316" strokeWidth="3" />
          <text x="82" y="103" textAnchor="middle" fill={ink} fontSize="18" fontWeight="800">x + a</text>
          <text x="278" y="103" textAnchor="middle" fill={ink} fontSize="18" fontWeight="800">b</text>
          <text x="180" y="160" textAnchor="middle" fill={muted} fontSize="12">same operation on both sides</text>
        </>
      ) : null}
      {kind === 'biology-cell' ? (
        <>
          <ellipse cx="180" cy="90" rx="118" ry="66" fill={isLight ? '#dcfce7' : '#14532d'} stroke="#22c55e" strokeWidth="4" />
          <circle cx="178" cy="88" r="30" fill={isLight ? '#ddd6fe' : '#5b21b6'} stroke="#8b5cf6" strokeWidth="3" />
          <text x="178" y="93" textAnchor="middle" fill={ink} fontSize="12" fontWeight="700">nucleus</text>
          <Arrow x1="277" y1="48" x2="247" y2="62" label="membrane" color="#0ea5e9" />
        </>
      ) : null}
      {kind === 'chemistry-bond' ? (
        <>
          <line x1="116" y1="90" x2="174" y2="90" stroke={ink} strokeWidth="5" />
          <line x1="186" y1="90" x2="244" y2="90" stroke={ink} strokeWidth="5" />
          {[90, 180, 270].map((cx, index) => <circle key={cx} cx={cx} cy="90" r={index === 1 ? 30 : 24} fill={index === 1 ? '#f97316' : '#0ea5e9'} />)}
          <text x="180" y="148" textAnchor="middle" fill={muted} fontSize="12">atoms connected by bonds</text>
        </>
      ) : null}
      {kind === 'graph' ? (
        <>
          <Arrow x1="58" y1="140" x2="310" y2="140" label="time / x" color={muted} />
          <Arrow x1="58" y1="140" x2="58" y2="30" label="value / y" color={muted} />
          <line x1="78" y1="126" x2="282" y2="50" stroke="#f97316" strokeWidth="5" />
          <path d="M190 84 L240 84 L240 65" fill="none" stroke="#0ea5e9" strokeWidth="3" strokeDasharray="5 4" />
          <text x="245" y="79" fill="#0ea5e9" fontSize="12" fontWeight="700">slope = Δy / Δx</text>
        </>
      ) : null}
      {kind === 'concept-relationship' ? (
        <>
          {['Observe', 'Connect', 'Check'].map((label, index) => (
            <g key={label}>
              <rect x={28 + index * 116} y="65" width="82" height="48" rx="10" fill={index === 1 ? '#f97316' : (isLight ? '#e2e8f0' : '#334155')} />
              <text x={69 + index * 116} y="94" textAnchor="middle" fill={index === 1 ? '#fff' : ink} fontSize="12" fontWeight="700">{label}</text>
            </g>
          ))}
          <Arrow x1="110" y1="89" x2="140" y2="89" label="" color={muted} />
          <Arrow x1="226" y1="89" x2="256" y2="89" label="" color={muted} />
        </>
      ) : null}
    </Frame>
  );
}

export default function StudyPicture({ caption = '', isLight = false }) {
  const label = String(caption || '').trim();
  if (!label) return null;
  const kind = studyVisualKind(label);
  const physicsVariant = kind === 'physics-motion' ? studyPhysicsVisualVariant(label) : null;
  // No diagram earns a frame it cannot fill. An empty decorative box beside a
  // lesson reads as a broken image, which is worse than no image at all.
  if (!kind) return null;
  return (
    <figure
      data-quantora-study-picture={kind}
      data-quantora-study-picture-variant={physicsVariant || undefined}
      style={{
        margin: '0 0 16px',
        maxWidth: '420px',
      }}
    >
      <div style={{
        borderRadius: '20px',
        overflow: 'hidden',
        border: isLight ? '1px solid #fdba74' : '1px solid rgba(251,146,60,0.35)',
      }}>
        <PictureArt isLight={isLight} caption={label} kind={kind} />
      </div>
      <figcaption style={{
        marginTop: '8px',
        fontSize: '0.85rem',
        lineHeight: 1.4,
        fontFamily: 'var(--font-body)',
        color: isLight ? '#9a3412' : '#fdba74',
      }}>
        {label}
      </figcaption>
    </figure>
  );
}
