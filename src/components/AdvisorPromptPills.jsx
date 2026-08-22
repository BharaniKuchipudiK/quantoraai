import React, { useState } from 'react';
import { X } from 'lucide-react';
import { studyLessonAsk, studyQuizAsk } from '../lib/study-learning-resources.js';
import { studyMiniPracticeAsk, studyRealWorldAsk, studyScheduleAsk } from '../lib/study-practice-desk.js';
import {
  travelAttractionsAsk,
  travelFlightsAsk,
  travelHotelsAsk,
  travelItineraryAsk,
} from '../lib/travel-advisor-asks.js';

/**
 * Cursor-style chips above the prompt. Each can be dismissed with X.
 * Travel and Study catalogs stay separate.
 */
export default function AdvisorPromptPills({
  domain,
  topic = '',
  onSend,
  isLight,
  textColor,
}) {
  const [dismissed, setDismissed] = useState(() => new Set());
  if (domain !== 'travel' && domain !== 'education') return null;

  const items = domain === 'education'
    ? [
      { id: 'explain', label: 'Explain', text: studyLessonAsk(topic || "this idea") },
      { id: 'practise', label: 'Practise', text: studyMiniPracticeAsk(topic || "this idea") },
      { id: 'plan', label: 'Plan', text: studyScheduleAsk(topic || "this idea") },
      { id: 'review', label: 'Review', text: studyQuizAsk(topic || "this idea") },
      { id: 'real-world', label: 'Real world', text: studyRealWorldAsk(topic || "this idea") },
    ]
    : [
      { id: 'flights', label: 'Flights', text: travelFlightsAsk() },
      { id: 'hotels', label: 'Hotels', text: travelHotelsAsk() },
      { id: 'attractions', label: 'Attractions', text: travelAttractionsAsk() },
      { id: 'itineraries', label: 'Itineraries', text: travelItineraryAsk() },
    ];

  const visible = items.filter((item) => !dismissed.has(item.id));
  if (!visible.length) return null;

  return (
    <div
      data-quantora-advisor-pills={domain}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        margin: '0 8px 10px',
      }}
    >
      {visible.map((item) => (
        <span
          key={item.id}
          data-quantora-advisor-pill={item.id}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
            border: isLight ? '1px solid #e4e4e7' : '1px solid #3f3f46',
            background: isLight ? '#ffffff' : '#18181b',
            color: textColor,
            borderRadius: '999px',
            padding: '3px 4px 3px 10px',
            fontSize: '0.75rem',
            fontWeight: 650,
          }}
        >
          <button
            type="button"
            onClick={() => onSend?.(item.text)}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              font: 'inherit',
              padding: '2px 4px',
            }}
          >
            {item.label}
          </button>
          <button
            type="button"
            title={`Hide ${item.label}`}
            aria-label={`Dismiss ${item.label}`}
            onClick={() => setDismissed((prev) => new Set(prev).add(item.id))}
            style={{
              border: 'none',
              background: 'transparent',
              color: isLight ? '#71717a' : '#a1a1aa',
              cursor: 'pointer',
              display: 'flex',
              padding: '4px',
              borderRadius: '999px',
            }}
          >
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}
