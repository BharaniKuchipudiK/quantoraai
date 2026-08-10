import React from 'react';
import { QuantoraFullLogoSvg } from './QuantoraLogoSvg';
import { Linkedin, Twitter, Youtube, ArrowRight } from 'lucide-react';

export default function Footer({ isLight, activeTab, handleTabChange }) {
  // Enterprise footers (like Accenture/EY) are typically always dark and anchoring
  const footerBg = '#000000';
  const textColor = '#a1a1aa'; // zinc-400
  const headingColor = '#ffffff';
  const accentColor = '#f97316'; // orange-500

  return (
    <footer style={{
      background: footerBg,
      padding: '80px 5% 40px',
      color: textColor,
      fontFamily: "'Inter', sans-serif",
      position: 'relative',
      zIndex: 10,
      borderTop: '4px solid #f97316'
    }}>
      <div style={{ 
        width: '100%', 
        maxWidth: '1400px',
        margin: '0 auto',
        display: 'flex', 
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: '60px'
      }}>
        
        {/* Brand Column */}
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <QuantoraFullLogoSvg height={40} isDark={true} tagline="" />
          <div style={{ width: '40px', height: '2px', background: accentColor }}></div>
          <p style={{ 
            fontSize: '0.9rem', 
            lineHeight: 1.7, 
            color: textColor, 
            margin: 0,
            maxWidth: '400px'
          }}>
            Quantora refers to the global AI orchestration platform, bridging natural language directly to full-stack applications, interactive canvas workflows, and quantum circuit simulations.
          </p>
          <div style={{ marginTop: '10px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: headingColor, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Prompt to Action
            </span>
          </div>
        </div>

        {/* Links Columns Container */}
        <div style={{ flex: '2 1 500px', display: 'flex', flexWrap: 'wrap', gap: '60px', justifyContent: 'space-between' }}>
          
          {/* Platform */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '160px' }}>
            <h4 style={{ color: headingColor, fontSize: '0.95rem', fontWeight: '800', margin: '0 0 8px 0' }}>Platform</h4>
            {['AI Studio', 'Dream Canvas', 'Quantum Horizon', 'Privacy Vault'].map((link) => (
              <div key={link} className="group" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <ArrowRight size={14} className="text-transparent group-hover:text-amber-500 transition-colors" />
                <span style={{ fontSize: '0.9rem', fontWeight: '500', transition: 'color 0.2s' }} className="group-hover:text-white">
                  {link}
                </span>
              </div>
            ))}
          </div>

          {/* Resources */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '160px' }}>
            <h4 style={{ color: headingColor, fontSize: '0.95rem', fontWeight: '800', margin: '0 0 8px 0' }}>Resources</h4>
            {['Connect with us', 'Our locations', 'My Quantora', 'Site map', 'Legal and privacy'].map((link) => (
              <div key={link} className="group" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <ArrowRight size={14} className="text-transparent group-hover:text-amber-500 transition-colors" />
                <span style={{ fontSize: '0.9rem', fontWeight: '500', transition: 'color 0.2s' }} className="group-hover:text-white">
                  {link}
                </span>
              </div>
            ))}
          </div>

          {/* Connect */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: '160px' }}>
            <h4 style={{ color: headingColor, fontSize: '0.95rem', fontWeight: '800', margin: '0 0 8px 0' }}>Connect</h4>
            <div style={{ display: 'flex', gap: '12px' }}>
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
                    borderRadius: '4px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  className="hover:bg-amber-500 hover:border-amber-500"
                >
                  {social.icon}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div style={{ 
        width: '100%', 
        maxWidth: '1400px', 
        margin: '60px auto 0', 
        paddingTop: '30px', 
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '20px'
      }}>
        <div style={{ fontSize: '0.85rem', fontWeight: '500' }}>
          © {new Date().getFullYear()} Quantora Inc. All rights reserved.
        </div>
        <div style={{ display: 'flex', gap: '24px', fontSize: '0.85rem', fontWeight: '500' }}>
          <span style={{ cursor: 'pointer' }} className="hover:text-white">Privacy Statement</span>
          <span style={{ cursor: 'pointer' }} className="hover:text-white">Terms & Conditions</span>
          <span style={{ cursor: 'pointer' }} className="hover:text-white">Cookie Policy</span>
        </div>
      </div>
    </footer>
  );
}
