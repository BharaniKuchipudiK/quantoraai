import React from 'react';
import { Sparkles, Network, Atom, ArrowRight } from 'lucide-react';

const modules = [
  {
    id: 'studio',
    icon: Sparkles,
    iconColor: '#f97316',
    iconBg: 'linear-gradient(135deg, rgba(249, 115, 22, 0.18) 0%, rgba(139, 92, 246, 0.14) 100%)',
    title: 'AI Studio',
    body: 'Work with approved frontier models — research, analysis, and production-ready builds from a single conversation.',
    cta: 'Launch Studio',
    ctaColor: '#f97316',
  },
  {
    id: 'canvas',
    icon: Network,
    iconColor: '#38bdf8',
    iconBg: 'linear-gradient(135deg, rgba(56, 189, 248, 0.18) 0%, rgba(59, 130, 246, 0.14) 100%)',
    title: 'Dream-to-Action Canvas',
    body: 'Map architecture and decisions visually — from abstract intent to structured, executable nodes.',
    cta: 'Open Canvas',
    ctaColor: '#3b82f6',
  },
  {
    id: 'quantum',
    icon: Atom,
    iconColor: '#10b981',
    iconBg: 'linear-gradient(135deg, rgba(16, 185, 129, 0.18) 0%, rgba(5, 150, 105, 0.14) 100%)',
    title: 'Quantum Playground',
    body: 'Simulate Qiskit circuits and inspect quantum states interactively in the browser.',
    cta: 'Launch Simulator',
    ctaColor: '#10b981',
  },
];

export default function WelcomeHub({ user, onNavigate, isLight }) {
  const firstName = user?.name?.split(' ')[0] || 'Creator';

  return (
    <div className="welcome-hub">
      <header className="welcome-hub__intro">
        <p className="welcome-hub__eyebrow">Workspace</p>
        <h1 className="welcome-hub__title">
          Welcome back, <span className="welcome-hub__name">{firstName}</span>
        </h1>
        <p className="welcome-hub__subtitle">
          Select a module to build, analyze, or explore.
        </p>
      </header>

      <div className="welcome-hub__grid">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <button
              key={mod.id}
              type="button"
              className={`welcome-hub__card${isLight ? ' is-light' : ''}`}
              onClick={() => onNavigate(mod.id)}
            >
              <div
                className="welcome-hub__card-icon"
                style={{ background: mod.iconBg, color: mod.iconColor }}
              >
                <Icon size={28} />
              </div>
              <div className="welcome-hub__card-body">
                <h2>{mod.title}</h2>
                <p>{mod.body}</p>
              </div>
              <span className="welcome-hub__card-cta" style={{ color: mod.ctaColor }}>
                {mod.cta} <ArrowRight size={16} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
