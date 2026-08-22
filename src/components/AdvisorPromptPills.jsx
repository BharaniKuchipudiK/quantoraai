import React from 'react';
import { studyLessonAsk, studyQuizAsk } from '../lib/study-learning-resources.js';
import { studyMiniPracticeAsk, studyRealWorldAsk, studyScheduleAsk } from '../lib/study-practice-desk.js';

/**
 * One quiet row above the prompt. Not a card. Not a second page.
 */
export default function AdvisorPromptPills({
  domain,
  topic = '',
  onSend,
  isLight,
  textColor,
}) {
  if (domain !== 'travel' && domain !== 'education') return null;

  const items = domain === 'education'
    ? [
      { label: 'Explain', text: studyLessonAsk(topic || "this idea") },
      { label: 'Practise', text: studyMiniPracticeAsk(topic || "this idea") },
      { label: 'Plan', text: studyScheduleAsk(topic || "this idea") },
      { label: 'Review', text: studyQuizAsk(topic || "this idea") },
      { label: 'Real world', text: studyRealWorldAsk(topic || "this idea") },
    ]
    : [
      { label: 'Flights', text: 'Help me choose live flights. I will give from-airport, to-airport, and dates.' },
      { label: 'Hotels', text: 'Help me shortlist places to stay. I will name the city.' },
      { label: 'Attractions', text: 'Suggest attractions that fit this trip. Keep it in chat — not a website.' },
      { label: 'Itineraries', text: 'Draft a balanced day-by-day itinerary for this trip.' },
    ];

  return (
    <div
      data-quantora-advisor-pills={domain}
      style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={() => onSend?.(item.text)}
          style={{
            border: isLight ? '1px solid #e4e4e7' : '1px solid #3f3f46',
            background: 'transparent',
            color: textColor,
            borderRadius: '999px',
            padding: '4px 10px',
            fontSize: '0.72rem',
            fontWeight: 650,
            cursor: 'pointer',
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
