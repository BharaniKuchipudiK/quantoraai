import React from 'react';

export function QuantoraEmblemSvg({ size = 140, isDark = false }) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ filter: 'drop-shadow(0 0 30px rgba(249, 115, 22, 0.8))' }}
      >
        <defs>
          <linearGradient id="amberPrismGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="40%" stopColor="#fb923c" />
            <stop offset="80%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>

          <filter id="hyperGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Prism Ring */}
        <circle
          cx="100"
          cy="90"
          r="66"
          stroke="url(#amberPrismGlow)"
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
          stroke="url(#amberPrismGlow)"
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
          color: '#ea580c',
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
      <svg
        width={height}
        height={height}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ filter: 'drop-shadow(0 0 12px rgba(249, 115, 22, 0.7))' }}
      >
        <circle
          cx="100"
          cy="90"
          r="66"
          stroke="url(#navAmberGlow)"
          strokeWidth="12"
          fill="none"
        />
        <line
          x1="124"
          y1="114"
          x2="168"
          y2="158"
          stroke="url(#navAmberGlow)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="navAmberGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#fb923c" />
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
          color: '#ea580c',
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
