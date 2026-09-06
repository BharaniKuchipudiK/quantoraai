import React, { useState, useRef, useEffect } from 'react';
import { QuantoraFullLogoSvg } from './QuantoraLogoSvg';
import GuestBuildPreview, { GUEST_DEMO_PROMPT } from './GuestBuildPreview';
import { exploratorySurfacesEnabled } from '../lib/platform-surfaces.js';
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
  Layers,
  Globe,
  PieChart,
  CheckCircle2,
  Eye,
  Zap,
  ShieldCheck,
  Network,
  Atom,
  Calendar,
  ClipboardCheck,
  User,
  Rocket,
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
  const [phase, setPhase] = useState(0);
  const [flashBack, setFlashBack] = useState(false);

  const modes = [
    { id: 'schedule', icon: Calendar, title: 'Study schedule', subtitle: 'Plan the week. You set the pace.' },
    { id: 'flash', icon: CreditCard, title: 'Flashcards', subtitle: 'Recall first. Tutor waits.' },
    { id: 'assess', icon: ClipboardCheck, title: 'Assessment', subtitle: 'Server-graded evidence.' },
    { id: 'tutor', icon: Sparkles, title: 'AI Tutor', subtitle: 'One beat. Then your turn.' },
  ];

  const activeMode = modes[phase]?.id || 'schedule';

  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return undefined;
    const id = setInterval(() => {
      setPhase((p) => {
        const next = (p + 1) % modes.length;
        if (next === 1) setFlashBack(false);
        return next;
      });
    }, 3400);
    return () => clearInterval(id);
  }, [modes.length]);

  useEffect(() => {
    if (activeMode !== 'flash') return undefined;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setFlashBack(true);
      return undefined;
    }
    const flip = setTimeout(() => setFlashBack(true), 1400);
    return () => clearTimeout(flip);
  }, [activeMode, phase]);

  const scheduleRows = [
    { day: 'Mon', topic: 'Light & chlorophyll', done: true },
    { day: 'Wed', topic: 'Calvin cycle', done: false, active: true },
    { day: 'Fri', topic: 'Verified check', done: false },
  ];

  const assessOptions = [
    { id: 'a', text: 'Light becomes chemical energy in the chloroplast', picked: true },
    { id: 'b', text: 'Roots absorb sunlight directly', picked: false },
    { id: 'c', text: 'Oxygen is the main product of the light reaction', picked: false },
  ];

  return (
    <div className="workspace-mock workspace-mock--study workspace-mock--rich study-mock" style={{ background: surface, borderColor: border }}>
      <div className="workspace-mock__titlebar study-mock__titlebar" style={{ borderColor: border }}>
        <div className="study-mock__title-left">
          <Lightbulb size={14} color={ORANGE} />
          <span className="workspace-mock__title">Study Tutor · Photosynthesis</span>
        </div>
        <span className="study-mock__human-pill">
          <User size={12} color={ORANGE} />
          Human in the loop
        </span>
      </div>

      <div className="study-mock__toolbar" style={{ borderColor: border, background: panel }}>
        <div className="study-mock__progress">
          <div className="study-mock__progress-label">
            <span style={{ color: muted }}>Your tutor board</span>
            <span style={{ color: ORANGE }}>35% verified</span>
          </div>
          <div className="study-mock__progress-track" aria-hidden="true">
            <span className="study-mock__progress-fill" style={{ width: '35%' }} />
          </div>
          <p className="study-mock__progress-caption" style={{ color: muted }}>
            Mastery moves only after verified evidence — not self-report.
          </p>
        </div>
        <div className="study-mock__chips" aria-label="Study tutor actions">
          {['Explain', 'Schedule', 'Flashcards', 'Test me'].map((label) => (
            <span
              key={label}
              className={`study-mock__chip${(
                (label === 'Schedule' && activeMode === 'schedule')
                || (label === 'Flashcards' && activeMode === 'flash')
                || (label === 'Test me' && activeMode === 'assess')
                || (label === 'Explain' && activeMode === 'tutor')
              ) ? ' is-active' : ''}`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="study-desk">
        <aside className="study-plus" style={{ borderColor: border, background: panel }}>
          <div className="study-plus__head">
            <span className="study-plus__mark" aria-hidden="true"><Plus size={14} color="#ffffff" strokeWidth={3} /></span>
            <div>
              <span className="workspace-mock__lab-label">This session</span>
              <strong style={{ color: ink }}>Pick the next beat</strong>
            </div>
          </div>
          {modes.map((tool) => {
            const Icon = tool.icon;
            const on = tool.id === activeMode;
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

        <div className="study-desk__stage study-mock__stage">
          <div className="study-mock__panel-stack" aria-live="polite">
            <div className={`study-mock__panel${activeMode === 'schedule' ? ' is-active' : ''}`} aria-hidden={activeMode !== 'schedule'}>
              <p className="study-mock__panel-kicker" style={{ color: ORANGE }}>Study schedule</p>
              <p className="study-mock__panel-lead" style={{ color: ink }}>Three beats this week — you choose when to show up.</p>
              <ul className="study-mock__schedule">
                {scheduleRows.map((row) => (
                  <li
                    key={row.day}
                    className={`study-mock__schedule-row${row.active ? ' is-active' : ''}${row.done ? ' is-done' : ''}`}
                    style={{ borderColor: border, background: row.active ? (isLight ? '#fff7ed' : 'rgba(234,88,12,0.08)') : panel }}
                  >
                    <span className="study-mock__schedule-day" style={{ color: row.active ? ORANGE : muted }}>{row.day}</span>
                    <span style={{ color: ink }}>{row.topic}</span>
                    {row.done && <CheckCircle2 size={14} color={ORANGE} />}
                    {row.active && <span className="study-mock__schedule-now" style={{ color: ORANGE }}>Tonight</span>}
                  </li>
                ))}
              </ul>
              <p className="study-mock__wait" style={{ color: ORANGE }}>Tap a beat when you&apos;re ready — the tutor waits.</p>
            </div>

            <div className={`study-mock__panel${activeMode === 'flash' ? ' is-active' : ''}`} aria-hidden={activeMode !== 'flash'}>
              <p className="study-mock__panel-kicker" style={{ color: ORANGE }}>Flashcard 2 / 6</p>
              <button type="button" className={`study-flash study-mock__flash${flashBack ? ' is-back' : ''}`} style={{ borderColor: ORANGE, background: panel }}>
                <em style={{ color: muted }}>{flashBack ? 'Answer' : 'Prompt'}</em>
                <strong style={{ color: ink }}>
                  {flashBack ? 'Light energy → chemical energy in the chloroplast' : 'What converts light into sugar?'}
                </strong>
              </button>
              <p className="study-mock__wait" style={{ color: ORANGE }}>
                {flashBack ? 'Recall logged. Next card when you say go.' : 'Try it in your head first — then tap to reveal.'}
              </p>
            </div>

            <div className={`study-mock__panel${activeMode === 'assess' ? ' is-active' : ''}`} aria-hidden={activeMode !== 'assess'}>
              <p className="study-mock__panel-kicker" style={{ color: isLight ? '#047857' : '#6ee7b7' }}>Server-graded check</p>
              <p className="study-mock__assess-q" style={{ color: ink }}>Where does photosynthesis store chemical energy first?</p>
              <div className="study-mock__assess-options">
                {assessOptions.map((opt) => (
                  <div
                    key={opt.id}
                    className={`study-mock__assess-opt${opt.picked ? ' is-picked' : ''}`}
                    style={{ borderColor: opt.picked ? ORANGE : border, background: opt.picked ? (isLight ? '#fff7ed' : 'rgba(234,88,12,0.1)') : panel }}
                  >
                    {opt.text}
                  </div>
                ))}
              </div>
              <p className="study-mock__assess-result" style={{ color: isLight ? '#047857' : '#6ee7b7' }}>
                <strong>Verified.</strong> Evidence added to your mastery ledger — not a chat guess.
              </p>
            </div>

            <div className={`study-mock__panel${activeMode === 'tutor' ? ' is-active' : ''}`} aria-hidden={activeMode !== 'tutor'}>
              <div className="study-beat__frame" style={{ borderColor: ORANGE, background: panel }}>
                <span style={{ color: ORANGE }}>light → ATP → sugar</span>
              </div>
              <p className="workspace-mock__chat-bubble is-ai" style={{ background: panel, borderColor: border, color: ink }}>
                Every green leaf is a quiet factory. One idea — then I wait for your words, not a multiple-choice guess.
              </p>
              <p className="workspace-mock__chat-bubble is-user study-mock__user-bubble" style={{ borderColor: border, color: ink }}>
                I think the chloroplast catches the light first?
              </p>
              <p className="study-mock__wait" style={{ color: ORANGE }}>Good start. Write your attempt — I&apos;ll debrief, not lecture.</p>
            </div>
          </div>

          <div className="study-composer" style={{ borderColor: border, background: panel }}>
            <span className="study-plus__mark is-composer" aria-hidden="true"><Plus size={14} color="#ffffff" strokeWidth={3} /></span>
            <span style={{ color: muted }}>Your turn — message Study Tutor…</span>
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
    finance: ['Currency', 'Debt', 'Savings'],
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

const OUTCOME_LOOP = [
  { icon: Eye, title: 'Understand', body: 'The mission, the context, what done means.' },
  { icon: Zap, title: 'Act', body: 'Build, research, study, plan, advise.' },
  { icon: ShieldCheck, title: 'Verify', body: 'Proof before anyone says “done.”' },
  { icon: Layers, title: 'Remember', body: 'Outcome state picks up next session.' },
];

const OUTCOME_PILLARS = [
  {
    n: '01',
    title: 'Proof of Done',
    body: 'The Coding Desk won’t claim success or open preview until the proof control plane passes.',
  },
  {
    n: '02',
    title: 'Grounded research',
    body: 'When facts matter, Quantora searches the web and cites sources — no invented numbers.',
  },
  {
    n: '03',
    title: 'Publish the win',
    body: 'Live preview → Vercel when the build is ready. A link you can share, not a screenshot.',
  },
];

const ROOMS = [
  {
    id: 'research',
    tag: 'Research',
    title: 'Research Analyst',
    body: 'Compare sources, map evidence, draft the call — grounded and still open when you return.',
    icon: BookOpen,
    mock: 'research',
  },
  {
    id: 'travel',
    tag: 'Travel',
    title: 'Travel Advisor',
    body: 'Clarify first, then flights, hotels, and an itinerary that stays on your desk.',
    icon: Globe,
    mock: 'travel',
  },
  {
    id: 'finance',
    tag: 'Finance',
    title: 'Finance Advisor',
    body: 'Portfolio, cash flow, trade-offs — a board that holds the numbers while you decide.',
    icon: PieChart,
    mock: 'finance',
  },
];

const PLATFORM_MODULES = [
  {
    icon: Sparkles,
    tag: 'Studio',
    title: 'AI Studio',
    body: 'Approved frontier models, choice cards, and session memory in one conversation.',
  },
  {
    icon: Network,
    tag: 'Canvas',
    title: 'Dream-to-Action',
    body: 'Map architecture and decisions from abstract intent to executable nodes.',
  },
  {
    icon: Atom,
    tag: 'Quantum',
    title: 'Quantum Playground',
    body: 'Simulate Qiskit circuits and inspect quantum states in the browser.',
  },
];

/** Parked surfaces (src/lib/platform-surfaces.js): their cards render only when the build shows them. */
const PARKED_MODULE_TAGS = ['Canvas', 'Quantum'];

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
    'Planning the turn…',
    'Assembling checkout.js…',
    'Running proof control plane…',
    'Patch applied. Re-proving…',
    'Verified. Preview ready.',
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
          <div className="heal-console__patch-block">
            {phase < 3 ? (
              <>
                <div className={`heal-console__line${phase >= 1 ? ' is-bug' : ''}`}>
                  <span className="heal-console__ln" style={{ color: muted }}>10</span>
                  <span>  const total = subtotal;</span>
                </div>
                <div className="heal-console__line is-reserved" aria-hidden="true">
                  <span className="heal-console__ln" style={{ color: muted }}>&nbsp;</span>
                  <span>&nbsp;</span>
                </div>
                <div className="heal-console__line is-reserved" aria-hidden="true">
                  <span className="heal-console__ln" style={{ color: muted }}>&nbsp;</span>
                  <span>&nbsp;</span>
                </div>
              </>
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
          </div>
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
          <p>$ quantora prove checkout.js</p>
          <p className={phase >= 1 ? '' : 'is-reserved'}>[proof] Reading 23 lines · gap: tax not applied</p>
          <p className={phase >= 2 ? '' : 'is-reserved'}>[agent] Writing patch…</p>
          <p className={phase >= 3 ? 'heal-console__del-line' : 'is-reserved'}>− const total = subtotal;</p>
          <p className={phase >= 3 ? 'heal-console__add-line' : 'is-reserved'}>+ const tax = await calculateTax(cart.address);</p>
          <p className={phase >= 3 ? 'heal-console__add-line' : 'is-reserved'}>+ const total = Math.round(subtotal * (1 + tax));</p>
          <p className={phase >= 4 ? '' : 'is-reserved'}>$ vitest run checkout.test.js</p>
          <p className={phase >= 4 ? '' : 'is-reserved'} style={{ color: phase >= 4 ? ORANGE : undefined }}>✓ tax is applied  ·  ✓ integer rounding</p>
          <span className="heal-console__caret" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

export default function LandingPage({ onLaunchStudio, onStartBuild, onOpenAuth, user, themeMode, setThemeMode, isLight: isLightProp }) {
  const [heroPrompt, setHeroPrompt] = useState('');
  const [ghost, setGhost] = useState('');
  const promptRef = useRef(null);

  useEffect(() => {
    if (heroPrompt) return undefined;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setGhost(GUEST_DEMO_PROMPT);
      return undefined;
    }
    let i = 0;
    let dir = 1;
    let holdUntil = 0;
    const id = setInterval(() => {
      if (dir === 1) {
        i += 1;
        setGhost(GUEST_DEMO_PROMPT.slice(0, i));
        if (i >= GUEST_DEMO_PROMPT.length) {
          dir = 0;
          holdUntil = Date.now() + 2400;
        }
      } else if (dir === 0) {
        if (Date.now() >= holdUntil) dir = -1;
      } else {
        i = Math.max(0, i - 3);
        setGhost(GUEST_DEMO_PROMPT.slice(0, i));
        if (i === 0) dir = 1;
      }
    }, 22);
    return () => clearInterval(id);
  }, [heroPrompt]);

  const isLight = typeof isLightProp === 'boolean' ? isLightProp : themeMode === 'light';
  const textColor = isLight ? '#0a0a0a' : '#ffffff';
  const subtextColor = isLight ? '#525252' : '#a3a3a3';
  const cardBorder = isLight ? '1px solid #e5e5e5' : '1px solid #262626';
  const cardBg = isLight ? '#ffffff' : '#0a0a0a';
  const navBg = isLight ? '#ffffff' : '#0a0a0a';

  // Hero / final CTAs must open the real auth gate for signed-out visitors
  // (Google + GitHub). A guest animation is not a substitute for sign-in.
  const startBuild = (prompt) => {
    const text = (prompt ?? heroPrompt ?? '').toString().trim() || GUEST_DEMO_PROMPT;
    if (!heroPrompt) setHeroPrompt(text);
    if (onStartBuild) onStartBuild(text);
    else if (user) onLaunchStudio();
    else onOpenAuth();
  };

  const openStudio = () => (user ? onLaunchStudio() : onOpenAuth());

  const TryCta = ({ className = 'landing-cta landing-cta--primary', large, onClick, login }) => (
    <button
      type="button"
      data-quantora-login={login ? 'true' : undefined}
      onClick={onClick}
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
            <QuantoraFullLogoSvg height={44} isDark={!isLight} tagline="IDEA TO OUTCOME" />
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
              <TryCta login onClick={openStudio} />
            )}
          </div>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-container">
          <div className="landing-hero__inner">
            <h1 className="landing-hero__title" style={{ color: textColor }}>
              Type the idea.<br />Own the <span className="landing-accent">outcome.</span>
            </h1>
            <p className="landing-hero__subtitle" style={{ color: subtextColor }}>
              Free outcomes studio. Models answer — Quantora builds, researches, tutors, plans, and proves it before calling it done.
            </p>
            <ol className="landing-hero__beats" aria-label="Outcome runtime">
              <li>Intent</li>
              <li>Act</li>
              <li>Verify</li>
              <li>Yours</li>
            </ol>
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
                  rows={2}
                  placeholder=""
                  style={{ color: textColor, caretColor: heroPrompt ? ORANGE : 'transparent' }}
                />
                {!heroPrompt && (
                  <div className="landing-hero__ghost" aria-hidden="true">
                    <span>{ghost}</span>
                    <span className="landing-hero__caret" />
                  </div>
                )}
              </div>
              <button
                type="button"
                className="landing-hero__submit"
                data-quantora-login={user ? undefined : 'true'}
                onClick={() => startBuild()}
              >
                Try Quantora <ArrowRight size={16} />
              </button>
            </div>
            <p className="landing-hero__free" style={{ color: subtextColor }}>Free to start. Sign in with Google or GitHub to keep the work.</p>
            <div className="landing-hero__preview">
              <GuestBuildPreview
                isLight={isLight}
                prompt={heroPrompt || GUEST_DEMO_PROMPT}
                running={false}
                done={false}
                onContinue={() => startBuild(heroPrompt || GUEST_DEMO_PROMPT)}
              />
            </div>
          </div>
        </div>
      </section>

      <section className={`landing-section landing-outcomes${isLight ? ' is-light' : ' is-dark'}`}>
        <div className="landing-container">
          <Reveal>
            <div className="landing-section__header is-center">
              <p className="landing-section__eyebrow">Outcome Runtime</p>
              <h2 className="landing-section__title" style={{ color: textColor }}>Models answer. Quantora finishes.</h2>
              <p className="landing-section__lead" style={{ color: subtextColor }}>
                Not another chatbot. The PCL judges the mission, acts, verifies the result, and remembers where you left off — across every workspace.
              </p>
            </div>
          </Reveal>
          <Reveal>
            <div className="landing-agentic__pipeline" aria-label="Understand, act, verify, remember">
              {OUTCOME_LOOP.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="landing-agentic__step" style={{ color: subtextColor }}>
                    {i < OUTCOME_LOOP.length - 1 && <span className="landing-agentic__connector" aria-hidden="true" />}
                    <div className="landing-agentic__icon" style={{ border: cardBorder }}>
                      <Icon size={22} color={ORANGE} />
                    </div>
                    <strong style={{ color: textColor }}>{step.title}</strong>
                    <span>{step.body}</span>
                  </div>
                );
              })}
            </div>
          </Reveal>
          <div className="landing-outcomes__grid">
            {OUTCOME_PILLARS.map((pillar, i) => (
              <Reveal key={pillar.title} delay={i * 50}>
                <article className="landing-outcome-card">
                  <em>{pillar.n}</em>
                  <strong>{pillar.title}</strong>
                  <span>{pillar.body}</span>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-proof">
        <div className="landing-container">
          <Reveal>
            <div className="landing-section__header is-center">
              <p className="landing-section__eyebrow">Coding Desk</p>
              <h2 className="landing-section__title" style={{ color: textColor }}>Build it. Prove it. Ship it.</h2>
              <p className="landing-section__lead" style={{ color: subtextColor }}>
                Files write. Preview goes live. Self-heal patches the gap. Nothing opens as “done” until proof passes — then publish to Vercel when you’re ready.
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
              <p className="landing-section__eyebrow">Domain workspaces</p>
              <h2 className="landing-section__title" style={{ color: textColor }}>One studio. Every ambition.</h2>
              <p className="landing-section__lead" style={{ color: subtextColor }}>
                An AI tutor with schedules, flashcards, and server-graded checks — plus research, travel, and finance. Same outcome memory when you return.
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

      <section className="landing-section">
        <div className="landing-container">
          <Reveal>
            <div className="landing-section__header is-center">
              <p className="landing-section__eyebrow">Platform</p>
              <h2 className="landing-section__title" style={{ color: textColor }}>More than a prompt box.</h2>
              <p className="landing-section__lead" style={{ color: subtextColor }}>
                {exploratorySurfacesEnabled()
                  ? 'Studio for everyday outcomes. Canvas for architecture. Quantum for exploration. All free to start.'
                  : 'Studio for everyday outcomes, and a desk for every kind of work. All free to start.'}
              </p>
            </div>
          </Reveal>
          <div className="landing-features__grid">
            {PLATFORM_MODULES.filter((mod) => exploratorySurfacesEnabled() || !PARKED_MODULE_TAGS.includes(mod.tag)).map((mod, i) => {
              const Icon = mod.icon;
              return (
                <Reveal key={mod.title} delay={i * 50}>
                  <article
                    className={`landing-feature-card${isLight ? ' is-light' : ' is-dark'}`}
                    style={{ border: cardBorder, background: cardBg }}
                  >
                    <div className="landing-feature-card__body">
                      <span className="landing-feature-card__tag" style={{ color: ORANGE }}>{mod.tag}</span>
                      <div className="landing-feature-card__title-row">
                        <Icon size={16} color={ORANGE} />
                        <h3 style={{ color: textColor }}>{mod.title}</h3>
                      </div>
                      <p style={{ color: subtextColor, margin: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>{mod.body}</p>
                    </div>
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
              <div className="landing-final-cta__head">
                <Rocket size={24} color={ORANGE} aria-hidden="true" />
                <h2 style={{ color: textColor }}>Bring the idea. Leave with the outcome.</h2>
              </div>
              <p style={{ color: subtextColor }}>
                Apps, research, study, travel, finance — measured by completion, not prompt volume. Try Quantora for free.
              </p>
              <TryCta large login onClick={() => startBuild()} />
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
