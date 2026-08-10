import React from 'react';
import { QuantoraFullLogoSvg } from './QuantoraLogoSvg';

export default function Footer({ isLight, activeTab, handleTabChange }) {
  const footerBg = isLight ? '#f1f5f9' : '#05070f';
  const textColor = isLight ? '#334155' : '#94a3b8';
  const headingColor = isLight ? '#0f172a' : '#f8fafc';
  const borderColor = isLight ? '#e2e8f0' : 'rgba(255,255,255,0.1)';

  const columns = [
    {
      title: 'Platforms',
      links: [
        { name: 'AI Studio', tab: 'studio' },
        { name: 'Dream Canvas', tab: 'canvas' },
        { name: 'Quantum Horizon', tab: 'quantum' },
        { name: 'Privacy Vault', tab: 'vault' }
      ]
    },
    {
      title: 'Solutions',
      links: [
        { name: 'Enterprise Analytics', tab: null },
        { name: 'Automated Deployments', tab: null },
        { name: 'Model Orchestration', tab: null },
        { name: 'API Security', tab: null }
      ]
    },
    {
      title: 'Insights',
      links: [
        { name: 'Documentation', tab: null },
        { name: 'Research Papers', tab: null },
        { name: 'Case Studies', tab: null },
        { name: 'Blog', tab: null }
      ]
    },
    {
      title: 'Company',
      links: [
        { name: 'About Quantora', tab: null },
        { name: 'Careers', tab: null },
        { name: 'Contact Us', tab: null },
        { name: 'Partners', tab: null }
      ]
    }
  ];

  return (
    <footer style={{
      background: footerBg,
      borderTop: `1px solid ${borderColor}`,
      padding: '80px 24px 40px 24px',
      color: textColor,
      fontFamily: "'Inter', sans-serif",
      position: 'relative',
      zIndex: 10,
      transition: 'background 0.3s ease, border-color 0.3s ease'
    }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '80px' }}>
        
        {/* Top Section: Logo and Columns */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '48px',
          alignItems: 'start'
        }}>
          
          {/* Brand Column (Wider on Desktop) */}
          <div style={{ flex: '1 1 300px', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div style={{ marginLeft: '-4px' }}> {/* Slight negative margin to optically align the circular SVG with the flat text below */}
              <QuantoraFullLogoSvg height={32} isDark={!isLight} tagline="" />
            </div>
            <p style={{ fontSize: '0.95rem', lineHeight: 1.7, color: textColor, margin: 0 }}>
              Quantora bridges natural language directly to full-stack applications, interactive canvas workflows, and 3D quantum circuit simulations.
            </p>
          </div>

          {/* Link Columns */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', 
            gap: '40px',
            flex: '2 1 600px'
          }}>
            {columns.map((col, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h4 style={{ 
                  color: headingColor, 
                  fontSize: '1rem', 
                  fontWeight: '700', 
                  margin: 0,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase'
                }}>
                  {col.title}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {col.links.map((link, lIdx) => (
                    <span
                      key={lIdx}
                      onClick={() => link.tab ? handleTabChange(link.tab) : null}
                      style={{
                        fontSize: '0.95rem',
                        cursor: link.tab ? 'pointer' : 'default',
                        color: link.tab && activeTab === link.tab ? '#f97316' : textColor,
                        transition: 'color 0.2s',
                        fontWeight: link.tab && activeTab === link.tab ? '600' : '400'
                      }}
                      onMouseEnter={(e) => { if (link.tab) e.currentTarget.style.color = '#f97316'; }}
                      onMouseLeave={(e) => { if (link.tab) e.currentTarget.style.color = activeTab === link.tab ? '#f97316' : textColor; }}
                    >
                      {link.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Section: Legal and Copyright */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          gap: '24px', 
          paddingTop: '32px',
          borderTop: `1px solid ${borderColor}`,
          fontSize: '0.85rem'
        }}>
          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
            <span style={{ cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = headingColor} onMouseLeave={e => e.currentTarget.style.color = textColor}>Privacy Policy</span>
            <span style={{ cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = headingColor} onMouseLeave={e => e.currentTarget.style.color = textColor}>Terms of Service</span>
            <span style={{ cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = headingColor} onMouseLeave={e => e.currentTarget.style.color = textColor}>Cookie Notice</span>
            <span style={{ cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = headingColor} onMouseLeave={e => e.currentTarget.style.color = textColor}>Security</span>
          </div>
          <div style={{ fontWeight: '500' }}>
            © {new Date().getFullYear()} Quantora AI. All rights reserved.
          </div>
        </div>

      </div>
    </footer>
  );
}
