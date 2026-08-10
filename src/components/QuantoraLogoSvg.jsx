import React from 'react';

/**
 * QuantoraIconSvg: 100% Crisp Vector SVG Logo Icon
 * Bold, strong gold ring with a glowing gradient, matching the ambitious vision.
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
        filter: isDark ? 'drop-shadow(0 0 16px rgba(249, 115, 22, 0.7))' : 'drop-shadow(0 4px 12px rgba(234, 88, 12, 0.4))',
        flexShrink: 0,
        overflow: 'visible'
      }}
    >
      <defs>
        <linearGradient id="qPremiumGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde047" />    {/* Yellow */}
          <stop offset="35%" stopColor="#f59e0b" />   {/* Gold */}
          <stop offset="70%" stopColor="#f97316" />   {/* Orange */}
          <stop offset="100%" stopColor="#ea580c" />  {/* Deep Orange */}
        </linearGradient>
      </defs>

      {/* Main Outer Q Ring - Strong & Bold */}
      <circle
        cx="44"
        cy="44"
        r="34"
        stroke="url(#qPremiumGradient)"
        strokeWidth="10"
        fill="none"
      />

      {/* Q Diagonal Tail */}
      <path
        d="M60 60 L86 86"
        stroke="url(#qPremiumGradient)"
        strokeWidth="10"
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
