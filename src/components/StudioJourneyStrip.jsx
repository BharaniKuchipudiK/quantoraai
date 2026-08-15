import React from 'react';
import { CheckCircle2, Circle, Workflow } from 'lucide-react';
import { normalizeJourneyStage } from '../lib/build-journey.js';

const LANES = [
  { id: 'captured', label: 'Captured' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

/**
 * Slim 3-step progress for the active session — links to Build Journey.
 */
export default function StudioJourneyStrip({
  sessionId,
  dreamNodes = [],
  isLight,
  onOpenJourney,
}) {
  const node = dreamNodes.find((n) => n.sessionId === sessionId);
  const stage = normalizeJourneyStage(node?.stage || 'captured');
  const stageIndex = LANES.findIndex((l) => l.id === stage);

  return (
    <div
      className="studio-journey-strip"
      style={{
        margin: '0 18px 4px',
        padding: '4px 10px',
        borderRadius: '10px',
        border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.08)',
        background: isLight ? '#fff' : 'rgba(15, 23, 42, 0.4)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap',
      }}
    >
      <button
        type="button"
        onClick={onOpenJourney}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: isLight ? '#0284c7' : '#38bdf8',
          fontSize: '0.72rem',
          fontWeight: 700,
        }}
      >
        <Workflow size={13} />
        Build Journey
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
        {LANES.map((lane, index) => {
          const isPast = index < stageIndex;
          const isCurrent = index === stageIndex;
          const Icon = isPast || (isCurrent && stage === 'done') ? CheckCircle2 : Circle;
          const color = isPast || (isCurrent && stage === 'done')
            ? '#10b981'
            : isCurrent
              ? '#0284c7'
              : (isLight ? '#94a3b8' : '#64748b');

          return (
            <React.Fragment key={lane.id}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.68rem',
                  fontWeight: isCurrent ? 700 : 500,
                  color: isCurrent ? (isLight ? '#0f172a' : '#fff') : (isLight ? '#64748b' : '#94a3b8'),
                  whiteSpace: 'nowrap',
                }}
                title={node?.title || lane.label}
              >
                <Icon size={12} color={color} />
                {lane.label}
              </div>
              {index < LANES.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: '2px',
                    minWidth: '12px',
                    maxWidth: '32px',
                    borderRadius: '1px',
                    background: index < stageIndex ? '#10b98155' : (isLight ? '#e2e8f0' : 'rgba(255,255,255,0.1)'),
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {node?.title && (
        <span
          style={{
            fontSize: '0.68rem',
            color: isLight ? '#64748b' : '#94a3b8',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '140px',
          }}
          title={node.title}
        >
          {node.title}
        </span>
      )}
    </div>
  );
}
