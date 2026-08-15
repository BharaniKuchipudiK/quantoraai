import React from 'react';
import { QuantoraFullLogoSvg } from './QuantoraLogoSvg';

export default function Footer() {
  // Minimalistic, single-bar footer (BCG-style): brand + copyright on the left,
  // legal links on the right. Deliberately spare — the previous multi-column
  // layout was mostly non-functional placeholder links.
  const footerBg = '#000000';
  const textColor = '#a1a1aa'; // zinc-400

  const legalLinks = ['Privacy Statement', 'Terms & Conditions', 'Cookie Policy'];

  return (
    <footer className="app-footer" style={{
      background: footerBg,
      color: textColor,
      fontFamily: "'Inter', sans-serif",
      position: 'relative',
      zIndex: 10,
      borderTop: '1px solid rgba(255,255,255,0.1)',
      padding: '18px 5%',
      flexShrink: 0
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
        {/* Brand + copyright */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <QuantoraFullLogoSvg height={22} isDark={true} tagline="" />
          <span style={{ fontSize: '0.8rem', color: textColor }}>
            © {new Date().getFullYear()} Quantora
          </span>
        </div>

        {/* Legal links */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', fontSize: '0.8rem', fontWeight: '500' }}>
          {legalLinks.map((link) => (
            <span key={link} style={{ cursor: 'pointer', transition: 'color 0.2s' }} className="hover:text-white">
              {link}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}
