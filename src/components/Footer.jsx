import React from 'react';
import { QuantoraFullLogoSvg } from './QuantoraLogoSvg';
import { Linkedin, Twitter, Youtube } from 'lucide-react';

export default function Footer({ isLight, activeTab, handleTabChange }) {
  const footerBg = isLight ? '#ffffff' : '#05070f';
  const textColor = isLight ? '#475569' : '#94a3b8';
  const headingColor = isLight ? '#0f172a' : '#f8fafc';
  const borderColor = isLight ? '#e2e8f0' : 'rgba(255,255,255,0.1)';

  return (
    <footer style={{
      background: footerBg,
      borderTop: `1px solid ${borderColor}`,
      padding: '40px 24px',
      color: textColor,
      fontFamily: "'Inter', sans-serif",
      position: 'relative',
      zIndex: 10,
      transition: 'background 0.3s ease, border-color 0.3s ease'
    }}>
      <div style={{ 
        maxWidth: '1280px', 
        margin: '0 auto', 
        display: 'flex', 
        flexDirection: 'row', 
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '40px'
      }}>
        
        {/* Left Side: Logo & Disclaimer */}
        <div style={{ flex: '1 1 400px', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <QuantoraFullLogoSvg height={36} isDark={!isLight} tagline="" />
            <div style={{ 
              fontSize: '0.8rem', 
              fontWeight: '700', 
              color: headingColor, 
              marginTop: '12px',
              letterSpacing: '-0.01em'
            }}>
              Prompt to Action.
            </div>
          </div>
          
          <p style={{ 
            fontSize: '0.75rem', 
            lineHeight: 1.5, 
            color: textColor, 
            margin: 0,
            opacity: 0.8
          }}>
            Quantora refers to the global AI orchestration platform, bridging natural language directly to full-stack applications, interactive canvas workflows, and quantum circuit simulations.
          </p>
        </div>

        {/* Right Side: Links & Social */}
        <div style={{ 
          flex: '1 1 400px', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '32px'
        }}>
          
          {/* Horizontal Links */}
          <div style={{ 
            display: 'flex', 
            gap: '24px', 
            flexWrap: 'wrap', 
            justifyContent: 'flex-end' 
          }}>
            {['Connect with us', 'Our locations', 'My Quantora', 'Site map', 'Legal and privacy'].map((link) => (
              <span 
                key={link}
                style={{ 
                  fontSize: '0.85rem', 
                  fontWeight: '700', 
                  color: headingColor,
                  cursor: 'pointer',
                  borderBottom: `2px solid ${headingColor}`,
                  paddingBottom: '2px',
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = 0.7}
                onMouseLeave={e => e.currentTarget.style.opacity = 1}
              >
                {link}
              </span>
            ))}
          </div>

          {/* Social Icons */}
          <div style={{ display: 'flex', gap: '16px' }}>
            {[
              { icon: <Linkedin size={16} /> },
              { icon: <Twitter size={16} /> },
              { icon: <Youtube size={16} /> }
            ].map((social, idx) => (
              <div 
                key={idx}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  border: `1px solid ${borderColor}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: headingColor,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = headingColor;
                  e.currentTarget.style.color = footerBg;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = headingColor;
                }}
              >
                {social.icon}
              </div>
            ))}
          </div>

        </div>

      </div>
    </footer>
  );
}
