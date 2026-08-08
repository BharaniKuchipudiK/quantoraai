import React, { useState } from 'react';
import BeeSwarmCanvas from './BeeSwarmCanvas';
import { QuantoraEmblemSvg, QuantoraFullLogoSvg } from './QuantoraLogoSvg';
import { Sparkles, Workflow, Cpu, ShieldCheck, ArrowRight, LogIn, CheckCircle2, Zap, Sun, Moon, Lock, ChevronDown } from 'lucide-react';

export default function LandingPage({ onLaunchStudio, onOpenAuth, user }) {
  const [theme, setTheme] = useState('light');
  const isLight = theme === 'light';

  const bgColor = isLight ? '#ffffff' : '#070913';
  const textColor = isLight ? '#111827' : '#ffffff';
  const subtextColor = isLight ? '#4b5563' : '#94a3b8';
  const cardBg = isLight ? 'rgba(255, 255, 255, 0.88)' : 'rgba(18, 24, 48, 0.65)';
  const cardBorder = isLight ? 'rgba(229, 231, 235, 0.8)' : 'rgba(139, 92, 246, 0.18)';
  const navBg = isLight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(7, 9, 19, 0.9)';

  return (
    <div style={{
      minHeight: '100vh',
      background: bgColor,
      color: textColor,
      position: 'relative',
      overflowX: 'hidden',
      transition: 'background 0.4s ease, color 0.4s ease'
    }}>

      {/* Navigation Header (Google Antigravity Design) */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: navBg,
        backdropFilter: 'blur(20px)',
        borderBottom: isLight ? '1px solid rgba(229, 231, 235, 0.8)' : '1px solid rgba(249, 115, 22, 0.2)',
        padding: '14px 36px',
        transition: 'all 0.3s ease'
      }}>
        <div style={{ maxWidth: '1350px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo & Caption */}
          <div style={{ cursor: 'pointer' }} onClick={() => user ? onLaunchStudio() : onOpenAuth()}>
            <QuantoraFullLogoSvg height={38} isDark={!isLight} />
          </div>

          {/* Navigation Links (Google Antigravity Style) */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '28px', fontSize: '0.92rem', fontWeight: '500', color: isLight ? '#374151' : '#e2e8f0' }}>
            <span onClick={() => user ? onLaunchStudio() : onOpenAuth()} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Open Models <ChevronDown size={14} color="var(--text-muted)" />
            </span>
            <span onClick={() => user ? onLaunchStudio() : onOpenAuth()} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Integrated Platform <ChevronDown size={14} color="var(--text-muted)" />
            </span>
            <span onClick={() => user ? onLaunchStudio() : onOpenAuth()} style={{ cursor: 'pointer' }}>
              Quantum Horizon
            </span>
            <span onClick={() => user ? onLaunchStudio() : onOpenAuth()} style={{ cursor: 'pointer' }}>
              Pricing ($0 Free)
            </span>
          </nav>

          {/* Right Action Controls: Theme Switcher & Google OAuth Sign-In */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', zIndex: 60 }}>
            {/* Light / Dark Mode Toggle */}
            <button
              onClick={() => setTheme(isLight ? 'dark' : 'light')}
              style={{
                background: isLight ? '#f3f4f6' : 'rgba(255, 255, 255, 0.08)',
                border: isLight ? '1px solid #e5e7eb' : '1px solid rgba(255, 255, 255, 0.2)',
                color: textColor,
                padding: '8px 14px',
                borderRadius: '9999px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.82rem',
                fontWeight: '600'
              }}
              title="Toggle Theme"
            >
              {isLight ? <Moon size={15} color="#8b5cf6" /> : <Sun size={15} color="#fb923c" />}
              {isLight ? 'Dark Mode' : 'Antigravity Light'}
            </button>

            {/* Google OAuth Pill Button */}
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={onLaunchStudio}
                  style={{
                    background: '#111827',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 22px',
                    borderRadius: '9999px',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.15)'
                  }}
                >
                  <Sparkles size={16} color="#f97316" /> Launch AI Studio
                </button>
                <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#34d399', background: 'rgba(52, 211, 153, 0.15)', padding: '6px 14px', borderRadius: '9999px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={14} /> Signed in as {(user?.name || 'User').split(' ')[0]}
                </span>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                style={{
                  background: '#111827',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px 24px',
                  borderRadius: '9999px',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  boxShadow: '0 4px 18px rgba(0,0,0,0.2)'
                }}
              >
                <LogIn size={16} color="#f97316" /> Sign in with Google
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Flagship Hero Section */}
      <section style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '80px 24px 60px 24px',
        textAlign: 'center',
        position: 'relative',
        zIndex: 10
      }}>
        {/* Emblem Node with PROMPT TO ACTION Caption */}
        <div style={{ marginBottom: '32px', display: 'inline-block' }}>
          <QuantoraEmblemSvg size={140} />
        </div>

        {/* Hero Title */}
        <h1 style={{
          fontSize: '4.2rem',
          fontWeight: '800',
          lineHeight: 1.12,
          marginBottom: '22px',
          fontFamily: 'var(--font-heading)',
          letterSpacing: '-0.035em'
        }}>
          Experience liftoff with <br />
          <span style={{
            background: 'linear-gradient(135deg, #f97316 0%, #ec4899 35%, #8b5cf6 70%, #06b6d4 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            open AI & quantum computing
          </span>
        </h1>

        {/* Subtitle with Integrated Slogan Fusion */}
        <p style={{
          fontSize: '1.28rem',
          color: subtextColor,
          maxWidth: '860px',
          margin: '0 auto 44px auto',
          lineHeight: 1.6,
          fontWeight: '400'
        }}>
          You have ideas floating like a swarm of possibilities. <strong>Quantora</strong> is the integrated AI & Quantum platform built for Gen Z and Gen Alpha creators to <strong>Make It Happen</strong>—turning raw prompts into real software: <strong>Dream ➔ Idea ➔ Thought ➔ Action</strong>.
        </p>

        {/* Hero Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {user ? (
            <button
              onClick={onLaunchStudio}
              style={{
                padding: '16px 36px',
                borderRadius: '9999px',
                fontSize: '1.08rem',
                fontWeight: '600',
                background: '#111827',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.18)'
              }}
            >
              <Sparkles size={18} color="#f97316" /> Launch Quantora Studio
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              style={{
                padding: '16px 36px',
                borderRadius: '9999px',
                fontSize: '1.08rem',
                fontWeight: '600',
                background: '#111827',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.18)'
              }}
            >
              <LogIn size={18} color="#f97316" /> Sign in with Google
            </button>
          )}

          <button
            onClick={onOpenAuth}
            style={{
              padding: '16px 32px',
              borderRadius: '9999px',
              fontSize: '1.05rem',
              fontWeight: '500',
              background: isLight ? '#f3f4f6' : 'rgba(255, 255, 255, 0.08)',
              color: textColor,
              border: isLight ? '1px solid #e5e7eb' : '1px solid rgba(255, 255, 255, 0.15)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            Explore use cases
          </button>
        </div>

        {/* Security Notice Pill */}
        <div style={{ marginTop: '32px', display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#f97316', background: 'rgba(249, 115, 22, 0.1)', border: '1px solid rgba(249, 115, 22, 0.3)', padding: '6px 18px', borderRadius: '9999px' }}>
          <Lock size={14} /> Protected by Google OAuth 2.0 PKCE • Zero Knowledge Vault
        </div>
      </section>

      {/* Feature Cards Grid */}
      <section style={{ maxWidth: '1200px', margin: '30px auto 90px auto', padding: '0 24px', position: 'relative', zIndex: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
          {/* Card 1 */}
          <div style={{
            background: cardBg,
            border: cardBorder,
            backdropFilter: 'blur(16px)',
            borderRadius: '20px',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            boxShadow: isLight ? '0 10px 30px rgba(0,0,0,0.04)' : '0 10px 30px rgba(0,0,0,0.3)'
          }}>
            <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: 'rgba(249, 115, 22, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Workflow size={22} color="#f97316" />
            </div>
            <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Dream-to-Action Canvas</h3>
            <p style={{ fontSize: '0.88rem', color: subtextColor, lineHeight: 1.6, margin: 0 }}>
              Turn your thoughts into real software, playable web widgets, code sandboxes, and execution plans automatically.
            </p>
          </div>

          {/* Card 2 */}
          <div style={{
            background: cardBg,
            border: cardBorder,
            backdropFilter: 'blur(16px)',
            borderRadius: '20px',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            boxShadow: isLight ? '0 10px 30px rgba(0,0,0,0.04)' : '0 10px 30px rgba(0,0,0,0.3)'
          }}>
            <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: 'rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={22} color="#8b5cf6" />
            </div>
            <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Open AI Model Router</h3>
            <p style={{ fontSize: '0.88rem', color: subtextColor, lineHeight: 1.6, margin: 0 }}>
              Access Qwen 2.5 Coder, Gemma 2, DeepSeek V3, and Llama 3.3 for free without subscription paywalls.
            </p>
          </div>

          {/* Card 3 */}
          <div style={{
            background: cardBg,
            border: cardBorder,
            backdropFilter: 'blur(16px)',
            borderRadius: '20px',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            boxShadow: isLight ? '0 10px 30px rgba(0,0,0,0.04)' : '0 10px 30px rgba(0,0,0,0.3)'
          }}>
            <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: 'rgba(6, 182, 212, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Cpu size={22} color="#06b6d4" />
            </div>
            <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Quantum Horizon Bridge</h3>
            <p style={{ fontSize: '0.88rem', color: subtextColor, lineHeight: 1.6, margin: 0 }}>
              Explore 2-Qubit state vector simulators, Hadamard & CNOT entangling gates, and AI Qiskit code synthesis.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
