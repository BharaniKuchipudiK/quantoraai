import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, FileCode2, LayoutPanelLeft } from 'lucide-react';

export const GUEST_DEMO_PROMPT =
  'Build a today board I can actually use: three must-ships, the one blocker, and a 25-minute focus timer';

const FILES = ['TodayBoard.jsx', 'FocusTimer.jsx', 'styles.css'];
const FOCUS_SECONDS = 25 * 60;

const RUN_STEPS = [
  { at: 0, status: 'Reading the prompt…', file: 0, assemble: 0 },
  { at: 1800, status: 'Planning the desk…', file: 1, assemble: 0 },
  { at: 3800, status: 'Writing TodayBoard.jsx…', file: 2, assemble: 1 },
  { at: 6200, status: 'Writing FocusTimer.jsx…', file: 3, assemble: 2 },
  { at: 9000, status: 'Assembling the preview…', file: 3, assemble: 3 },
  { at: 12500, status: 'Ready on the desk.', file: 3, assemble: 4 },
];

const STARTER_SHIPS = [
  { id: 'patch', label: 'Send the client the patch' },
  { id: 'study', label: 'Finish tonight’s Study icebreaker' },
  { id: 'desk', label: 'Open last night’s desk and continue' },
];

function formatFocus(total) {
  const safe = Math.max(0, total);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function TodayBoard({ interactive, assemble }) {
  const [ships, setShips] = useState(STARTER_SHIPS.map((item) => ({ ...item, done: false })));
  const [blocker, setBlocker] = useState('Waiting on the API key from ops');
  const [left, setLeft] = useState(FOCUS_SECONDS);
  const [timing, setTiming] = useState(false);

  useEffect(() => {
    if (!interactive || !timing) return undefined;
    const id = setInterval(() => {
      setLeft((value) => {
        if (value <= 1) {
          setTiming(false);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [interactive, timing]);

  const shipped = ships.filter((item) => item.done).length;
  const shown = assemble >= 2;

  const toggleShip = (id) => {
    if (!interactive) return;
    setShips((rows) => rows.map((row) => (row.id === id ? { ...row, done: !row.done } : row)));
  };

  return (
    <div className={`guest-today${shown ? ' is-on' : ''}${assemble >= 4 ? ' is-live' : ''}`}>
      <div className="guest-today__top">
        <span>Today</span>
        <strong>{shipped}/3 shipped</strong>
        <small>Check one off. Start the timer. This desk is yours for the next twenty-five minutes.</small>
      </div>
      <ul className="guest-today__ships">
        {ships.map((ship) => (
          <li key={ship.id} className={ship.done ? 'is-done' : ''}>
            <button
              type="button"
              className="guest-today__check"
              aria-pressed={ship.done}
              aria-label={ship.done ? `Mark ${ship.label} as not done` : `Mark ${ship.label} as shipped`}
              disabled={!interactive}
              onClick={() => toggleShip(ship.id)}
            >
              {ship.done ? '✓' : ''}
            </button>
            {interactive ? (
              <input
                type="text"
                value={ship.label}
                onChange={(event) => {
                  const next = event.target.value;
                  setShips((rows) => rows.map((row) => (row.id === ship.id ? { ...row, label: next } : row)));
                }}
              />
            ) : (
              <span>{ship.label}</span>
            )}
          </li>
        ))}
      </ul>
      {assemble >= 3 && (
        <label className="guest-today__blocker">
          <span>The blocker</span>
          {interactive ? (
            <input type="text" value={blocker} onChange={(event) => setBlocker(event.target.value)} />
          ) : (
            <em>{blocker}</em>
          )}
        </label>
      )}
      {assemble >= 4 && (
        <div className="guest-today__timer">
          <b>{formatFocus(left)}</b>
          <span>Focus</span>
          {interactive && (
            <div className="guest-today__timer-actions">
              <button type="button" onClick={() => setTiming((on) => !on && left > 0)}>
                {timing ? 'Pause' : left === 0 ? 'Done' : 'Start'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTiming(false);
                  setLeft(FOCUS_SECONDS);
                }}
              >
                Reset
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GuestBuildPreview({
  isLight,
  prompt,
  running,
  done,
  onContinue,
  onReady,
}) {
  const [clock, setClock] = useState(0);
  const [idleTick, setIdleTick] = useState(4);
  const reduce = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useEffect(() => {
    if (running || done || reduce) return undefined;
    const id = setInterval(() => setIdleTick((t) => (t >= 4 ? 2 : t + 1)), 900);
    return () => clearInterval(id);
  }, [running, done, reduce]);

  useEffect(() => {
    if (!running || reduce) return undefined;
    const started = Date.now();
    const id = setInterval(() => setClock(Date.now() - started), 80);
    return () => clearInterval(id);
  }, [running, reduce]);

  useEffect(() => {
    if (running) setClock(reduce ? 20000 : 0);
  }, [running, reduce]);

  const step = RUN_STEPS.reduce((acc, item) => (clock >= item.at ? item : acc), RUN_STEPS[0]);

  const readyOnce = useRef(false);
  useEffect(() => {
    if (!running) {
      readyOnce.current = false;
      return;
    }
    if (step.assemble >= 4 && !readyOnce.current) {
      readyOnce.current = true;
      onReady?.();
    }
  }, [running, step.assemble, onReady]);

  const fileCount = running || done ? step.file : reduce ? 3 : Math.min(3, idleTick);
  const assemble = running || done ? step.assemble : reduce ? 4 : idleTick;
  const ready = done || (running && step.assemble >= 4);
  const status = running
    ? step.status
    : done
      ? 'Ready on the desk.'
      : 'Watch it assemble.';
  const reading = (prompt || GUEST_DEMO_PROMPT).slice(0, 64);

  return (
    <div className={`guest-preview${isLight ? ' is-light' : ' is-dark'}${running ? ' is-running' : ''}${ready ? ' is-ready' : ''}`}>
      <div className="guest-preview__bar">
        <LayoutPanelLeft size={14} />
        <span>Coding Desk · TodayBoard</span>
        <em>{status}</em>
      </div>
      <div className="guest-preview__body">
        <aside className="guest-preview__files">
          <span>Files</span>
          {FILES.map((name, i) => (
            <p key={name} className={i < fileCount ? 'is-on' : ''}>
              <FileCode2 size={12} />
              {name}
            </p>
          ))}
        </aside>
        <div className="guest-preview__stage">
          <p className={`guest-preview__read${running && !ready ? ' is-visible' : ''}`}>
            {reading}{reading.length >= 64 ? '…' : ''}
          </p>
          <TodayBoard interactive={ready} assemble={ready ? 4 : assemble} />
        </div>
      </div>
      <div className={`guest-preview__cta${ready ? ' is-visible' : ''}`} aria-hidden={!ready}>
        <p>Use it. Then continue — your desk keeps the work.</p>
        <button type="button" data-quantora-login="true" onClick={onContinue}>
          Continue with Quantora <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
