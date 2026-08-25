import React from 'react';
import './QuantoraLogo.css';

/**
 * A regular capital Q — same face as the wordmark, no custom tail.
 */
export function QuantoraIconSvg({ size = 28, isDark = true }) {
  return (
    <span
      className={`quantora-icon${isDark ? ' is-dark' : ' is-light'}`}
      style={{ fontSize: size }}
      aria-hidden="true"
    >
      Q
    </span>
  );
}

function OrangeO() {
  return <span className="quantora-o" aria-hidden="true" />;
}

export function QuantoraBrandText({
  isDark = true,
  fontSize = '1.25rem',
  tagline = 'SHAPING TOMORROW',
  align = 'left',
}) {
  const letter = isDark ? '#ffffff' : '#0a0a0a';
  const parsed = typeof fontSize === 'number' ? fontSize : parseFloat(fontSize);
  const oSize = Number.isFinite(parsed) ? parsed : 18;

  return (
    <div className={`quantora-wordmark${align === 'center' ? ' is-center' : ''}${isDark ? ' is-dark' : ''}`}>
      <div className="quantora-name" style={{ fontSize, color: letter }}>
        QUANT
        <OrangeO />
        RΛ
      </div>
      {tagline ? (
        <span
          className="quantora-tagline"
          style={{ fontSize: `${Math.max(9, Math.round(oSize * 0.48))}px` }}
        >
          {tagline}
        </span>
      ) : null}
    </div>
  );
}

export function QuantoraEmblemSvg({ size = 220, isDark = true, showText = true, tagline = 'SHAPING TOMORROW' }) {
  return (
    <div className="quantora-emblem">
      <QuantoraIconSvg size={size} isDark={isDark} />
      {showText && (
        <QuantoraBrandText isDark={isDark} fontSize={`${Math.max(28, size * 0.28)}px`} tagline={tagline} align="center" />
      )}
    </div>
  );
}

export function QuantoraFullLogoSvg({ height = 36, isDark = true, tagline = 'SHAPING TOMORROW' }) {
  const nameSize = Math.max(15, height * 0.5);

  return (
    <div className="quantora-lockup">
      <QuantoraIconSvg size={nameSize} isDark={isDark} />
      <QuantoraBrandText isDark={isDark} fontSize={`${nameSize}px`} tagline={tagline} align="left" />
    </div>
  );
}
