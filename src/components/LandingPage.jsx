import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileText,
  FolderKanban,
  Globe2,
  Moon,
  Paperclip,
  Search,
  Sparkles,
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

const OUTCOME_STEPS = ['Understand', 'Research', 'Create', 'Verify', 'Ship'];

function startFromPrompt({ prompt, onStartBuild, onLaunchStudio, onOpenAuth, user }) {
  const value = String(prompt || '').trim();
  if (onStartBuild) {
    onStartBuild(value);
    return;
  }
  if (user) onLaunchStudio?.();
  else onOpenAuth?.();
}

function ProductScene() {
  return (
    <div className="q-product-scene" aria-label="Quantora Studio product preview">
      <aside className="q-product-sidebar">
        <div className="q-product-sidebar__brand">Q</div>
        <button type="button" className="q-product-new">+ New chat</button>

        <div className="q-product-sidebar__label">Projects</div>
        <div className="q-product-project q-product-project--active">
          <FolderKanban size={14} />
          <span>Cloud Modernization</span>
        </div>
        <div className="q-product-project">
          <FolderKanban size={14} />
          <span>Quantora Platform</span>
        </div>

        <div className="q-product-sidebar__label q-product-sidebar__label--later">Recent</div>
        <div className="q-product-recent">CIO decision pack</div>
        <div className="q-product-recent">Cost assumptions</div>
        <div className="q-product-recent">Target architecture</div>
      </aside>

      <section className="q-product-chat">
        <header className="q-product-chat__header">
          <div>
            <strong>Cloud Modernization</strong>
            <span>Project</span>
          </div>
          <div className="q-product-model">Gemini Flash <ChevronDown size={13} /></div>
        </header>

        <div className="q-product-thread">
          <div className="q-product-user">
            Prepare the CIO decision pack. Make the recommendation explicit and use what we already agreed in this project.
          </div>

          <div className="q-product-assistant">
            <div className="q-product-assistant__mark"><Sparkles size={15} /></div>
            <div>
              <strong>Got it.</strong>
              <p>I’m using the approved recommendation, current constraints and financial evidence already in this project.</p>
              <div className="q-product-action">Creating presentation</div>
            </div>
          </div>

          <div className="q-product-composer">
            <Paperclip size={15} />
            <span>Ask Quantora…</span>
            <div className="q-product-composer__tool"><Search size={13} /> Web Search</div>
            <button type="button" aria-label="Send"><ArrowRight size={14} /></button>
          </div>
        </div>
      </section>

      <section className="q-product-workspace">
        <header className="q-product-workspace__header">
          <div>
            <FileText size={15} />
            <strong>Strategic Path Forward.pptx</strong>
          </div>
          <span>Preview</span>
        </header>

        <div className="q-slide-stage">
          <div className="q-slide-preview">
            <div className="q-slide-brand">QUANTORA</div>
            <div className="q-slide-title">Strategic path forward</div>
            <div className="q-slide-subtitle">Cloud modernization · CIO decision</div>
            <div className="q-slide-rule" />

            <div className="q-slide-kpis">
              <div><span>01</span><strong>Stabilize</strong><small>Protect critical services</small></div>
              <div><span>02</span><strong>Modernize</strong><small>Prioritize value pools</small></div>
              <div><span>03</span><strong>Scale</strong><small>Industrialize delivery</small></div>
            </div>

            <div className="q-slide-callout">
              <span>RECOMMENDATION</span>
              <strong>Approve a phased modernization path with a 90-day mobilization.</strong>
            </div>
          </div>
        </div>

        <footer className="q-product-workspace__footer">
          <div><CheckCircle2 size={14} /> Verified</div>
          <span>PowerPoint · Ready</span>
        </footer>
      </section>
    </div>
  );
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
        <div className="q-shell q-hero__copy">
          <span className="q-kicker">QUANTORA / PROMPT TO ACTION</span>
          <h1>Turn thought into<br /><em>something real.</em></h1>
          <p>Think. Create. Deliver.</p>

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

        <div className="q-shell q-hero__product">
          <ProductScene />
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
              <React.Fragment key={step}>
                <div className="q-flow__step">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{step}</strong>
                </div>
                {index < OUTCOME_STEPS.length - 1 && <div className="q-flow__line" aria-hidden="true" />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      <section className="q-proof">
        <div className="q-shell q-proof__inner">
          <span>THE DIFFERENCE</span>
          <h2>Work that leaves the conversation.</h2>
          <div className="q-proof__outcomes">
            <div><Search size={18} /><strong>Research</strong><span>Evidence</span></div>
            <div><FileText size={18} /><strong>Office</strong><span>Artifacts</span></div>
            <div><FolderKanban size={18} /><strong>Projects</strong><span>Continuity</span></div>
            <div><Globe2 size={18} /><strong>Ship</strong><span>Live</span></div>
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
