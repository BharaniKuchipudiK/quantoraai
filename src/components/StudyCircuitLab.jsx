import React, { useEffect, useReducer, useRef, useState } from 'react';
import { createStudyCircuitState, studyCircuitModel, studyCircuitPoint, transitionStudyCircuit } from '../lib/study-circuit.js';
import { STUDY_LEARNING_INTERACTION, recordStudyLearningInteraction } from '../lib/study-learning-interactions.js';
import './study-circuit-lab.css';

export default function StudyCircuitLab({ isLight = false, conceptKey = '' }) {
  const [state, dispatch] = useReducer(transitionStudyCircuit, undefined, createStudyCircuitState);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window === 'undefined'
    || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [inView, setInView] = useState(true);
  const root = useRef(null);
  const model = studyCircuitModel(state);
  const animating = state.playing && state.connected && !reducedMotion && pageVisible && inView;

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return undefined;
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    const sync = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !root.current) return undefined;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!animating) return undefined;
    let stopped = false;
    let frame;
    let previous = null;
    const tick = (now) => {
      if (stopped) return;
      if (previous !== null) dispatch({ type: 'tick', deltaMs: Math.min(100, Math.max(0, now - previous)) });
      previous = now;
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => { stopped = true; window.cancelAnimationFrame(frame); };
  }, [animating]);

  const act = (type, value) => {
    dispatch({ type, value });
    // A historical lab must not attribute a click to the current lesson.
    // Unknown original concept means no observation, not a guessed identity.
    if (typeof conceptKey === 'string' && conceptKey) {
      recordStudyLearningInteraction({
        type: STUDY_LEARNING_INTERACTION.SIMULATION_MANIPULATED,
        source: 'study_visual_lab', conceptId: conceptKey,
        labKind: 'simple-dc-circuit', control: type, controlValue: String(value ?? type),
      });
    }
  };
  if (!model) return <p role="status">This circuit configuration is unavailable.</p>;

  return (
    <section ref={root} className={`study-circuit-lab${isLight ? ' study-circuit-lab--light' : ''}`}
      data-quantora-study-workspace="true" data-quantora-study-lab="simple-dc-circuit"
      data-circuit-connected={String(state.connected)} data-circuit-playing={String(animating)}
      data-circuit-phase={state.phase.toFixed(6)} aria-label="Interactive DC circuit">
      <header className="study-circuit-lab__header">
        <span className="study-circuit-lab__badge" aria-hidden="true">⚡</span>
        <div><strong>Make the circuit tell the story</strong><small>One battery. One load. One complete loop.</small></div>
      </header>
      <p className="study-circuit-lab__prediction"><span aria-hidden="true">💭</span> Predict: what happens to the lamp when the return wire opens?</p>
      <svg viewBox="0 0 420 270" role="img" aria-label={`DC circuit: battery, lamp and ${state.connected ? 'connected' : 'open'} return wire. Conventional current ${model.current.toFixed(2)} amperes.`}>
        <path className="study-circuit-lab__wire" d="M75 122V58H330V110 M330 160V215H235 M187 215H75V148" />
        <path className={`study-circuit-lab__switch${state.connected ? '' : ' study-circuit-lab__switch--open'}`}
          d={state.connected ? 'M235 215H187' : 'M235 215L187 184'} />
        <circle cx="235" cy="215" r="4" className="study-circuit-lab__contact" />
        <circle cx="187" cy="215" r="4" className="study-circuit-lab__contact" />
        <path d="M48 124H102 M59 146H91" className="study-circuit-lab__battery" />
        <text x="41" y="114" className="study-circuit-lab__polarity">+</text>
        <text x="42" y="166" className="study-circuit-lab__polarity">−</text>
        <text x="75" y="30" textAnchor="middle">Battery</text>
        <text x="75" y="48" textAnchor="middle" className="study-circuit-lab__value">{state.voltage} V source</text>
        <circle cx="330" cy="135" r="36" className="study-circuit-lab__glow" opacity={model.lampOn ? 0.22 : 0} />
        <circle cx="330" cy="135" r="25" className="study-circuit-lab__lamp" data-circuit-lamp={model.lampOn ? 'on' : 'off'} />
        <path d="M314 119L346 151 M346 119L314 151" className="study-circuit-lab__filament" />
        <text x="330" y="30" textAnchor="middle">Lamp / load</text>
        <text x="330" y="48" textAnchor="middle" className="study-circuit-lab__value">{state.resistance} Ω</text>
        <path d="M174 82H232 M224 76L232 82L224 88" className="study-circuit-lab__direction" />
        <text x="203" y="107" textAnchor="middle">Conventional current</text>
        <text x="210" y="251" textAnchor="middle">Return wire · {state.connected ? 'connected' : 'open'}</text>
        {Array.from({ length: 16 }, (_, index) => {
          const point = studyCircuitPoint(state.phase + index / 16);
          const hidden = (point.x === 75 && point.y > 116 && point.y < 154)
            || (point.x === 330 && point.y > 106 && point.y < 164)
            || (!state.connected && point.y === 215 && point.x > 182 && point.x < 240);
          return <circle key={index} data-study-circuit-marker={index} cx={point.x} cy={point.y}
            r="4.5" className="study-circuit-lab__marker" opacity={hidden ? 0 : 1} />;
        })}
      </svg>
      <div className="study-circuit-lab__readouts">
        <span><span aria-hidden="true">🔋</span> Terminal <strong>{model.terminalVoltage.toFixed(2)} V</strong></span>
        <span><span aria-hidden="true">⚡</span> Current <strong data-study-circuit-current="true">{model.current.toFixed(2)} A</strong></span>
        <span><span aria-hidden="true">💡</span> Load <strong>{model.loadPower.toFixed(2)} W</strong></span>
      </div>
      <div className="study-circuit-lab__controls">
        {reducedMotion ? (
          <button type="button" data-circuit-control="step" disabled={!state.connected} onClick={() => act('step')}>Step current markers</button>
        ) : (
          <button type="button" className="study-circuit-lab__primary" data-circuit-control="play"
            disabled={!state.connected} aria-pressed={state.playing}
            onClick={() => act(state.playing ? 'pause' : 'play')}>
            <span aria-hidden="true">{state.playing ? 'Ⅱ' : '▶'}</span> {state.playing ? 'Pause' : 'Play current flow'}
          </button>
        )}
        <button type="button" data-circuit-control="wire" onClick={() => act(state.connected ? 'open' : 'reconnect')}>
          {state.connected ? 'Open return wire' : 'Reconnect'}
        </button>
        <button type="button" data-circuit-control="reset" onClick={() => act('reset')}>Reset</button>
      </div>
      <p role="status" aria-live="polite" className="study-circuit-lab__observation">
        {state.connected
          ? 'The complete loop carries current through the load. Pausing the illustration does not switch off the circuit.'
          : 'The return path is broken: no sustained DC current, and the lamp is off. The battery still has a terminal voltage.'}
      </p>
      <details className="study-circuit-lab__adjust">
        <summary>Explore voltage and resistance</summary>
        {[['voltage', 'Source EMF (V)', 1, 12, 1], ['resistance', 'Load resistance (Ω)', 2, 30, 1], ['internalResistance', 'Internal resistance (Ω)', 0, 5, 0.5]].map(([name, label, min, max, step]) => (
          <label key={name}>{label}: <strong>{state[name]}</strong>
            <input type="range" aria-label={label} min={min} max={max} step={step} value={state[name]}
              onChange={(event) => act(name, Number(event.target.value))} />
          </label>
        ))}
        <p>Closed loop: I = ε / (R + r). Terminal voltage = ε − Ir.</p>
      </details>
      <p className="study-circuit-lab__note">{reducedMotion ? 'Reduced motion: use Step to compare positions. ' : ''}Markers show conventional-current direction, not individual electrons; electrons in metal drift oppositely. Charges are already present around the wires. Speed and lamp glow are illustrative. This ohmic-load model shows steady states, not switching delays or filament heating.</p>
    </section>
  );
}
