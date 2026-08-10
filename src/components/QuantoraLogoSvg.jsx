import React from 'react';

// Masterpiece-Grade Defs for Quantora Brand Identity
const QuantoraLogoDefs = () => (
  <defs>
    {/* Pure Gold Flame Gradient for the Q Emblem */}
    <linearGradient id="qEmblemGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#f59e0b" />
      <stop offset="50%" stopColor="#fbbf24" />
      <stop offset="100%" stopColor="#d97706" />
    </linearGradient>
  </defs>
);

/**
 * QuantoraBrandText: Clean Orbitron Typography
 * - Geometric characters: Q U Λ N T O R Λ
 * - 'O' is a glowing golden ring letter
 * - Dark theme: Q, U, Λ, N, T, R, Λ in solid WHITE (#ffffff). O in GOLD (#fbbf24)
 * - Light theme: Q, U, Λ, N, T, R, Λ in solid BLACK (#000000). O in GOLD (#d97706)
 * - Tagline: "PROMPT TO ACTION"
 */
export function QuantoraBrandText({ isDark = true, fontSize = '1.5rem', tagline = 'PROMPT TO ACTION' }) {
  const mainTextColor = isDark ? '#ffffff' : '#000000';
  const oColor = isDark ? '#fbbf24' : '#d97706';
  const taglineColor = isDark ? '#f59e0b' : '#d97706';

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div style={{
        fontFamily: "'Orbitron', 'Space Grotesk', 'Syne', sans-serif",
        fontWeight: '700',
        fontSize: fontSize,
        letterSpacing: '0.28em',
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        textTransform: 'uppercase',
        userSelect: 'none'
      }}>
        <span style={{ color: mainTextColor }}>Q</span>
        <span style={{ color: mainTextColor }}>U</span>
        <span style={{ color: mainTextColor }}>Λ</span>
        <span style={{ color: mainTextColor }}>N</span>
        <span style={{ color: mainTextColor }}>T</span>
        
        {/* 'O' in Gold - styled as a glowing golden ring letter */}
        <span style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: oColor,
          margin: '0 0.05em',
          fontWeight: '800',
          textShadow: isDark 
            ? '0 0 14px rgba(251, 191, 36, 0.85), 0 0 4px rgba(245, 158, 11, 0.7)' 
            : '0 0 6px rgba(217, 119, 6, 0.4)'
        }}>
          O
        </span>

        <span style={{ color: mainTextColor }}>R</span>
        <span style={{ color: mainTextColor }}>Λ</span>
      </div>

      {tagline && (
        <span style={{
          fontSize: '0.52em',
          color: taglineColor,
          fontWeight: '700',
          letterSpacing: '0.42em',
          textTransform: 'uppercase',
          marginTop: '8px',
          opacity: 0.95,
          fontFamily: "'Orbitron', 'Space Grotesk', sans-serif"
        }}>
          {tagline}
        </span>
      )}
    </div>
  );
}

/**
 * QuantoraEmblemSvg: Clean Main Q Symbol
 * - Clean interior: no background clutter or floating dots
 * - Ring & Diagonal Leg Slash are uniform 7px stroke
 * - Pure gold flame styling
 */
export function QuantoraEmblemSvg({ size = 180, isDark = true, showText = true, tagline = "PROMPT TO ACTION" }) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      <img 
        src="/quantora-logo-transparent.png" 
        alt="Quantora Emblem" 
        style={{
          height: `${size}px`,
          width: 'auto',
          maxWidth: '100%',
          objectFit: 'contain',
          filter: isDark ? 'drop-shadow(0 0 24px rgba(245, 158, 11, 0.45))' : 'none'
        }} 
        onError={(e) => {
          e.target.onerror = null;
          e.target.src = '/quantora-logo.png';
        }}
      />
    </div>
  );
}

/**
 * QuantoraFullLogoSvg: Header Logo (Icon + Text)
 */
export function QuantoraFullLogoSvg({ height = 40, isDark = true, tagline = "PROMPT TO ACTION" }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
      <img 
        src="/quantora-logo-transparent.png" 
        alt="Quantora Logo" 
        style={{
          height: `${height}px`,
          width: 'auto',
          objectFit: 'contain',
          filter: isDark ? 'drop-shadow(0 0 12px rgba(245, 158, 11, 0.35))' : 'none'
        }} 
        onError={(e) => {
          e.target.onerror = null;
          e.target.src = '/quantora-logo.png';
        }}
      />
    </div>
  );
}
