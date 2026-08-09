import React from 'react';

export function QuantoraEmblemSvg({ size = 140, isDark = false }) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      <style>
        {`
          @keyframes phoenixPulse {
            0% { filter: drop-shadow(0 0 15px rgba(251, 191, 36, 0.6)) hue-rotate(0deg); transform: scale(1); }
            50% { filter: drop-shadow(0 0 30px rgba(234, 88, 12, 0.9)) hue-rotate(-10deg); transform: scale(1.03); }
            100% { filter: drop-shadow(0 0 15px rgba(251, 191, 36, 0.6)) hue-rotate(0deg); transform: scale(1); }
          }
          .phoenix-anim {
            animation: phoenixPulse 3s ease-in-out infinite;
            transform-origin: center;
          }
        `}
      </style>
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="phoenix-anim"
      >
        <defs>
          <linearGradient id="goldenPhoenixGlow" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ea580c" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#fef08a" />
          </linearGradient>

          <filter id="hyperGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Prism Ring */}
        <circle
          cx="100"
          cy="90"
          r="66"
          stroke="url(#goldenPhoenixGlow)"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
          filter="url(#hyperGlow)"
        />

        {/* Diagonal Q Cut Line */}
        <line
          x1="124"
          y1="114"
          x2="168"
          y2="158"
          stroke="url(#goldenPhoenixGlow)"
          strokeWidth="12"
          strokeLinecap="round"
          filter="url(#hyperGlow)"
        />
      </svg>

      {/* Iconic High-Contrast Brand Text */}
      <div style={{
        marginTop: '12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px'
      }}>
        <span style={{
          fontSize: '1.45rem',
          fontWeight: '900',
          fontFamily: 'var(--font-heading)',
          letterSpacing: '0.12em',
          color: isDark ? '#ffffff' : '#0f172a',
          lineHeight: 1
        }}>
          QUANTORA
        </span>
        <span style={{
          fontSize: '0.74rem',
          color: '#fbbf24',
          fontWeight: '800',
          letterSpacing: '0.35em',
          textTransform: 'uppercase'
        }}>
          PROMPT TO ACTION
        </span>
      </div>
    </div>
  );
}

export function QuantoraFullLogoSvg({ height = 40, isDark = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
      <style>
        {`
          @keyframes navPhoenixPulse {
            0% { filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.5)); transform: scale(1); }
            50% { filter: drop-shadow(0 0 15px rgba(234, 88, 12, 0.8)); transform: scale(1.05); }
            100% { filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.5)); transform: scale(1); }
          }
          .nav-phoenix-anim {
            animation: navPhoenixPulse 3.5s ease-in-out infinite;
            transform-origin: center;
          }
        `}
      </style>
      <svg
        width={height}
        height={height}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="nav-phoenix-anim"
      >
        <circle
          cx="100"
          cy="90"
          r="66"
          stroke="url(#navGoldenGlow)"
          strokeWidth="12"
          fill="none"
        />
        <line
          x1="124"
          y1="114"
          x2="168"
          y2="158"
          stroke="url(#navGoldenGlow)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="navGoldenGlow" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ea580c" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#fef08a" />
          </linearGradient>
        </defs>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{
          fontSize: `${height * 0.52}px`,
          fontWeight: '800',
          fontFamily: 'var(--font-heading)',
          letterSpacing: '0.08em',
          color: isDark ? '#ffffff' : '#0f172a',
          lineHeight: 1
        }}>
          QUANTORA
        </span>
        <span style={{
          fontSize: `${height * 0.22}px`,
          color: '#fbbf24',
          fontWeight: '800',
          letterSpacing: '0.28em',
          marginTop: '2px'
        }}>
          PROMPT TO ACTION
        </span>
      </div>
    </div>
  );
}
