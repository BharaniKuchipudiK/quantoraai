import React, { useState } from 'react';
import { Workflow, Sparkles, Code, Play, CheckCircle, ArrowRight, Layers, Cpu, Terminal, Smartphone } from 'lucide-react';

export default function DreamActionCanvas({ activeCanvasNode, setActiveCanvasNode, isLight }) {
  const [selectedStage, setSelectedStage] = useState('action');

  const textColor = isLight ? '#0f172a' : '#ffffff';
  const subtextColor = isLight ? '#475569' : '#94a3b8';
  const itemBg = isLight ? '#f8fafc' : 'rgba(255,255,255,0.03)';
  const borderSubtle = isLight ? '#e2e8f0' : 'rgba(255,255,255,0.08)';

  const canvasStages = [
    {
      id: 'dream',
      stage: 'Stage 1: Dream',
      subtitle: 'Raw Human Prompt',
      icon: Sparkles,
      color: '#f97316',
      description: 'Capture ambient thoughts, natural language prompts, and raw vision specs.',
      nodeOutput: {
        rawPrompt: "I want an interactive iOS style calculator and beat maker for Gen Z.",
        targetDemographic: "Gen Z / Gen Alpha Creators",
        subscriptionCost: "$0 / mo (Open Models)"
      }
    },
    {
      id: 'idea',
      stage: 'Stage 2: Idea',
      subtitle: 'Open Model Router',
      icon: Layers,
      color: '#8b5cf6',
      description: 'Synthesize architecture blueprints using Qwen 2.5 Coder, Gemma 2, and DeepSeek V3.',
      nodeOutput: {
        modelSelected: "Qwen 2.5 Coder 32B",
        uiFramework: "React 18 + Vanilla CSS Glassmorphism",
        quantumEngine: "Qiskit / Cirq JS Simulator"
      }
    },
    {
      id: 'thought',
      stage: 'Stage 3: Thought',
      subtitle: 'Logical Structure',
      icon: Cpu,
      color: '#06b6d4',
      description: 'Formulate state vector math, execution graphs, and component trees.',
      nodeOutput: {
        stateManagement: "Stateless PKCE OAuth + Browser Local Storage",
        components: ["IosCalculator", "LiveBeatMaker", "PrismEngine"]
      }
    },
    {
      id: 'action',
      stage: 'Stage 4: Action',
      subtitle: 'Live Playable App',
      icon: Play,
      color: '#10b981',
      description: 'Transform specifications into live, playable web components and executable code sandboxes.',
      nodeOutput: {
        status: "Production Ready",
        sandboxUrl: "quantoraai.app/sandbox/beat-maker"
      }
    }
  ];

  const currentStageData = canvasStages.find(s => s.id === selectedStage);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Banner */}
      <div className="glass-card" style={{ padding: '24px', background: isLight ? 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)' : 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(6, 182, 212, 0.1) 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Workflow size={22} color="#0284c7" />
              <h2 style={{ fontSize: '1.4rem', margin: 0 }} className="gradient-text">
                Dream-to-Action Visual Canvas
              </h2>
            </div>
            <p style={{ fontSize: '0.88rem', color: subtextColor, margin: 0 }}>
              The USP of Quantora: Transform raw creative sparks into executable code, visual wireframes, and live prototypes.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', background: 'rgba(249, 115, 22, 0.15)', border: '1px solid rgba(249, 115, 22, 0.4)', color: '#c2410c', padding: '6px 12px', borderRadius: '8px', fontWeight: '600' }}>
              ⚡ 4-Stage Visual Execution Pipeline
            </span>
          </div>
        </div>
      </div>

      {/* 4-Stage Horizontal Pipeline Connector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {canvasStages.map((s, idx) => {
          const IconComp = s.icon;
          const isSelected = selectedStage === s.id;

          return (
            <div
              key={s.id}
              onClick={() => setSelectedStage(s.id)}
              className="glass-card"
              style={{
                padding: '18px',
                cursor: 'pointer',
                border: isSelected ? `2px solid ${s.color}` : `1px solid ${borderSubtle}`,
                background: isSelected ? (isLight ? '#ffffff' : 'rgba(255, 255, 255, 0.06)') : itemBg,
                boxShadow: isSelected ? `0 0 20px ${s.color}33` : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${s.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconComp size={18} color={s.color} />
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: textColor }}>{s.stage}</span>
              </div>

              <div style={{ fontSize: '0.78rem', color: subtextColor }}>{s.subtitle}</div>
            </div>
          );
        })}
      </div>

      {/* Node Detail & Interactive Playground Box */}
      {currentStageData && (
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', borderBottom: `1px solid ${borderSubtle}`, paddingBottom: '14px' }}>
            <currentStageData.icon size={24} color={currentStageData.color} />
            <div>
              <h3 style={{ fontSize: '1.2rem', margin: 0, color: textColor }}>{currentStageData.stage} — {currentStageData.subtitle}</h3>
              <p style={{ fontSize: '0.82rem', color: subtextColor, margin: '2px 0 0 0' }}>{currentStageData.description}</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Spec JSON Output */}
            <div style={{ background: isLight ? '#0f172a' : '#070913', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: '600', marginBottom: '10px', fontFamily: 'monospace' }}>
                STAGE OUTPUT DATA
              </div>
              <pre style={{ margin: 0, fontSize: '0.82rem', color: '#38bdf8', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(currentStageData.nodeOutput, null, 2)}
              </pre>
            </div>

            {/* Stage Action Guide */}
            <div style={{ background: itemBg, padding: '20px', borderRadius: '12px', border: `1px solid ${borderSubtle}`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem', color: textColor }}>
                  Pipeline Node Execution Status
                </h4>
                <p style={{ fontSize: '0.84rem', color: subtextColor, lineHeight: 1.6, margin: 0 }}>
                  Quantora's open engine automatically resolves state transitions across iOS, Android, and Web.
                </p>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                <button style={{ flex: 1, padding: '10px', borderRadius: '10px', background: currentStageData.color, border: 'none', color: '#ffffff', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer' }}>
                  Execute Stage Node
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
