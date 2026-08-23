import React from 'react';

function Frame({ isLight, children }) {
  return (
    <svg viewBox="0 0 360 200" width="100%" height="100%" role="img" aria-hidden="true">
      <rect width="360" height="200" rx="22" fill={isLight ? '#fff7ed' : '#1c1917'} />
      <rect x="10" y="10" width="340" height="180" rx="16" fill={isLight ? '#ffedd5' : '#292524'} />
      {children}
    </svg>
  );
}

/** One scene language: the caption is the lesson. Art is not a subject pack. */
function PictureArt({ isLight }) {
  const ink = isLight ? '#9a3412' : '#fdba74';
  const ground = isLight ? '#c2410c' : '#ea580c';
  return (
    <Frame isLight={isLight}>
      <rect x="70" y="60" width="90" height="80" rx="12" fill={ground} />
      <circle cx="230" cy="100" r="36" fill={ink} />
      <rect x="150" y="130" width="60" height="18" rx="6" fill={isLight ? '#9a3412' : '#fed7aa'} />
    </Frame>
  );
}

export default function StudyPicture({ caption = '', isLight = false }) {
  const label = String(caption || '').trim();
  if (!label) return null;
  return (
    <figure
      data-quantora-study-picture="caption"
      style={{
        margin: '0 0 16px',
        maxWidth: '420px',
      }}
    >
      <div style={{
        borderRadius: '20px',
        overflow: 'hidden',
        border: isLight ? '1px solid #fdba74' : '1px solid rgba(251,146,60,0.35)',
      }}>
        <PictureArt isLight={isLight} />
      </div>
      <figcaption style={{
        marginTop: '8px',
        fontSize: '0.85rem',
        lineHeight: 1.4,
        fontFamily: "var(--font-study-body), sans-serif",
        color: isLight ? '#9a3412' : '#fdba74',
      }}>
        {label}
      </figcaption>
    </figure>
  );
}
