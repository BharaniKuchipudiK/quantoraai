import React from 'react';
import { studyPictureCaption } from '../lib/study-pictures.js';

function Frame({ isLight, children }) {
  return (
    <svg viewBox="0 0 360 200" width="100%" height="100%" role="img" aria-hidden="true">
      <rect width="360" height="200" rx="22" fill={isLight ? '#fff7ed' : '#1c1917'} />
      <rect x="10" y="10" width="340" height="180" rx="16" fill={isLight ? '#ffedd5' : '#292524'} />
      {children}
    </svg>
  );
}

function PictureArt({ kind, isLight }) {
  const ink = isLight ? '#9a3412' : '#fdba74';
  const ground = isLight ? '#c2410c' : '#ea580c';
  if (kind === 'book-table') {
    return (
      <Frame isLight={isLight}>
        <rect x="48" y="128" width="264" height="18" rx="4" fill={ground} />
        <rect x="140" y="88" width="80" height="40" rx="4" fill={ink} />
        <path d="M180 86 V54" stroke={ground} strokeWidth="4" />
        <path d="M180 148 V176" stroke={ground} strokeWidth="4" />
        <polygon points="180,48 172,62 188,62" fill={ground} />
        <polygon points="180,182 172,168 188,168" fill={ground} />
      </Frame>
    );
  }
  if (kind === 'truck-car') {
    return (
      <Frame isLight={isLight}>
        <rect x="40" y="110" width="120" height="44" rx="8" fill={ground} />
        <rect x="210" y="124" width="88" height="30" rx="8" fill={ink} />
        <circle cx="70" cy="158" r="10" fill={isLight ? '#1c1917' : '#fed7aa'} />
        <circle cx="140" cy="158" r="10" fill={isLight ? '#1c1917' : '#fed7aa'} />
        <circle cx="232" cy="158" r="9" fill={isLight ? '#1c1917' : '#fed7aa'} />
        <circle cx="280" cy="158" r="9" fill={isLight ? '#1c1917' : '#fed7aa'} />
        <path d="M168 128 H202" stroke={ink} strokeWidth="4" />
      </Frame>
    );
  }
  if (kind === 'canoe-dock') {
    return (
      <Frame isLight={isLight}>
        <rect x="200" y="70" width="110" height="90" rx="6" fill={ground} />
        <ellipse cx="120" cy="148" rx="70" ry="18" fill={ink} opacity="0.85" />
        <circle cx="132" cy="112" r="16" fill={isLight ? '#9a3412' : '#fed7aa'} />
      </Frame>
    );
  }
  if (kind === 'rocket') {
    return (
      <Frame isLight={isLight}>
        <polygon points="180,36 210,120 150,120" fill={ground} />
        <rect x="162" y="118" width="36" height="28" fill={ink} />
        <polygon points="168,168 180,148 192,168" fill="#fb923c" />
        <polygon points="174,188 180,168 186,188" fill="#f97316" />
      </Frame>
    );
  }
  if (kind === 'force-arrows') {
    return (
      <Frame isLight={isLight}>
        <circle cx="180" cy="100" r="28" fill={ground} />
        <path d="M80 100 H140" stroke={ink} strokeWidth="6" />
        <polygon points="148,100 132,90 132,110" fill={ink} />
        <path d="M220 100 H280" stroke={ink} strokeWidth="6" />
        <polygon points="288,100 272,90 272,110" fill={ink} />
      </Frame>
    );
  }
  if (kind === 'ice-puck') {
    return (
      <Frame isLight={isLight}>
        <rect x="30" y="120" width="300" height="40" rx="8" fill={isLight ? '#e0f2fe' : '#164e63'} />
        <ellipse cx="200" cy="128" rx="28" ry="10" fill={ground} />
        <path d="M120 128 H168" stroke={ink} strokeWidth="4" />
        <polygon points="176,128 160,120 160,136" fill={ink} />
      </Frame>
    );
  }
  if (kind === 'apple-tree') {
    return (
      <Frame isLight={isLight}>
        <rect x="150" y="40" width="18" height="110" fill={ground} />
        <circle cx="200" cy="78" r="36" fill="#16a34a" />
        <circle cx="228" cy="148" r="14" fill="#dc2626" />
        <circle cx="86" cy="150" r="22" fill={ink} opacity="0.9" />
      </Frame>
    );
  }
  if (kind === 'mystery-box') {
    return (
      <Frame isLight={isLight}>
        <rect x="120" y="58" width="120" height="96" rx="10" fill={ground} />
        <path d="M120 82 H240" stroke={ink} strokeWidth="4" />
        <text x="180" y="124" textAnchor="middle" fill={isLight ? '#fff7ed' : '#1c1917'} fontSize="42" fontWeight="700" fontFamily="Georgia, serif">x</text>
      </Frame>
    );
  }
  if (kind === 'balance-scale') {
    return (
      <Frame isLight={isLight}>
        <rect x="174" y="70" width="12" height="90" fill={ground} />
        <rect x="70" y="68" width="220" height="8" rx="4" fill={ink} />
        <rect x="64" y="76" width="70" height="36" rx="6" fill={ground} />
        <rect x="226" y="76" width="70" height="36" rx="6" fill={ground} />
        <text x="99" y="100" textAnchor="middle" fill={isLight ? '#fff7ed' : '#1c1917'} fontSize="18" fontWeight="700">x</text>
        <text x="261" y="100" textAnchor="middle" fill={isLight ? '#fff7ed' : '#1c1917'} fontSize="16" fontWeight="700">15</text>
      </Frame>
    );
  }
  if (kind === 'number-line') {
    return (
      <Frame isLight={isLight}>
        <path d="M40 110 H320" stroke={ground} strokeWidth="6" />
        <polygon points="328,110 312,100 312,120" fill={ground} />
        {[80, 140, 200, 260].map((x) => (
          <rect key={x} x={x} y="98" width="4" height="24" fill={ink} />
        ))}
        <circle cx="200" cy="110" r="12" fill={ink} />
      </Frame>
    );
  }
  return (
    <Frame isLight={isLight}>
      <rect x="70" y="60" width="90" height="80" rx="12" fill={ground} />
      <circle cx="230" cy="100" r="36" fill={ink} />
      <rect x="150" y="130" width="60" height="18" rx="6" fill={isLight ? '#9a3412' : '#fed7aa'} />
    </Frame>
  );
}

export default function StudyPicture({ kind = 'concept-card', caption = '', isLight = false }) {
  const label = studyPictureCaption(kind, caption);
  return (
    <figure
      data-quantora-study-picture={kind}
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
        <PictureArt kind={kind} isLight={isLight} />
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
