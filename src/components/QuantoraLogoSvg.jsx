import React from 'react';

/**
 * QuantoraBrandText: Clean, High-Contrast Typography
 * - Uses system typography stack or Google Fonts loaded in index.html
 * - In Dark Mode: Main text in solid crisp White (#ffffff), 'A' or accent in vibrant Orange (#f97316)
 * - In Light Mode: Main text in solid Slate Black (#0f172a), 'A' or accent in vibrant Orange (#ea580c)
 * - Tagline: "PROMPT TO ACTION"
 */
export function QuantoraBrandText({ isDark = true, fontSize = '1.25rem', tagline = 'PROMPT TO ACTION' }) {
  const mainTextColor = isDark ? '#ffffff' : '#0f172a';
  const taglineColor = isDark ? '#f97316' : '#ea580c';

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', textAlign: 'left', lineHeight: 1.15 }}>
      <div style={{
        fontFamily: "'Orbitron', 'Plus Jakarta Sans', 'Outfit', sans-serif",
        fontWeight: '800',
        fontSize: fontSize,
        letterSpacing: '0.1em',
        color: mainTextColor,
        textTransform: 'uppercase',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        whiteSpace: 'nowrap'
      }}>
        QUANT<span style={{ color: '#f97316' }}>O</span>RA
      </div>
      {tagline && (
        <span style={{
          fontSize: '0.45em',
          color: taglineColor,
          fontWeight: '700',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          marginTop: '2px',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          whiteSpace: 'nowrap'
        }}>
          {tagline}
        </span>
      )}
    </div>
  );
}

/**
 * QuantoraIconSvg: 100% Crisp Vector SVG Logo Icon
 * - Gold to Orange to Rose Flame Ring with Q Diagonal Slash
 * - Works 100% reliably in all browsers without external image loading issues
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
        filter: isDark ? 'drop-shadow(0 0 10px rgba(249, 115, 22, 0.45))' : 'drop-shadow(0 2px 6px rgba(234, 88, 12, 0.25))',
        flexShrink: 0
      }}
    >
      <defs>
        <linearGradient id="qLogoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="45%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#e11d48" />
        </linearGradient>
      </defs>

      {/* Main Outer Q Ring */}
      <circle
        cx="48"
        cy="48"
        r="32"
        stroke="url(#qLogoGradient)"
        strokeWidth="10"
        fill="none"
      />

      {/* Q Diagonal Tail / Leg */}
      <path
        d="M60 60 L82 82"
        stroke="url(#qLogoGradient)"
        strokeWidth="10"
        strokeLinecap="round"
      />

      {/* Inner Sparkle Accent */}
      <circle
        cx="48"
        cy="48"
        r="6"
        fill="url(#qLogoGradient)"
      />
    </svg>
  );
}

/**
 * QuantoraEmblemSvg: Centered Hero Symbol (Icon + Centered Brand Text)
 */
export function QuantoraEmblemSvg({ size = 100, isDark = true, showText = true, tagline = "PROMPT TO ACTION" }) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '14px' }}>
      <QuantoraIconSvg size={size} isDark={isDark} />
      {showText && (
        <QuantoraBrandText isDark={isDark} fontSize={`${Math.max(22, size * 0.24)}px`} tagline={tagline} />
      )}
    </div>
  );
}

/**
 * QuantoraFullLogoSvg: Horizontal Logo for Top Header Navigation (Icon + Text)
 */
export function QuantoraFullLogoSvg({ height = 36, isDark = true, tagline = "PROMPT TO ACTION" }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
      <QuantoraIconSvg size={height} isDark={isDark} />
      <QuantoraBrandText isDark={isDark} fontSize={`${Math.max(15, height * 0.5)}px`} tagline={tagline} />
    </div>
  );
}
