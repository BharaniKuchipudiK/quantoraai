import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  FileText,
  Globe2,
  Moon,
  Search,
  Sun,
} from 'lucide-react';
import { QuantoraFullLogoSvg } from './QuantoraLogoSvg';
import './LandingPage.css';

const PROMPT_EXAMPLES = [
  'Turn this idea into a board-ready decision…',
  'Research this and tell me what actually matters…',
  'Build the presentation, not just the outline…',
  'Create the app and get it running…',
];

const OUTCOME_STEPS = [
  { label: 'Understand', mark: '01' },
  { label: 'Research', mark: '02' },
  { label: 'Create', mark: '03' },
  { label: 'Verify', mark: '04' },
  { label: 'Ship', mark: '05' },
];

const SURFACES = [
  { icon: Search, label: 'Research', result: 'Evidence' },
  { icon: FileText, label: 'Office', result: 'Artifacts' },
  { icon: Code2, label: 'Build', result: 'Software' },
  { icon: Globe2, label: 'Ship', result: 'Live' },
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
          <QuantoraFullLogoSvg height={32} isDark={!isLight} tagline="PROMPT TO ACTION" />
        </button>

        <div className="q-nav__actions">
          <button
            type="button"
            className="q-icon-button"
            onClick={() => setThemeMode?.(isLight ? 'dark' : 'light')}
            aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
          >
            {isLight ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button
            type="button"
            className="q-nav__cta"
            onClick={() => (user ? onLaunchStudio?.() : onOpenAuth?.())}
          >
            {user ? 'Open Quantora' : 'Start'} <ArrowRight size={16} />
          </button>
        </div>
      </header>

      <section className="q-hero">
        <div className="q-shell q-hero__inner">
          <div className="q-hero__copy">
            <span className="q-kicker">QUANTORA / PROMPT TO ACTION</span>
            <h1>Turn thought<br />into <em>something real.</em></h1>
            <p>Research. Decide. Create. Build. Ship.</p>

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
                aria-label="What do you want to make happen?"
              />
              <button type="button" onClick={submit} aria-label="Start with Quantora">
                <ArrowRight size={19} />
              </button>
            </div>
          </div>

          <div className="q-orbit" aria-label="Quantora outcome flow">
            <div className="q-orbit__glow" />
            <div className="q-orbit__core">
              <span>YOUR INTENT</span>
              <strong>One outcome</strong>
            </div>
            <div className="q-orbit__ring q-orbit__ring--one" />
            <div className="q-orbit__ring q-orbit__ring--two" />
            <div className="q-orbit__node q-orbit__node--research"><Search size={16} /><span>Research</span></div>
            <div className="q-orbit__node q-orbit__node--office"><FileText size={16} /><span>Office</span></div>
            <div className="q-orbit__node q-orbit__node--build"><Code2 size={16} /><span>Build</span></div>
            <div className="q-orbit__node q-orbit__node--ship"><Globe2 size={16} /><span>Ship</span></div>
          </div>
        </div>
      </section>

      <section className="q-punch">
        <div className="q-shell">
          <span>THE VALUE</span>
          <h2>Less prompting.<br /><em>More progress.</em></h2>
        </div>
      </section>

      <section className="q-flow">
        <div className="q-shell">
          <div className="q-flow__eyebrow">One project. One context. One direction.</div>
          <div className="q-flow__track">
            {OUTCOME_STEPS.map((step, index) => (
              <React.Fragment key={step.label}>
                <div className="q-flow__step">
                  <span>{step.mark}</span>
                  <strong>{step.label}</strong>
                </div>
                {index < OUTCOME_STEPS.length - 1 && <div className="q-flow__line" aria-hidden="true" />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      <section className="q-proof">
        <div className="q-shell q-proof__grid">
          <div className="q-proof__statement">
            <span>NOT ANOTHER CHAT WINDOW</span>
            <h2>Work that leaves the conversation.</h2>
          </div>

          <div className="q-proof__demo" aria-label="Example Quantora outcome">
            <div className="q-proof__prompt">Prepare the CIO decision pack.</div>
            <div className="q-proof__artifact">
              <div>
                <FileText size={19} />
                <span>Strategic Path Forward.pptx</span>
              </div>
              <b><CheckCircle2 size={14} /> Verified</b>
            </div>
            <div className="q-proof__artifact">
              <div>
                <Code2 size={19} />
                <span>Executive dashboard</span>
              </div>
              <b><CheckCircle2 size={14} /> Running</b>
            </div>
            <div className="q-proof__next">
              <span>NEXT</span>
              <strong>Move the decision forward.</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="q-surfaces">
        <div className="q-shell">
          <div className="q-surfaces__headline">Whatever the outcome needs.</div>
          <div className="q-surfaces__grid">
            {SURFACES.map(({ icon: Icon, label, result }) => (
              <div key={label} className="q-surface">
                <Icon size={20} />
                <span>{label}</span>
                <strong>{result}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="q-final">
        <div className="q-shell q-final__inner">
          <h2>Start with what you want done.</h2>
          <button type="button" onClick={() => (user ? onLaunchStudio?.() : onOpenAuth?.())}>
            Open Quantora <ArrowRight size={18} />
          </button>
        </div>
      </section>
    </main>
  );
}
