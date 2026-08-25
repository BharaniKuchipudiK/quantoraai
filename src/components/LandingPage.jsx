import React, { useState, useRef, useEffect } from 'react';
import { QuantoraFullLogoSvg } from './QuantoraLogoSvg';
import {
  ArrowRight,
  Sun,
  Moon,
  Terminal,
  Lightbulb,
  BookOpen,
  Sparkles,
  Plus,
  CreditCard,
  HelpCircle,
  Layers,
  Globe,
  PieChart,
  CheckCircle2,
} from 'lucide-react';
import './LandingPage.css';

const ORANGE = '#ea580c';

function mockTokens(isLight) {
  return {
    surface: isLight ? '#ffffff' : '#0a0a0a',
    panel: isLight ? '#f5f5f5' : '#141414',
    border: isLight ? '#e5e5e5' : '#262626',
    muted: isLight ? '#737373' : '#a3a3a3',
    ink: isLight ? '#0a0a0a' : '#ffffff',
  };
}

function Reveal({ children, delay = 0, style, className }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
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
      transform: shown ? 'none' : 'translateY(28px)',
      transition: `opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
    }}>{children}</div>
  );
}

function StudyTutorMock({ isLight }) {
  const { surface, panel, border, muted, ink } = mockTokens(isLight);
  const tools = [
    { id: 'ice', icon: Sparkles, title: 'Icebreaker', subtitle: 'One true hook. Then we wait.' },
    { id: 'explain', icon: BookOpen, title: 'Explain', subtitle: 'One idea. Then a picture.' },
    { id: 'cards', icon: CreditCard, title: 'Flashcards', subtitle: 'Front. Flip. Recall.' },
    { id: 'quiz', icon: HelpCircle, title: 'Quiz', subtitle: 'A check. Then we wait.' },
  ];

  return (
    <div className="workspace-mock workspace-mock--study workspace-mock--rich" style={{ background: surface, borderColor: border }}>
      <div className="workspace-mock__titlebar" style={{ borderColor: border }}>
        <Lightbulb size={14} color={ORANGE} />
        <span className="workspace-mock__title">Study Tutor · Photosynthesis</span>
      </div>
      <div className="study-desk">
        <aside className="study-plus" style={{ borderColor: border, background: panel }}>
          <div className="study-plus__head">
            <span className="study-plus__mark" aria-hidden="true"><Plus size={14} color="#ffffff" strokeWidth={3} /></span>
            <div>
              <span className="workspace-mock__lab-label">This topic</span>
              <strong style={{ color: ink }}>The next beat</strong>
            </div>
          </div>
          {tools.map((tool) => {
            const Icon = tool.icon;
            const on = tool.id === 'ice';
            return (
              <div
                key={tool.id}
                className={`study-plus__item${on ? ' is-active' : ''}`}
                style={{ borderColor: on ? ORANGE : 'transparent', color: on ? ORANGE : muted }}
              >
                <Icon size={14} color={on ? ORANGE : muted} />
                <div>
                  <span>{tool.title}</span>
                  <small style={{ color: on ? ink : muted }}>{tool.subtitle}</small>
                </div>
              </div>
            );
          })}
        </aside>
        <div className="study-desk__stage">
          <div className="study-beat">
            <div className="study-beat__frame" style={{ borderColor: ORANGE, background: panel }}>
              <span style={{ color: ORANGE }}>light → sugar</span>
            </div>
            <p className="workspace-mock__chat-bubble is-ai" style={{ background: panel, borderColor: border, color: ink }}>
              Every green leaf is a quiet factory. Light goes in. Sugar comes out.
            </p>
            <p className="study-beat__wait" style={{ color: ORANGE }}>Say I’m with you — then we begin.</p>
          </div>
          <div className="study-composer" style={{ borderColor: border, background: panel }}>
            <span className="study-plus__mark is-composer" aria-hidden="true"><Plus size={14} color="#ffffff" strokeWidth={3} /></span>
            <span style={{ color: muted }}>Message Study Tutor…</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdvisorMock({ isLight, type }) {
  const titles = {
    research: 'Research Analyst',
    travel: 'Travel Advisor',
    finance: 'Finance Advisor',
  };
  const items = {
    research: ['Compare sources', 'Evidence map', 'Conclusion draft'],
    travel: ['Flights', 'Hotels', 'Itinerary'],
    finance: ['Portfolio', 'Cash flow', 'Decisions'],
  };
  const title = titles[type] || titles.research;
  const rows = items[type] || items.research;
  const { surface, border, muted } = mockTokens(isLight);
  return (
    <div className="workspace-mock workspace-mock--advisor" style={{ background: surface, borderColor: border }}>
      <div className="workspace-mock__titlebar" style={{ borderColor: border }}>
        <Layers size={14} color={ORANGE} />
        <span className="workspace-mock__title">{title}</span>
      </div>
      <div className="workspace-mock__advisor-body">
        {rows.map((item, i) => (
          <div key={item} className="workspace-mock__advisor-row" style={{ borderColor: border }}>
            <span className="workspace-mock__advisor-num" style={{ color: ORANGE }}>{String(i + 1).padStart(2, '0')}</span>
            <span>{item}</span>
            <CheckCircle2 size={14} color={i < 2 ? ORANGE : muted} style={{ marginLeft: 'auto', opacity: i < 2 ? 1 : 0.35 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

const ROOMS = [
  {
    id: 'research',
    tag: 'Research',
    title: 'Research Analyst',
    body: 'The question, the sources, the conclusion — held in the same place you left them.',
    icon: BookOpen,
    mock: 'research',
  },
  {
    id: 'travel',
    tag: 'Travel',
    title: 'Travel Advisor',
    body: 'Destination, dates, the itinerary you can still open next week.',
    icon: Globe,
    mock: 'travel',
  },
  {
    id: 'finance',
    tag: 'Finance',
    title: 'Finance Advisor',
    body: 'The numbers, the trade-off, the decision taking shape.',
    icon: PieChart,
    mock: 'finance',
  },
];

function SelfHealConsole({ isLight }) {
  const { surface, panel, border, muted, ink } = mockTokens(isLight);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return undefined;
    const id = setInterval(() => setPhase((p) => (p + 1) % 5), 2200);
    return () => clearInterval(id);
  }, []);

  const status = [
    'Writing checkout.js…',
    'Reviewing the total…',
    'Writing the tax patch…',
    'Patch applied. Running tests…',
    'Ready. Tests passed.',
  ][phase];

  const lines = [
    { n: 1, text: 'async function processCheckout(cart) {' },
    { n: 2, text: '  const session = await getSession();' },
    { n: 3, text: '  if (!session) throw new Error(\'Unauthorized\');' },
    { n: 4, text: '' },
    { n: 5, text: '  let subtotal = 0;' },
    { n: 6, text: '  for (const item of cart.items) {' },
    { n: 7, text: '    subtotal += item.price * item.quantity;' },
    { n: 8, text: '  }' },
    { n: 9, text: '' },
  ];

  return (
    <div className="heal-console" style={{ background: surface, borderColor: border }}>
      <div className="heal-console__bar" style={{ borderColor: border }}>
        <Terminal size={14} color={ORANGE} />
        <span>Coding Desk · checkout.js</span>
        <span className="heal-console__status" style={{ color: ORANGE }}>{status}</span>
      </div>
      <div className="heal-console__body">
        <div className="heal-console__code" style={{ color: ink, background: panel }}>
          {lines.map((line) => (
            <div key={line.n} className="heal-console__line">
              <span className="heal-console__ln" style={{ color: muted }}>{line.n}</span>
              <span>{line.text}</span>
            </div>
          ))}
          {phase < 3 ? (
            <div className={`heal-console__line${phase >= 1 ? ' is-bug' : ''}`}>
              <span className="heal-console__ln" style={{ color: muted }}>10</span>
              <span>  const total = subtotal;</span>
            </div>
          ) : (
            <>
              <div className="heal-console__line is-del">
                <span className="heal-console__ln" style={{ color: muted }}>—</span>
                <span>  const total = subtotal;</span>
              </div>
              <div className="heal-console__line is-add">
                <span className="heal-console__ln" style={{ color: muted }}>+</span>
                <span>  const tax = await calculateTax(cart.address);</span>
              </div>
              <div className="heal-console__line is-add">
                <span className="heal-console__ln" style={{ color: muted }}>+</span>
                <span>  const total = Math.round(subtotal * (1 + tax));</span>
              </div>
            </>
          )}
          {[
            { n: 15, text: '' },
            { n: 16, text: '  const charge = await stripe.charges.create({' },
            { n: 17, text: '    amount: total,' },
            { n: 18, text: '    currency: \'usd\',' },
            { n: 19, text: '    source: cart.token,' },
            { n: 20, text: '  });' },
            { n: 21, text: '' },
            { n: 22, text: '  return new Response(JSON.stringify(charge));' },
            { n: 23, text: '}' },
          ].map((line) => (
            <div key={line.n} className="heal-console__line">
              <span className="heal-console__ln" style={{ color: muted }}>{line.n}</span>
              <span>{line.text}</span>
            </div>
          ))}
        </div>
        <div className="heal-console__term" style={{ borderColor: border, color: muted }}>
          <p>$ quantora heal checkout.js</p>
          {phase >= 1 && <p>[agent] Reading 23 lines · refining the total</p>}
          {phase >= 2 && <p>[agent] Writing patch…</p>}
          {phase >= 3 && (
            <>
              <p className="heal-console__del-line">− const total = subtotal;</p>
              <p className="heal-console__add-line">+ const tax = await calculateTax(cart.address);</p>
              <p className="heal-console__add-line">+ const total = Math.round(subtotal * (1 + tax));</p>
            </>
          )}
          {phase >= 4 && (
            <>
              <p>$ vitest run checkout.test.js</p>
              <p style={{ color: ORANGE }}>✓ tax is applied  ·  ✓ integer rounding</p>
            </>
          )}
          <span className="heal-console__caret" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

export default function LandingPage({ onLaunchStudio, onStartBuild, onOpenAuth, user, themeMode, setThemeMode, isLight: isLightProp }) {
  const [heroPrompt, setHeroPrompt] = useState('');
  const [phIdx, setPhIdx] = useState(0);
  const promptRef = useRef(null);

  const heroExamples = [
    'The study planner I started last night…',
    'The dashboard I started last night…',
    'Flashcards from last night’s notes…',
    'A checkout flow with tax…',
  ];

  useEffect(() => {
    if (heroPrompt) return;
    const t = setInterval(() => setPhIdx((i) => (i + 1) % heroExamples.length), 2800);
    return () => clearInterval(t);
  }, [heroPrompt, heroExamples.length]);

  const isLight = typeof isLightProp === 'boolean' ? isLightProp : themeMode === 'light';
  const textColor = isLight ? '#0a0a0a' : '#ffffff';
  const subtextColor = isLight ? '#525252' : '#a3a3a3';
  const cardBorder = isLight ? '1px solid #e5e5e5' : '1px solid #262626';
  const cardBg = isLight ? '#ffffff' : '#0a0a0a';
  const navBg = isLight ? '#ffffff' : '#0a0a0a';

  const startBuild = (prompt) => {
    const text = (prompt ?? heroPrompt ?? '').toString();
    if (onStartBuild) onStartBuild(text);
    else if (user) onLaunchStudio();
    else onOpenAuth();
  };

  const openStudio = () => (user ? onLaunchStudio() : onOpenAuth());

  const TryCta = ({ className = 'landing-cta landing-cta--primary', large }) => (
    <button
      type="button"
      data-quantora-login="true"
      onClick={() => startBuild()}
      className={`${className}${large ? ' landing-cta--large' : ''}`}
    >
      Try Quantora <ArrowRight size={large ? 18 : 16} />
    </button>
  );

  return (
    <div className={`landing-page${isLight ? ' is-light' : ' is-dark'}`}>
      <header className="landing-header" style={{ background: navBg, borderBottom: cardBorder }}>
        <div className="landing-header__inner">
          <button type="button" className="landing-header__brand" aria-label="Open Quantora AI Studio" onClick={openStudio}>
            <QuantoraFullLogoSvg height={44} isDark={!isLight} />
          </button>
          <div className="landing-header__actions">
            <button
              type="button"
              className="landing-theme-toggle"
              onClick={() => setThemeMode(isLight ? 'dark' : 'light')}
              aria-label={`Switch to ${isLight ? 'dark' : 'light'} theme`}
            >
              {isLight ? <Moon size={18} color={ORANGE} /> : <Sun size={18} color={ORANGE} />}
            </button>
            {user ? (
              <button
                type="button"
                data-quantora-enter-studio="true"
                onClick={onLaunchStudio}
                className="landing-cta landing-cta--primary"
              >
                Try Quantora <ArrowRight size={16} />
              </button>
            ) : (
              <TryCta />
            )}
          </div>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-container">
          <div className="landing-hero__inner">
            <h1 className="landing-hero__title" style={{ color: textColor }}>
              It already knows<br />your <span className="landing-accent">world.</span>
            </h1>
            <p className="landing-hero__subtitle" style={{ color: subtextColor }}>
              Close one screen. Open another. The files, the preview, and the last prompt are waiting. You pick up where you left it.
            </p>
            <div
              className={`landing-hero__prompt${isLight ? ' is-light' : ' is-dark'}`}
              onClick={() => promptRef.current?.focus()}
            >
              <div className="landing-hero__prompt-field">
                <textarea
                  ref={promptRef}
                  aria-label="Describe what you want to build"
                  value={heroPrompt}
                  onChange={(e) => setHeroPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); startBuild(); } }}
                  rows={1}
                  placeholder=""
                  style={{ color: textColor, caretColor: heroPrompt ? ORANGE : 'transparent' }}
                />
                {!heroPrompt && (
                  <div className="landing-hero__ghost" aria-hidden="true">
                    <span>{heroExamples[phIdx]}</span>
                    <span className="landing-hero__caret" />
                  </div>
                )}
              </div>
              <TryCta className="landing-hero__submit" />
            </div>
            <p className="landing-hero__free" style={{ color: subtextColor }}>Try Quantora for free.</p>
          </div>
        </div>
      </section>

      <section className="landing-section landing-proof">
        <div className="landing-container">
          <Reveal>
            <div className="landing-section__header is-center">
              <h2 className="landing-section__title" style={{ color: textColor }}>The work stays on the desk.</h2>
              <p className="landing-section__lead" style={{ color: subtextColor }}>
                Files. Preview. The patch. Leave. Come back. They are still yours.
              </p>
            </div>
          </Reveal>
          <Reveal>
            <SelfHealConsole isLight={isLight} />
          </Reveal>
        </div>
      </section>

      <section className="landing-section landing-proof">
        <div className="landing-container">
          <Reveal>
            <div className="landing-section__header is-center">
              <h2 className="landing-section__title" style={{ color: textColor }}>Same assistant. Another room.</h2>
              <p className="landing-section__lead" style={{ color: subtextColor }}>
                Study opens from +. Icebreaker first — one true hook. Flashcards and a quiz wait until you are ready.
              </p>
            </div>
          </Reveal>
          <Reveal>
            <StudyTutorMock isLight={isLight} />
          </Reveal>
          <div className="landing-workspaces__grid">
            {ROOMS.map((ws, i) => {
              const Icon = ws.icon;
              return (
                <Reveal key={ws.id} delay={i * 60}>
                  <article className={`landing-workspace-card${isLight ? ' is-light' : ' is-dark'}`} style={{ border: cardBorder, background: cardBg }}>
                    <div className="landing-workspace-card__visual landing-workspace-card__visual--compact">
                      <AdvisorMock isLight={isLight} type={ws.mock} />
                    </div>
                    <span className="landing-workspace-card__tag" style={{ color: ORANGE }}>{ws.tag}</span>
                    <div className="landing-workspace-card__title-row">
                      <Icon size={16} color={ORANGE} />
                      <h3 style={{ color: textColor }}>{ws.title}</h3>
                    </div>
                    <p style={{ color: subtextColor }}>{ws.body}</p>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="landing-section landing-final-cta">
        <div className="landing-container">
          <Reveal>
            <div className="landing-final-cta__inner">
              <h2 style={{ color: textColor }}>The desk is waiting.</h2>
              <p style={{ color: subtextColor }}>Try Quantora for free. Your world travels with every screen.</p>
              <TryCta large />
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
