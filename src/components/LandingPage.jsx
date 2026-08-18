import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Code2,
  FileText,
  FolderKanban,
  Globe2,
  Layers3,
  Moon,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Workflow,
} from 'lucide-react';
import { QuantoraFullLogoSvg } from './QuantoraLogoSvg';
import './LandingPage.css';

const PROMPT_EXAMPLES = [
  'Build a board-ready cloud modernization case…',
  'Research this market and prepare the decision brief…',
  'Turn these notes into a clean PowerPoint…',
  'Build a working dashboard from this idea…',
];

const DIFFERENTIATORS = [
  {
    icon: FolderKanban,
    eyebrow: '01 / Context',
    title: 'Understands the outcome.',
    body: 'Projects keep the goal, decisions, constraints, artifacts and next actions connected across conversations.',
  },
  {
    icon: Workflow,
    eyebrow: '02 / Action',
    title: 'Does the work.',
    body: 'Research, Office, code, analysis and publishing happen in the same workflow instead of disappearing into separate tools.',
  },
  {
    icon: ShieldCheck,
    eyebrow: '03 / Quality',
    title: 'Checks the result.',
    body: 'Generated artifacts can be compiled, executed, repaired and verified before Quantora treats them as finished.',
  },
];

const SURFACES = [
  { icon: Search, label: 'Research', body: 'Find, compare and turn evidence into a usable decision.' },
  { icon: FileText, label: 'Office', body: 'Create and refine PowerPoint, Word and Excel artifacts.' },
  { icon: Code2, label: 'Build', body: 'Generate working software, inspect the code and run it live.' },
  { icon: Globe2, label: 'Ship', body: 'Preview, verify and publish when the web is the right outcome.' },
];

const TRUST_POINTS = [
  'Project-aware context',
  'Multi-model routing',
  'Bring your own keys',
  'Verified artifact paths',
];

function startFromPrompt({ prompt, onStartBuild, onLaunchStudio, onOpenAuth, user }) {
  const value = String(prompt || '').trim();
  if (onStartBuild) {
    onStartBuild(value);
    return;
  }
  if (user) onLaunchStudio?.();
  else onOpenAuth?.();
}

export default function LandingPage({
  onLaunchStudio,
  onStartBuild,
  onOpenAuth,
  user,
  availableModels = [],
  themeMode,
  setThemeMode,
}) {
  const isLight = themeMode === 'light';
  const [prompt, setPrompt] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    if (prompt) return undefined;
    const timer = window.setInterval(() => {
      setPlaceholderIndex((index) => (index + 1) % PROMPT_EXAMPLES.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [prompt]);

  const liveModelCount = useMemo(
    () => availableModels.filter((model) => model && model.available !== false).length,
    [availableModels],
  );

  const submit = () => startFromPrompt({ prompt, onStartBuild, onLaunchStudio, onOpenAuth, user });

  return (
    <main className={`q-landing${isLight ? ' q-landing--light' : ''}`}>
      <header className="q-nav">
        <button
          type="button"
          className="q-nav__brand"
          onClick={() => (user ? onLaunchStudio?.() : onOpenAuth?.())}
          aria-label="Open Quantora"
        >
          <QuantoraFullLogoSvg height={34} isDark={!isLight} tagline="PROMPT TO ACTION" />
        </button>

        <nav className="q-nav__links" aria-label="Primary navigation">
          <a href="#why">Why Quantora</a>
          <a href="#platform">Platform</a>
          <a href="#trust">Trust</a>
        </nav>

        <div className="q-nav__actions">
          <button
            type="button"
            className="q-icon-button"
            onClick={() => setThemeMode?.(isLight ? 'dark' : 'light')}
            aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
          >
            {isLight ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          <button
            type="button"
            className="q-nav__cta"
            onClick={() => (user ? onLaunchStudio?.() : onOpenAuth?.())}
          >
            {user ? 'Open Studio' : 'Start free'} <ArrowRight size={16} />
          </button>
        </div>
      </header>

      <section className="q-hero">
        <div className="q-shell q-hero__grid">
          <div className="q-hero__copy">
            <span className="q-kicker"><span /> Quantora</span>
            <h1>From intent to <em>outcome.</em></h1>
            <p className="q-hero__lead">
              Research it. Decide it. Build it. Present it. Ship it. One project, one context, the right intelligence for the job.
            </p>

            <div className="q-prompt" role="group" aria-label="Start with Quantora">
              <textarea
                rows={1}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                placeholder={PROMPT_EXAMPLES[placeholderIndex]}
                aria-label="What do you need done?"
              />
              <button type="button" onClick={submit}>
                Run with it <ArrowRight size={17} />
              </button>
            </div>

            <div className="q-hero__proof">
              <span>{liveModelCount > 0 ? `${liveModelCount} available models` : 'Multi-model intelligence'}</span>
              <span>Project context</span>
              <span>Verified artifacts</span>
            </div>
          </div>

          <div className="q-product-frame" aria-label="Quantora product workflow preview">
            <div className="q-product-frame__bar">
              <span className="q-product-frame__dot" />
              <span>Cloud Modernization</span>
              <small>Project</small>
            </div>
            <div className="q-product-frame__body">
              <div className="q-product-frame__prompt">Prepare the CIO decision pack and make the recommendation explicit.</div>
              <div className="q-product-frame__response">
                <Sparkles size={17} />
                <div>
                  <strong>Outcome understood.</strong>
                  <p>Use the approved recommendation, current constraints and verified financial evidence already in this project.</p>
                </div>
              </div>
              <div className="q-product-frame__artifacts">
                <div><FileText size={16} /><span>Strategic Path Forward.pptx</span><b>Verified</b></div>
                <div><Layers3 size={16} /><span>Architecture Assessment.docx</span><b>Ready</b></div>
              </div>
              <div className="q-product-frame__next">
                <span>Next best action</span>
                <strong>Finalize the CIO decision slide</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="q-statement">
        <div className="q-shell">
          <p>Not another AI chat.</p>
          <h2>Quantora keeps the objective in view and moves the work forward.</h2>
        </div>
      </section>

      <section id="why" className="q-section">
        <div className="q-shell">
          <div className="q-section__head">
            <span>Why Quantora</span>
            <h2>The difference is continuity.</h2>
            <p>A good model can answer a prompt. Quantora is designed to understand what the work is trying to achieve, carry context forward and deliver something usable.</p>
          </div>
          <div className="q-diff-grid">
            {DIFFERENTIATORS.map(({ icon: Icon, eyebrow, title, body }) => (
              <article key={title} className="q-diff-card">
                <div className="q-diff-card__top"><span>{eyebrow}</span><Icon size={20} /></div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="platform" className="q-section q-section--muted">
        <div className="q-shell q-platform">
          <div className="q-platform__copy">
            <span>One project. Every surface.</span>
            <h2>Stay in the work instead of rebuilding context.</h2>
            <p>Move from research to a decision, from a decision to an artifact, and from an artifact to working software without starting over in another product.</p>
            <button type="button" onClick={() => (user ? onLaunchStudio?.() : onOpenAuth?.())}>
              Explore the Studio <ArrowRight size={17} />
            </button>
          </div>
          <div className="q-surface-grid">
            {SURFACES.map(({ icon: Icon, label, body }) => (
              <article key={label} className="q-surface-card">
                <Icon size={19} />
                <h3>{label}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="trust" className="q-section">
        <div className="q-shell q-trust">
          <div>
            <span>Built for serious work</span>
            <h2>Less prompt theatre. More evidence, control and completion.</h2>
          </div>
          <div className="q-trust__list">
            {TRUST_POINTS.map((item) => (
              <div key={item}><Check size={17} /><span>{item}</span></div>
            ))}
          </div>
        </div>
      </section>

      <section className="q-final">
        <div className="q-shell q-final__inner">
          <span>Start with the outcome.</span>
          <h2>What do you need done?</h2>
          <button type="button" onClick={() => (user ? onLaunchStudio?.() : onOpenAuth?.())}>
            Open Quantora <ArrowRight size={18} />
          </button>
        </div>
      </section>
    </main>
  );
}
