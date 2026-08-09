import React, { useState } from 'react';
import { Workflow, Sparkles, Code, Play, ArrowRight, Layers, Cpu, Terminal, Smartphone, Trash2 } from 'lucide-react';

export default function DreamActionCanvas({ dreamNodes = [], setDreamNodes, isLight }) {
  const textColor = isLight ? '#0f172a' : '#ffffff';
  const subtextColor = isLight ? '#475569' : '#94a3b8';
  const itemBg = isLight ? '#f8fafc' : 'rgba(255,255,255,0.03)';
  const borderSubtle = isLight ? '#e2e8f0' : 'rgba(255,255,255,0.08)';

  const columns = [
    { id: 'dream', title: '1. Dream', icon: Sparkles, color: '#f97316', desc: 'Raw Sparks & Ideas' },
    { id: 'idea', title: '2. Idea', icon: Layers, color: '#8b5cf6', desc: 'Architecture Spec' },
    { id: 'thought', title: '3. Thought', icon: Cpu, color: '#06b6d4', desc: 'Component Logic' },
    { id: 'action', title: '4. Action', icon: Play, color: '#10b981', desc: 'Live Prototype' }
  ];

  const moveNode = (nodeId, currentStage) => {
    if (!setDreamNodes) return;
    const stageOrder = ['dream', 'idea', 'thought', 'action'];
    const currentIndex = stageOrder.indexOf(currentStage);
    if (currentIndex < stageOrder.length - 1) {
      const nextStage = stageOrder[currentIndex + 1];
      setDreamNodes(dreamNodes.map(n => n.id === nodeId ? { ...n, stage: nextStage } : n));
    }
  };

  const deleteNode = (nodeId) => {
    if (!setDreamNodes) return;
    setDreamNodes(dreamNodes.filter(n => n.id !== nodeId));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%', minHeight: '80vh' }}>
      {/* Header Banner */}
      <div className="glass-card" style={{ padding: '24px', background: isLight ? 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)' : 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(6, 182, 212, 0.1) 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Workflow size={22} color="#0284c7" />
              <h2 style={{ fontSize: '1.4rem', margin: 0 }} className="gradient-text">
                Dream-to-Action Visual Pipeline
              </h2>
            </div>
            <p style={{ fontSize: '0.88rem', color: subtextColor, margin: 0 }}>
              Push ideas from AI Studio and execute them through the 4-stage engine.
            </p>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', flex: 1 }}>
        {columns.map(col => {
          const colNodes = dreamNodes.filter(n => n.stage === col.id);
          const IconComp = col.icon;
          
          return (
            <div key={col.id} style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: isLight ? '#f1f5f9' : 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '16px', border: `1px solid ${borderSubtle}` }}>
              {/* Column Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <IconComp size={18} color={col.color} />
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '700', color: textColor }}>{col.title}</div>
                  <div style={{ fontSize: '0.7rem', color: subtextColor }}>{col.desc}</div>
                </div>
                <div style={{ marginLeft: 'auto', background: `${col.color}22`, color: col.color, padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '700' }}>
                  {colNodes.length}
                </div>
              </div>

              {/* Cards Container */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                {colNodes.map(node => (
                  <div key={node.id} className="glass-card" style={{ padding: '14px', borderLeft: `3px solid ${col.color}`, position: 'relative', background: itemBg }}>
                    <div style={{ fontSize: '0.8rem', color: textColor, marginBottom: '12px', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto' }}>
                      {node.sourceText.length > 200 ? node.sourceText.substring(0, 200) + '...' : node.sourceText}
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${borderSubtle}`, paddingTop: '8px' }}>
                      <button onClick={() => deleteNode(node.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}>
                        <Trash2 size={14} />
                      </button>
                      
                      {col.id !== 'action' && (
                        <button onClick={() => moveNode(node.id, col.id)} style={{ background: `${col.color}15`, border: `1px solid ${col.color}44`, color: col.color, padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Execute <ArrowRight size={12} />
                        </button>
                      )}
                      {col.id === 'action' && (
                        <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: '700' }}>Production Ready</span>
                      )}
                    </div>
                  </div>
                ))}
                
                {colNodes.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px', color: subtextColor, fontSize: '0.8rem', border: `1px dashed ${borderSubtle}`, borderRadius: '12px', opacity: 0.5 }}>
                    No items here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
