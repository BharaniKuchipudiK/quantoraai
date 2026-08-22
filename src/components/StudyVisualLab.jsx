import React, { useEffect, useState } from 'react';

function Arrow({ x1, y1, x2, y2, color, label, isLight }) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 9;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="4" />
      <polygon
        points={`${x2},${y2} ${x2 - head * Math.cos(angle - 0.45)},${y2 - head * Math.sin(angle - 0.45)} ${x2 - head * Math.cos(angle + 0.45)},${y2 - head * Math.sin(angle + 0.45)}`}
        fill={color}
      />
      <text x={x2 + 8} y={y2 + 4} fill={isLight ? '#9a3412' : '#fdba74'} fontSize="13" fontFamily="Nunito, sans-serif">{label}</text>
    </g>
  );
}

function FbdLab({ isLight }) {
  const [ramp, setRamp] = useState(false);
  const [rough, setRough] = useState(true);
  const [pull, setPull] = useState(0);
  const tilt = ramp ? 28 : 0;
  const rad = (tilt * Math.PI) / 180;
  const g = 10;
  const mass = 5;
  const W = mass * g;
  const N = Math.round(W * Math.cos(rad));
  const ink = isLight ? '#9a3412' : '#fdba74';

  return (
    <div data-quantora-study-lab="fbd">
      <svg viewBox="0 0 360 210" width="100%" height="210">
        <rect width="360" height="210" rx="18" fill={isLight ? '#fff7ed' : '#1c1917'} />
        <g transform={`translate(180 130) rotate(${-tilt})`}>
          <rect x="-130" y="18" width="260" height="14" rx="4" fill={isLight ? '#c2410c' : '#ea580c'} />
          <rect x="-28" y="-22" width="56" height="40" rx="6" fill={ink} />
          <Arrow x1="0" y1="0" x2="0" y2="52" color="#fb7185" label={`W ${W} N`} isLight={isLight} />
          <Arrow x1="0" y1="0" x2="0" y2="-52" color="#38bdf8" label={`N ${N} N`} isLight={isLight} />
          {pull > 0 ? <Arrow x1="28" y1="-2" x2={28 + pull * 3} y2="-2" color="#a3e635" label={`Pull ${pull} N`} isLight={isLight} /> : null}
          {rough && pull > 0 ? <Arrow x1="-28" y1="8" x2={-28 - Math.min(pull, 12) * 2} y2="8" color="#facc15" label="Friction" isLight={isLight} /> : null}
        </g>
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
        <button type="button" onClick={() => setRamp(false)} style={chip(isLight, !ramp)}>Flat table</button>
        <button type="button" onClick={() => setRamp(true)} style={chip(isLight, ramp)}>30° ramp</button>
        <button type="button" onClick={() => setRough((v) => !v)} style={chip(isLight, rough)}>{rough ? 'Rough floor' : 'Smooth floor'}</button>
      </div>
      <label style={{ display: 'block', marginTop: '10px', fontSize: '0.82rem', color: ink }}>
        Applied pull: {pull} N
        <input type="range" min="0" max="20" value={pull} onChange={(e) => setPull(Number(e.target.value))} style={{ width: '100%' }} />
      </label>
    </div>
  );
}

function NewtonLab({ isLight }) {
  const [law, setLaw] = useState(1);
  const [rough, setRough] = useState(false);
  const [x, setX] = useState(40);
  const [mass, setMass] = useState(5);
  const [force, setForce] = useState(20);
  const a = (force / mass).toFixed(1);
  const ink = isLight ? '#9a3412' : '#fdba74';

  useEffect(() => {
    if (law !== 1) return undefined;
    let frame;
    let v = 0;
    let pos = 40;
    const tick = () => {
      v += rough ? -0.12 : 0;
      if (v < 0) v = 0;
      pos += v;
      if (pos > 280) pos = 280;
      setX(pos);
      frame = requestAnimationFrame(tick);
    };
    return () => cancelAnimationFrame(frame);
  }, [law, rough]);

  const push = () => {
    setX(40);
    let v = 4.2;
    let pos = 40;
    const step = () => {
      v += rough ? -0.18 : -0.02;
      if (v < 0) v = 0;
      pos += v;
      if (pos > 280) pos = 280;
      setX(pos);
      if (v > 0 && pos < 280) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  return (
    <div data-quantora-study-lab="newton">
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        {[1, 2, 3].map((n) => (
          <button key={n} type="button" onClick={() => setLaw(n)} style={chip(isLight, law === n)}>Law {n}</button>
        ))}
      </div>
      {law === 1 ? (
        <>
          <svg viewBox="0 0 360 140" width="100%" height="140">
            <rect width="360" height="140" rx="18" fill={isLight ? '#fff7ed' : '#1c1917'} />
            <rect x="20" y="100" width="320" height="12" rx="4" fill={isLight ? '#c2410c' : '#ea580c'} />
            <ellipse cx={x} cy="96" rx="22" ry="10" fill={ink} />
          </svg>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button type="button" onClick={push} style={chip(isLight, true)}>Give one quick push</button>
            <button type="button" onClick={() => setRough((v) => !v)} style={chip(isLight, rough)}>{rough ? 'Rough floor on' : 'Smooth ice'}</button>
          </div>
        </>
      ) : null}
      {law === 2 ? (
        <>
          <p style={{ margin: '0 0 8px', fontSize: '0.95rem' }}>a = F / m = {force} / {mass} = <strong>{a} m/s²</strong></p>
          <div style={{ height: '18px', borderRadius: '999px', background: isLight ? '#fed7aa' : '#44403c' }}>
            <div style={{ width: `${Math.min(100, Number(a) * 8)}%`, height: '100%', borderRadius: '999px', background: '#f97316' }} />
          </div>
          <label style={{ display: 'block', marginTop: '10px', fontSize: '0.82rem', color: ink }}>
            Mass {mass} kg
            <input type="range" min="1" max="20" value={mass} onChange={(e) => setMass(Number(e.target.value))} style={{ width: '100%' }} />
          </label>
          <label style={{ display: 'block', fontSize: '0.82rem', color: ink }}>
            Force {force} N
            <input type="range" min="1" max="40" value={force} onChange={(e) => setForce(Number(e.target.value))} style={{ width: '100%' }} />
          </label>
        </>
      ) : null}
      {law === 3 ? (
        <p style={{ margin: 0, fontSize: '0.95rem' }}>
          You push the wall. The wall pushes you back with the same size force. Same pair, opposite ways — that is why a rocket can leave the pad.
        </p>
      ) : null}
    </div>
  );
}

function chip(isLight, on) {
  return {
    border: 'none',
    borderRadius: '999px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '0.8rem',
    background: on ? '#f97316' : (isLight ? '#ffedd5' : '#292524'),
    color: on ? '#fff' : (isLight ? '#9a3412' : '#fdba74'),
  };
}

export default function StudyVisualLab({ kind = 'newton', isLight = false }) {
  return (
    <section
      data-quantora-study-workspace="true"
      style={{
        margin: '0 0 16px',
        padding: '14px',
        borderRadius: '20px',
        border: isLight ? '1px solid #fdba74' : '1px solid rgba(251,146,60,0.35)',
        background: isLight ? '#fffbeb' : '#0c0a09',
        maxWidth: '440px',
        fontFamily: "var(--font-study-body), sans-serif",
      }}
    >
      <div style={{ fontFamily: "var(--font-story), serif", fontWeight: 600, marginBottom: '10px', fontSize: '1.05rem' }}>
        {kind === 'fbd' ? 'Free-body diagram — on this page' : 'Newton lab — on this page'}
      </div>
      {kind === 'fbd' ? <FbdLab isLight={isLight} /> : <NewtonLab isLight={isLight} />}
    </section>
  );
}
