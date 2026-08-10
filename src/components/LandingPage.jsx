import React, { useState } from 'react';
import AuroraBackground from './AuroraBackground';
import { QuantoraEmblemSvg, QuantoraFullLogoSvg } from './QuantoraLogoSvg';
import { 
  Sparkles, 
  Workflow, 
  Cpu, 
  ShieldCheck, 
  ArrowRight, 
  ArrowLeft,
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

export default function LandingPage({ onLaunchStudio, onOpenAuth, user, themeMode, setThemeMode }) {
  const [activeDemoTab, setActiveDemoTab] = useState('app-builder'); // 'app-builder', 'quantum', 'multi-model', 'vault'
  const [selectedPrompt, setSelectedPrompt] = useState('Create a real-time crypto portfolio tracker with dark glassmorphic charts');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationComplete, setSimulationComplete] = useState(false);

  // Hero Carousel State
  const [heroSlide, setHeroSlide] = useState(0);

  const heroSlides = [
    {
      bg: '/hero-bg.jpg',
      headline: <>Confidence to reimagine.<br/></>,
      gradientText: 'Power to realize.',
      sub: 'Quantora gives you the power to unleash your ideas. Transform your dreams into live software, scale your vision, and shape the future.',
      cta: 'Start here',
      nav: 'AI Studio'
    },
    {
      bg: '/hero-bg.jpg',
      headline: <>Visualize architecture.<br/></>,
      gradientText: 'Architect the future.',
      sub: 'Map out your software architecture visually. Convert abstract concepts into structured, executable nodes in real-time.',
      cta: 'Launch Canvas',
      nav: 'Dream Canvas'
    },
    {
      bg: '/hero-bg.jpg',
      headline: <>Simulate logic.<br/></>,
      gradientText: 'Command the quantum realm.',
      sub: 'Simulate 2-Qubit logic gates, compute exact state vector matrices, and synthesize IBM Qiskit code.',
      cta: 'Simulate Circuits',
      nav: 'Quantum Horizon'
    }
  ];

  const nextSlide = () => setHeroSlide((prev) => (prev + 1) % heroSlides.length);
  const prevSlide = () => setHeroSlide((prev) => (prev - 1 + heroSlides.length) % heroSlides.length);


  // Use global theme
  const isLight = themeMode === 'light';

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
      {/* Header Navigation */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: navBg,
        backdropFilter: 'blur(20px)',
        borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(249, 115, 22, 0.2)',
        padding: '14px 5%',
        transition: 'all 0.3s ease'
      }}>
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
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

          {/* Theme Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', zIndex: 60 }}>
            <button
              onClick={() => setThemeMode(isLight ? 'dark' : 'light')}
              style={{
                background: isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.08)',
                border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.2)',
                color: textColor,
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease'
              }}
              title="Toggle Theme"
            >
              {isLight ? <Moon size={18} color="#8b5cf6" /> : <Sun size={18} color="#fb923c" />}
            </button>

            {user && (
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
            )}
          </div>
        </div>
      </header>

      {/* Flagship Hero Section */}
      <section style={{
        width: '100%',
        height: 'calc(100vh - 67px)', // Fits perfectly within viewport accounting for header
        minHeight: '600px', // Fallback for very small screens
        display: 'flex',
        alignItems: 'center',
        padding: '0 5%',
        position: 'relative',
        zIndex: 10,
        backgroundImage: `url(${heroSlides[heroSlide].bg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        transition: 'background-image 0.5s ease-in-out'
      }}>
        {/* Subtle gradient behind text instead of washing out the entire image */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '50%',
          height: '100%',
          background: 'linear-gradient(90deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 100%)',
          zIndex: 0,
          opacity: isLight ? 1 : 0
        }} />
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '60%',
          height: '100%',
          background: 'linear-gradient(90deg, rgba(7,9,19,0.9) 0%, rgba(7,9,19,0) 100%)',
          zIndex: 0,
          opacity: isLight ? 0 : 1
        }} />

        <div style={{
          width: '100%',
          textAlign: 'left',
          position: 'relative',
          zIndex: 10,
          marginTop: '-40px' // Nudge up slightly to balance bottom carousel
        }}>
          <div style={{ maxWidth: '900px' }} key={heroSlide} className="animate-fade-in-up">
            {/* Headline */}
            <h1 style={{
              fontSize: 'clamp(4rem, 7vw, 7.5rem)',
              fontWeight: '900',
              lineHeight: 1.05,
              color: isLight ? '#0f172a' : '#ffffff', // Ensure high contrast against the subtle gradient
              marginBottom: '24px',
              letterSpacing: '-0.02em',
              textTransform: 'uppercase'
            }}>
              {heroSlides[heroSlide].headline}
              <span style={{
                background: 'linear-gradient(135deg, #fde047 0%, #ea580c 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                {heroSlides[heroSlide].gradientText}
              </span>
            </h1>

            {/* Subtitle */}
            <div style={{
              borderLeft: '5px solid #f97316',
              paddingLeft: '24px',
              marginBottom: '40px',
              maxWidth: '700px'
            }}>
              <p style={{
                fontSize: 'clamp(1.15rem, 1.5vw, 1.4rem)',
                color: isLight ? '#334155' : '#e2e8f0',
                lineHeight: 1.6,
                fontWeight: '600'
              }}>
                {heroSlides[heroSlide].sub}
              </p>
            </div>

            {/* Primary Call to Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <button
                onClick={() => user ? onLaunchStudio() : onOpenAuth()}
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  cursor: 'pointer',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  boxShadow: '0 12px 30px rgba(0,0,0,0.15)'
                }}
              >
                <div style={{
                  padding: '20px 36px',
                  fontSize: '1.25rem',
                  fontWeight: '800',
                  background: '#000000',
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  {heroSlides[heroSlide].cta}
                </div>
                <div style={{
                  padding: '0 24px',
                  background: '#ea580c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  transition: 'background 0.2s'
                }} className="hover:bg-amber-500">
                  <ChevronRight size={28} strokeWidth={3} />
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Interactive Navigation / Carousel Controls (EY Style) */}
        <div style={{
          position: 'absolute',
          bottom: '30px',
          left: '5%',
          right: '5%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: isLight ? '1px solid rgba(0,0,0,0.2)' : '1px solid rgba(255,255,255,0.2)',
          paddingTop: '20px',
          zIndex: 10,
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          {/* Link List */}
          <div style={{ display: 'flex', gap: '40px', overflowX: 'auto', paddingBottom: '4px' }}>
            {heroSlides.map((slide, index) => (
              <span 
                key={index}
                onClick={() => setHeroSlide(index)}
                style={{ 
                  fontSize: '1.05rem', 
                  fontWeight: heroSlide === index ? '800' : '600', 
                  color: isLight ? '#0f172a' : '#ffffff', 
                  opacity: heroSlide === index ? 1 : 0.6,
                  borderBottom: heroSlide === index ? '3px solid #ea580c' : '3px solid transparent', 
                  paddingBottom: '6px', 
                  cursor: 'pointer', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.05em',
                  transition: 'all 0.2s ease'
                }} 
                className="hover:opacity-100"
              >
                {slide.nav}
              </span>
            ))}
          </div>

          {/* Circular Controls */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button onClick={prevSlide} style={{ width: '44px', height: '44px', borderRadius: '50%', border: 'none', background: isLight ? '#000000' : '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: isLight ? '#ffffff' : '#000000', transition: 'transform 0.2s, background 0.2s', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }} className="hover:scale-105 hover:bg-amber-600">
              <ArrowLeft size={20} strokeWidth={2} />
            </button>
            <button onClick={nextSlide} style={{ width: '44px', height: '44px', borderRadius: '50%', border: 'none', background: isLight ? '#000000' : '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: isLight ? '#ffffff' : '#000000', transition: 'transform 0.2s, background 0.2s', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }} className="hover:scale-105 hover:bg-amber-600">
              <ArrowRight size={20} strokeWidth={2} />
            </button>
          </div>
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
      <section style={{ maxWidth: '1350px', margin: '0 auto 100px auto', padding: '0 24px', position: 'relative', zIndex: 10 }}>
        <div style={{ textAlign: 'center', marginBottom: '60px' }}>
          <h2 style={{ fontSize: '2.8rem', fontWeight: '900', marginBottom: '16px', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
            Flagship Capabilities
          </h2>
          <p style={{ color: subtextColor, fontSize: '1.15rem', maxWidth: '700px', margin: '0 auto', fontWeight: '500' }}>
            Engineered for developers, creators, and quantum researchers looking for unmatched speed, security, and multi-model intelligence.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '32px' }}>
          
          {/* Module 1: AI Studio */}
          <div 
            className="group relative overflow-hidden rounded-2xl cursor-pointer"
            style={{ minHeight: '450px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}
            onClick={() => user ? onLaunchStudio() : onOpenAuth()}
          >
            {/* Background Image that scales on hover */}
            <div 
              className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-110"
              style={{ backgroundImage: 'url(/card-bg-ai.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
            />
            {/* Gradient Overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />
            
            {/* Frosted Glass Content Panel */}
            <div className="absolute bottom-0 left-0 right-0 p-8 transition-transform duration-500 ease-out group-hover:-translate-y-4">
              <div style={{ borderLeft: '4px solid #f97316', paddingLeft: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#f97316', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Interactive</span>
              </div>
              <h3 style={{ fontSize: '1.8rem', fontWeight: '800', color: '#ffffff', margin: '0 0 12px 0', lineHeight: 1.15 }}>AI Studio & Live Web Builder</h3>
              <div className="grid transition-all duration-500 ease-in-out grid-rows-[0fr] opacity-0 group-hover:grid-rows-[1fr] group-hover:opacity-100">
                <div className="overflow-hidden">
                  <p style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, margin: '0 0 16px 0' }}>
                    Generate complete, functional React & HTML applications from natural language prompts with real-time SSE streaming.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', fontSize: '0.95rem', fontWeight: '800', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Open AI Studio <ArrowRight size={18} color="#f97316" />
              </div>
            </div>
          </div>

          {/* Module 2: Canvas */}
          <div 
            className="group relative overflow-hidden rounded-2xl cursor-pointer"
            style={{ minHeight: '450px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}
            onClick={() => user ? onLaunchStudio() : onOpenAuth()}
          >
            <div 
              className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-110"
              style={{ backgroundImage: 'url(/card-bg-canvas.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />
            
            <div className="absolute bottom-0 left-0 right-0 p-8 transition-transform duration-500 ease-out group-hover:-translate-y-4">
              <div style={{ borderLeft: '4px solid #f59e0b', paddingLeft: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#f59e0b', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Visualizer</span>
              </div>
              <h3 style={{ fontSize: '1.8rem', fontWeight: '800', color: '#ffffff', margin: '0 0 12px 0', lineHeight: 1.15 }}>Dream-to-Action Canvas</h3>
              <div className="grid transition-all duration-500 ease-in-out grid-rows-[0fr] opacity-0 group-hover:grid-rows-[1fr] group-hover:opacity-100">
                <div className="overflow-hidden">
                  <p style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, margin: '0 0 16px 0' }}>
                    Map out software architecture visually. Convert abstract concepts into structured, executable nodes.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', fontSize: '0.95rem', fontWeight: '800', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Launch Canvas <ArrowRight size={18} color="#f59e0b" />
              </div>
            </div>
          </div>

          {/* Module 3: Quantum */}
          <div 
            className="group relative overflow-hidden rounded-2xl cursor-pointer"
            style={{ minHeight: '450px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}
            onClick={() => user ? onLaunchStudio() : onOpenAuth()}
          >
            <div 
              className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-110"
              style={{ backgroundImage: 'url(/card-bg-quantum.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />
            
            <div className="absolute bottom-0 left-0 right-0 p-8 transition-transform duration-500 ease-out group-hover:-translate-y-4">
              <div style={{ borderLeft: '4px solid #06b6d4', paddingLeft: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#06b6d4', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Simulator</span>
              </div>
              <h3 style={{ fontSize: '1.8rem', fontWeight: '800', color: '#ffffff', margin: '0 0 12px 0', lineHeight: 1.15 }}>Quantum Horizon & 3D Qubits</h3>
              <div className="grid transition-all duration-500 ease-in-out grid-rows-[0fr] opacity-0 group-hover:grid-rows-[1fr] group-hover:opacity-100">
                <div className="overflow-hidden">
                  <p style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, margin: '0 0 16px 0' }}>
                    Simulate quantum logic gates, compute state vector matrices, and visualize 3D Bloch Spheres in real-time.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', fontSize: '0.95rem', fontWeight: '800', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Simulate Circuits <ArrowRight size={18} color="#06b6d4" />
              </div>
            </div>
          </div>

          {/* Module 4: Vault */}
          <div 
            className="group relative overflow-hidden rounded-2xl cursor-pointer"
            style={{ minHeight: '450px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}
            onClick={() => user ? onLaunchStudio() : onOpenAuth()}
          >
            <div 
              className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-110"
              style={{ backgroundImage: 'url(/card-bg-vault.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />
            
            <div className="absolute bottom-0 left-0 right-0 p-8 transition-transform duration-500 ease-out group-hover:-translate-y-4">
              <div style={{ borderLeft: '4px solid #10b981', paddingLeft: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#10b981', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Security</span>
              </div>
              <h3 style={{ fontSize: '1.8rem', fontWeight: '800', color: '#ffffff', margin: '0 0 12px 0', lineHeight: 1.15 }}>Privacy Vault & API Gateway</h3>
              <div className="grid transition-all duration-500 ease-in-out grid-rows-[0fr] opacity-0 group-hover:grid-rows-[1fr] group-hover:opacity-100">
                <div className="overflow-hidden">
                  <p style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, margin: '0 0 16px 0' }}>
                    Store custom API keys securely using enterprise-grade encryption with zero log exposure.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', fontSize: '0.95rem', fontWeight: '800', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Configure Vault <ArrowRight size={18} color="#10b981" />
              </div>
            </div>
          </div>

          {/* Module 5: Langchain */}
          <div 
            className="group relative overflow-hidden rounded-2xl cursor-pointer"
            style={{ minHeight: '450px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}
            onClick={() => user ? onLaunchStudio() : onOpenAuth()}
          >
            <div 
              className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-110"
              style={{ backgroundImage: 'url(/card-bg-langchain.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />
            
            <div className="absolute bottom-0 left-0 right-0 p-8 transition-transform duration-500 ease-out group-hover:-translate-y-4">
              <div style={{ borderLeft: '4px solid #ec4899', paddingLeft: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#ec4899', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Autonomous</span>
              </div>
              <h3 style={{ fontSize: '1.8rem', fontWeight: '800', color: '#ffffff', margin: '0 0 12px 0', lineHeight: 1.15 }}>LangChain Agent & Web Search</h3>
              <div className="grid transition-all duration-500 ease-in-out grid-rows-[0fr] opacity-0 group-hover:grid-rows-[1fr] group-hover:opacity-100">
                <div className="overflow-hidden">
                  <p style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, margin: '0 0 16px 0' }}>
                    Multi-step reasoning powered by LangChain tools, live DuckDuckGo web search integration, and prompt optimization.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', fontSize: '0.95rem', fontWeight: '800', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Try Agent <ArrowRight size={18} color="#ec4899" />
              </div>
            </div>
          </div>

          {/* Module 6: Metrics */}
          <div 
            className="group relative overflow-hidden rounded-2xl cursor-pointer"
            style={{ minHeight: '450px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}
            onClick={() => user ? onLaunchStudio() : onOpenAuth()}
          >
            <div 
              className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-110"
              style={{ backgroundImage: 'url(/card-bg-metrics.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />
            
            <div className="absolute bottom-0 left-0 right-0 p-8 transition-transform duration-500 ease-out group-hover:-translate-y-4">
              <div style={{ borderLeft: '4px solid #8b5cf6', paddingLeft: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#8b5cf6', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Analytics</span>
              </div>
              <h3 style={{ fontSize: '1.8rem', fontWeight: '800', color: '#ffffff', margin: '0 0 12px 0', lineHeight: 1.15 }}>Enterprise Metrics & Token Audit</h3>
              <div className="grid transition-all duration-500 ease-in-out grid-rows-[0fr] opacity-0 group-hover:grid-rows-[1fr] group-hover:opacity-100">
                <div className="overflow-hidden">
                  <p style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, margin: '0 0 16px 0' }}>
                    Real-time API latency tracking, token usage breakdowns, user session management, and system status health checks.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', fontSize: '0.95rem', fontWeight: '800', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                View Analytics <ArrowRight size={18} color="#8b5cf6" />
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Footer removed to prevent double-layering with App.jsx Global Footer */}
    </div>
  );
}
