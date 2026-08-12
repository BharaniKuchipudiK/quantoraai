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
import './FlagshipShowcase.css';

export default function LandingPage({ onLaunchStudio, onStartBuild, onOpenAuth, user, availableModels = [], themeMode, setThemeMode }) {
  const [activeCapability, setActiveCapability] = useState('studio');

  // The hero's real prompt box — the same idea a build starts from. Not a
  // simulation: submitting it drops the visitor straight into a live build.
  const [heroPrompt, setHeroPrompt] = useState('');

  const heroExamples = [
    'A cozy cafe website with an online menu and ordering',
    'A portfolio site for a photographer with a booking form',
    'A landing page for my app with a waitlist signup',
    'An online boutique to sell handmade jewelry'
  ];

  const startBuild = (prompt) => {
    const text = (prompt ?? heroPrompt ?? '').toString();
    if (onStartBuild) onStartBuild(text);
    else if (user) onLaunchStudio();
    else onOpenAuth();
  };

  // The four steps that make Quantora outcome-first — all real product
  // behaviour, no mock. This is the journey, told as a filmstrip.
  const journey = [
    { icon: Sparkles, color: '#f97316', step: '01', title: 'Describe it', body: 'Say what you want in plain English. No templates, no setup — just the idea.' },
    { icon: Workflow, color: '#8b5cf6', step: '02', title: 'Refine in chat', body: 'Ask for changes conversationally. Quantora edits the live site as you talk.' },
    { icon: ShieldCheck, color: '#10b981', step: '03', title: 'It verifies itself', body: 'Every build runs in a sandbox and self-heals runtime errors before you see it.' },
    { icon: Globe2, color: '#06b6d4', step: '04', title: 'Publish & sell', body: 'Go live on your own domain and take real payments — your Stripe, your money.' }
  ];

  // Use global theme
  const isLight = themeMode === 'light';

  const bgColor = isLight ? '#f8fafc' : '#070913';
  const textColor = isLight ? '#0f172a' : '#ffffff';
  const subtextColor = isLight ? '#475569' : '#94a3b8';
  const cardBg = isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.75)';
  const cardBorder = isLight ? '1px solid #e2e8f0' : '1px solid rgba(249, 115, 22, 0.2)';
  const navBg = isLight ? 'rgba(255, 255, 255, 0.92)' : 'rgba(7, 9, 19, 0.88)';

  // Live model facts for the trust strip — sourced from the real registry the
  // app already fetched, so nothing here can drift out of date.
  const onlineModels = (availableModels || []).filter((m) => m && m.available !== false);
  const liveModelCount = onlineModels.length;
  const liveModelNames = onlineModels.slice(0, 5).map((m) => m.name).filter(Boolean);

  const flagshipCapabilities = [
    {
      id: 'studio',
      number: '01',
      label: 'Create',
      title: 'Build from a conversation.',
      description: 'Turn a natural-language idea into a working interface, then refine it with an AI partner that explains what it is doing.',
      action: 'Open AI Studio',
      image: '/card-bg-ai.jpg',
      color: '#f97316',
      icon: Code2
    },
    {
      id: 'canvas',
      number: '02',
      label: 'Shape',
      title: 'See the system before you build it.',
      description: 'Map ideas, decisions and architecture into a visual canvas that keeps complex work understandable.',
      action: 'Launch Dream Canvas',
      image: '/card-bg-canvas.jpg',
      color: '#f59e0b',
      icon: Workflow
    },
    {
      id: 'quantum',
      number: '03',
      label: 'Explore',
      title: 'Make quantum ideas tangible.',
      description: 'Simulate circuits, inspect state probabilities and learn by interacting instead of starting with a wall of mathematics.',
      action: 'Explore Quantum Horizon',
      image: '/card-bg-quantum.jpg',
      color: '#06b6d4',
      icon: Atom
    },
    {
      id: 'vault',
      number: '04',
      label: 'Protect',
      title: 'Keep access under your control.',
      description: 'Connect your own model keys through a privacy-minded gateway without turning security into another complicated workflow.',
      action: 'Open Privacy Vault',
      image: '/card-bg-vault.jpg',
      color: '#10b981',
      icon: ShieldCheck
    }
  ];

  const selectedCapability = flagshipCapabilities.find((item) => item.id === activeCapability) || flagshipCapabilities[0];
  const SelectedCapabilityIcon = selectedCapability.icon;

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
        height: 'calc(100vh - 67px)',
        minHeight: '550px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '0 5%',
        position: 'relative',
        zIndex: 10,
        backgroundImage: `url('/hero-bg.jpg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
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
          flex: 1,
          display: 'flex',
          alignItems: 'center'
        }}>
          <div style={{ maxWidth: '820px' }} className="animate-fade-in-up">
            {/* Eyebrow */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              fontSize: '0.82rem', fontWeight: '700', letterSpacing: '0.08em',
              textTransform: 'uppercase', color: '#ea580c',
              background: isLight ? 'rgba(249,115,22,0.1)' : 'rgba(249,115,22,0.16)',
              border: '1px solid rgba(249,115,22,0.35)',
              padding: '6px 14px', borderRadius: '9999px', marginBottom: '22px'
            }}>
              <Sparkles size={14} /> Prompt to published website
            </div>

            {/* Outcome headline */}
            <h1 style={{
              fontSize: 'clamp(2.6rem, 5vw, 4.8rem)',
              fontWeight: '900',
              lineHeight: 1.05,
              color: isLight ? '#0f172a' : '#ffffff',
              marginBottom: '18px',
              letterSpacing: '-0.025em'
            }}>
              Describe your idea.<br/>
              <span style={{
                background: 'linear-gradient(135deg, #fde047 0%, #ea580c 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                Get a real website you can publish.
              </span>
            </h1>

            {/* Subcopy */}
            <p style={{
              fontSize: 'clamp(1.1rem, 1.4vw, 1.3rem)',
              color: isLight ? '#334155' : '#e2e8f0',
              lineHeight: 1.55,
              fontWeight: '500',
              maxWidth: '620px',
              marginBottom: '28px'
            }}>
              Tell Quantora what you want in plain English. It builds a live, styled
              site, refines it as you chat, publishes to your own domain, and takes
              real payments — on your Stripe.
            </p>

            {/* Real prompt box */}
            <div style={{
              background: isLight ? 'rgba(255,255,255,0.96)' : 'rgba(11,15,25,0.92)',
              border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(249,115,22,0.3)',
              borderRadius: '18px',
              padding: '14px',
              maxWidth: '640px',
              boxShadow: '0 18px 50px rgba(0,0,0,0.18)'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
                <textarea
                  value={heroPrompt}
                  onChange={(e) => setHeroPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); startBuild(); } }}
                  rows={2}
                  placeholder="A cozy cafe website with an online menu and ordering…"
                  style={{
                    flex: 1, resize: 'none', border: 'none', outline: 'none',
                    background: 'transparent', color: textColor,
                    fontSize: '1rem', lineHeight: 1.5, fontFamily: 'inherit',
                    padding: '8px 6px', maxHeight: '120px'
                  }}
                />
                <button
                  onClick={() => startBuild()}
                  style={{
                    flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                    color: '#ffffff', border: 'none',
                    padding: '12px 22px', borderRadius: '12px',
                    fontSize: '0.98rem', fontWeight: '800', cursor: 'pointer',
                    boxShadow: '0 6px 18px rgba(249,115,22,0.4)'
                  }}
                >
                  Build free <ArrowRight size={17} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            {/* Example chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px', maxWidth: '640px' }}>
              <span style={{ fontSize: '0.82rem', color: isLight ? '#64748b' : '#94a3b8', fontWeight: '600', alignSelf: 'center' }}>Try:</span>
              {heroExamples.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => { setHeroPrompt(ex); }}
                  style={{
                    fontSize: '0.8rem', fontWeight: '600',
                    padding: '6px 12px', borderRadius: '9999px', cursor: 'pointer',
                    background: isLight ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)',
                    border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255,255,255,0.14)',
                    color: isLight ? '#334155' : '#cbd5e1'
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Live model trust strip — pulled from the real registry, never hardcoded */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          borderTop: isLight ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(255,255,255,0.15)',
          paddingTop: '18px',
          paddingBottom: '28px',
          zIndex: 10,
          flexWrap: 'wrap',
          position: 'relative'
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '0.85rem', fontWeight: '700', color: isLight ? '#0f172a' : '#ffffff' }}>
            <Cpu size={15} color="#f97316" />
            {liveModelCount > 0 ? `${liveModelCount} live models` : 'Live model routing'}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {liveModelNames.map((name, i) => (
              <span key={i} style={{
                fontSize: '0.76rem', fontWeight: '600',
                padding: '4px 11px', borderRadius: '9999px',
                background: isLight ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.07)',
                border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255,255,255,0.12)',
                color: isLight ? '#334155' : '#cbd5e1'
              }}>{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — the real journey, no simulation */}
      <section style={{ maxWidth: '1180px', margin: '10px auto 90px auto', padding: '0 24px', position: 'relative', zIndex: 10 }}>
        <div style={{ textAlign: 'center', marginBottom: '44px' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ea580c' }}>From idea to income</span>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', fontWeight: '800', margin: '10px 0 12px', color: textColor, letterSpacing: '-0.02em' }}>Four steps. One sentence to a live business.</h2>
          <p style={{ fontSize: '1.05rem', color: subtextColor, maxWidth: '640px', margin: '0 auto', lineHeight: 1.6 }}>No code, no setup, no templates. The value is the finished website you can share and sell on — not the code behind it.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
          {journey.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} style={{ background: cardBg, border: cardBorder, borderRadius: '20px', padding: '26px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '14px', right: '18px', fontSize: '2.4rem', fontWeight: '900', color: s.color, opacity: 0.14, lineHeight: 1 }}>{s.step}</div>
                <div style={{ width: '46px', height: '46px', borderRadius: '13px', background: `${s.color}1f`, border: `1px solid ${s.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <Icon size={22} color={s.color} />
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', margin: '0 0 8px', color: textColor }}>{s.title}</h3>
                <p style={{ fontSize: '0.92rem', color: subtextColor, lineHeight: 1.55, margin: 0 }}>{s.body}</p>
              </div>
            );
          })}
        </div>
        <div style={{ textAlign: 'center', marginTop: '40px' }}>
          <button onClick={() => startBuild()} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', color: '#fff', border: 'none', padding: '15px 32px', borderRadius: '14px', fontSize: '1.05rem', fontWeight: '800', cursor: 'pointer', boxShadow: '0 10px 28px rgba(249,115,22,0.4)' }}>
            Start building free <ArrowRight size={19} strokeWidth={2.5} />
          </button>
        </div>
      </section>
      <section className="flagship-experience" aria-labelledby="flagship-experience-title">
        <div className="flagship-experience-heading">
          <span>Also inside Quantora</span>
          <h2 id="flagship-experience-title">Building sites is the start.</h2>
          <p>Your workspace also lets you map ideas visually, explore quantum circuits, and keep your model keys under your own control.</p>
        </div>

        <div
          className="flagship-stage"
          style={{ '--flagship-accent': selectedCapability.color }}
        >
          <div
            key={selectedCapability.id}
            className="flagship-stage-image"
            style={{ backgroundImage: `url(${selectedCapability.image})` }}
          />
          <div className="flagship-stage-shade" />

          <div key={`${selectedCapability.id}-content`} className="flagship-stage-content">
            <div className="flagship-stage-label">
              <SelectedCapabilityIcon size={18} />
              <span>{selectedCapability.number} / {selectedCapability.label}</span>
            </div>
            <h3>{selectedCapability.title}</h3>
            <p>{selectedCapability.description}</p>
            <button onClick={() => user ? onLaunchStudio() : onOpenAuth()}>
              {selectedCapability.action} <ArrowRight size={17} />
            </button>
          </div>

          <div className="flagship-stage-nav" role="tablist" aria-label="Quantora experiences">
            {flagshipCapabilities.map((item) => {
              const ItemIcon = item.icon;
              const isActive = item.id === selectedCapability.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={isActive ? 'is-active' : ''}
                  style={{ '--item-accent': item.color }}
                  onClick={() => setActiveCapability(item.id)}
                >
                  <span>{item.number}</span>
                  <ItemIcon size={16} />
                  <strong>{item.label}</strong>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flagship-supporting-strip">
          <div>
            <Search size={17} color="#ec4899" />
            <span><strong>Agent-assisted research</strong><small>Search and multi-step reasoning when the task demands it.</small></span>
          </div>
          <div>
            <BarChart3 size={17} color="#8b5cf6" />
            <span><strong>Live model intelligence</strong><small>Availability, reliability and usage without operational clutter.</small></span>
          </div>
        </div>
      </section>

      {/* Footer removed to prevent double-layering with App.jsx Global Footer */}
    </div>
  );
}
