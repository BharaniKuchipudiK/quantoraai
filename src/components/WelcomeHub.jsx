import React from 'react';
import { Sparkles, Workflow, Atom, ArrowRight } from 'lucide-react';

export default function WelcomeHub({ user, onNavigate, isLight }) {
  const cardBg = isLight ? '#ffffff' : 'rgba(30, 41, 59, 0.4)';
  const cardBorder = isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.1)';
  const cardHoverBg = isLight ? '#f8fafc' : 'rgba(30, 41, 59, 0.8)';
  const textColor = isLight ? '#0f172a' : '#ffffff';
  const subtextColor = isLight ? '#64748b' : '#94a3b8';

  return (
    <div style={{
      maxWidth: '1000px',
      margin: '0 auto',
      padding: '60px 20px',
      minHeight: 'calc(100vh - 70px)'
    }}>
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{
          fontSize: '2.5rem',
          fontWeight: '700',
          color: textColor,
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          Hello, {user?.name?.split(' ')[0] || 'Creator'} <span role="img" aria-label="wave">👋</span>
        </h1>
        <p style={{
          fontSize: '1.2rem',
          color: subtextColor,
          fontWeight: '500'
        }}>
          Welcome to Quantora. What would you like to build today?
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '24px'
      }}>
        {/* AI Studio Card */}
        <div
          onClick={() => onNavigate('studio')}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = cardHoverBg;
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = isLight ? '0 12px 30px rgba(0,0,0,0.05)' : '0 12px 30px rgba(0,0,0,0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = cardBg;
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
          style={{
            background: cardBg,
            border: cardBorder,
            borderRadius: '16px',
            padding: '30px',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            position: 'relative'
          }}
        >
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f97316'
          }}>
            <Sparkles size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: textColor, marginBottom: '8px' }}>
              AI Studio
            </h3>
            <p style={{ color: subtextColor, fontSize: '0.95rem', lineHeight: '1.5' }}>
              Chat with free top-tier AI models. Ask complex scientific or research questions, solve math problems, or generate code.
            </p>
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '6px', color: '#8b5cf6', fontWeight: '600', fontSize: '0.9rem' }}>
            Launch Studio <ArrowRight size={14} />
          </div>
        </div>

        {/* Dream-to-Action Canvas Card */}
        <div
          onClick={() => onNavigate('canvas')}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = cardHoverBg;
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = isLight ? '0 12px 30px rgba(0,0,0,0.05)' : '0 12px 30px rgba(0,0,0,0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = cardBg;
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
          style={{
            background: cardBg,
            border: cardBorder,
            borderRadius: '16px',
            padding: '30px',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            position: 'relative'
          }}
        >
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#38bdf8'
          }}>
            <Workflow size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: textColor, marginBottom: '8px' }}>
              Dream-to-Action Canvas
            </h3>
            <p style={{ color: subtextColor, fontSize: '0.95rem', lineHeight: '1.5' }}>
              Visually map out software architectures and turn abstract thoughts into concrete, executable nodes.
            </p>
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '6px', color: '#3b82f6', fontWeight: '600', fontSize: '0.9rem' }}>
            Open Canvas <ArrowRight size={14} />
          </div>
        </div>

        {/* Quantum Playground Card */}
        <div
          onClick={() => onNavigate('quantum')}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = cardHoverBg;
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = isLight ? '0 12px 30px rgba(0,0,0,0.05)' : '0 12px 30px rgba(0,0,0,0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = cardBg;
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
          style={{
            background: cardBg,
            border: cardBorder,
            borderRadius: '16px',
            padding: '30px',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            position: 'relative'
          }}
        >
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#10b981'
          }}>
            <Atom size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: textColor, marginBottom: '8px' }}>
              Quantum Playground
            </h3>
            <p style={{ color: subtextColor, fontSize: '0.95rem', lineHeight: '1.5' }}>
              Simulate advanced Qiskit circuits and explore quantum states directly in your browser.
            </p>
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontWeight: '600', fontSize: '0.9rem' }}>
            Launch Simulator <ArrowRight size={14} />
          </div>
        </div>

      </div>
    </div>
  );
}
