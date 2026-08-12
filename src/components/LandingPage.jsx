import React, { useState, useRef, useEffect } from 'react';
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
import './LandingPage.css';

/*
 * Reveal-on-scroll wrapper. Content starts slightly lowered and transparent,
 * then eases into place the first time it enters the viewport — so the page
 * unfolds as you scroll instead of presenting a static wall of text. Honors
 * reduced-motion and degrades to "always visible" without IntersectionObserver.
 */
function Reveal({ children, delay = 0, style, className }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} style={{
      ...style,
      opacity: shown ? 1 : 0,
      transform: shown ? 'none' : 'translateY(30px)',
      transition: `opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      willChange: 'opacity, transform'
    }}>{children}</div>
  );
}

export default function LandingPage({ onLaunchStudio, onStartBuild, onOpenAuth, user, availableModels = [], themeMode, setThemeMode }) {
  const [activeCapability, setActiveCapability] = useState('studio');

  // The hero's real prompt box — the same idea a build starts from. Not a
  // simulation: submitting it drops the visitor straight into a live build.
  const [heroPrompt, setHeroPrompt] = useState('');
  const [phIdx, setPhIdx] = useState(0);

  const heroExamples = [
    'A research assistant that searches papers and summarizes them…',
    'A study planner that turns my syllabus into daily goals…',
    'A dashboard to track weekly metrics for my team…',
    'A tool that turns my lecture notes into flashcards…',
    'An invoice generator for my consulting clients…',
    'A cozy cafe website with online ordering…',
    'A literature-review helper for my thesis…',
    'A portfolio for a photographer with a booking form…'
  ];

  // Cycle the prompt placeholder so ideas suggest themselves as gentle motion,
  // instead of a static block of example chips sitting on the page. Pauses
  // while the visitor is actually typing.
  useEffect(() => {
    if (heroPrompt) return;
    const t = setInterval(() => setPhIdx((i) => (i + 1) % heroExamples.length), 2600);
    return () => clearInterval(t);
  }, [heroPrompt, heroExamples.length]);

  const startBuild = (prompt) => {
    const text = (prompt ?? heroPrompt ?? '').toString();
    if (onStartBuild) onStartBuild(text);
    else if (user) onLaunchStudio();
    else onOpenAuth();
  };

  // The four steps that make Quantora outcome-first — all real product
  // behaviour, no mock. This is the journey, told as a filmstrip.
  const journey = [
    { icon: Sparkles, color: '#f97316', step: '01', title: 'Define the outcome', body: 'State what you need in plain language — no templates, configuration, or code required.' },
    { icon: Workflow, color: '#8b5cf6', step: '02', title: 'Refine through dialogue', body: 'Quantora clarifies requirements, proposes options, and iterates with you until the result is right.' },
    { icon: ShieldCheck, color: '#10b981', step: '03', title: 'Validate before delivery', body: 'Every build runs in a live sandbox and self-corrects errors before it reaches you.' },
    { icon: Globe2, color: '#06b6d4', step: '04', title: 'Deploy and transact', body: 'Publish to your domain on Vercel and accept payments through your own Stripe account.' }
  ];

  const techPillars = [
    { icon: Layers, color: '#f97316', title: 'Multi-model orchestration', body: 'Requests route across approved frontier models — selecting the right capability for each task.' },
    { icon: ShieldCheck, color: '#10b981', title: 'Self-healing build loop', body: 'Generated artifacts are executed, verified, and repaired automatically before delivery.' },
    { icon: Workflow, color: '#8b5cf6', title: 'Conversation-first workflow', body: 'No rigid forms. Requirements emerge naturally through structured dialogue.' },
    { icon: Lock, color: '#06b6d4', title: 'Privacy by design', body: 'Bring your own API keys. Your data, models, and outputs remain under your control.' }
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

  const outcomes = [
    { metric: 'Preview', title: 'Working builds in minutes', body: 'Open runnable HTML in the live canvas — see, test, and refine before you ship.' },
    { metric: 'Publish', title: 'Live on your domain', body: 'Deploy to Vercel in one click. You own the site, the code, and the deployment.' },
    { metric: 'Transact', title: 'Payments on sites you build', body: 'Connect Stripe and accept payments directly — infrastructure we provide, revenue you keep.' }
  ];

  const flagshipCapabilities = [
    {
      id: 'studio',
      number: '01',
      label: 'Create',
      title: 'Build from a conversation.',
      description: 'Turn a natural-language idea into a working interface, then refine it with an AI partner that explains what it is doing.',
      action: 'Open AI Studio',
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
      color: '#10b981',
      icon: ShieldCheck
    }
  ];

  const selectedCapability = flagshipCapabilities.find((item) => item.id === activeCapability) || flagshipCapabilities[0];
  const SelectedCapabilityIcon = selectedCapability.icon;

  return (
    <div className="landing-page" style={{
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

      {/* Hero — same column width as every section below */}
      <section
        className="landing-hero"
        style={{
          position: 'relative',
          zIndex: 10,
          background: isLight
            ? 'radial-gradient(900px 420px at 18% -8%, rgba(249,115,22,0.10), rgba(255,255,255,0) 62%), #ffffff'
            : 'radial-gradient(900px 460px at 18% -6%, rgba(249,115,22,0.14), rgba(7,9,19,0) 60%), #070913'
        }}
      >
        <div className="landing-container animate-fade-in-up">
          <div className="landing-hero__eyebrow" style={{ color: isLight ? '#9a3412' : '#fdba74' }}>
            <span className="landing-hero__eyebrow-dot" />
            Possibility, built with purpose
          </div>

          <h1 className="landing-hero__title" style={{ color: isLight ? '#0b1220' : '#ffffff' }}>
            From intent to <span style={{ color: '#ea580c' }}>outcome.</span>
          </h1>

          <p className="landing-hero__subtitle" style={{ color: subtextColor }}>
            Describe what you need in plain language. Quantora orchestrates frontier models to deliver working results — in one conversation.
          </p>

          <div
            className="landing-hero__prompt"
            style={{
              background: isLight ? '#ffffff' : 'rgba(17,23,38,0.92)',
              border: isLight ? '1px solid #e5e7eb' : '1px solid rgba(255,255,255,0.1)',
              boxShadow: isLight ? '0 14px 44px rgba(15,23,42,0.10)' : '0 14px 48px rgba(0,0,0,0.5)'
            }}
          >
            <textarea
              value={heroPrompt}
              onChange={(e) => setHeroPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); startBuild(); } }}
              rows={1}
              placeholder={heroExamples[phIdx]}
              style={{
                flex: 1, resize: 'none', border: 'none', outline: 'none',
                background: 'transparent', color: textColor,
                fontSize: '1.02rem', lineHeight: 1.5, fontFamily: 'inherit',
                padding: '11px 0', maxHeight: '120px'
              }}
            />
            <button onClick={() => startBuild()} style={{
              flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: '#ea580c', color: '#ffffff', border: 'none',
              padding: '13px 24px', borderRadius: '11px',
              fontSize: '0.98rem', fontWeight: '700', cursor: 'pointer'
            }}>
              Build free <ArrowRight size={17} strokeWidth={2.5} />
            </button>
          </div>

          <div className="landing-hero__models" style={{ color: isLight ? '#64748b' : '#94a3b8' }}>
            <span>{liveModelCount > 0 ? `${liveModelCount} live models` : 'Live model routing'}</span>
            {liveModelNames.map((name, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ opacity: 0.4 }}>·</span> {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Outcomes — value-first, same width rhythm as hero */}
      <section className={`landing-section landing-outcomes ${isLight ? 'is-light' : ''}`}>
        <div className="landing-container">
          <Reveal>
            <div className="landing-section__header">
              <span className="landing-section__eyebrow" style={{ color: '#fdba74' }}>What you get</span>
              <h2 className="landing-section__title" style={{ color: '#ffffff' }}>Real outcomes, not chat logs.</h2>
              <p className="landing-section__lead" style={{ color: 'rgba(255,255,255,0.72)' }}>
                Every session is designed to finish with something you can open, share, or operate — a live preview, a published page, or a plan you can execute tomorrow.
              </p>
            </div>
            <div className="landing-outcomes__grid">
              {outcomes.map((item) => (
                <div key={item.metric} className="landing-outcome-card">
                  <em>{item.metric}</em>
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                </div>
              ))}
            </div>
            <p style={{
              margin: 'clamp(28px, 4vh, 36px) 0 0',
              paddingLeft: '18px',
              borderLeft: '3px solid #f97316',
              fontSize: 'clamp(1.05rem, 1.6vw, 1.25rem)',
              lineHeight: 1.55,
              fontWeight: 500,
              color: 'rgba(255,255,255,0.88)',
              maxWidth: '720px'
            }}>
              The distance between an idea and a deployed outcome should be measured in conversation — not in quarters, headcount, or capital.
            </p>
          </Reveal>
        </div>
      </section>

      {/* How it works */}
      <section className="landing-section" style={{ position: 'relative', zIndex: 10 }}>
        <div className="landing-container">
        <Reveal>
          <div className="landing-section__header is-center">
            <span className="landing-section__eyebrow">How it works</span>
            <h2 className="landing-section__title" style={{ color: textColor }}>Four stages. One continuous workflow.</h2>
            <p className="landing-section__lead" style={{ color: subtextColor }}>From first prompt to published site — every step is designed to produce a result you can use, share, and operate.</p>
          </div>
        </Reveal>
        <div className="landing-card-grid">
          {journey.map((s, i) => {
            const Icon = s.icon;
            return (
              <Reveal key={i} delay={i * 90} style={{ height: '100%' }}>
              <div className="landing-card" style={{ background: cardBg, border: cardBorder }}>
                <div className="landing-card__step" style={{ color: s.color }}>{s.step}</div>
                <div className="landing-card__icon" style={{ background: `${s.color}1f`, border: `1px solid ${s.color}55` }}>
                  <Icon size={22} color={s.color} />
                </div>
                <h3 style={{ color: textColor }}>{s.title}</h3>
                <p style={{ color: subtextColor }}>{s.body}</p>
              </div>
              </Reveal>
            );
          })}
        </div>
        <Reveal delay={120}>
          <div style={{ textAlign: 'center', marginTop: '36px' }}>
            <button onClick={() => startBuild()} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', color: '#fff', border: 'none', padding: '15px 32px', borderRadius: '14px', fontSize: '1.05rem', fontWeight: '800', cursor: 'pointer', boxShadow: '0 10px 28px rgba(249,115,22,0.4)' }}>
              Start building free <ArrowRight size={19} strokeWidth={2.5} />
            </button>
          </div>
        </Reveal>
        </div>
      </section>

      {/* Platform */}
      <section className="landing-section" style={{ position: 'relative', zIndex: 10, paddingTop: 0 }}>
        <div className="landing-container">
        <Reveal>
          <div className="landing-section__header is-center">
            <span className="landing-section__eyebrow">Platform</span>
            <h2 className="landing-section__title" style={{ color: textColor }}>Engineered for reliability, not hype.</h2>
            <p className="landing-section__lead" style={{ color: subtextColor }}>Model routing, automated verification, and a privacy-first gateway — built to turn dialogue into dependable outcomes.</p>
          </div>
        </Reveal>
        <div className="landing-card-grid">
          {techPillars.map((t, i) => {
            const Icon = t.icon;
            return (
              <Reveal key={i} delay={i * 90} style={{ height: '100%' }}>
              <div className="landing-card" style={{ background: cardBg, border: cardBorder }}>
                <div className="landing-card__icon" style={{ background: `${t.color}1f`, border: `1px solid ${t.color}55` }}>
                  <Icon size={22} color={t.color} />
                </div>
                <h3 style={{ color: textColor }}>{t.title}</h3>
                <p style={{ color: subtextColor }}>{t.body}</p>
              </div>
              </Reveal>
            );
          })}
        </div>
        </div>
      </section>

      {/* Studio modules — text-first, no heavy photography */}
      <section className="landing-section" style={{ position: 'relative', zIndex: 10, paddingTop: 0 }}>
        <div className="landing-container">
        <Reveal>
          <div className="landing-section__header">
            <span className="landing-section__eyebrow">The studio</span>
            <h2 className="landing-section__title" style={{ color: textColor }}>Four surfaces. One build loop.</h2>
            <p className="landing-section__lead" style={{ color: subtextColor }}>
              Create, shape, explore, and protect — each module connects back to the same conversation, so you never lose context between idea and delivery.
            </p>
          </div>
        </Reveal>

        <div className="landing-card-grid">
          {flagshipCapabilities.map((item) => {
            const ItemIcon = item.icon;
            const isActive = item.id === selectedCapability.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`landing-capability ${isLight ? 'is-light' : ''}${isActive ? ' is-active' : ''}`}
                style={{ '--cap-accent': item.color, color: textColor }}
                onClick={() => setActiveCapability(item.id)}
              >
                <div className="landing-capability__label">{item.number} · {item.label}</div>
                <h3>{item.title}</h3>
                <p style={{ color: subtextColor }}>{item.description}</p>
                <ItemIcon size={16} style={{ position: 'absolute', top: 16, right: 16, opacity: 0.35, color: item.color }} />
              </button>
            );
          })}
        </div>

        <Reveal delay={60}>
          <div className={`landing-capability-panel ${isLight ? 'is-light' : ''}`} style={{ '--panel-accent': selectedCapability.color }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: selectedCapability.color, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              <SelectedCapabilityIcon size={16} />
              {selectedCapability.number} / {selectedCapability.label}
            </div>
            <h3 style={{ fontSize: 'clamp(1.2rem, 2vw, 1.5rem)', fontWeight: 600, margin: '0 0 10px', color: textColor }}>{selectedCapability.title}</h3>
            <p style={{ margin: '0 0 20px', maxWidth: '560px', lineHeight: 1.6, color: subtextColor }}>{selectedCapability.description}</p>
            <button
              onClick={() => user ? onLaunchStudio() : onOpenAuth()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                background: selectedCapability.color, color: '#fff', border: 'none',
                padding: '12px 22px', borderRadius: '10px',
                fontSize: '0.92rem', fontWeight: 700, cursor: 'pointer'
              }}
            >
              {selectedCapability.action} <ArrowRight size={16} />
            </button>
          </div>
        </Reveal>
        </div>
      </section>

      {/* Footer removed to prevent double-layering with App.jsx Global Footer */}
    </div>
  );
}
