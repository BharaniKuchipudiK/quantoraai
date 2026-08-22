import React from 'react';
import { isCannedProjectDescription } from '../lib/studio-mission.js';

/**
 * Visible world model — what this session is building. Not an IDE, not notes chrome.
 */
export default function StudioMissionCard({ mission, isLight, textColor, subtextColor }) {
  if (!mission?.goal && !mission?.next) return null;

  return (
    <div
      data-quantora-mission="true"
      style={{
        margin: '0 8px 10px',
        padding: '10px 14px',
        borderRadius: '14px',
        background: isLight ? '#f8fafc' : 'rgba(15, 23, 42, 0.65)',
        border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {mission.goal ? (
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: textColor, lineHeight: 1.4 }}>
          {mission.lead || 'Building'}: {mission.goal}
        </div>
      ) : null}
      {mission.understanding && !isCannedProjectDescription(mission.understanding) ? (
        <div style={{ fontSize: '0.75rem', color: subtextColor, marginTop: '4px', lineHeight: 1.4 }}>
          {mission.understanding}
        </div>
      ) : null}
      {mission.next ? (
        <div style={{ fontSize: '0.75rem', color: isLight ? '#c2410c' : '#fdba74', marginTop: '6px', lineHeight: 1.4, fontWeight: 600 }}>
          Next: {mission.next}
        </div>
      ) : null}
    </div>
  );
}
