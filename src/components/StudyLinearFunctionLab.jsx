import React, { useId, useMemo, useState } from 'react';
import {
  STUDY_LEARNING_INTERACTION,
  recordStudyLearningInteraction,
} from '../lib/study-learning-interactions.js';

const EXPERIMENTS = Object.freeze({
  slope: {
    label: 'Slope',
    question: 'Before changing anything: if m increases from 1 while b stays 0, what should happen to the line?',
    options: [
      { id: 'steeper', label: 'It gets steeper' },
      { id: 'shift-up', label: 'It shifts straight up' },
      { id: 'flat', label: 'It becomes flat' },
    ],
    controlLabel: 'Increase slope m',
    min: 2,
    max: 4,
    initial: 3,
    explain: 'Why did changing m rotate the line around the origin instead of shifting the whole line upward?',
  },
  intercept: {
    label: 'Intercept',
    question: 'Before changing anything: if b increases while m stays 1, what should happen to the line?',
    options: [
      { id: 'shift-up', label: 'It shifts upward' },
      { id: 'steeper', label: 'It gets steeper' },
      { id: 'rotate', label: 'It rotates around the origin' },
    ],
    controlLabel: 'Increase intercept b',
    min: 1,
    max: 4,
    initial: 3,
    explain: 'Why did changing b move every point upward without changing the line’s steepness?',
  },
});

function controlChip(isLight, active, disabled = false) {
  return {
    border: 'none',
    borderRadius: '999px',
    padding: '8px 12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 700,
    fontSize: '0.8rem',
    background: active ? '#f97316' : (isLight ? '#ffedd5' : '#292524'),
    color: active ? '#fff' : (isLight ? '#9a3412' : '#fdba74'),
    opacity: disabled ? 0.55 : 1,
  };
}

function equationFor(experiment, value) {
  return experiment === 'slope'
    ? `y = ${value}x`
    : `y = x + ${value}`;
}

function observationFor(experiment, value) {
  if (experiment === 'slope') {
    return `Observed: increasing m from 1 to ${value} makes the line steeper while the y-intercept stays at 0.`;
  }
  return `Observed: increasing b from 0 to ${value} shifts the line upward by ${value} units while its slope stays 1.`;
}

function LinearGraph({ experiment, value, hasRun, isLight, clipId }) {
  const domainMin = -5;
  const domainMax = 5;
  const left = 38;
  const right = 336;
  const top = 20;
  const bottom = 224;
  const width = right - left;
  const height = bottom - top;
  const toX = (x) => left + ((x - domainMin) / (domainMax - domainMin)) * width;
  const toY = (y) => bottom - ((y - domainMin) / (domainMax - domainMin)) * height;
  const axis = isLight ? '#9a3412' : '#fdba74';
  const grid = isLight ? '#fed7aa' : '#44403c';
  const baseline = isLight ? '#64748b' : '#94a3b8';
  const current = '#f97316';
  const m = experiment === 'slope' ? value : 1;
  const b = experiment === 'intercept' ? value : 0;
  const yAt = (x) => m * x + b;
  const probeX = 1;
  const probeY = yAt(probeX);

  return (
    <svg
      viewBox="0 0 360 250"
      width="100%"
      height="250"
      role="img"
      aria-label={hasRun
        ? `Coordinate graph comparing baseline y equals x with ${equationFor(experiment, value)}. ${observationFor(experiment, value)}`
        : 'Coordinate graph showing the baseline line y equals x before the experiment is run.'}
    >
      <rect width="360" height="250" rx="18" fill={isLight ? '#fff7ed' : '#1c1917'} />
      <defs>
        <clipPath id={clipId}>
          <rect x={left} y={top} width={width} height={height} />
        </clipPath>
      </defs>
      {[-4, -2, 0, 2, 4].map((tick) => (
        <g key={`grid-${tick}`}>
          <line x1={toX(tick)} y1={top} x2={toX(tick)} y2={bottom} stroke={grid} strokeWidth="1" opacity="0.55" />
          <line x1={left} y1={toY(tick)} x2={right} y2={toY(tick)} stroke={grid} strokeWidth="1" opacity="0.55" />
        </g>
      ))}
      <line x1={left} y1={toY(0)} x2={right} y2={toY(0)} stroke={axis} strokeWidth="2" />
      <line x1={toX(0)} y1={top} x2={toX(0)} y2={bottom} stroke={axis} strokeWidth="2" />
      <text x={right - 4} y={toY(0) - 7} textAnchor="end" fill={axis} fontSize="12">x</text>
      <text x={toX(0) + 7} y={top + 12} fill={axis} fontSize="12">y</text>
      <g clipPath={`url(#${clipId})`}>
        <line
          x1={toX(domainMin)}
          y1={toY(domainMin)}
          x2={toX(domainMax)}
          y2={toY(domainMax)}
          stroke={baseline}
          strokeWidth="3"
          strokeDasharray="7 6"
        />
        {hasRun ? (
          <>
            <line
              x1={toX(domainMin)}
              y1={toY(yAt(domainMin))}
              x2={toX(domainMax)}
              y2={toY(yAt(domainMax))}
              stroke={current}
              strokeWidth="4"
            />
            <circle cx={toX(probeX)} cy={toY(probeY)} r="5" fill={current} />
          </>
        ) : null}
      </g>
      <text x={48} y={238} fill={baseline} fontSize="12">baseline: y = x</text>
      {hasRun ? <text x={225} y={238} fill={current} fontSize="12">experiment: {equationFor(experiment, value)}</text> : null}
    </svg>
  );
}

export default function StudyLinearFunctionLab({ isLight = false }) {
  const [experiment, setExperiment] = useState('slope');
  const [prediction, setPrediction] = useState(null);
  const [values, setValues] = useState({ slope: EXPERIMENTS.slope.initial, intercept: EXPERIMENTS.intercept.initial });
  const [hasRun, setHasRun] = useState(false);
  const clipId = `study-linear-function-${useId().replace(/:/g, '')}`;
  const spec = EXPERIMENTS[experiment];
  const value = values[experiment];
  const ink = isLight ? '#9a3412' : '#fdba74';
  const observation = useMemo(() => observationFor(experiment, value), [experiment, value]);

  const chooseExperiment = (next) => {
    setExperiment(next);
    setPrediction(null);
    setHasRun(false);
  };

  const choosePrediction = (optionId) => {
    if (optionId !== prediction) {
      recordStudyLearningInteraction({
        type: STUDY_LEARNING_INTERACTION.PREDICTION_MADE,
        source: 'linear_function_lab',
        labKind: 'linear-function',
        control: experiment,
        choiceId: optionId,
      });
    }
    setPrediction(optionId);
    setHasRun(false);
  };

  const setExperimentValue = (nextValue) => {
    if (nextValue !== values[experiment]) {
      recordStudyLearningInteraction({
        type: STUDY_LEARNING_INTERACTION.SIMULATION_MANIPULATED,
        source: 'linear_function_lab',
        labKind: 'linear-function',
        control: experiment,
        controlValue: String(nextValue),
      });
    }
    setValues((current) => ({ ...current, [experiment]: nextValue }));
    setHasRun(false);
  };

  return (
    <div data-quantora-study-interactive-lab="linear-function" data-quantora-study-lab-stage={hasRun ? 'observe' : prediction ? 'manipulate' : 'predict'}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {Object.entries(EXPERIMENTS).map(([key, item]) => (
          <button
            key={key}
            type="button"
            onClick={() => chooseExperiment(key)}
            aria-pressed={experiment === key}
            style={controlChip(isLight, experiment === key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: '12px' }} data-quantora-study-lab-step="predict">
        <div style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: ink, marginBottom: '6px' }}>
          1 · Predict
        </div>
        <p style={{ margin: '0 0 9px', fontSize: '0.94rem', lineHeight: 1.45 }}>{spec.question}</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {spec.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => choosePrediction(option.id)}
              aria-pressed={prediction === option.id}
              style={controlChip(isLight, prediction === option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '12px' }} data-quantora-study-lab-step="manipulate">
        <div style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: ink, marginBottom: '6px' }}>
          2 · Manipulate
        </div>
        <label style={{ display: 'block', fontSize: '0.84rem', color: ink, opacity: prediction ? 1 : 0.6 }}>
          {spec.controlLabel}: {value}
          <input
            type="range"
            min={spec.min}
            max={spec.max}
            step="1"
            value={value}
            disabled={!prediction}
            aria-label={spec.controlLabel}
            onChange={(event) => setExperimentValue(Number(event.target.value))}
            style={{ width: '100%' }}
          />
        </label>
        {!prediction ? <p style={{ margin: '6px 0 0', fontSize: '0.8rem', opacity: 0.72 }}>Make a prediction first; then the control unlocks.</p> : null}
      </div>

      <div style={{ marginBottom: '12px' }} data-quantora-study-lab-step="run">
        <div style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: ink, marginBottom: '6px' }}>
          3 · Run
        </div>
        <button
          type="button"
          disabled={!prediction}
          onClick={() => setHasRun(true)}
          style={controlChip(isLight, Boolean(prediction), !prediction)}
        >
          Run graph
        </button>
      </div>

      <LinearGraph experiment={experiment} value={value} hasRun={hasRun} isLight={isLight} clipId={clipId} />

      {hasRun ? (
        <div style={{ marginTop: '12px' }} data-quantora-study-lab-step="observe-explain" aria-live="polite">
          <div style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: ink, marginBottom: '6px' }}>
            4 · Observe
          </div>
          <p style={{ margin: '0 0 8px', fontSize: '0.92rem', lineHeight: 1.45 }}>{observation}</p>
          <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.45 }}>
            <strong>5 · Explain:</strong> {spec.explain}
          </p>
        </div>
      ) : null}
    </div>
  );
}
