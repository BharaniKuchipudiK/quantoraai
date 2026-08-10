import React from 'react';
import { Sparkles, Workflow, Atom, ArrowRight } from 'lucide-react';

export default function WelcomeHub({ user, onNavigate, isLight }) {
  const cardBg = isLight ? 'rgba(255, 255, 255, 0.7)' : 'rgba(30, 41, 59, 0.4)';
  const cardBorder = isLight ? '1px solid rgba(255, 255, 255, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)';
  const cardHoverBg = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(30, 41, 59, 0.8)';
  const textColor = isLight ? '#0f172a' : '#ffffff';
  const subtextColor = isLight ? '#64748b' : '#94a3b8';

  return (
    <div style={{
      maxWidth: '1100px',
      margin: '0 auto',
      padding: '80px 20px',
      minHeight: 'calc(100vh - 70px)'
    }}>
      <div style={{ marginBottom: '60px' }}>
        <h1 style={{
          fontSize: '3.5rem',
          fontWeight: '800',
          color: textColor,
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          letterSpacing: '-1px'
        }}>
          Hello, <span style={{
            background: 'linear-gradient(135deg, #f97316 0%, #eab308 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>{user?.name?.split(' ')[0] || 'Creator'}</span> <span role="img" aria-label="wave">👋</span>
        </h1>
        <p style={{
          fontSize: '1.25rem',
          color: subtextColor,
          fontWeight: '500',
          maxWidth: '600px',
          lineHeight: '1.6'
        }}>
          Welcome to Quantora. Select a module below to start building, analyzing, or exploring.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '30px'
      }}>
        {/* AI Studio Card */}
        <div
          onClick={() => onNavigate('studio')}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = cardHoverBg;
            e.currentTarget.style.transform = 'translateY(-6px)';
            e.currentTarget.style.boxShadow = isLight ? '0 20px 40px rgba(0,0,0,0.08)' : '0 20px 40px rgba(0,0,0,0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = cardBg;
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
          style={{
            background: cardBg,
            backdropFilter: 'blur(16px)',
            border: cardBorder,
            borderRadius: '24px',
            padding: '40px 32px',
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            position: 'relative',
            minHeight: '280px'
          }}
        >
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f97316'
          }}>
            <Sparkles size={28} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: '700', color: textColor, marginBottom: '12px' }}>
              AI Studio
            </h3>
            <p style={{ color: subtextColor, fontSize: '1rem', lineHeight: '1.6' }}>
              Chat with free top-tier AI models. Ask complex scientific or research questions, solve math problems, or instantly <strong style={{ color: isLight ? '#f97316' : '#fb923c' }}>build Websites, PWAs, or Mobile Apps from scratch!</strong>
            </p>
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '8px', color: '#8b5cf6', fontWeight: '700', fontSize: '1rem' }}>
            Launch Studio <ArrowRight size={16} />
          </div>
        </div>

        {/* Dream-to-Action Canvas Card */}
        <div
          onClick={() => onNavigate('canvas')}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = cardHoverBg;
            e.currentTarget.style.transform = 'translateY(-6px)';
            e.currentTarget.style.boxShadow = isLight ? '0 20px 40px rgba(0,0,0,0.08)' : '0 20px 40px rgba(0,0,0,0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = cardBg;
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
          style={{
            background: cardBg,
            backdropFilter: 'blur(16px)',
            border: cardBorder,
            borderRadius: '24px',
            padding: '40px 32px',
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            position: 'relative',
            minHeight: '280px'
          }}
        >
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#38bdf8'
          }}>
            <Workflow size={28} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: '700', color: textColor, marginBottom: '12px' }}>
              Dream-to-Action Canvas
            </h3>
            <p style={{ color: subtextColor, fontSize: '1rem', lineHeight: '1.6' }}>
              Visually map out software architectures and turn abstract thoughts into concrete, executable nodes.
            </p>
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6', fontWeight: '700', fontSize: '1rem' }}>
            Open Canvas <ArrowRight size={16} />
          </div>
        </div>

        {/* Quantum Playground Card */}
        <div
          onClick={() => onNavigate('quantum')}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = cardHoverBg;
            e.currentTarget.style.transform = 'translateY(-6px)';
            e.currentTarget.style.boxShadow = isLight ? '0 20px 40px rgba(0,0,0,0.08)' : '0 20px 40px rgba(0,0,0,0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = cardBg;
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
          style={{
            background: cardBg,
            backdropFilter: 'blur(16px)',
            border: cardBorder,
            borderRadius: '24px',
            padding: '40px 32px',
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            position: 'relative',
            minHeight: '280px'
          }}
        >
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#10b981'
          }}>
            <Atom size={28} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: '700', color: textColor, marginBottom: '12px' }}>
              Quantum Playground
            </h3>
            <p style={{ color: subtextColor, fontSize: '1rem', lineHeight: '1.6' }}>
              Simulate advanced Qiskit circuits and explore quantum states directly in your browser.
            </p>
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: '700', fontSize: '1rem' }}>
            Launch Simulator <ArrowRight size={16} />
          </div>
        </div>

      </div>
    </div>
  );
}
