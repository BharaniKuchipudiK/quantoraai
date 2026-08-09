import React from 'react';
import { blochVector } from '../lib/quantum/statevector';

/*
 * A Bloch sphere for one qubit.
 *
 * Every pure state of a single qubit is a point on this sphere: |0> at the top,
 * |1> at the bottom, superpositions around the equator, and the angle around
 * the equator is the phase — the thing that never shows up in a probability bar
 * but decides what happens when paths interfere.
 *
 * The arrow's LENGTH carries the idea that is hardest to convey in words. A
 * qubit with a state of its own reaches the surface. Entangle it and the arrow
 * shrinks; fully entangled, it vanishes to a point at the centre, because the
 * qubit genuinely has no individual state — only a relationship with its
 * partner. Watching it collapse the instant a CNOT lands does more than a
 * paragraph can.
 */

const R = 62;
const CX = 82;
const CY = 82;

/* A gentle three-quarter view: +y recedes up-right, so the sphere reads as solid. */
function project(x, y, z) {
  return {
    sx: CX + R * 0.82 * (x + 0.42 * y),
    sy: CY - R * 0.82 * (z - 0.26 * y),
  };
}

export default function BlochSphere({ state, qubit, label, isLight }) {
  const v = blochVector(state, qubit);
  const tip = project(v.x, v.y, v.z);

  const line = isLight ? '#cbd5e1' : 'rgba(255,255,255,0.18)';
  const faint = isLight ? '#e2e8f0' : 'rgba(255,255,255,0.10)';
  const text = isLight ? '#475569' : '#94a3b8';
  const strong = isLight ? '#0f172a' : '#ffffff';

  // Below this the arrow is too short to read; say it in words instead.
  const collapsed = v.purity < 0.02;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      <svg width={CX * 2} height={CY * 2 + 6} role="img"
           aria-label={`Bloch sphere for ${label}. ${collapsed ? 'No definite state — fully entangled.' : `Vector x ${v.x.toFixed(2)}, y ${v.y.toFixed(2)}, z ${v.z.toFixed(2)}.`}`}>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke={line} strokeWidth="1.2" />
        {/* equator, seen edge-on from this angle */}
        <ellipse cx={CX} cy={CY} rx={R} ry={R * 0.30} fill="none" stroke={faint} strokeWidth="1" />
        {/* meridian */}
        <ellipse cx={CX} cy={CY} rx={R * 0.30} ry={R} fill="none" stroke={faint} strokeWidth="1" />
        <line x1={CX} y1={CY - R} x2={CX} y2={CY + R} stroke={faint} strokeWidth="1" />

        <text x={CX} y={CY - R - 5} textAnchor="middle" fontSize="10" fill={text} fontFamily="var(--font-mono), monospace">|0⟩</text>
        <text x={CX} y={CY + R + 14} textAnchor="middle" fontSize="10" fill={text} fontFamily="var(--font-mono), monospace">|1⟩</text>

        {!collapsed && (
          <>
            <defs>
              <marker id={`tip-${qubit}`} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M0 0 L8 4 L0 8 z" fill="#059669" />
              </marker>
            </defs>
            <line x1={CX} y1={CY} x2={tip.sx} y2={tip.sy}
                  stroke="#059669" strokeWidth="2.2" strokeLinecap="round"
                  markerEnd={`url(#tip-${qubit})`} />
          </>
        )}

        <circle cx={CX} cy={CY} r={collapsed ? 4 : 2} fill={collapsed ? '#f97316' : line} />
      </svg>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: strong, fontFamily: 'var(--font-mono), monospace' }}>{label}</div>
        <div style={{ fontSize: '0.68rem', color: collapsed ? '#f97316' : text, maxWidth: '150px', lineHeight: 1.4 }}>
          {collapsed
            ? 'No state of its own — fully entangled'
            : `purity ${v.purity.toFixed(2)}`}
        </div>
      </div>
    </div>
  );
}
