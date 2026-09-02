import React from 'react';
import { QuantoraFullLogoSvg } from './QuantoraLogoSvg';

export default function Footer({ isLight = false }) {
  const footerBg = isLight ? '#ffffff' : '#0a0a0a';
  const textColor = isLight ? '#525252' : '#a3a3a3';

  const legalLinks = ['Privacy Statement', 'Terms & Conditions', 'Cookie Policy'];

  return (
    <footer className={`app-footer${isLight ? ' is-light' : ' is-dark'}`} style={{
      background: footerBg,
      color: textColor,
      fontFamily: "'Inter', sans-serif",
      position: 'relative',
      zIndex: 10,
      borderTop: isLight ? '1px solid #e5e5e5' : '1px solid #262626',
      padding: '18px 5%',
      flexShrink: 0,
      transition: 'background 0.4s ease, color 0.4s ease, border-color 0.4s ease'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '1400px',
        margin: '0 auto',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '18px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <QuantoraFullLogoSvg height={22} isDark={!isLight} tagline="" />
          <span style={{ fontSize: '0.8rem', color: textColor }}>
            © {new Date().getFullYear()} Quantora
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', fontSize: '0.8rem', fontWeight: '500' }}>
          {legalLinks.map((link) => (
            <span
              key={link}
              style={{ cursor: 'pointer', transition: 'color 0.2s' }}
              className={isLight ? 'hover:text-slate-900' : 'hover:text-white'}
            >
              {link}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}
