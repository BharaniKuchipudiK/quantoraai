import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  Cpu,
  FileSpreadsheet,
  FileText,
  Moon,
  Presentation,
  ShieldCheck,
  Sparkles,
  Sun,
} from 'lucide-react';
import { QuantoraFullLogoSvg } from './QuantoraLogoSvg';
import './LandingPage.css';

const PLATFORM_PANELS = [
  {
    id: 'pcl',
    number: '01',
    eyebrow: 'Context',
    title: 'PCL',
    subtitle: 'Persistent Cognitive Layer',
    explanation: 'Keeps the objective, decisions, memory and artifacts connected across the work — so Quantora does not start from zero every turn.',
  },
  {
    id: 'agents',
    number: '02',
    eyebrow: 'Intelligence',
    title: 'AI Agents',
    subtitle: 'Reason. Research. Act.',
    explanation: 'Specialized intelligence can research, create, build and verify around the same goal instead of working as isolated chat responses.',
  },
  {
    id: 'office',
    number: '03',
    eyebrow: 'Creation',
    title: 'Microsoft Office',
    subtitle: 'From thought to usable work',
    explanation: 'Turn an objective into professional PowerPoint, Word and Excel artifacts that are structured, verified and ready to use.',
  },
  {
    id: 'quantum',
    number: '04',
    eyebrow: 'Frontier',
    title: 'Quantum',
    subtitle: 'Explore what comes next',
    explanation: 'A frontier workspace for experimenting with emerging computational ideas alongside the classical tools you already use.',
  },
];

const FUTURE_CAPABILITIES = [
  {
    id: 'cognitive',
    number: '01',
    status: 'EVOLVING NOW',
    title: 'Cognitive Intelligence',
    strapline: 'The right intelligence. Automatically.',
    description: 'Quantora reads the task, project context and intended outcome, then routes the right model, tools and workflow without making you manage the machinery.',
  },
  {
    id: 'ide',
    number: '02',
    status: 'COMING',
    title: 'Integrated IDE',
    strapline: 'Build without leaving the work.',
    description: 'Plan, code, test, preview and ship software inside one Quantora project workspace.',
  },
  {
    id: 'automation',
    number: '03',
    status: 'COMING',
    title: 'Workflow Automation',
    strapline: 'Automate what repeats.',
    description: 'Turn recurring research, analysis, reporting and follow-up work into reusable flows that keep moving.',
  },
  {
    id: 'agents',
    number: '04',
    status: 'COMING',
    title: 'AI Agents',
    strapline: 'Specialists. Shared context.',
    description: 'Research, create, build and verify through specialized agents working toward the same outcome.',
  },
];

const DONE_STORIES = [
  {
    id: 'website',
    tab: 'Website',
    label: 'WEBSITE / APP',
    prompt: 'Create a premium boutique website selling sarees and ready-made dresses. Add a product catalogue, cart and checkout experience, then make it ready to publish.',
    outcome: 'Boutique storefront',
    status: 'PUBLISHED · LIVE',
    proof: 'Catalogue · cart · checkout · responsive',
  },
  {
    id: 'presentation',
    tab: 'Presentation',
    label: 'POWERPOINT',
    prompt: 'Prepare a consulting-grade cloud migration strategy for executives. Cover current-state challenges, target architecture, roadmap, risks and business value.',
    outcome: 'Cloud migration strategy',
    status: 'VERIFIED · READY',
    proof: 'Executive narrative · roadmap · architecture',
  },
  {
    id: 'document',
    tab: 'Document',
    label: 'BUSINESS DOCUMENT',
    prompt: 'Create an executive brief on AI adoption opportunities in insurance with use cases, risks, recommendations and a clear decision summary.',
    outcome: 'Executive decision brief',
    status: 'READY TO SHARE',
    proof: 'Structured · polished · decision-ready',
  },
];

function enterQuantora({ user, onLaunchStudio, onOpenAuth }) {
  if (user) onLaunchStudio?.();
  else onOpenAuth?.();
}

function PclVisual() {
  return (
    <div className="q-panel-visual q-pcl-visual" aria-label="Persistent Cognitive Layer context graph">
      <div className="q-pcl-core">
        <span>PCL</span>
        <strong>Objective</strong>
      </div>
      <div className="q-pcl-node q-pcl-node--goal"><span>Goal</span><b>Launch Quantora</b></div>
      <div className="q-pcl-node q-pcl-node--decisions"><span>Decisions</span><b>Outcome first</b></div>
      <div className="q-pcl-node q-pcl-node--memory"><span>Memory</span><b>Project context</b></div>
      <div className="q-pcl-node q-pcl-node--next"><span>Next action</span><b>Move work forward</b></div>
      <div className="q-pcl-link q-pcl-link--one" />
      <div className="q-pcl-link q-pcl-link--two" />
      <div className="q-pcl-link q-pcl-link--three" />
      <div className="q-pcl-link q-pcl-link--four" />
    </div>
  );
}

function AgentVisual() {
  return (
    <div className="q-panel-visual q-agent-visual" aria-label="AI agent orchestration">
      <div className="q-agent-command">
        <Sparkles size={14} />
        <span>Turn this objective into an investor-ready launch.</span>
      </div>
      <div className="q-agent-stack">
        <div className="q-agent-row q-agent-row--active">
          <Bot size={15} />
          <div><strong>Research agent</strong><span>Scanning evidence</span></div>
          <b>RUNNING</b>
        </div>
        <div className="q-agent-row">
          <Bot size={15} />
          <div><strong>Strategy agent</strong><span>Shaping the narrative</span></div>
          <b>READY</b>
        </div>
        <div className="q-agent-row">
          <Bot size={15} />
          <div><strong>Build agent</strong><span>Preparing the outcome</span></div>
          <b>QUEUED</b>
        </div>
      </div>
      <div className="q-agent-route"><span>ROUTING</span><strong>Right model · right tool · right moment</strong></div>
    </div>
  );
}

function OfficeVisual() {
  return (
    <div className="q-panel-visual q-office-visual" aria-label="Microsoft Office artifact generation">
      <div className="q-office-stack">
        <div className="q-office-card q-office-card--ppt">
          <div className="q-office-card__head"><Presentation size={15} /><span>PowerPoint</span><b>READY</b></div>
          <div className="q-office-slide">
            <small>QUANTORA</small>
            <strong>From intent to outcome</strong>
            <span>Executive narrative · verified</span>
            <div><i /><i /><i /></div>
          </div>
        </div>
        <div className="q-office-card q-office-card--doc">
          <div className="q-office-card__head"><FileText size={15} /><span>Word</span><b>VERIFIED</b></div>
          <div className="q-office-lines"><i /><i /><i /><i /></div>
        </div>
        <div className="q-office-card q-office-card--xls">
          <div className="q-office-card__head"><FileSpreadsheet size={15} /><span>Excel</span><b>LIVE</b></div>
          <div className="q-office-grid"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
        </div>
      </div>
    </div>
  );
}

function QuantumVisual() {
  return (
    <div className="q-panel-visual q-quantum-visual" aria-label="Quantora quantum exploration space">
      <div className="q-quantum-head"><Cpu size={16} /><span>QUANTUM SPACE</span><b>SIMULATE</b></div>
      <div className="q-circuit">
        <div className="q-circuit-wire q-circuit-wire--one"><span>q0</span><i className="q-gate">H</i><i className="q-control" /><i className="q-meter">M</i></div>
        <div className="q-circuit-wire q-circuit-wire--two"><span>q1</span><i className="q-gate">X</i><i className="q-target">⊕</i><i className="q-meter">M</i></div>
        <div className="q-circuit-wire q-circuit-wire--three"><span>q2</span><i className="q-gate">R</i><i className="q-gate">Z</i><i className="q-meter">M</i></div>
      </div>
      <div className="q-quantum-result">
        <span>STATE</span>
        <div><i style={{ '--bar': '72%' }} /><i style={{ '--bar': '42%' }} /><i style={{ '--bar': '88%' }} /><i style={{ '--bar': '56%' }} /></div>
        <strong>Explore beyond classical workflows.</strong>
      </div>
    </div>
  );
}

function PlatformPanel({ panel, active, flipped, onActivate, onFlip }) {
  const Visual = panel.id === 'pcl'
    ? PclVisual
    : panel.id === 'agents'
      ? AgentVisual
      : panel.id === 'office'
        ? OfficeVisual
        : QuantumVisual;

  return (
    <button
      type="button"
      className={`q-platform-panel${active ? ' is-active' : ''}${flipped ? ' is-flipped' : ''}`}
      onMouseEnter={onActivate}
      onFocus={onActivate}
      onClick={onFlip}
      aria-pressed={flipped}
      aria-label={`${panel.title}. ${flipped ? 'Hide' : 'Show'} explanation`}
    >
      <span className="q-platform-panel__face q-platform-panel__face--front">
        <span className="q-platform-panel__head">
          <span>{panel.number} / {panel.eyebrow}</span>
          <b>{flipped ? 'BACK' : active ? 'ACTIVE' : 'EXPLORE'}</b>
        </span>
        <span className="q-platform-panel__title">
          <span className="q-platform-panel__h3">{panel.title}</span>
          <span className="q-platform-panel__subtitle">{panel.subtitle}</span>
        </span>
        <Visual />
      </span>

      <span className="q-platform-panel__face q-platform-panel__face--back">
        <span className="q-platform-panel__back-kicker">WHY IT MATTERS</span>
        <span className="q-platform-panel__back-title">{panel.title}</span>
        <span className="q-platform-panel__back-copy">{panel.explanation}</span>
        <span className="q-platform-panel__back-action">Click to return ↺</span>
      </span>
    </button>
  );
}

function CognitiveStage() {
  const [activePanel, setActivePanel] = useState(0);
  const [flippedPanel, setFlippedPanel] = useState(null);

  useEffect(() => {
    if (flippedPanel !== null) return undefined;
    const timer = window.setInterval(() => {
      setActivePanel((value) => (value + 1) % PLATFORM_PANELS.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [flippedPanel]);

  const togglePanel = (index) => {
    setActivePanel(index);
    setFlippedPanel((current) => (current === index ? null : index));
  };

  return (
    <div className="q-cognitive-stage">
      <header className="q-cognitive-stage__header">
        <div><span className="q-live-dot" /> QUANTORA COGNITIVE PLATFORM</div>
        <span>PRODUCT VISION · CLICK A PANEL</span>
      </header>

      <div className="q-cognitive-stage__panels">
        {PLATFORM_PANELS.map((panel, index) => (
          <PlatformPanel
            key={panel.id}
            panel={panel}
            active={activePanel === index}
            flipped={flippedPanel === index}
            onActivate={() => setActivePanel(index)}
            onFlip={() => togglePanel(index)}
          />
        ))}
        <div className="q-cognitive-signal" aria-hidden="true">
          <span className="q-cognitive-signal__pulse" />
        </div>
      </div>

      <footer className="q-cognitive-stage__footer">
        <div className="q-stage-status"><ShieldCheck size={15} /><span>Verify</span><strong>Quality gate</strong></div>
        <div className="q-stage-arrow">→</div>
        <div className="q-stage-status"><Code2 size={15} /><span>Execute</span><strong>Real artifact</strong></div>
        <div className="q-stage-arrow">→</div>
        <div className="q-stage-status"><CheckCircle2 size={15} /><span>Deliver</span><strong>Usable outcome</strong></div>
      </footer>
    </div>
  );
}

function FutureCapabilityVisual({ capability }) {
  if (capability.id === 'cognitive') {
    return (
      <div className="q-future-visual q-future-visual--cognitive" aria-hidden="true">
        <div className="q-route-input"><span>Task</span><b>Context</b><strong>Outcome</strong></div>
        <div className="q-route-line"><i /></div>
        <div className="q-route-output"><Sparkles size={15} /><span>AUTO ROUTE</span><b>Right model · tools · workflow</b></div>
      </div>
    );
  }

  if (capability.id === 'ide') {
    return (
      <div className="q-future-visual q-future-visual--ide" aria-hidden="true">
        <div className="q-ide-tabs"><span className="is-active">App.tsx</span><span>Preview</span><span>Terminal</span></div>
        <div className="q-ide-body">
          <div className="q-ide-files"><i /><i /><i /><i /></div>
          <div className="q-ide-code"><i /><i /><i /><i /><i /></div>
        </div>
        <div className="q-ide-terminal">✓ build passed · ready to ship</div>
      </div>
    );
  }

  if (capability.id === 'automation') {
    return (
      <div className="q-future-visual q-future-visual--automation" aria-hidden="true">
        <div className="q-flow-node"><span>TRIGGER</span><b>Weekly update</b></div>
        <ArrowRight size={14} />
        <div className="q-flow-node is-active"><span>WORK</span><b>Research + analyse</b></div>
        <ArrowRight size={14} />
        <div className="q-flow-node"><span>DELIVER</span><b>Verified report</b></div>
      </div>
    );
  }

  return (
    <div className="q-future-visual q-future-visual--agents" aria-hidden="true">
      <div><Bot size={15} /><span>Research</span><b>RUNNING</b></div>
      <div><Bot size={15} /><span>Create</span><b>READY</b></div>
      <div><ShieldCheck size={15} /><span>Verify</span><b>NEXT</b></div>
    </div>
  );
}

function FutureCapabilityCard({ capability, flipped, onFlip }) {
  return (
    <button
      type="button"
      className={`q-future-card${flipped ? ' is-flipped' : ''}`}
      onClick={onFlip}
      aria-pressed={flipped}
    >
      <span className="q-future-card__front">
        <span className="q-future-card__meta"><span>{capability.number}</span><b>{capability.status}</b></span>
        <span className="q-future-card__title">{capability.title}</span>
        <span className="q-future-card__strapline">{capability.strapline}</span>
        <FutureCapabilityVisual capability={capability} />
      </span>
      <span className="q-future-card__back">
        <span>WHAT IT DOES</span>
        <strong>{capability.title}</strong>
        <p>{capability.description}</p>
        <small>Click to return ↺</small>
      </span>
    </button>
  );
}

function PclSignalSection() {
  const signals = ['GOAL', 'CONTEXT', 'MEMORY', 'DECISIONS', 'ARTIFACTS', 'NEXT ACTION'];
  const [flippedCapability, setFlippedCapability] = useState(null);

  return (
    <section className="q-pcl-story q-future-story">
      <div className="q-pcl-story__copy q-future-copy q-shell">
        <span>FROM IDEA TO DONE</span>
        <div className="q-future-copy__grid">
          <h2>Create what matters.<br /><em>Automate what repeats.</em></h2>
          <p>Tell Quantora what you need. It chooses the right intelligence, tools and workflow for the job.</p>
        </div>
      </div>

      <div className="q-pcl-wave q-pcl-wave--compact" aria-label="Shared project context moving through Quantora">
        <div className="q-pcl-wave__line" />
        <div className="q-pcl-wave__track">
          {signals.map((signal) => <span key={signal}>{signal}</span>)}
        </div>
        <div className="q-pcl-wave__core"><strong>PCL</strong><span>Shared context across every surface</span></div>
      </div>

      <div className="q-shell q-future-cards q-future-cards--below">
        {FUTURE_CAPABILITIES.map((capability, index) => (
          <FutureCapabilityCard
            key={capability.id}
            capability={capability}
            flipped={flippedCapability === index}
            onFlip={() => setFlippedCapability((current) => (current === index ? null : index))}
          />
        ))}
      </div>
    </section>
  );
}

function DoneWebsiteVisual() {
  return (
    <div className="q-done-visual q-done-visual--website" aria-label="Boutique website outcome preview">
      <div className="q-browser-bar"><i /><i /><i /><span>vastra-boutique.com</span><b>LIVE</b></div>
      <div className="q-store-nav"><strong>VASTRA</strong><span>New arrivals</span><span>Sarees</span><span>Ready-to-wear</span><b>Bag · 2</b></div>
      <div className="q-store-hero"><small>FESTIVE EDIT</small><strong>Tradition, made contemporary.</strong><span>Shop the collection →</span></div>
      <div className="q-store-products">
        <div><i className="q-product q-product--one" /><span>Silk Saree</span><b>$128</b></div>
        <div><i className="q-product q-product--two" /><span>Kurta Set</span><b>$92</b></div>
        <div><i className="q-product q-product--three" /><span>Drape Dress</span><b>$110</b></div>
      </div>
      <div className="q-store-proof"><span>✓ Cart</span><span>✓ Checkout</span><span>✓ Responsive</span><span>✓ Published</span></div>
    </div>
  );
}

function DonePresentationVisual() {
  return (
    <div className="q-done-visual q-done-visual--presentation" aria-label="Cloud migration presentation outcome preview">
      <div className="q-deck-top"><span>QUANTORA · CLOUD TRANSFORMATION</span><b>07 / 12</b></div>
      <h4>Migration succeeds when the roadmap connects technology to business value.</h4>
      <div className="q-deck-columns">
        <div><small>01</small><strong>Stabilize</strong><span>Inventory · risk · landing zone</span></div>
        <div><small>02</small><strong>Migrate</strong><span>Wave plan · factory · controls</span></div>
        <div><small>03</small><strong>Modernize</strong><span>Platform · data · operating model</span></div>
      </div>
      <div className="q-deck-roadmap"><span>0–90 days</span><i /><span>3–9 months</span><i /><span>9–18 months</span></div>
      <div className="q-deck-proof"><span>✓ Executive narrative</span><span>✓ Roadmap</span><span>✓ Architecture</span></div>
    </div>
  );
}

function DoneDocumentVisual() {
  return (
    <div className="q-done-visual q-done-visual--document" aria-label="Executive business document outcome preview">
      <div className="q-doc-brand">QUANTORA</div>
      <h4>AI adoption in insurance</h4>
      <p>Executive decision brief</p>
      <div className="q-doc-summary"><small>EXECUTIVE SUMMARY</small><strong>Prioritize high-volume, human-reviewed use cases first.</strong></div>
      <div className="q-doc-grid">
        <div><span>01</span><strong>Claims</strong><small>Assist triage and summarization</small></div>
        <div><span>02</span><strong>Underwriting</strong><small>Surface evidence and risk signals</small></div>
        <div><span>03</span><strong>Service</strong><small>Grounded customer responses</small></div>
      </div>
      <div className="q-doc-proof"><span>✓ Structured</span><span>✓ Decision-ready</span><span>✓ Ready to share</span></div>
    </div>
  );
}

function DoneVisual({ story }) {
  if (story.id === 'website') return <DoneWebsiteVisual />;
  if (story.id === 'presentation') return <DonePresentationVisual />;
  return <DoneDocumentVisual />;
}

function PromptToActionShowcase() {
  const [activeStory, setActiveStory] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveStory((value) => (value + 1) % DONE_STORIES.length);
    }, 7200);
    return () => window.clearInterval(timer);
  }, []);

  const story = DONE_STORIES[activeStory];

  return (
    <section className="q-done-showcase">
      <div className="q-shell">
        <div className="q-done-showcase__header">
          <div><span>PROMPT TO ACTION</span><h2>This is what <em>done</em> looks like.</h2></div>
          <div className="q-done-tabs" role="tablist" aria-label="Quantora outcome examples">
            {DONE_STORIES.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={activeStory === index ? 'is-active' : ''}
                onClick={() => setActiveStory(index)}
                role="tab"
                aria-selected={activeStory === index}
              >
                {item.tab}
              </button>
            ))}
          </div>
        </div>

        <div className="q-done-stage" key={story.id}>
          <div className="q-done-prompt">
            <span>QUANTORA AI STUDIO · PROMPT</span>
            <p>{story.prompt}</p>
            <div><Sparkles size={15} /><strong>Quantora takes it forward</strong></div>
          </div>

          <div className="q-done-arrow" aria-hidden="true"><ArrowRight size={24} /></div>

          <div className="q-done-output">
            <div className="q-done-output__meta"><span>{story.label}</span><b>{story.status}</b></div>
            <DoneVisual story={story} />
            <div className="q-done-output__caption"><strong>{story.outcome}</strong><span>{story.proof}</span></div>
          </div>
        </div>
      </div>
    </section>
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
  void onStartBuild;

  const openQuantora = () => enterQuantora({ user, onLaunchStudio, onOpenAuth });

  return (
    <main className={`q-landing${isLight ? ' q-landing--light' : ''}`}>
      <header className="q-nav">
        <button type="button" className="q-nav__brand" onClick={openQuantora} aria-label="Open Quantora">
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
          <button type="button" className="q-nav__cta" onClick={openQuantora}>
            {user ? 'Open Quantora' : 'Try Quantora now'} <ArrowRight size={16} />
          </button>
        </div>
      </header>

      <section className="q-hero">
        <div className="q-shell q-hero__copy">
          <span className="q-kicker">IDEAS DESERVE MORE THAN ANSWERS</span>
          <h1>From idea<br /><em>to done.</em></h1>
          <p>Create what matters. Automate what repeats.</p>
          <button type="button" className="q-hero__try" onClick={openQuantora}>
            {user ? 'Open Quantora' : 'Try Quantora now'} <ArrowRight size={17} />
          </button>
        </div>

        <div className="q-shell q-hero__stage">
          <CognitiveStage />
        </div>
      </section>

      <section className="q-punch">
        <div className="q-shell">
          <span>THE DIFFERENCE</span>
          <h2>No model picking. No prompt gymnastics.<br /><em>Just the right intelligence at the right moment.</em></h2>
        </div>
      </section>

      <PclSignalSection />
      <PromptToActionShowcase />

      <section className="q-final">
        <div className="q-shell q-final__inner">
          <span>FROM IDEA TO DONE</span>
          <h2>Start with what you want done.</h2>
          <button type="button" onClick={openQuantora}>
            {user ? 'Open Quantora' : 'Try Quantora now'} <ArrowRight size={18} />
          </button>
        </div>
      </section>
    </main>
  );
}
