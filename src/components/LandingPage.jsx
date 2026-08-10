import React, { useState } from 'react';
import AuroraBackground from './AuroraBackground';
import { QuantoraEmblemSvg, QuantoraFullLogoSvg } from './QuantoraLogoSvg';
import { 
  Sparkles, 
  Workflow, 
  Cpu, 
  ShieldCheck, 
  ArrowRight, 
  LogIn, 
  CheckCircle2, 
  Zap, 
  Sun, 
  Moon, 
  Lock, 
  Search, 
  BarChart3, 
  Terminal, 
  Code2, 
  Layers,
  Key,
  Play,
  RotateCcw,
  Check,
  ChevronRight,
  Gauge,
  Globe2,
  Atom
} from 'lucide-react';

export default function LandingPage({ onLaunchStudio, onOpenAuth, user }) {
  const [theme, setTheme] = useState('dark');
  const [activeDemoTab, setActiveDemoTab] = useState('app-builder'); // 'app-builder', 'quantum', 'multi-model', 'vault'
  const [selectedPrompt, setSelectedPrompt] = useState('Create a real-time crypto portfolio tracker with dark glassmorphic charts');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationComplete, setSimulationComplete] = useState(false);

  const isLight = theme === 'light';

  const bgColor = isLight ? '#f8fafc' : '#070913';
  const textColor = isLight ? '#0f172a' : '#ffffff';
  const subtextColor = isLight ? '#475569' : '#94a3b8';
  const cardBg = isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.75)';
  const cardBorder = isLight ? '1px solid #e2e8f0' : '1px solid rgba(249, 115, 22, 0.2)';
  const navBg = isLight ? 'rgba(255, 255, 255, 0.92)' : 'rgba(7, 9, 19, 0.88)';

  const samplePrompts = [
    'Create a real-time crypto portfolio tracker with dark glassmorphic charts',
    'Simulate a Bell State quantum entanglement circuit with Hadamard and CNOT gates',
    'Build an AI research assistant with autonomous DuckDuckGo web search',
    'Design a responsive Kanban board with drag-and-drop local persistence'
  ];

  const handleRunSimulation = () => {
    setIsSimulating(true);
    setSimulationComplete(false);
    setTimeout(() => {
      setIsSimulating(false);
      setSimulationComplete(true);
    }, 1200);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: bgColor,
      color: textColor,
      position: 'relative',
      overflowX: 'hidden',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      transition: 'background 0.4s ease, color 0.4s ease'
    }}>
      {/* Dynamic Ambient Glow Background in Dark Mode */}
      {!isLight && <AuroraBackground />}

      {/* Header Navigation */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: navBg,
        backdropFilter: 'blur(20px)',
        borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(249, 115, 22, 0.2)',
        padding: '14px 36px',
        transition: 'all 0.3s ease'
      }}>
        <div style={{ maxWidth: '1350px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          {/* Brand Logo */}
          <div style={{ cursor: 'pointer' }} onClick={() => user ? onLaunchStudio() : onOpenAuth()}>
            <QuantoraFullLogoSvg height={38} isDark={!isLight} tagline="PROMPT TO ACTION" />
          </div>

          {/* Navigation Links */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '28px', fontSize: '0.92rem', fontWeight: '600', color: isLight ? '#334155' : '#cbd5e1' }}>
            <span 
              onClick={() => user ? onLaunchStudio() : onOpenAuth()} 
              style={{ cursor: 'pointer', transition: 'color 0.2s' }}
              className="hover:text-amber-500"
            >
              AI Studio
            </span>
            <span 
              onClick={() => user ? onLaunchStudio() : onOpenAuth()} 
              style={{ cursor: 'pointer', transition: 'color 0.2s' }}
              className="hover:text-amber-500"
            >
              Dream Canvas
            </span>
            <span 
              onClick={() => user ? onLaunchStudio() : onOpenAuth()} 
              style={{ cursor: 'pointer', transition: 'color 0.2s' }}
              className="hover:text-amber-500"
            >
              Quantum Horizon
            </span>
            <span 
              onClick={() => user ? onLaunchStudio() : onOpenAuth()} 
              style={{ cursor: 'pointer', transition: 'color 0.2s' }}
              className="hover:text-amber-500"
            >
              Privacy Vault
            </span>
          </nav>

          {/* Theme Switcher & Login CTA */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', zIndex: 60 }}>
            <button
              onClick={() => setTheme(isLight ? 'dark' : 'light')}
              style={{
                background: isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.08)',
                border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.2)',
                color: textColor,
                padding: '8px 16px',
                borderRadius: '9999px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.82rem',
                fontWeight: '700'
              }}
              title="Toggle Theme"
            >
              {isLight ? <Moon size={15} color="#8b5cf6" /> : <Sun size={15} color="#fb923c" />}
              {isLight ? 'Dark Mode' : 'Light Mode'}
            </button>

            {user ? (
              <button
                onClick={onLaunchStudio}
                style={{
                  background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px 22px',
                  borderRadius: '9999px',
                  fontSize: '0.9rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 18px rgba(249, 115, 22, 0.4)'
                }}
              >
                <Sparkles size={16} color="#ffffff" /> Enter Portal
              </button>
            ) : (
              <button
                onClick={onOpenAuth}
                style={{
                  background: '#0f172a',
                  color: '#ffffff',
                  border: isLight ? 'none' : '1px solid rgba(251, 191, 36, 0.4)',
                  padding: '10px 24px',
                  borderRadius: '9999px',
                  fontSize: '0.9rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  boxShadow: '0 4px 18px rgba(0,0,0,0.25)'
                }}
              >
                <LogIn size={16} color="#f59e0b" /> Sign in with Google
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Flagship Hero Section */}
      <section style={{
        maxWidth: '1240px',
        margin: '0 auto',
        padding: '60px 24px 40px 24px',
        textAlign: 'center',
        position: 'relative',
        zIndex: 10
      }}>


        {/* Quantora Masterpiece Emblem */}
        <div style={{ marginBottom: '24px', display: 'inline-block' }}>
          <QuantoraEmblemSvg size={140} isDark={!isLight} tagline="PROMPT TO ACTION" />
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: '3.8rem',
          fontWeight: '900',
          lineHeight: 1.12,
          color: textColor,
          marginBottom: '20px',
          letterSpacing: '-0.03em',
          maxWidth: '1020px',
          margin: '0 auto 20px auto'
        }}>
          <span style={{ color: textColor }}>Turn Prompts into Live Software with</span>{' '}
          <span style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 45%, #ec4899 90%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            display: 'inline-block'
          }}>
            Multi-Model AI & Quantum Power
          </span>
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: '1.2rem',
          color: subtextColor,
          maxWidth: '840px',
          margin: '0 auto 36px auto',
          lineHeight: 1.6,
          fontWeight: '400'
        }}>
          <strong>Quantora</strong> bridges natural language directly to full-stack React applications, interactive canvas workflows, and 3D quantum circuit simulations. Orchestrated via Gemini, GPT-4o, DeepSeek, and encrypted API Vaults.
        </p>

        {/* Primary Call to Actions */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '40px' }}>
          {user ? (
            <button
              onClick={onLaunchStudio}
              style={{
                padding: '16px 38px',
                borderRadius: '9999px',
                fontSize: '1.08rem',
                fontWeight: '800',
                background: 'linear-gradient(135deg, #f97316 0%, #d97706 100%)',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 10px 30px rgba(249, 115, 22, 0.4)'
              }}
            >
              <Sparkles size={18} color="#ffffff" /> Launch AI Studio
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              style={{
                padding: '16px 38px',
                borderRadius: '9999px',
                fontSize: '1.08rem',
                fontWeight: '800',
                background: 'linear-gradient(135deg, #f97316 0%, #d97706 100%)',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 10px 30px rgba(249, 115, 22, 0.4)'
              }}
            >
              <LogIn size={18} color="#ffffff" /> Sign in with Google to Start
            </button>
          )}

          <button
            onClick={() => user ? onLaunchStudio() : onOpenAuth()}
            style={{
              padding: '16px 32px',
              borderRadius: '9999px',
              fontSize: '1.02rem',
              fontWeight: '700',
              background: isLight ? '#ffffff' : 'rgba(255, 255, 255, 0.06)',
              color: textColor,
              border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.18)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <Cpu size={18} color="#f59e0b" /> Explore Quantum Simulator
          </button>
        </div>

        {/* Feature Highlights Pills */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
          fontSize: '0.85rem',
          fontWeight: '600',
          color: isLight ? '#475569' : '#cbd5e1'
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: isLight ? '#ffffff' : 'rgba(255,255,255,0.05)', padding: '6px 16px', borderRadius: '9999px', border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)' }}>
            <CheckCircle2 size={15} color="#10b981" /> Free Multi-Model Access
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: isLight ? '#ffffff' : 'rgba(255,255,255,0.05)', padding: '6px 16px', borderRadius: '9999px', border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)' }}>
            <ShieldCheck size={15} color="#3b82f6" /> Supabase Vault API Gateway
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: isLight ? '#ffffff' : 'rgba(255,255,255,0.05)', padding: '6px 16px', borderRadius: '9999px', border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)' }}>
            <Zap size={15} color="#f59e0b" /> Live SSE Execution
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: isLight ? '#ffffff' : 'rgba(255,255,255,0.05)', padding: '6px 16px', borderRadius: '9999px', border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)' }}>
            <Lock size={15} color="#ec4899" /> Zero-Log Security
          </span>
        </div>
      </section>

      {/* Interactive Platform Sandbox Window Showcase */}
      <section style={{ maxWidth: '1180px', margin: '20px auto 80px auto', padding: '0 24px', position: 'relative', zIndex: 10 }}>
        <div style={{
          background: isLight ? '#ffffff' : '#0b0f19',
          border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(249, 115, 22, 0.3)',
          borderRadius: '24px',
          overflow: 'hidden',
          boxShadow: isLight ? '0 20px 50px rgba(0,0,0,0.08)' : '0 20px 60px rgba(0,0,0,0.6)',
        }}>
          {/* Mac Top Window Controls Bar */}
          <div style={{
            background: isLight ? '#f1f5f9' : '#070a12',
            padding: '14px 24px',
            borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444' }} />
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#f59e0b' }} />
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#10b981' }} />
              <span style={{ marginLeft: '12px', fontSize: '0.82rem', fontWeight: '700', color: subtextColor, fontFamily: 'monospace' }}>
                quantora-sandbox://studio-v3.2
              </span>
            </div>

            {/* Sandbox Tabs */}
            <div style={{ display: 'flex', gap: '6px', background: isLight ? '#e2e8f0' : 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '10px' }}>
              <button
                onClick={() => setActiveDemoTab('app-builder')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: activeDemoTab === 'app-builder' ? (isLight ? '#ffffff' : '#f97316') : 'transparent',
                  color: activeDemoTab === 'app-builder' ? (isLight ? '#0f172a' : '#ffffff') : subtextColor,
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Code2 size={14} /> Live App Generator
              </button>
              <button
                onClick={() => setActiveDemoTab('quantum')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: activeDemoTab === 'quantum' ? (isLight ? '#ffffff' : '#06b6d4') : 'transparent',
                  color: activeDemoTab === 'quantum' ? (isLight ? '#0f172a' : '#ffffff') : subtextColor,
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Atom size={14} /> Quantum 3D Bloch
              </button>
              <button
                onClick={() => setActiveDemoTab('multi-model')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: activeDemoTab === 'multi-model' ? (isLight ? '#ffffff' : '#8b5cf6') : 'transparent',
                  color: activeDemoTab === 'multi-model' ? (isLight ? '#0f172a' : '#ffffff') : subtextColor,
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Cpu size={14} /> AI Orchestrator
              </button>
            </div>
          </div>

          {/* Interactive Tab Contents */}
          <div style={{ padding: '28px' }}>
            {activeDemoTab === 'app-builder' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '700', color: subtextColor }}>
                    Select or Type a Natural Language Prompt:
                  </label>
                  <textarea
                    value={selectedPrompt}
                    onChange={(e) => setSelectedPrompt(e.target.value)}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '14px',
                      borderRadius: '12px',
                      background: isLight ? '#f8fafc' : '#131927',
                      border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255,255,255,0.15)',
                      color: textColor,
                      fontSize: '0.92rem',
                      outline: 'none',
                      resize: 'none',
                      fontFamily: 'inherit'
                    }}
                  />

                  {/* Preset prompt pills */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {samplePrompts.map((p, idx) => (
                      <span
                        key={idx}
                        onClick={() => setSelectedPrompt(p)}
                        style={{
                          fontSize: '0.75rem',
                          padding: '5px 12px',
                          borderRadius: '9999px',
                          background: selectedPrompt === p ? 'rgba(249, 115, 22, 0.2)' : (isLight ? '#f1f5f9' : 'rgba(255,255,255,0.05)'),
                          border: selectedPrompt === p ? '1px solid #f97316' : (isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)'),
                          color: selectedPrompt === p ? '#f59e0b' : subtextColor,
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        Prompt #{idx + 1}
                      </span>
                    ))}
                  </div>

                  <button
                    onClick={handleRunSimulation}
                    disabled={isSimulating}
                    style={{
                      padding: '12px 24px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: '800',
                      fontSize: '0.92rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      marginTop: '8px'
                    }}
                  >
                    {isSimulating ? <RotateCcw className="animate-spin" size={16} /> : <Play size={16} />}
                    {isSimulating ? 'Streaming React Code...' : 'Simulate Prompt-to-Code Generation'}
                  </button>
                </div>

                {/* Simulated Output Preview Box */}
                <div style={{
                  background: isLight ? '#f8fafc' : '#05070f',
                  borderRadius: '16px',
                  border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)',
                  padding: '20px',
                  fontFamily: 'monospace',
                  fontSize: '0.82rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  position: 'relative'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px', color: '#f59e0b' }}>
                    <span>App.jsx • Output Console</span>
                    <span style={{ color: '#10b981' }}>● SSE Live Stream</span>
                  </div>

                  {isSimulating ? (
                    <div style={{ color: subtextColor, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={{ color: '#3b82f6' }}>[1/3] Parsing intent with Gemini 1.5 Pro...</span>
                      <span style={{ color: '#8b5cf6' }}>[2/3] Generating React components & Tailwind styles...</span>
                      <span style={{ color: '#f59e0b' }}>[3/3] Compiling Vite bundle...</span>
                    </div>
                  ) : simulationComplete ? (
                    <div style={{ color: '#10b981', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span>✓ Application compiled in 0.82s</span>
                      <div style={{
                        background: isLight ? '#ffffff' : '#0f172a',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px dashed #10b981',
                        color: textColor
                      }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>🚀 Live Preview Rendered</div>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: subtextColor }}>
                          "{selectedPrompt}" is ready! Click below to open in full Studio mode.
                        </p>
                      </div>
                      <button
                        onClick={() => user ? onLaunchStudio() : onOpenAuth()}
                        style={{
                          background: '#f97316',
                          color: '#fff',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          alignSelf: 'flex-start'
                        }}
                      >
                        Open Live App in Studio <ArrowRight size={14} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ color: subtextColor, lineHeight: 1.6 }}>
                      <code>
                        import React from 'react';<br/>
                        // QUANTORA Prompt-to-Action Engine<br/>
                        // Click 'Simulate Prompt' to see live SSE output<br/>
                        export default function GeneratedApp() &#123;<br/>
                        &nbsp;&nbsp;return &lt;div className="p-8 bg-slate-900"&gt;Ready&lt;/div&gt;<br/>
                        &#125;
                      </code>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeDemoTab === 'quantum' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0, color: '#06b6d4' }}>
                    2-Qubit Quantum Circuit Simulator
                  </h3>
                  <p style={{ fontSize: '0.9rem', color: subtextColor, lineHeight: 1.6, margin: 0 }}>
                    Construct Hadamard (H), CNOT, and Pauli rotation gates. Compute exact state vector probability distributions |Ψ⟩ = α|00⟩ + β|01⟩ + γ|10⟩ + δ|11⟩.
                  </p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <span style={{ padding: '6px 12px', background: 'rgba(6, 182, 212, 0.15)', border: '1px solid #06b6d4', borderRadius: '8px', fontSize: '0.8rem', color: '#06b6d4', fontWeight: '700' }}>
                      |q0⟩ ──[ H ]──■──
                    </span>
                    <span style={{ padding: '6px 12px', background: 'rgba(6, 182, 212, 0.15)', border: '1px solid #06b6d4', borderRadius: '8px', fontSize: '0.8rem', color: '#06b6d4', fontWeight: '700' }}>
                      |q1⟩ ─────────┼──
                    </span>
                  </div>
                  <button
                    onClick={() => user ? onLaunchStudio() : onOpenAuth()}
                    style={{
                      background: '#06b6d4',
                      color: '#ffffff',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '10px',
                      fontWeight: '800',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: '8px',
                      alignSelf: 'flex-start'
                    }}
                  >
                    Open 3D Bloch Simulator <ArrowRight size={16} />
                  </button>
                </div>

                <div style={{
                  background: isLight ? '#f8fafc' : '#05070f',
                  borderRadius: '16px',
                  padding: '20px',
                  textAlign: 'center',
                  border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(6, 182, 212, 0.3)'
                }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '700', color: subtextColor, marginBottom: '12px' }}>
                    Entangled State Vector: (|00⟩ + |11⟩) / √2
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: '100px', padding: '0 20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '32px', height: '60px', background: '#06b6d4', borderRadius: '6px 6px 0 0' }} />
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>|00⟩ 50%</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '32px', height: '0px', background: '#334155', borderRadius: '6px 6px 0 0' }} />
                      <span style={{ fontSize: '0.75rem', color: subtextColor }}>|01⟩ 0%</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '32px', height: '0px', background: '#334155', borderRadius: '6px 6px 0 0' }} />
                      <span style={{ fontSize: '0.75rem', color: subtextColor }}>|10⟩ 0%</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '32px', height: '60px', background: '#06b6d4', borderRadius: '6px 6px 0 0' }} />
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>|11⟩ 50%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeDemoTab === 'multi-model' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                <div style={{ background: isLight ? '#f8fafc' : '#131927', padding: '16px', borderRadius: '14px', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
                  <div style={{ fontWeight: '800', color: '#f59e0b', marginBottom: '6px' }}>Gemini 1.5 Pro (Primary)</div>
                  <p style={{ fontSize: '0.82rem', color: subtextColor, margin: 0 }}>2M token context window for full-stack code synthesis and file mapping.</p>
                </div>
                <div style={{ background: isLight ? '#f8fafc' : '#131927', padding: '16px', borderRadius: '14px', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                  <div style={{ fontWeight: '800', color: '#8b5cf6', marginBottom: '6px' }}>GPT-4o & DeepSeek-V3</div>
                  <p style={{ fontSize: '0.82rem', color: subtextColor, margin: 0 }}>Multi-model fallback routing for logic optimization & security checks.</p>
                </div>
                <div style={{ background: isLight ? '#f8fafc' : '#131927', padding: '16px', borderRadius: '14px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <div style={{ fontWeight: '800', color: '#10b981', marginBottom: '6px' }}>Zero Latency SSE</div>
                  <p style={{ fontSize: '0.82rem', color: subtextColor, margin: 0 }}>Real-time code streaming directly to live container iframe.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Flagship Platform Capabilities (6 Core Modules) */}
      <section style={{ maxWidth: '1240px', margin: '0 auto 100px auto', padding: '0 24px', position: 'relative', zIndex: 10 }}>
        <div style={{ textAlign: 'center', marginBottom: '50px' }}>
          <h2 style={{ fontSize: '2.4rem', fontWeight: '900', marginBottom: '12px' }}>
            Everything You Need to Build, Simulate & Deploy
          </h2>
          <p style={{ color: subtextColor, fontSize: '1.08rem', maxWidth: '680px', margin: '0 auto' }}>
            Engineered for developers, creators, and quantum researchers looking for unmatched speed, security, and multi-model intelligence.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
          
          {/* Module 1: AI Studio & Web Generator */}
          <div style={{
            background: cardBg,
            border: cardBorder,
            backdropFilter: 'blur(16px)',
            borderRadius: '20px',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: isLight ? '0 10px 30px rgba(0,0,0,0.03)' : '0 10px 30px rgba(0,0,0,0.35)',
            cursor: 'pointer',
            transition: 'transform 0.2s ease'
          }} onClick={() => user ? onLaunchStudio() : onOpenAuth()}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(249, 115, 22, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Code2 size={24} color="#f97316" />
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: '700', margin: 0 }}>AI Studio & Live Web Builder</h3>
            <p style={{ fontSize: '0.92rem', color: subtextColor, lineHeight: 1.6, margin: 0 }}>
              Generate complete, functional React & HTML applications from natural language prompts. Features real-time SSE streaming, live iframe preview, and instant ZIP exports.
            </p>
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', fontWeight: '700', color: '#f97316' }}>
              Open AI Studio <ArrowRight size={16} />
            </div>
          </div>

          {/* Module 2: Dream-to-Action Canvas */}
          <div style={{
            background: cardBg,
            border: cardBorder,
            backdropFilter: 'blur(16px)',
            borderRadius: '20px',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: isLight ? '0 10px 30px rgba(0,0,0,0.03)' : '0 10px 30px rgba(0,0,0,0.35)',
            cursor: 'pointer',
            transition: 'transform 0.2s ease'
          }} onClick={() => user ? onLaunchStudio() : onOpenAuth()}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Workflow size={24} color="#8b5cf6" />
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: '700', margin: 0 }}>Dream-to-Action Canvas</h3>
            <p style={{ fontSize: '0.92rem', color: subtextColor, lineHeight: 1.6, margin: 0 }}>
              Map out software architecture visually. Convert abstract concepts into structured, executable nodes: <strong>Dream ➔ Idea ➔ Thought ➔ Action</strong>.
            </p>
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', fontWeight: '700', color: '#8b5cf6' }}>
              Launch Canvas <ArrowRight size={16} />
            </div>
          </div>

          {/* Module 3: Quantum Horizon & 3D Bloch Sphere */}
          <div style={{
            background: cardBg,
            border: cardBorder,
            backdropFilter: 'blur(16px)',
            borderRadius: '20px',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: isLight ? '0 10px 30px rgba(0,0,0,0.03)' : '0 10px 30px rgba(0,0,0,0.35)',
            cursor: 'pointer',
            transition: 'transform 0.2s ease'
          }} onClick={() => user ? onLaunchStudio() : onOpenAuth()}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(6, 182, 212, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Cpu size={24} color="#06b6d4" />
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: '700', margin: 0 }}>Quantum Horizon & 3D Qubits</h3>
            <p style={{ fontSize: '0.92rem', color: subtextColor, lineHeight: 1.6, margin: 0 }}>
              Simulate 2-Qubit quantum logic gates (Hadamard, CNOT, Pauli X/Y/Z), compute exact state vector matrices, visualize 3D Bloch Spheres, and synthesize IBM Qiskit code.
            </p>
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', fontWeight: '700', color: '#06b6d4' }}>
              Simulate Quantum Circuit <ArrowRight size={16} />
            </div>
          </div>

          {/* Module 4: Privacy Vault & Gateway */}
          <div style={{
            background: cardBg,
            border: cardBorder,
            backdropFilter: 'blur(16px)',
            borderRadius: '20px',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: isLight ? '0 10px 30px rgba(0,0,0,0.03)' : '0 10px 30px rgba(0,0,0,0.35)',
            cursor: 'pointer',
            transition: 'transform 0.2s ease'
          }} onClick={() => user ? onLaunchStudio() : onOpenAuth()}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Key size={24} color="#10b981" />
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: '700', margin: 0 }}>Privacy Vault & API Gateway</h3>
            <p style={{ fontSize: '0.92rem', color: subtextColor, lineHeight: 1.6, margin: 0 }}>
              Store custom API keys securely using Supabase Vault encryption. Zero log exposure, client-side key storage, and centralized rate limiting.
            </p>
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', fontWeight: '700', color: '#10b981' }}>
              Configure Vault <ArrowRight size={16} />
            </div>
          </div>

          {/* Module 5: Autonomous LangChain Agent */}
          <div style={{
            background: cardBg,
            border: cardBorder,
            backdropFilter: 'blur(16px)',
            borderRadius: '20px',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: isLight ? '0 10px 30px rgba(0,0,0,0.03)' : '0 10px 30px rgba(0,0,0,0.35)',
            cursor: 'pointer',
            transition: 'transform 0.2s ease'
          }} onClick={() => user ? onLaunchStudio() : onOpenAuth()}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(236, 72, 153, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Search size={24} color="#ec4899" />
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: '700', margin: 0 }}>LangChain Agent & Web Search</h3>
            <p style={{ fontSize: '0.92rem', color: subtextColor, lineHeight: 1.6, margin: 0 }}>
              Autonomous multi-step reasoning powered by LangChain tools, live DuckDuckGo web search integration, and prompt optimization engines.
            </p>
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', fontWeight: '700', color: '#ec4899' }}>
              Try Autonomous Agent <ArrowRight size={16} />
            </div>
          </div>

          {/* Module 6: Enterprise Analytics & Admin */}
          <div style={{
            background: cardBg,
            border: cardBorder,
            backdropFilter: 'blur(16px)',
            borderRadius: '20px',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: isLight ? '0 10px 30px rgba(0,0,0,0.03)' : '0 10px 30px rgba(0,0,0,0.35)',
            cursor: 'pointer',
            transition: 'transform 0.2s ease'
          }} onClick={() => user ? onLaunchStudio() : onOpenAuth()}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BarChart3 size={24} color="#f59e0b" />
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: '700', margin: 0 }}>Enterprise Metrics & Token Audit</h3>
            <p style={{ fontSize: '0.92rem', color: subtextColor, lineHeight: 1.6, margin: 0 }}>
              Real-time API latency tracking, token usage breakdowns, user session management, and system status health checks.
            </p>
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', fontWeight: '700', color: '#f59e0b' }}>
              View System Analytics <ArrowRight size={16} />
            </div>
          </div>

        </div>
      </section>

      {/* Footer removed to prevent double-layering with App.jsx Global Footer */}
    </div>
  );
}
