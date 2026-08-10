import React from 'react';

/**
 * QuantoraIconSvg: 100% Crisp Vector SVG Logo Icon
 * Elegant thin-line Q with a glowing gradient, exactly matching the premium style.
 */
export function QuantoraIconSvg({ size = 36, isDark = true }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        filter: isDark ? 'drop-shadow(0 0 12px rgba(249, 115, 22, 0.6))' : 'drop-shadow(0 2px 8px rgba(234, 88, 12, 0.3))',
        flexShrink: 0,
        overflow: 'visible'
      }}
    >
      <defs>
        <linearGradient id="qPremiumGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde047" />    {/* Yellow */}
          <stop offset="50%" stopColor="#f97316" />   {/* Orange */}
          <stop offset="100%" stopColor="#ea580c" />  {/* Deep Orange */}
        </linearGradient>
      </defs>

      {/* Main Outer Q Ring - Thin & Elegant */}
      <circle
        cx="44"
        cy="44"
        r="36"
        stroke="url(#qPremiumGradient)"
        strokeWidth="2.5"
        fill="none"
      />

      {/* Q Diagonal Tail */}
      <path
        d="M62 62 L88 88"
        stroke="url(#qPremiumGradient)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * QuantoraBrandText: Clean, High-Contrast Typography
 * Matches the elegant wide tracking style from the premium logo.
 */
export function QuantoraBrandText({ isDark = true, fontSize = '1.25rem', tagline = 'PROMPT TO ACTION' }) {
  const mainTextColor = isDark ? '#ffffff' : '#0f172a';
  const taglineColor = isDark ? '#f97316' : '#ea580c';

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', textAlign: 'center', alignItems: 'center', lineHeight: 1.15 }}>
      <div style={{
        fontFamily: "'Syncopate', sans-serif",
        fontWeight: '700', /* Syncopate needs bold to look right */
        fontSize: fontSize,
        letterSpacing: '0.15em',
        color: mainTextColor,
        textTransform: 'uppercase',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        whiteSpace: 'nowrap'
      }}>
        QUANT<span style={{ 
          color: 'transparent',
          background: 'linear-gradient(135deg, #fde047 0%, #f97316 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontWeight: '500'
        }}>O</span>RΛ
      </div>
      {tagline && (
        <span style={{
          fontSize: '0.35em',
          color: taglineColor,
          fontWeight: '600',
          letterSpacing: '0.4em',
          textTransform: 'uppercase',
          marginTop: '12px',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          whiteSpace: 'nowrap',
          opacity: 0.9
        }}>
          {tagline}
        </span>
      )}
    </div>
  );
}

/**
 * QuantoraEmblemSvg: Centered Hero Symbol
 * Completely recreated in scalable SVG to eliminate background boxes.
 */
export function QuantoraEmblemSvg({ size = 220, isDark = true, showText = true, tagline = "PROMPT TO ACTION" }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '24px', width: '100%' }}>
      <QuantoraIconSvg size={size} isDark={isDark} />
      {showText && (
        <QuantoraBrandText isDark={isDark} fontSize={`${Math.max(28, size * 0.28)}px`} tagline={tagline} />
      )}
    </div>
  );
}

/**
 * QuantoraFullLogoSvg: Horizontal Logo for Top Header Navigation
 */
export function QuantoraFullLogoSvg({ height = 36, isDark = true, tagline = "PROMPT TO ACTION" }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '14px' }}>
      <QuantoraIconSvg size={height} isDark={isDark} />
      <QuantoraBrandText isDark={isDark} fontSize={`${Math.max(16, height * 0.6)}px`} tagline={tagline} />
    </div>
  );
}
