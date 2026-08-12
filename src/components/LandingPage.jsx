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
import './FlagshipShowcase.css';

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

// Per-capability cinematic canvas — a rich indigo base with two ambient
// accent glows. The bright focal object is a separate luminous orb element
// (see .flagship-stage-orb) so the right side reads as a composed visual, not
// empty space. On-brand per experience, and it can never 404.
function stageBackground(c) {
  return `radial-gradient(1100px 520px at 100% 0%, ${c}26, transparent 60%), radial-gradient(760px 640px at 16% 118%, ${c}24, transparent 58%), linear-gradient(120deg, #0a0f22 0%, #121a3a 54%, #0a1026 100%)`;
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
    { icon: Sparkles, color: '#f97316', step: '01', title: 'Say it out loud', body: 'Describe what you imagine in plain words — no templates, no setup, no code.' },
    { icon: Workflow, color: '#8b5cf6', step: '02', title: 'A real conversation', body: 'Brief it like a teammate. It listens, asks, and reshapes the living result as you talk — a natural back-and-forth, not a form.' },
    { icon: ShieldCheck, color: '#10b981', step: '03', title: 'It verifies itself', body: 'Every build runs in a live sandbox and repairs its own errors before it ever reaches you.' },
    { icon: Globe2, color: '#06b6d4', step: '04', title: 'Out into the world', body: 'Publish to your own domain and take real payments — your accounts, your money, entirely yours.' }
  ];

  // What makes this more than a prompt box with a logo — every claim maps to
  // real code in this repo (LangChain orchestration, the repair loop, the
  // bring-your-own-key gateway), so the story stays honest.
  const techPillars = [
    { icon: Layers, color: '#f97316', title: 'Multi-model orchestration', body: 'LangChain routes each request across frontier models — Gemini, GPT-4o, DeepSeek, Llama, Qwen — and picks the right mind for the job.' },
    { icon: ShieldCheck, color: '#10b981', title: 'A self-healing build loop', body: 'Every result runs in a live sandbox and repairs its own runtime errors before it ever reaches your screen.' },
    { icon: Workflow, color: '#8b5cf6', title: 'Human-to-AI conversation', body: 'No forms, no settings. You talk, it reasons and iterates — a natural loop between you and the machine.' },
    { icon: Lock, color: '#06b6d4', title: 'Privacy-first by design', body: 'Bring your own keys. They live in a secure API gateway — your data and your models stay yours.' }
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

  // Cinematic auto-advance through the four experiences, like a film reel.
  // Re-armed on every change, so a manual tap resets the countdown rather than
  // yanking the viewer forward. The progress bar (keyed in the JSX) fills over
  // the same interval, so the motion reads as intentional, not restless.
  const FLAGSHIP_INTERVAL = 5200;
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const t = setTimeout(() => {
      setActiveCapability((prev) => {
        const idx = flagshipCapabilities.findIndex((c) => c.id === prev);
        return flagshipCapabilities[(idx + 1) % flagshipCapabilities.length].id;
      });
    }, FLAGSHIP_INTERVAL);
    return () => clearTimeout(t);
  }, [activeCapability]);

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

      {/* Hero — clean editorial canvas, no competing photography */}
      <section style={{
        position: 'relative',
        zIndex: 10,
        minHeight: 'calc(100vh - 67px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 'clamp(48px, 9vh, 120px) 6% 48px',
        background: isLight
          ? 'radial-gradient(1100px 520px at 50% -8%, rgba(249,115,22,0.10), rgba(255,255,255,0) 62%), #ffffff'
          : 'radial-gradient(1000px 560px at 50% -6%, rgba(249,115,22,0.16), rgba(7,9,19,0) 60%), #070913'
      }}>
        <div style={{ maxWidth: '940px', margin: '0 auto', width: '100%', textAlign: 'center' }} className="animate-fade-in-up">
          {/* Eyebrow */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '9px',
            fontSize: '0.76rem', fontWeight: '700', letterSpacing: '0.16em',
            textTransform: 'uppercase', color: isLight ? '#9a3412' : '#fdba74',
            marginBottom: '30px'
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f97316', display: 'inline-block' }} />
            Possibility, built together
          </div>

          {/* Headline — solid ink, a single accent, tight editorial tracking */}
          <h1 style={{
            fontSize: 'clamp(2.7rem, 6vw, 5.2rem)',
            fontWeight: '800',
            lineHeight: 1.02,
            letterSpacing: '-0.035em',
            color: isLight ? '#0b1220' : '#ffffff',
            margin: '0 0 24px'
          }}>
            Dream bigger.<br/>
            Let's build it <span style={{ color: '#ea580c' }}>together.</span>
          </h1>

          {/* Subcopy — one line, deliberately brief */}
          <p style={{
            fontSize: 'clamp(1.05rem, 1.35vw, 1.28rem)',
            color: isLight ? '#475569' : '#cbd5e1',
            lineHeight: 1.6, fontWeight: '400',
            maxWidth: '520px', margin: '0 auto 40px'
          }}>
            Say it in plain words. We'll build it together.
          </p>

          {/* Real prompt box — the product, front and centre */}
          <div style={{
            maxWidth: '700px', margin: '0 auto',
            background: isLight ? '#ffffff' : 'rgba(17,23,38,0.92)',
            border: isLight ? '1px solid #e5e7eb' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px',
            padding: '10px 10px 10px 18px',
            display: 'flex', alignItems: 'center', gap: '12px',
            boxShadow: isLight ? '0 14px 44px rgba(15,23,42,0.10)' : '0 14px 48px rgba(0,0,0,0.5)',
            textAlign: 'left'
          }}>
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

        </div>

        {/* Live model strip — muted, sourced from the real registry */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '14px', flexWrap: 'wrap',
          margin: '58px auto 0', maxWidth: '940px', width: '100%'
        }}>
          <span style={{ fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase', color: isLight ? '#94a3b8' : '#64748b' }}>
            {liveModelCount > 0 ? `${liveModelCount} live models` : 'Live model routing'}
          </span>
          {liveModelNames.map((name, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '14px', fontSize: '0.8rem', fontWeight: '600', color: isLight ? '#64748b' : '#94a3b8' }}>
              <span style={{ opacity: 0.4 }}>·</span> {name}
            </span>
          ))}
        </div>
      </section>

      {/* Belief statement — one bold line, the way great brands lead */}
      <section style={{
        padding: 'clamp(70px, 12vh, 140px) 6%',
        position: 'relative', zIndex: 10,
        background: isLight ? '#0b1220' : 'rgba(255,255,255,0.02)',
        borderTop: isLight ? 'none' : '1px solid rgba(255,255,255,0.06)',
        borderBottom: isLight ? 'none' : '1px solid rgba(255,255,255,0.06)'
      }}>
        <Reveal>
          <div style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'center' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: '700', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#fdba74' }}>
              What we believe
            </span>
            <p style={{
              fontSize: 'clamp(1.7rem, 3.4vw, 3rem)',
              fontWeight: '700',
              lineHeight: 1.22,
              letterSpacing: '-0.02em',
              color: '#ffffff',
              margin: '24px auto 0',
              maxWidth: '940px'
            }}>
              The distance between an idea and something real should be a
              <span style={{ color: '#f97316' }}> conversation</span> — not a budget,
              a team, or a year of waiting. So we set out to close it, <span style={{ color: '#f97316' }}>together</span>.
            </p>
          </div>
        </Reveal>
      </section>

      {/* How it works — the real journey, no simulation */}
      <section style={{ maxWidth: '1180px', margin: '90px auto 90px auto', padding: '0 24px', position: 'relative', zIndex: 10 }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: '44px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ea580c' }}>From idea to reality</span>
            <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', fontWeight: '800', margin: '10px 0 12px', color: textColor, letterSpacing: '-0.02em' }}>Four steps from a sentence to something live.</h2>
            <p style={{ fontSize: '1.05rem', color: subtextColor, maxWidth: '640px', margin: '0 auto', lineHeight: 1.6 }}>No code, no setup, no templates. The value is the finished thing you can share and act on — not the code behind it.</p>
          </div>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
          {journey.map((s, i) => {
            const Icon = s.icon;
            return (
              <Reveal key={i} delay={i * 90} style={{ height: '100%' }}>
              <div style={{ background: cardBg, border: cardBorder, borderRadius: '20px', padding: '26px', position: 'relative', overflow: 'hidden', height: '100%' }}>
                <div style={{ position: 'absolute', top: '14px', right: '18px', fontSize: '2.4rem', fontWeight: '900', color: s.color, opacity: 0.14, lineHeight: 1 }}>{s.step}</div>
                <div style={{ width: '46px', height: '46px', borderRadius: '13px', background: `${s.color}1f`, border: `1px solid ${s.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <Icon size={22} color={s.color} />
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', margin: '0 0 8px', color: textColor }}>{s.title}</h3>
                <p style={{ fontSize: '0.92rem', color: subtextColor, lineHeight: 1.55, margin: 0 }}>{s.body}</p>
              </div>
              </Reveal>
            );
          })}
        </div>
        <Reveal delay={120}>
          <div style={{ textAlign: 'center', marginTop: '40px' }}>
            <button onClick={() => startBuild()} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', color: '#fff', border: 'none', padding: '15px 32px', borderRadius: '14px', fontSize: '1.05rem', fontWeight: '800', cursor: 'pointer', boxShadow: '0 10px 28px rgba(249,115,22,0.4)' }}>
              Start building free <ArrowRight size={19} strokeWidth={2.5} />
            </button>
          </div>
        </Reveal>
      </section>
      {/* Under the hood — the real engineering, honestly stated */}
      <section style={{ maxWidth: '1180px', margin: '0 auto 96px auto', padding: '0 24px', position: 'relative', zIndex: 10 }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: '44px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ea580c' }}>Under the hood</span>
            <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', fontWeight: '800', margin: '10px 0 12px', color: textColor, letterSpacing: '-0.02em' }}>Not another AI wrapper.</h2>
            <p style={{ fontSize: '1.05rem', color: subtextColor, maxWidth: '680px', margin: '0 auto', lineHeight: 1.6 }}>Quantora is a system, not a prompt box with a logo. Frontier models, a self-correcting build loop, and a privacy-first core — engineered to turn a conversation into something real, reliably.</p>
          </div>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
          {techPillars.map((t, i) => {
            const Icon = t.icon;
            return (
              <Reveal key={i} delay={i * 90} style={{ height: '100%' }}>
              <div style={{ background: cardBg, border: cardBorder, borderRadius: '20px', padding: '26px', height: '100%' }}>
                <div style={{ width: '46px', height: '46px', borderRadius: '13px', background: `${t.color}1f`, border: `1px solid ${t.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <Icon size={22} color={t.color} />
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', margin: '0 0 8px', color: textColor }}>{t.title}</h3>
                <p style={{ fontSize: '0.92rem', color: subtextColor, lineHeight: 1.55, margin: 0 }}>{t.body}</p>
              </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      <div className="flagship-band" style={{
        background: isLight
          ? 'radial-gradient(1100px 440px at 50% 0%, rgba(249,115,22,0.12), transparent 72%), #070b16'
          : 'radial-gradient(1100px 440px at 50% 0%, rgba(249,115,22,0.10), transparent 72%), #04060d',
        '--page-bg': isLight ? '#f8fafc' : '#070913'
      }}>
      <section className="flagship-experience" aria-labelledby="flagship-experience-title">
        <Reveal>
          <div className="flagship-experience-heading flagship-heading-ondark">
            <span>Our belief</span>
            <h2 id="flagship-experience-title">Together, there's no limit to what you can make real.</h2>
            <p style={{ fontStyle: 'italic', opacity: 0.9 }}>
              “Dream, dream, dream. Dreams transform into thoughts, and thoughts result in action.” — Dr. A.P.J. Abdul Kalam
            </p>
            <p>We're not here to sell you software. We're here to stand beside your imagination — to help an idea become a thought, and a thought become action. What you build is yours. The possibilities are endless.</p>
          </div>
        </Reveal>

        <Reveal delay={80}>
        <div
          className="flagship-stage"
          style={{ '--flagship-accent': selectedCapability.color }}
        >
          <div key={`${selectedCapability.id}-bar`} className="flagship-progress" style={{ background: selectedCapability.color }} />
          <div
            key={selectedCapability.id}
            className="flagship-stage-image"
            style={{ backgroundImage: stageBackground(selectedCapability.color) }}
          />
          <div key={`${selectedCapability.id}-orb`} className="flagship-stage-orb" style={{ '--orb': selectedCapability.color }} />
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
        </Reveal>
      </section>
      </div>

      {/* Footer removed to prevent double-layering with App.jsx Global Footer */}
    </div>
  );
}
