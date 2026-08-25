import React, { useState, useRef, useEffect } from 'react';
import { QuantoraFullLogoSvg } from './QuantoraLogoSvg';
import {
  ArrowRight,
  Sun,
  Moon,
  Code2,
  Layers,
  Terminal,
  Lightbulb,
  BookOpen,
  PieChart,
  Globe,
  RefreshCw,
  CheckCircle2,
  FileCode2,
  FolderTree,
  Sparkles,
  Play,
  Atom,
} from 'lucide-react';
import './LandingPage.css';

const ORANGE = '#ea580c';
const ORANGE_BRIGHT = '#f97316';

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

function CodingDeskMock({ isLight }) {
  const { surface, panel, border, muted, ink } = mockTokens(isLight);
  return (
    <div className="workspace-mock workspace-mock--ide" style={{ background: surface, borderColor: border }}>
      <div className="workspace-mock__titlebar" style={{ borderColor: border }}>
        <span className="workspace-mock__dot" style={{ background: ORANGE_BRIGHT }} />
        <span className="workspace-mock__dot" style={{ background: muted }} />
        <span className="workspace-mock__dot" style={{ background: muted }} />
        <span className="workspace-mock__title">Coding desk</span>
        <div className="workspace-mock__tabs">
          {['Preview', 'Code', 'Terminal', 'Git'].map((tab, i) => (
            <span key={tab} className={`workspace-mock__tab${i === 0 ? ' is-active' : ''}`} style={{ borderColor: border, color: i === 0 ? ORANGE : muted }}>{tab}</span>
          ))}
        </div>
      </div>
      <div className="workspace-mock__ide-body">
        <div className="workspace-mock__sidebar" style={{ borderColor: border, background: panel }}>
          <div className="workspace-mock__sidebar-head"><FolderTree size={12} /> Files</div>
          {['index.html', 'styles.css', 'app.js'].map((f, i) => (
            <div key={f} className={`workspace-mock__file${i === 0 ? ' is-active' : ''}`} style={{ color: i === 0 ? ORANGE : muted }}>
              <FileCode2 size={11} /> {f}
            </div>
          ))}
        </div>
        <div className="workspace-mock__editor" style={{ borderColor: border, background: panel }}>
          <div className="workspace-mock__line"><span style={{ color: muted }}>1</span><span style={{ color: ORANGE }}>async function</span><span> processCheckout(cart) {'{'}</span></div>
          <div className="workspace-mock__line"><span style={{ color: muted }}>2</span><span>  let subtotal = 0;</span></div>
          <div className="workspace-mock__line"><span style={{ color: muted }}>3</span><span>  const total = subtotal;</span></div>
          <div className="workspace-mock__line"><span style={{ color: muted }}>4</span><span style={{ color: ORANGE_BRIGHT }}>  // heal: apply tax</span></div>
          <div className="workspace-mock__line"><span style={{ color: muted }}>5</span><span style={{ color: ORANGE }}>{'}'}</span></div>
          <div className="workspace-mock__cursor" />
        </div>
        <div className="workspace-mock__preview" style={{ borderColor: border, background: panel }}>
          <div className="workspace-mock__preview-frame">
            <div className="workspace-mock__preview-bar" style={{ background: isLight ? '#e5e5e5' : '#262626' }} />
            <div className="workspace-mock__preview-block" style={{ background: isLight ? '#f5f5f5' : '#141414', borderColor: border }} />
            <Play size={20} color={ORANGE} className="workspace-mock__play" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StudyTutorMock({ isLight }) {
  const { surface, panel, border, muted } = mockTokens(isLight);
  return (
    <div className="workspace-mock workspace-mock--study" style={{ background: surface, borderColor: border }}>
      <div className="workspace-mock__titlebar" style={{ borderColor: border }}>
        <Lightbulb size={14} color={ORANGE} />
        <span className="workspace-mock__title">Study Tutor</span>
      </div>
      <div className="workspace-mock__study-body">
        <div className="workspace-mock__chat-bubble is-ai" style={{ background: panel, borderColor: border }}>
          Let&apos;s break this into three concepts you can practise.
        </div>
        <div className="workspace-mock__lab" style={{ borderColor: border, background: panel }}>
          <span className="workspace-mock__lab-label">Study lab</span>
          <div className="workspace-mock__flashcards">
            {['Photosynthesis', 'Krebs cycle', 'Review'].map((c, i) => (
              <div key={c} className="workspace-mock__flashcard" style={{ borderColor: i === 1 ? ORANGE : border, background: 'transparent' }}>{c}</div>
            ))}
          </div>
          <div className="workspace-mock__progress" style={{ background: border }}>
            <span style={{ width: '68%', background: ORANGE }} />
          </div>
        </div>
        <div className="workspace-mock__chat-bubble is-user" style={{ background: panel, color: muted, borderColor: border }}>
          Quiz me on chapter 4
        </div>
      </div>
    </div>
  );
}

function SelfHealConsole({ isLight }) {
  const { surface, panel, border, muted, ink } = mockTokens(isLight);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % 5), 2200);
    return () => clearInterval(id);
  }, []);

  const status = [
    'Writing checkout.js…',
    'Bug found — tax never applied',
    'Self-heal writing patch…',
    'Patch applied. Running tests…',
    'Fixed. Tests passed.',
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
              <span>  const total = subtotal; // BUG: tax never applied</span>
            </div>
          ) : (
            <>
              <div className="heal-console__line is-del">
                <span className="heal-console__ln" style={{ color: muted }}>—</span>
                <span>  const total = subtotal; // BUG: tax never applied</span>
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
          {phase >= 1 && <p>[agent] Scanning 23 lines · Bug at L10 — total ignores tax</p>}
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

function QuantumLabMock({ isLight }) {
  const { surface, panel, border, muted, ink } = mockTokens(isLight);
  return (
    <div className="workspace-mock workspace-mock--quantum" style={{ background: surface, borderColor: border }}>
      <div className="workspace-mock__titlebar" style={{ borderColor: border }}>
        <Atom size={14} color={ORANGE} />
        <span className="workspace-mock__title">Quantum lab</span>
      </div>
      <div className="workspace-mock__quantum-body">
        <div className="workspace-mock__quantum-circuit" style={{ borderColor: border, background: panel }}>
          {['H', 'X', 'CNOT', 'M'].map((gate, i) => (
            <span
              key={gate}
              className={`workspace-mock__gate${i === 2 ? ' is-active' : ''}`}
              style={{ borderColor: i === 2 ? ORANGE : border, color: i === 2 ? ORANGE : ink }}
            >
              {gate}
            </span>
          ))}
        </div>
        <div className="workspace-mock__quantum-readout" style={{ color: muted }}>
          <span style={{ color: ORANGE }}>|ψ⟩</span>
          {' '}superposition · measure
        </div>
      </div>
    </div>
  );
}

const WORKSPACES = [
  {
    id: 'study',
    tag: 'Learning',
    title: 'Study Tutor',
    body: 'Explanation, practice, and review — in the same thread as the work you are building.',
    color: ORANGE,
    icon: Lightbulb,
    mock: 'study',
  },
  {
    id: 'research',
    tag: 'Research',
    title: 'Research Analyst',
    body: 'Frame the question, compare sources, and move toward a defensible conclusion.',
    color: ORANGE,
    icon: BookOpen,
    mock: 'research',
  },
  {
    id: 'travel',
    tag: 'Travel',
    title: 'Travel Advisor',
    body: 'Destination, dates, constraints — into an itinerary you can follow.',
    color: ORANGE,
    icon: Globe,
    mock: 'travel',
  },
  {
    id: 'finance',
    tag: 'Finance',
    title: 'Finance Advisor',
    body: 'Cash flow, trade-offs, and a recommendation you can act on.',
    color: ORANGE,
    icon: PieChart,
    mock: 'finance',
  },
];

const DESK_POINTS = [
  'Live preview of the running app',
  'Multi-file editor',
  'Integrated terminal and git',
  'Agent console reads the files on the desk',
  'Detects the failing line, writes a patch',
  'Re-runs tests before it calls the work done',
];

const CAPABILITIES = [
  { icon: Code2, title: 'A real workspace', body: 'Preview, editor, terminal, and git sit beside the conversation. The output is a running app, not a code dump.' },
  { icon: RefreshCw, title: 'Self-healing builds', body: 'When a run fails, the console locates the fault, applies a patch, and verifies it. You stay in the prompt.' },
  { icon: Sparkles, title: 'Model selection, handled', body: 'Each turn is routed to a model suited to the task. You describe the outcome. Quantora chooses the path.' },
];

export default function LandingPage({ onLaunchStudio, onStartBuild, onOpenAuth, user, themeMode, setThemeMode, isLight: isLightProp }) {
  const [heroPrompt, setHeroPrompt] = useState('');
  const [phIdx, setPhIdx] = useState(0);
  const promptRef = useRef(null);

  const heroExamples = [
    'A study planner from my syllabus…',
    'A metrics dashboard for my team…',
    'Flashcards from lecture notes…',
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

  const renderWorkspaceMock = (mock) => {
    if (mock === 'coding') return <CodingDeskMock isLight={isLight} />;
    if (mock === 'study') return <StudyTutorMock isLight={isLight} />;
    return <AdvisorMock isLight={isLight} type={mock} />;
  };

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

          <nav className="landing-header__nav" aria-label="Primary navigation">
            <button type="button" className="landing-header__link" onClick={() => document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth' })}>AI Studio</button>
            <button type="button" className="landing-header__link" onClick={() => document.getElementById('workspaces')?.scrollIntoView({ behavior: 'smooth' })}>Workspaces</button>
            <button type="button" className="landing-header__link" onClick={() => document.getElementById('canvas')?.scrollIntoView({ behavior: 'smooth' })}>Dream to Action</button>
            <button type="button" className="landing-header__link" onClick={() => document.getElementById('quantum')?.scrollIntoView({ behavior: 'smooth' })}>Quantum</button>
          </nav>

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

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-container">
          <div className="landing-hero__inner">
            <div className="landing-hero__eyebrow">
              <span className="landing-hero__eyebrow-dot" />
              Sovereign vibe coding
            </div>
            <h1 className="landing-hero__title" style={{ color: textColor }}>
              From idea to <span className="landing-accent">outcome.</span>
            </h1>
            <p className="landing-hero__subtitle" style={{ color: subtextColor }}>
              Describe what you want. Quantora writes the files, heals the faults, and leaves you a running preview — not a chat you have to babysit.
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
          </div>
        </div>
      </section>

      {/* Desk — the product, once */}
      <section id="studio" className="landing-section landing-agentic">
        <div className="landing-container">
          <Reveal>
            <div className="landing-section__header is-center">
              <span className="landing-section__eyebrow">AI Studio</span>
              <h2 className="landing-section__title" style={{ color: textColor }}>The desk where the work actually runs.</h2>
              <p className="landing-section__lead" style={{ color: subtextColor }}>
                The build lands in a real workspace. The console reads those files, flags the fault, and patches it in place.
              </p>
            </div>
          </Reveal>
          <Reveal>
            <div className="desk-split">
              <SelfHealConsole isLight={isLight} />
              <aside className="desk-points" style={{ border: cardBorder, background: cardBg }}>
                <span className="landing-workspace-card__tag" style={{ color: ORANGE }}>Built in</span>
                <h3 style={{ color: textColor, margin: '8px 0 6px', fontSize: '1.15rem' }}>The IDE console</h3>
                <p style={{ color: subtextColor, margin: '0 0 16px', fontSize: '0.88rem', lineHeight: 1.55 }}>
                  Not a chat log pasted into an editor. Terminal, preview, and repair run against the files on the desk.
                </p>
                <ul className="desk-points__list">
                  {DESK_POINTS.map((point) => (
                    <li key={point} style={{ color: textColor }}>
                      <CheckCircle2 size={16} color={ORANGE} strokeWidth={2} />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Workspaces — other desks, no Coding Desk repeat */}
      <section id="workspaces" className="landing-section landing-workspaces">
        <div className="landing-container">
          <Reveal>
            <div className="landing-section__header is-center">
              <span className="landing-section__eyebrow">Workspaces</span>
              <h2 className="landing-section__title" style={{ color: textColor }}>One conversation. The right workspace.</h2>
              <p className="landing-section__lead" style={{ color: subtextColor }}>
                Build on Coding Desk, then stay in-thread for study, research, travel, or finance — without starting over.
              </p>
            </div>
          </Reveal>

          <div className="landing-workspaces__featured">
            {WORKSPACES.filter((w) => w.id === 'study').map((ws) => {
              const Icon = ws.icon;
              return (
                <Reveal key={ws.id} className="landing-workspace-showcase">
                  <article className={`landing-workspace-card is-featured${isLight ? ' is-light' : ' is-dark'}`} style={{ border: cardBorder, background: cardBg }}>
                    <div className="landing-workspace-card__visual">
                      {renderWorkspaceMock(ws.mock)}
                    </div>
                    <div className="landing-workspace-card__copy">
                      <span className="landing-workspace-card__tag" style={{ color: ws.color }}>{ws.tag}</span>
                      <div className="landing-workspace-card__title-row">
                        <Icon size={20} color={ws.color} />
                        <h3 style={{ color: textColor }}>{ws.title}</h3>
                      </div>
                      <p style={{ color: subtextColor }}>{ws.body}</p>
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>

          <div className="landing-workspaces__grid">
            {WORKSPACES.filter((w) => w.id !== 'study').map((ws, i) => {
              const Icon = ws.icon;
              return (
                <Reveal key={ws.id} delay={i * 60}>
                  <article className={`landing-workspace-card${isLight ? ' is-light' : ' is-dark'}`} style={{ border: cardBorder, background: cardBg }}>
                    <div className="landing-workspace-card__visual landing-workspace-card__visual--compact">
                      {renderWorkspaceMock(ws.mock)}
                    </div>
                    <span className="landing-workspace-card__tag" style={{ color: ws.color }}>{ws.tag}</span>
                    <div className="landing-workspace-card__title-row">
                      <Icon size={16} color={ws.color} />
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

      {/* Capabilities */}
      <section id="canvas" className="landing-section">
        <div className="landing-container">
          <Reveal>
            <div className="landing-section__header is-center">
              <span className="landing-section__eyebrow">Dream to Action</span>
              <h2 className="landing-section__title" style={{ color: textColor }}>The prompt does not die in chat.</h2>
              <p className="landing-section__lead" style={{ color: subtextColor }}>
                Plan, preview, and ship on one board. The studio writes. The canvas keeps the thread until something runs.
              </p>
            </div>
          </Reveal>
          <div className="landing-card-grid landing-why-grid">
            {CAPABILITIES.map((p, i) => {
              const Icon = p.icon;
              return (
                <Reveal key={p.title} delay={i * 70}>
                  <div className="landing-card" style={{ background: cardBg, border: cardBorder }}>
                    <div className="landing-card__icon" style={{ background: isLight ? '#ffffff' : '#141414', border: `1px solid ${ORANGE}` }}>
                      <Icon size={22} color={ORANGE} />
                    </div>
                    <h3 style={{ color: textColor }}>{p.title}</h3>
                    <p style={{ color: subtextColor }}>{p.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section id="quantum" className="landing-section">
        <div className="landing-container">
          <Reveal>
            <div className="landing-section__header is-center">
              <span className="landing-section__eyebrow">Quantum</span>
              <h2 className="landing-section__title" style={{ color: textColor }}>A lab for circuits, not a footnote.</h2>
              <p className="landing-section__lead" style={{ color: subtextColor }}>
                Same prompt box. Pointed at a circuit you can inspect and measure.
              </p>
            </div>
          </Reveal>
          <Reveal>
            <div className="desk-split">
              <QuantumLabMock isLight={isLight} />
              <aside className="desk-points" style={{ border: cardBorder, background: cardBg }}>
                <span className="landing-workspace-card__tag" style={{ color: ORANGE }}>Playground</span>
                <h3 style={{ color: textColor, margin: '8px 0 6px', fontSize: '1.15rem' }}>Build, then look</h3>
                <p style={{ color: subtextColor, margin: '0 0 16px', fontSize: '0.88rem', lineHeight: 1.55 }}>
                  Gates on a canvas. A readout you can trust. The same prompt box, pointed at quantum.
                </p>
                <ul className="desk-points__list">
                  {['Compose a circuit from a sentence', 'See superposition before you measure', 'Keep the experiment next to the code'].map((point) => (
                    <li key={point} style={{ color: textColor }}>
                      <CheckCircle2 size={16} color={ORANGE} strokeWidth={2} />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Final CTA */}
      <section className="landing-section landing-final-cta">
        <div className="landing-container">
          <Reveal>
            <div className="landing-final-cta__inner">
              <h2 style={{ color: textColor }}>Start with a prompt.</h2>
              <p style={{ color: subtextColor }}>Vibe coding with a desk you keep — files, preview, and the patch.</p>
              <TryCta large />
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
