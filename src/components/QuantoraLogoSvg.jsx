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
        style={{ filter: 'drop-shadow(0 0 15px rgba(251, 191, 36, 0.6))' }}
      >
        <g style={{ transformOrigin: '100px 100px' }}>
          <animateTransform
            attributeName="transform"
            type="scale"
            values="1; 1.05; 1"
            dur="4s"
            repeatCount="indefinite"
            additive="sum"
          />
          <defs>
            <linearGradient id="goldenPhoenixGlow" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ea580c">
                <animate attributeName="stop-color" values="#ea580c;#dc2626;#ea580c" dur="3s" repeatCount="indefinite" />
              </stop>
              <stop offset="50%" stopColor="#f59e0b">
                <animate attributeName="stop-color" values="#f59e0b;#ea580c;#f59e0b" dur="3s" repeatCount="indefinite" />
              </stop>
              <stop offset="100%" stopColor="#fef08a">
                <animate attributeName="stop-color" values="#fef08a;#f59e0b;#fef08a" dur="3s" repeatCount="indefinite" />
              </stop>
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
            strokeDasharray="415"
            strokeDashoffset="0"
          >
            <animate attributeName="stroke-dashoffset" values="415;0" dur="8s" repeatCount="indefinite" />
          </circle>

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
        </g>
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
      <svg
        width={height}
        height={height}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.5))' }}
      >
        <g style={{ transformOrigin: '100px 100px' }}>
          <animateTransform
            attributeName="transform"
            type="scale"
            values="1; 1.05; 1"
            dur="4s"
            repeatCount="indefinite"
            additive="sum"
          />
          <defs>
            <linearGradient id="navGoldenGlow" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ea580c">
                <animate attributeName="stop-color" values="#ea580c;#dc2626;#ea580c" dur="3s" repeatCount="indefinite" />
              </stop>
              <stop offset="50%" stopColor="#f59e0b">
                <animate attributeName="stop-color" values="#f59e0b;#ea580c;#f59e0b" dur="3s" repeatCount="indefinite" />
              </stop>
              <stop offset="100%" stopColor="#fef08a">
                <animate attributeName="stop-color" values="#fef08a;#f59e0b;#fef08a" dur="3s" repeatCount="indefinite" />
              </stop>
            </linearGradient>
          </defs>
          <circle
            cx="100"
            cy="90"
            r="66"
            stroke="url(#navGoldenGlow)"
            strokeWidth="12"
            fill="none"
            strokeDasharray="415"
            strokeDashoffset="0"
          >
             <animate attributeName="stroke-dashoffset" values="415;0" dur="8s" repeatCount="indefinite" />
          </circle>
          <line
            x1="124"
            y1="114"
            x2="168"
            y2="158"
            stroke="url(#navGoldenGlow)"
            strokeWidth="14"
            strokeLinecap="round"
          />
        </g>
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
