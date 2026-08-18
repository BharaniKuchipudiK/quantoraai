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
  { id: 'pcl', number: '01', eyebrow: 'Context', title: 'PCL', subtitle: 'Persistent Cognitive Layer' },
  { id: 'agents', number: '02', eyebrow: 'Intelligence', title: 'AI Agents', subtitle: 'Reason. Research. Act.' },
  { id: 'office', number: '03', eyebrow: 'Creation', title: 'Microsoft Office', subtitle: 'From thought to usable work' },
  { id: 'quantum', number: '04', eyebrow: 'Frontier', title: 'Quantum', subtitle: 'Explore what comes next' },
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

function PlatformPanel({ panel, active, onActivate }) {
  const Visual = panel.id === 'pcl'
    ? PclVisual
    : panel.id === 'agents'
      ? AgentVisual
      : panel.id === 'office'
        ? OfficeVisual
        : QuantumVisual;

  return (
    <article
      className={`q-platform-panel${active ? ' is-active' : ''}`}
      onMouseEnter={onActivate}
      onFocus={onActivate}
      tabIndex={0}
    >
      <div className="q-platform-panel__head">
        <span>{panel.number} / {panel.eyebrow}</span>
        <b>{active ? 'ACTIVE' : 'EXPLORE'}</b>
      </div>
      <div className="q-platform-panel__title">
        <h3>{panel.title}</h3>
        <p>{panel.subtitle}</p>
      </div>
      <Visual />
    </article>
  );
}

function CognitiveStage() {
  const [activePanel, setActivePanel] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActivePanel((value) => (value + 1) % PLATFORM_PANELS.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="q-cognitive-stage">
      <header className="q-cognitive-stage__header">
        <div><span className="q-live-dot" /> QUANTORA COGNITIVE PLATFORM</div>
        <span>PRODUCT VISION</span>
      </header>

      <div className="q-cognitive-stage__panels">
        {PLATFORM_PANELS.map((panel, index) => (
          <PlatformPanel
            key={panel.id}
            panel={panel}
            active={activePanel === index}
            onActivate={() => setActivePanel(index)}
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

function FutureCapabilityCard({ capability, active, onActivate }) {
  return (
    <article
      className={`q-future-card${active ? ' is-active' : ''}`}
      onMouseEnter={onActivate}
      onFocus={onActivate}
      tabIndex={0}
    >
      <div className="q-future-card__meta"><span>{capability.number}</span><b>{capability.status}</b></div>
      <h3>{capability.title}</h3>
      <strong>{capability.strapline}</strong>
      <p>{capability.description}</p>
      <FutureCapabilityVisual capability={capability} />
    </article>
  );
}

function PclSignalSection() {
  const signals = ['GOAL', 'CONTEXT', 'MEMORY', 'DECISIONS', 'ARTIFACTS', 'NEXT ACTION'];
  const [activeCapability, setActiveCapability] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveCapability((value) => (value + 1) % FUTURE_CAPABILITIES.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="q-pcl-story q-future-story">
      <div className="q-pcl-story__copy q-future-copy q-shell">
        <span>FROM IDEA TO DONE</span>
        <div className="q-future-copy__grid">
          <h2>Create what matters.<br /><em>Automate what repeats.</em></h2>
          <p>Tell Quantora what you need. It chooses the right intelligence, tools and workflow for the job.</p>
        </div>
      </div>

      <div className="q-pcl-wave q-pcl-wave--future" aria-label="Quantora context and capability signal">
        <div className="q-pcl-wave__line" />
        <div className="q-pcl-wave__track">
          {[...signals, ...signals].map((signal, index) => (
            <span key={`${signal}-${index}`}>{signal}</span>
          ))}
        </div>
        <div className="q-pcl-wave__core"><strong>PCL</strong><span>Shared context across every surface</span></div>

        <div className="q-shell q-future-cards">
          {FUTURE_CAPABILITIES.map((capability, index) => (
            <FutureCapabilityCard
              key={capability.id}
              capability={capability}
              active={activeCapability === index}
              onActivate={() => setActiveCapability(index)}
            />
          ))}
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
  // Keep onStartBuild in the public contract; the investor-facing landing page
  // intentionally enters Studio through one confident CTA instead of leading
  // with a large prompt box that visually reduces Quantora to a chatbot.
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

      <section className="q-outcomes">
        <div className="q-shell">
          <span className="q-outcomes__eyebrow">ONE INTENT · MANY OUTCOMES</span>
          <div className="q-outcomes__rail">
            <div><strong>Research</strong><span>Evidence</span></div>
            <div><strong>Present</strong><span>PowerPoint</span></div>
            <div><strong>Document</strong><span>Word</span></div>
            <div><strong>Analyse</strong><span>Excel</span></div>
            <div><strong>Build</strong><span>Software</span></div>
            <div><strong>Ship</strong><span>Live</span></div>
          </div>
        </div>
      </section>

      <section className="q-final">
        <div className="q-shell q-final__inner">
          <span>THE NEXT MOVE</span>
          <h2>Start with what you want done.</h2>
          <button type="button" onClick={openQuantora}>
            {user ? 'Open Quantora' : 'Try Quantora now'} <ArrowRight size={18} />
          </button>
        </div>
      </section>
    </main>
  );
}