import React from 'react';
import {
  studyElectricityVisualVariant,
  studyNumberLineLabel,
  studyNumberLineSpec,
  studyPhysicsVisualVariant,
  studyProcessSteps,
  studyTimelinePoints,
  studyVisualKind,
} from '../lib/study-pictures.js';

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

function processCenters(count) {
  if (count === 2) return [100, 260];
  if (count === 3) return [68, 180, 292];
  return [48, 136, 224, 312];
}

/** Caption-routed teaching diagrams; no generic decorative scene is shown. */
function PictureArt({ isLight, caption, kind }) {
  const ink = isLight ? '#334155' : '#e2e8f0';
  const muted = isLight ? '#64748b' : '#94a3b8';
  const physicsVariant = kind === 'physics-motion' ? studyPhysicsVisualVariant(caption) : null;
  const electricityVariant = kind === 'electricity-circuit' ? studyElectricityVisualVariant(caption) : null;
  const processSteps = kind === 'process-flow' ? studyProcessSteps(caption) : [];
  const timelinePoints = kind === 'timeline' ? studyTimelinePoints(caption) : [];
  const numberLine = kind === 'number-line' ? studyNumberLineSpec(caption) : null;
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
          <text x="120" y="102" textAnchor="middle" fill={muted} fontSize="12" fontWeight="700">friction</text>
          <circle cx="180" cy="114" r="3.5" fill={ink} />
          <text x="180" y="16" textAnchor="middle" fill={muted} fontSize="11">every force acts from the same point</text>
        </>
      ) : null}
      {kind === 'electricity-circuit' && electricityVariant === 'simple-circuit' ? (
        <>
          <path d="M76 54 H145 M235 54 H294 V132 H76 V104" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="76" y1="54" x2="76" y2="78" stroke={ink} strokeWidth="3" />
          <line x1="63" y1="78" x2="89" y2="78" stroke="#f97316" strokeWidth="4" />
          <line x1="68" y1="90" x2="84" y2="90" stroke="#0ea5e9" strokeWidth="4" />
          <line x1="76" y1="90" x2="76" y2="104" stroke={ink} strokeWidth="3" />
          <polyline points="145,54 156,44 168,64 180,44 192,64 204,44 216,64 235,54" fill="none" stroke="#fbbf24" strokeWidth="3" strokeLinejoin="round" />
          <Arrow x1="110" y1="38" x2="258" y2="38" label="I" color="#0ea5e9" />
          <text x="76" y="119" textAnchor="middle" fill={muted} fontSize="11">cell / battery</text>
          <text x="190" y="88" textAnchor="middle" fill={muted} fontSize="11">resistor / load</text>
          <text x="180" y="157" textAnchor="middle" fill={muted} fontSize="11">conventional current completes the circuit</text>
          <text x="59" y="75" fill="#f97316" fontSize="11" fontWeight="800">+</text>
          <text x="58" y="96" fill="#0ea5e9" fontSize="13" fontWeight="800">−</text>
        </>
      ) : null}
      {kind === 'electricity-circuit' && electricityVariant === 'emf-terminal-voltage' ? (
        <>
          <rect x="28" y="56" width="92" height="58" rx="12" fill={isLight ? '#fff7ed' : '#431407'} stroke="#f97316" strokeWidth="2" />
          <rect x="134" y="56" width="92" height="58" rx="12" fill={isLight ? '#eff6ff' : '#172554'} stroke="#0ea5e9" strokeWidth="2" />
          <rect x="240" y="56" width="92" height="58" rx="12" fill={isLight ? '#f0fdf4' : '#14532d'} stroke="#22c55e" strokeWidth="2" />
          <text x="74" y="78" textAnchor="middle" fill={ink} fontSize="11" fontWeight="800">battery chemistry</text>
          <text x="74" y="96" textAnchor="middle" fill="#f97316" fontSize="12" fontWeight="800">EMF ε</text>
          <text x="74" y="109" textAnchor="middle" fill={muted} fontSize="9.5">energy supplied / C</text>
          <text x="180" y="78" textAnchor="middle" fill={ink} fontSize="11" fontWeight="800">internal resistance</text>
          <text x="180" y="96" textAnchor="middle" fill="#0ea5e9" fontSize="12" fontWeight="800">lost volts = Ir</text>
          <text x="180" y="109" textAnchor="middle" fill={muted} fontSize="9.5">energy lost / C</text>
          <text x="286" y="78" textAnchor="middle" fill={ink} fontSize="11" fontWeight="800">external circuit</text>
          <text x="286" y="96" textAnchor="middle" fill="#22c55e" fontSize="12" fontWeight="800">terminal p.d. V</text>
          <text x="286" y="109" textAnchor="middle" fill={muted} fontSize="9.5">useful energy / C</text>
          <Arrow x1="120" y1="85" x2="134" y2="85" label="" color={muted} />
          <Arrow x1="226" y1="85" x2="240" y2="85" label="" color={muted} />
          <text x="180" y="137" textAnchor="middle" fill={ink} fontSize="15" fontWeight="800">ε = V + Ir</text>
          <text x="180" y="157" textAnchor="middle" fill={muted} fontSize="11">terminal voltage falls below EMF when current flows through internal resistance</text>
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
      {kind === 'process-flow' && processSteps.length >= 2 ? (
        <>
          {processSteps.map((step, index) => {
            const centers = processCenters(processSteps.length);
            const cx = centers[index];
            const boxWidth = processSteps.length === 4 ? 68 : 78;
            const nextCx = centers[index + 1];
            return (
              <g key={`${step}-${index}`}>
                <rect
                  x={cx - boxWidth / 2}
                  y="66"
                  width={boxWidth}
                  height="50"
                  rx="11"
                  fill={index === processSteps.length - 1 ? '#f97316' : (isLight ? '#e2e8f0' : '#334155')}
                  stroke={index === processSteps.length - 1 ? '#f97316' : muted}
                  strokeWidth="1.5"
                />
                <text x={cx} y="87" textAnchor="middle" fill={index === processSteps.length - 1 ? '#fff' : ink} fontSize="10.5" fontWeight="700">
                  {step.length > 16 ? <><tspan x={cx} dy="0">{step.slice(0, 16)}</tspan><tspan x={cx} dy="13">{step.slice(16)}</tspan></> : step}
                </text>
                {nextCx ? <Arrow x1={cx + boxWidth / 2 + 5} y1="91" x2={nextCx - boxWidth / 2 - 7} y2="91" label="" color={muted} /> : null}
              </g>
            );
          })}
          <text x="180" y="145" textAnchor="middle" fill={muted} fontSize="11">follow the change from left to right</text>
        </>
      ) : null}
      {kind === 'timeline' && timelinePoints.length >= 2 ? (
        <>
          <line x1="48" y1="92" x2="312" y2="92" stroke={muted} strokeWidth="3" strokeLinecap="round" />
          {timelinePoints.map((year, index) => {
            const x = timelinePoints.length === 1 ? 180 : 48 + (264 * index) / (timelinePoints.length - 1);
            const above = index % 2 === 0;
            return (
              <g key={`${year}-${index}`}>
                <circle cx={x} cy="92" r="7" fill={index === timelinePoints.length - 1 ? '#f97316' : '#0ea5e9'} />
                <line x1={x} y1={above ? 85 : 99} x2={x} y2={above ? 58 : 126} stroke={muted} strokeWidth="1.5" />
                <text x={x} y={above ? 48 : 145} textAnchor="middle" fill={ink} fontSize="12" fontWeight="800">{year}</text>
              </g>
            );
          })}
          <text x="180" y="166" textAnchor="middle" fill={muted} fontSize="11">earlier → later</text>
        </>
      ) : null}
      {kind === 'number-line' && numberLine ? (
        <>
          <line x1="48" y1="96" x2="312" y2="96" stroke={ink} strokeWidth="3" strokeLinecap="round" />
          <polygon points="48,96 58,90 58,102" fill={ink} />
          <polygon points="312,96 302,90 302,102" fill={ink} />
          {Array.from({ length: 7 }, (_, index) => {
            const ratio = index / 6;
            const value = numberLine.min + (numberLine.max - numberLine.min) * ratio;
            const x = 52 + 256 * ratio;
            return (
              <g key={index}>
                <line x1={x} y1="87" x2={x} y2="105" stroke={muted} strokeWidth="1.5" />
                <text x={x} y="124" textAnchor="middle" fill={muted} fontSize="10.5">{studyNumberLineLabel(value, numberLine.min, numberLine.max)}</text>
              </g>
            );
          })}
          {numberLine.mark !== null ? (() => {
            const ratio = (numberLine.mark - numberLine.min) / (numberLine.max - numberLine.min);
            const x = 52 + 256 * ratio;
            return (
              <g>
                <circle cx={x} cy="96" r="9" fill="#f97316" stroke={isLight ? '#fff' : '#111827'} strokeWidth="3" />
                <text x={x} y="62" textAnchor="middle" fill="#f97316" fontSize="13" fontWeight="800">{studyNumberLineLabel(numberLine.mark, numberLine.min, numberLine.max)}</text>
                <line x1={x} y1="69" x2={x} y2="82" stroke="#f97316" strokeWidth="2" />
              </g>
            );
          })() : null}
          <text x="180" y="154" textAnchor="middle" fill={muted} fontSize="11">position shows relative value</text>
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
  const electricityVariant = kind === 'electricity-circuit' ? studyElectricityVisualVariant(label) : null;
  if (!kind) return null;
  return (
    <figure
      data-quantora-study-picture={kind}
      data-quantora-study-picture-variant={physicsVariant || electricityVariant || undefined}
      style={{
        margin: '2px 0 18px',
        maxWidth: '430px',
      }}
    >
      <div style={{
        borderRadius: '18px',
        overflow: 'hidden',
        border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,0.20)',
        background: isLight ? '#f8fafc' : '#111827',
        boxShadow: isLight ? '0 8px 28px rgba(15,23,42,0.05)' : '0 8px 28px rgba(0,0,0,0.12)',
      }}>
        <PictureArt isLight={isLight} caption={label} kind={kind} />
      </div>
      <figcaption style={{
        marginTop: '7px',
        paddingLeft: '2px',
        fontSize: '0.78rem',
        lineHeight: 1.45,
        fontFamily: 'var(--font-body)',
        color: isLight ? '#64748b' : '#94a3b8',
      }}>
        {label}
      </figcaption>
    </figure>
  );
}
