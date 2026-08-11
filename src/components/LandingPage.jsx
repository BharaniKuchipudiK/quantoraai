import React, { useState } from 'react';
import {
  ArrowRight,
  Atom,
  Check,
  CheckCircle2,
  Code2,
  Cpu,
  Gauge,
  Layers,
  MessageSquareText,
  Moon,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sun,
  Workflow,
  Zap
} from 'lucide-react';
import { QuantoraFullLogoSvg } from './QuantoraLogoSvg';
import './LandingPage.css';

const samplePrompts = [
  'Create a clean launch page for a sustainable coffee brand',
  'Build a task tracker with priorities and due dates',
  'Explain this product idea and help me improve it'
];

const capabilityCards = [
  {
    icon: MessageSquareText,
    label: 'Human-first guidance',
    title: 'Talk to Quantora like a thoughtful teammate.',
    text: 'It explains the reasoning, understands context and asks a useful follow-up when the direction is unclear.'
  },
  {
    icon: Workflow,
    label: 'Smart model routing',
    title: 'Use the best ready free model for the job.',
    text: 'Quantora matches the request to an available model and can move to a fallback when a provider fails.'
  },
  {
    icon: Code2,
    label: 'Prompt to action',
    title: 'Move from an answer to something you can use.',
    text: 'Build, preview and refine working interfaces without being buried under an unexplained wall of code.'
  }
];

export default function LandingPage({ onLaunchStudio, onOpenAuth, user, themeMode, setThemeMode }) {
  const [activeDemoTab, setActiveDemoTab] = useState('builder');
  const [selectedPrompt, setSelectedPrompt] = useState(samplePrompts[0]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationComplete, setSimulationComplete] = useState(false);

  const isLight = themeMode === 'light';
  const openQuantora = () => (user ? onLaunchStudio() : onOpenAuth());

  const handleRunSimulation = () => {
    setIsSimulating(true);
    setSimulationComplete(false);
    window.setTimeout(() => {
      setIsSimulating(false);
      setSimulationComplete(true);
    }, 950);
  };

  const scrollToDemo = () => {
    document.getElementById('product-demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div
      className={`landing-page ${isLight ? 'is-light' : 'is-dark'}`}
      style={{
        '--landing-bg': isLight ? '#fbfaf8' : '#080b12',
        '--landing-surface': isLight ? '#ffffff' : '#10151f',
        '--landing-soft': isLight ? '#f4f1ec' : '#171d29',
        '--landing-text': isLight ? '#111827' : '#f8fafc',
        '--landing-muted': isLight ? '#5d6675' : '#aab4c4',
        '--landing-border': isLight ? '#e7e2da' : '#263041'
      }}
    >
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <button className="landing-brand" onClick={openQuantora} aria-label="Open Quantora">
            <QuantoraFullLogoSvg height={34} isDark={!isLight} tagline="PROMPT TO ACTION" />
          </button>

          <nav className="landing-nav-links" aria-label="Main navigation">
            <a href="#why-quantora">Why Quantora</a>
            <a href="#product-demo">Product</a>
            <a href="#how-it-helps">How it helps</a>
          </nav>

          <div className="landing-nav-actions">
            <button
              className="landing-theme-button"
              onClick={() => setThemeMode(isLight ? 'dark' : 'light')}
              aria-label={`Use ${isLight ? 'dark' : 'light'} theme`}
            >
              {isLight ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <button className="landing-nav-cta" onClick={openQuantora}>
              {user ? 'Open Quantora' : 'Start building'} <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero" id="why-quantora">
          <div className="landing-hero-glow landing-hero-glow-one" />
          <div className="landing-hero-glow landing-hero-glow-two" />

          <div className="landing-hero-copy">
            <div className="landing-eyebrow"><Sparkles size={15} /> One workspace. The right model for the moment.</div>
            <h1>Turn an idea into <span>working software.</span></h1>
            <p>
              Quantora listens first, chooses a ready AI model and helps you move from a rough thought to a useful result—without making you learn the machinery behind it.
            </p>

            <div className="landing-hero-actions">
              <button className="landing-primary-cta" onClick={openQuantora}>
                Start building <ArrowRight size={17} />
              </button>
              <button className="landing-secondary-cta" onClick={scrollToDemo}>
                <Play size={15} /> See how it works
              </button>
            </div>

            <div className="landing-proof-list" aria-label="Quantora benefits">
              <span><Check size={14} /> Prioritizes ready free models</span>
              <span><Check size={14} /> Explains its choices</span>
              <span><Check size={14} /> Falls back when a model fails</span>
            </div>
          </div>

          <div className="landing-product-visual" aria-label="Quantora product preview">
            <div className="product-window">
              <div className="product-window-topbar">
                <div className="window-dots"><i /><i /><i /></div>
                <span>AI Studio</span>
                <span className="product-live"><i /> Live</span>
              </div>

              <div className="product-window-body">
                <aside className="product-mini-sidebar">
                  <div className="product-mini-brand"><Sparkles size={16} /> Quantora</div>
                  <div className="product-mini-nav is-active">New conversation</div>
                  <div className="product-mini-nav">Model Dashboard</div>
                  <div className="product-mini-caption">Recent</div>
                  <div className="product-mini-history">Launch page direction</div>
                  <div className="product-mini-history">Product roadmap</div>
                </aside>

                <div className="product-chat">
                  <div className="product-routing-card">
                    <div>
                      <span className="product-routing-label">Best free model</span>
                      <strong>Auto-selected for this request</strong>
                    </div>
                    <span className="product-ready"><CheckCircle2 size={13} /> Ready</span>
                  </div>

                  <div className="product-user-message">Help me turn my idea into a clean launch page. Keep it simple and explain your choices.</div>

                  <div className="product-ai-message">
                    <div className="product-ai-avatar"><Sparkles size={15} /></div>
                    <div>
                      <strong>Here’s the direction I’d recommend.</strong>
                      <p>Lead with one clear promise, show the real product early, and keep the first decision easy. I’ll draft the structure before building it.</p>
                      <div className="product-plan-row"><span>1</span> Clarify the promise</div>
                      <div className="product-plan-row"><span>2</span> Show product proof</div>
                      <div className="product-plan-row"><span>3</span> Build and preview</div>
                    </div>
                  </div>

                  <div className="product-composer">Ask Quantora anything… <ArrowRight size={15} /></div>
                </div>
              </div>
            </div>

            <div className="product-floating-card product-floating-model">
              <Cpu size={16} />
              <div><strong>Smart routing</strong><span>Ready free model chosen</span></div>
            </div>
            <div className="product-floating-card product-floating-fallback">
              <ShieldCheck size={16} />
              <div><strong>Fallback ready</strong><span>Continuity without the guesswork</span></div>
            </div>
          </div>
        </section>

        <section className="landing-signal-strip" aria-label="Product principles">
          <div><strong>Human</strong><span>Clear advice, not a code dump</span></div>
          <div><strong>Adaptive</strong><span>The right available model for the task</span></div>
          <div><strong>Practical</strong><span>From conversation to a working result</span></div>
        </section>

        <section className="landing-demo-section" id="product-demo">
          <div className="landing-section-heading">
            <span>See the product, not a promise</span>
            <h2>Explore what Quantora can do.</h2>
            <p>A lightweight preview of the same workflow: describe the outcome, let Quantora choose a path, then refine it together.</p>
          </div>

          <div className="landing-demo-window">
            <div className="landing-demo-tabs" role="tablist" aria-label="Product demonstrations">
              <button className={activeDemoTab === 'builder' ? 'is-active' : ''} onClick={() => setActiveDemoTab('builder')}><Code2 size={15} /> App builder</button>
              <button className={activeDemoTab === 'models' ? 'is-active' : ''} onClick={() => setActiveDemoTab('models')}><Cpu size={15} /> Model routing</button>
              <button className={activeDemoTab === 'quantum' ? 'is-active' : ''} onClick={() => setActiveDemoTab('quantum')}><Atom size={15} /> Quantum tools</button>
            </div>

            {activeDemoTab === 'builder' && (
              <div className="landing-demo-grid">
                <div className="landing-demo-input">
                  <label htmlFor="landing-demo-prompt">What would you like to make?</label>
                  <textarea id="landing-demo-prompt" rows={4} value={selectedPrompt} onChange={(event) => setSelectedPrompt(event.target.value)} />
                  <div className="landing-prompt-options">
                    {samplePrompts.map((prompt, index) => (
                      <button key={prompt} className={selectedPrompt === prompt ? 'is-active' : ''} onClick={() => setSelectedPrompt(prompt)}>Idea {index + 1}</button>
                    ))}
                  </div>
                  <button className="landing-demo-run" onClick={handleRunSimulation} disabled={isSimulating}>
                    {isSimulating ? <RotateCcw className="animate-spin" size={16} /> : <Play size={16} />}
                    {isSimulating ? 'Building the first version…' : 'Preview the workflow'}
                  </button>
                </div>

                <div className="landing-demo-output">
                  <div className="landing-output-header"><span>Quantora workspace</span><span><i /> Ready</span></div>
                  {isSimulating ? (
                    <div className="landing-output-progress">
                      <span><CheckCircle2 size={15} /> Understanding your goal</span>
                      <span><Gauge size={15} /> Selecting a ready free model</span>
                      <span><Layers size={15} /> Structuring the first version</span>
                    </div>
                  ) : simulationComplete ? (
                    <div className="landing-output-success">
                      <div className="landing-output-icon"><CheckCircle2 size={20} /></div>
                      <div><strong>Your first version is ready to refine.</strong><p>Quantora has shaped “{selectedPrompt}” into a clear build direction.</p></div>
                      <button onClick={openQuantora}>Continue in AI Studio <ArrowRight size={14} /></button>
                    </div>
                  ) : (
                    <div className="landing-output-empty">
                      <Sparkles size={22} />
                      <strong>A useful result starts with your intent.</strong>
                      <p>Try one of the example ideas or describe what you actually want to achieve.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeDemoTab === 'models' && (
              <div className="landing-model-demo">
                <div className="landing-model-copy">
                  <span className="landing-demo-kicker">Best Free Model — Auto Select</span>
                  <h3>Quantora handles the model decision.</h3>
                  <p>It reads the task, considers ready free options and explains the choice in normal language. If the provider fails, another suitable model can take over.</p>
                  <button onClick={openQuantora}>Open Model Dashboard <ArrowRight size={14} /></button>
                </div>
                <div className="landing-model-list">
                  <div className="is-selected"><span className="model-status-dot" /><div><strong>Gemini Flash</strong><span>Fast general work · Free tier</span></div><em>Selected</em></div>
                  <div><span className="model-status-dot" /><div><strong>Nemotron</strong><span>Coding and research · Free</span></div><em>Ready</em></div>
                  <div><span className="model-status-dot" /><div><strong>Free fallback</strong><span>Used when the primary route fails</span></div><em>Standby</em></div>
                </div>
              </div>
            )}

            {activeDemoTab === 'quantum' && (
              <div className="landing-quantum-demo">
                <div className="landing-quantum-orbit"><Atom size={54} /></div>
                <div>
                  <span className="landing-demo-kicker">Quantum Playground</span>
                  <h3>Learn difficult ideas by interacting with them.</h3>
                  <p>Build a circuit, explore state probabilities and see how quantum gates change a system—without beginning with a wall of mathematics.</p>
                  <button onClick={openQuantora}>Explore Quantum Playground <ArrowRight size={14} /></button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="landing-capabilities" id="how-it-helps">
          <div className="landing-section-heading is-left">
            <span>Designed around the user</span>
            <h2>Powerful underneath. Calm on the surface.</h2>
          </div>
          <div className="landing-capability-grid">
            {capabilityCards.map(({ icon: Icon, label, title, text }) => (
              <article key={title}>
                <div className="landing-capability-icon"><Icon size={20} /></div>
                <span>{label}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-final-cta">
          <div>
            <span><Zap size={14} /> Start with curiosity</span>
            <h2>You bring the idea. Quantora helps with the next step.</h2>
          </div>
          <button onClick={openQuantora}>Start building <ArrowRight size={17} /></button>
        </section>
      </main>
    </div>
  );
}
