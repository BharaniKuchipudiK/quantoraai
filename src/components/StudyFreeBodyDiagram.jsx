import React, { useMemo, useState } from 'react';
import { buildFreeBodyScene, validateFreeBodyScene } from '../lib/study-free-body-diagram.js';

export default function StudyFreeBodyDiagram({ isLight, textColor, subtextColor }) {
  const [applied, setApplied] = useState(false);
  const [friction, setFriction] = useState(false);
  const scene = useMemo(() => buildFreeBodyScene({ applied, friction: applied && friction }), [applied, friction]);
  const validation = useMemo(() => validateFreeBodyScene(scene), [scene]);
  if (!validation.valid) return null;

  const toggleStyle = (active) => ({
    border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(148,163,184,0.35)',
    background: active ? (isLight ? '#e0f2fe' : 'rgba(14,165,233,0.18)') : 'transparent',
    color: textColor,
    borderRadius: '999px',
    padding: '6px 10px',
    fontSize: '0.72rem',
    fontWeight: 700,
    cursor: 'pointer',
  });

  return (
    <section data-quantora-study-fbd="true" aria-labelledby="study-fbd-title" style={{ marginTop: '12px' }}>
      <div id="study-fbd-title" style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: subtextColor }}>
        Interactive free-body diagram
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '7px' }}>
        <button type="button" aria-pressed={applied} onClick={() => { setApplied((value) => !value); if (applied) setFriction(false); }} style={toggleStyle(applied)}>
          Applied force
        </button>
        <button type="button" aria-pressed={friction} disabled={!applied} onClick={() => setFriction((value) => !value)} style={{ ...toggleStyle(friction), opacity: applied ? 1 : 0.45 }}>
          Friction
        </button>
      </div>
      <svg
        viewBox="0 0 320 210"
        role="img"
        aria-label={`${scene.title}. ${scene.description}`}
        style={{ display: 'block', width: '100%', maxHeight: '250px', marginTop: '8px', borderRadius: '12px', background: isLight ? '#f8fafc' : 'rgba(15,23,42,0.55)' }}
      >
        <defs>
          {scene.forces.map((arrow) => (
            <marker key={arrow.id} id={`fbd-arrow-${arrow.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L8,4 L0,8 Z" fill={arrow.color} />
            </marker>
          ))}
        </defs>
        <line x1="50" y1="145" x2="270" y2="145" stroke={isLight ? '#64748b' : '#94a3b8'} strokeWidth="4" />
        <rect x="125" y="75" width="70" height="70" rx="8" fill={isLight ? '#fde68a' : '#a16207'} stroke={isLight ? '#92400e' : '#fbbf24'} strokeWidth="2" />
        {scene.forces.map((arrow) => (
          <g key={arrow.id}>
            <title>{arrow.label}</title>
            <line x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} stroke={arrow.color} strokeWidth="4" markerEnd={`url(#fbd-arrow-${arrow.id})`} />
            <text x={arrow.x2 + (arrow.x2 < arrow.x1 ? -12 : 8)} y={arrow.y2 + (arrow.y2 < arrow.y1 ? -7 : 16)} fill={arrow.color} fontSize="15" fontWeight="700">{arrow.symbol}</text>
          </g>
        ))}
      </svg>
      <p style={{ margin: '6px 0 0', color: subtextColor, fontSize: '0.75rem', lineHeight: 1.45 }}>
        {scene.description} Arrows represent forces acting on the object—not its velocity.
      </p>
    </section>
  );
}
