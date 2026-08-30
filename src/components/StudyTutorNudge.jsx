import React from 'react';

function WaveArt({ ink, paper }) {
  return (
    <>
      <path d="M18 31c1.7-7.2 2.8-13.7 4.2-19.4.3-1.4 1.6-2.2 2.8-1.9 1.2.3 1.9 1.4 1.6 2.7l-1.4 6.2 2.4-8.3c.4-1.4 1.8-2.1 3-1.7 1.2.4 1.8 1.7 1.4 3l-2 7 2.4-6.6c.5-1.3 1.9-1.9 3.1-1.4 1.2.5 1.7 1.9 1.2 3.2l-2.3 6.5 1.8-4.2c.6-1.3 2-1.8 3.2-1.2 1.2.6 1.6 2 .9 3.3l-4.3 8.5c-2.5 5-6.3 8.5-11 8.5-4.6 0-7.8-2.5-8.6-7.1Z" fill={paper} stroke={ink} strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M14 13c-2.6 1.2-4.5 3.3-5.4 6" stroke={ink} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 7c-3.8 1.5-6.8 4.5-8.2 8.1" stroke={ink} strokeWidth="1.4" strokeLinecap="round" strokeDasharray="3 2" />
    </>
  );
}

function BookArt({ ink, paper }) {
  return (
    <>
      <path d="M7 13.5c7.4-.5 12.4 1.3 16 4.8v19.2c-3.8-3-8.8-4.4-16-3.8V13.5Z" fill={paper} stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M41 13.5c-7.4-.5-12.4 1.3-16 4.8v19.2c3.8-3 8.8-4.4 16-3.8V13.5Z" fill={paper} stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 20c3.8-.1 6.7.7 9 2.6M12 25c3.7 0 6.7.8 9 2.6M36 20c-3.8-.1-6.7.7-9 2.6M36 25c-3.7 0-6.7.8-9 2.6" stroke={ink} strokeWidth="1.7" strokeLinecap="round" />
    </>
  );
}

function PencilArt({ ink, paper }) {
  return (
    <>
      <rect x="8" y="10" width="26" height="30" rx="6" fill={paper} stroke={ink} strokeWidth="1.8" />
      <path d="M13 17h15M13 23h12M13 29h9" stroke={ink} strokeWidth="1.6" strokeLinecap="round" strokeDasharray="8 2" />
      <path d="m29.5 34.5 9.8-9.8 4 4-9.8 9.8-5.5 1.5 1.5-5.5Z" fill={paper} stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m39.3 24.7 2.1-2.1a1.8 1.8 0 0 1 2.6 0l1.4 1.4a1.8 1.8 0 0 1 0 2.6l-2.1 2.1" fill={paper} stroke={ink} strokeWidth="1.8" />
    </>
  );
}

function SparkArt({ ink, paper }) {
  return (
    <>
      <circle cx="24" cy="24" r="15" fill={paper} stroke={ink} strokeWidth="1.5" />
      <path d="M24 10.5 27 20l9.5 3-9.5 3-3 9.5-3-9.5-9.5-3 9.5-3 3-9.5Z" fill={ink} />
      <path d="m37.5 8 .9 3 .1.1 3 .9-3 .9-.1.1-.9 3-.9-3-.1-.1-3-.9 3-.9-3-.1-.1Z" fill={ink} />
    </>
  );
}

function MagnifyArt({ ink, paper }) {
  return (
    <>
      <circle cx="21" cy="21" r="11.5" fill={paper} stroke={ink} strokeWidth="2" />
      <path d="m29.5 29.5 9 9" stroke={ink} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M16.5 19.5c1.5-2.6 4.6-3.7 7.4-2.6" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
    </>
  );
}

function IdeaArt({ ink, paper }) {
  return (
    <>
      <path d="M24 8.5c-7.2 0-12.7 5.2-12.7 11.7 0 4.7 2.7 7.6 5.7 9.9 1.3 1 2 2 2.2 3.5h9.6c.2-1.5.9-2.5 2.2-3.5 3-2.3 5.7-5.2 5.7-9.9C36.7 13.7 31.2 8.5 24 8.5Z" fill={paper} stroke={ink} strokeWidth="1.8" />
      <path d="M20 38h8M21 42h6" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
      <path d="m24 15 2 4 4.4.6-3.2 3.1.8 4.4-4-2.1-4 2.1.8-4.4-3.2-3.1 4.4-.6 2-4Z" fill={ink} />
    </>
  );
}

const ART = {
  wave: WaveArt,
  book: BookArt,
  pencil: PencilArt,
  spark: SparkArt,
  magnify: MagnifyArt,
  idea: IdeaArt,
};

export default function StudyTutorNudge({ kind = 'book', label = 'Let’s unpack it' }) {
  const Art = ART[kind] || ART.book;
  const ink = 'var(--q-ink)';
  const paper = 'var(--q-paper)';

  return (
    <div
      data-quantora-study-nudge={kind}
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        margin: '0 0 10px',
        color: 'var(--q-ink)',
        fontFamily: 'var(--font-body)',
        fontSize: '0.72rem',
        fontWeight: 650,
        letterSpacing: '0.01em',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '13px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--q-paper)',
          border: '1px solid var(--q-border)',
        }}
      >
        <svg viewBox="0 0 48 48" width="32" height="32" fill="none">
          <Art ink={ink} paper={paper} />
        </svg>
      </span>
      <span>{label}</span>
    </div>
  );
}
