import React from 'react';
import { Sparkles, Network, Atom, ArrowRight } from 'lucide-react';
import { exploratorySurfacesEnabled } from '../lib/platform-surfaces.js';

/*
 * The signed-in landing. Styled to match the marketing homepage: flat white or
 * near-black surfaces, hairline borders, and no per-module colour coding — the
 * modules are distinguished by name and description, not by a palette.
 */
const modules = [
  {
    id: 'studio',
    icon: Sparkles,
    title: 'AI Studio',
    body: 'Work with approved frontier models — research, analysis, and production-ready builds from a single conversation.',
    cta: 'Launch Studio',
  },
  // Parked with the landing's cards and the header's tabs (platform-surfaces):
  // the first browser gate to sign in and arrive here found the two parked
  // modules still offered on this page alone (2026-09-06).
  {
    id: 'canvas',
    icon: Network,
    title: 'Dream-to-Action Canvas',
    body: 'Map architecture and decisions visually — from abstract intent to structured, executable nodes.',
    cta: 'Open Canvas',
    parked: true,
  },
  {
    id: 'quantum',
    icon: Atom,
    title: 'Quantum Playground',
    body: 'Simulate Qiskit circuits and inspect quantum states interactively in the browser.',
    cta: 'Launch Simulator',
    parked: true,
  },
];

function offeredModules() {
  const showParked = exploratorySurfacesEnabled();
  return modules.filter((mod) => !mod.parked || showParked);
}

export default function WelcomeHub({ user, onNavigate }) {
  const firstName = user?.name?.split(' ')[0] || 'Creator';

  return (
    <div className="welcome-hub">
      <header className="welcome-hub__intro">
        <p className="welcome-hub__eyebrow">Workspace</p>
        <h1 className="welcome-hub__title">
          Welcome back, {firstName}
        </h1>
        <p className="welcome-hub__subtitle">
          Select a module to build, analyze, or explore.
        </p>
      </header>

      <div className="welcome-hub__grid">
        {offeredModules().map((mod) => {
          const Icon = mod.icon;
          return (
            <button
              key={mod.id}
              type="button"
              className="welcome-hub__card"
              data-quantora-hub-module={mod.id}
              onClick={() => onNavigate(mod.id)}
            >
              <div className="welcome-hub__card-icon">
                <Icon size={26} />
              </div>
              <div className="welcome-hub__card-body">
                <h2>{mod.title}</h2>
                <p>{mod.body}</p>
              </div>
              <span className="welcome-hub__card-cta">
                {mod.cta} <ArrowRight size={16} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
