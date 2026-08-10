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
      padding: '60px 5%',
      color: textColor,
      fontFamily: "'Inter', sans-serif",
      position: 'relative',
      zIndex: 10,
      transition: 'background 0.3s ease, border-color 0.3s ease'
    }}>
      <div style={{ 
        width: '100%', 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
        gap: '40px'
      }}>
        
        {/* Left Side: Logo & Disclaimer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <QuantoraFullLogoSvg height={36} isDark={!isLight} tagline="" />
            <div style={{ 
              fontSize: '0.85rem', 
              fontWeight: '800', 
              color: headingColor, 
              marginTop: '16px',
              letterSpacing: '-0.01em',
              textTransform: 'uppercase'
            }}>
              Prompt to Action
            </div>
          </div>
          
          <p style={{ 
            fontSize: '0.85rem', 
            lineHeight: 1.6, 
            color: textColor, 
            margin: 0,
            opacity: 0.8,
            maxWidth: '400px'
          }}>
            Quantora refers to the global AI orchestration platform, bridging natural language directly to full-stack applications, interactive canvas workflows, and quantum circuit simulations.
          </p>
        </div>

        {/* Middle Column: Links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h4 style={{ color: headingColor, fontSize: '0.9rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px 0' }}>Platform</h4>
          {['AI Studio', 'Dream Canvas', 'Quantum Horizon', 'Privacy Vault'].map((link) => (
            <span 
              key={link}
              style={{ 
                fontSize: '0.9rem', 
                fontWeight: '600', 
                color: textColor,
                cursor: 'pointer',
                transition: 'color 0.2s'
              }}
              className="hover:text-amber-500"
            >
              {link}
            </span>
          ))}
        </div>

        {/* Middle Column 2: Resources */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h4 style={{ color: headingColor, fontSize: '0.9rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px 0' }}>Resources</h4>
          {['Connect with us', 'Our locations', 'My Quantora', 'Site map', 'Legal and privacy'].map((link) => (
            <span 
              key={link}
              style={{ 
                fontSize: '0.9rem', 
                fontWeight: '600', 
                color: textColor,
                cursor: 'pointer',
                transition: 'color 0.2s'
              }}
              className="hover:text-amber-500"
            >
              {link}
            </span>
          ))}
        </div>

        {/* Right Column: Social & Legal */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <h4 style={{ color: headingColor, fontSize: '0.9rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px 0' }}>Connect</h4>
          {/* Social Icons */}
          <div style={{ display: 'flex', gap: '16px' }}>
            {[
              { icon: <Linkedin size={18} /> },
              { icon: <Twitter size={18} /> },
              { icon: <Youtube size={18} /> }
            ].map((social, idx) => (
              <div 
                key={idx}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: headingColor,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                className="hover:bg-amber-500 hover:text-white"
              >
                {social.icon}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 'auto', fontSize: '0.8rem', color: textColor, opacity: 0.7 }}>
            © {new Date().getFullYear()} Quantora Inc.<br/>All rights reserved.
          </div>
        </div>

      </div>
    </footer>
  );
}
