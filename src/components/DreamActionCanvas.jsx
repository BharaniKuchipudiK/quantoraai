import React, { useState, useMemo } from 'react';
import {
  Workflow, Sparkles, Play, ArrowRight, Trash2, ExternalLink, MessageSquare,
  CheckCircle2, GripVertical, Plus
} from 'lucide-react';
import { normalizeJourneyStage, normalizeJourneyNode, STAGE_ORDER } from '../lib/build-journey';

const COLUMNS = [
  {
    id: 'captured',
    title: 'Captured',
    icon: Sparkles,
    color: '#f97316',
    desc: 'Ideas saved from Studio or typed here',
  },
  {
    id: 'in_progress',
    title: 'In progress',
    icon: Play,
    color: '#0284c7',
    desc: 'Preview opened or actively building',
  },
  {
    id: 'done',
    title: 'Done',
    icon: CheckCircle2,
    color: '#10b981',
    desc: 'Published or outcome finished',
  },
];

function domainLabel(domain) {
  const labels = {
    travel: 'Travel',
    finance: 'Finance',
    research: 'Research',
    education: 'Education',
  };
  return labels[domain] || domain;
}

export default function DreamActionCanvas({
  dreamNodes = [],
  setDreamNodes,
  isLight,
  onContinueInStudio,
}) {
  const textColor = isLight ? '#0f172a' : '#ffffff';
  const subtextColor = isLight ? '#475569' : '#94a3b8';
  const itemBg = isLight ? '#ffffff' : 'rgba(255,255,255,0.03)';
  const borderSubtle = isLight ? '#e2e8f0' : 'rgba(255,255,255,0.08)';

  const [draggingId, setDraggingId] = useState(null);
  const [newTitle, setNewTitle] = useState('');

  const nodes = useMemo(
    () => dreamNodes.map(normalizeJourneyNode).filter(Boolean),
    [dreamNodes],
  );

  const updateNodeStage = (nodeId, nextStage) => {
    if (!setDreamNodes || !STAGE_ORDER.includes(nextStage)) return;
    setDreamNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? { ...n, stage: nextStage, updatedAt: new Date().toISOString() }
          : n,
      ),
    );
  };

  const deleteNode = (nodeId) => {
    if (!setDreamNodes) return;
    setDreamNodes((prev) => prev.filter((n) => n.id !== nodeId));
  };

  const addCaptured = () => {
    const title = newTitle.trim();
    if (!title || !setDreamNodes) return;
    const now = new Date().toISOString();
    setDreamNodes((prev) => [
      {
        id: `journey-${Date.now()}`,
        title,
        brief: title,
        studioPrompt: title,
        stage: 'captured',
        createdAt: now,
        updatedAt: now,
      },
      ...prev,
    ]);
    setNewTitle('');
  };

  const handleDrop = (columnId, e) => {
    e.preventDefault();
    const nodeId = e.dataTransfer.getData('text/journey-node-id');
    if (nodeId) updateNodeStage(nodeId, columnId);
    setDraggingId(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%', minHeight: '80vh' }}>
      <div
        className="glass-card"
        style={{
          padding: '24px',
          background: isLight
            ? 'linear-gradient(135deg, #fff7ed 0%, #f0f9ff 100%)'
            : 'linear-gradient(135deg, rgba(249, 115, 22, 0.12) 0%, rgba(2, 132, 199, 0.1) 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Workflow size={22} color="#0284c7" />
              <h2 style={{ fontSize: '1.4rem', margin: 0 }} className="gradient-text">
                Build Journey
              </h2>
            </div>
            <p style={{ fontSize: '0.88rem', color: subtextColor, margin: '0 0 8px 0', maxWidth: '640px' }}>
              Track outcomes from idea to finished work — not a dev pipeline. Save from AI Studio, drag across lanes, continue building anytime.
            </p>
            <p style={{ fontSize: '0.78rem', color: subtextColor, margin: 0, opacity: 0.85 }}>
              <strong>So what?</strong> You see what you started, what is live, and what you shipped — without losing context between sessions.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCaptured()}
              placeholder="Quick capture an idea…"
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: `1px solid ${borderSubtle}`,
                background: isLight ? '#fff' : 'rgba(0,0,0,0.25)',
                color: textColor,
                fontSize: '0.85rem',
                minWidth: '220px',
              }}
            />
            <button
              type="button"
              onClick={addCaptured}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#0284c7',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '0.82rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '16px',
          flex: 1,
        }}
      >
        {COLUMNS.map((col) => {
          const colNodes = nodes.filter((n) => normalizeJourneyStage(n.stage) === col.id);
          const IconComp = col.icon;

          return (
            <div
              key={col.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(col.id, e)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                background: isLight ? '#f1f5f9' : 'rgba(0,0,0,0.2)',
                padding: '16px',
                borderRadius: '16px',
                border: draggingId ? `2px dashed ${col.color}55` : `1px solid ${borderSubtle}`,
                minHeight: '320px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <IconComp size={18} color={col.color} />
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '700', color: textColor }}>{col.title}</div>
                  <div style={{ fontSize: '0.7rem', color: subtextColor }}>{col.desc}</div>
                </div>
                <div
                  style={{
                    marginLeft: 'auto',
                    background: `${col.color}22`,
                    color: col.color,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                  }}
                >
                  {colNodes.length}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                {colNodes.map((node) => (
                  <div
                    key={node.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/journey-node-id', node.id);
                      setDraggingId(node.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    className="glass-card"
                    style={{
                      padding: '14px',
                      borderLeft: `3px solid ${col.color}`,
                      background: itemBg,
                      cursor: 'grab',
                      opacity: draggingId === node.id ? 0.55 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                      <GripVertical size={14} color={subtextColor} style={{ marginTop: '2px', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: '700', color: textColor, marginBottom: '4px' }}>
                          {node.title}
                        </div>
                        {node.brief && node.brief !== node.title && (
                          <div style={{ fontSize: '0.78rem', color: subtextColor, lineHeight: 1.45 }}>
                            {node.brief.length > 140 ? `${node.brief.slice(0, 140)}…` : node.brief}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      {node.domain && (
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: '700',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: `${col.color}18`,
                            color: col.color,
                          }}
                        >
                          {domainLabel(node.domain)}
                        </span>
                      )}
                      {node.publishUrl && (
                        <span style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: '700' }}>Published</span>
                      )}
                      {!node.publishUrl && node.previewOpenedAt && (
                        <span style={{ fontSize: '0.68rem', color: '#0284c7', fontWeight: '700' }}>Preview opened</span>
                      )}
                      {!node.publishUrl && !node.previewOpenedAt && node.previewUrl && (
                        <span style={{ fontSize: '0.68rem', color: '#0284c7', fontWeight: '700' }}>Has preview</span>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderTop: `1px solid ${borderSubtle}`,
                        paddingTop: '8px',
                        gap: '8px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => deleteNode(node.id)}
                          title="Remove"
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                        >
                          <Trash2 size={14} />
                        </button>
                        {node.publishUrl && (
                          <a
                            href={node.publishUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Open live site"
                            style={{ color: '#10b981', display: 'inline-flex', padding: '4px' }}
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {onContinueInStudio && node.studioPrompt && (
                          <button
                            type="button"
                            onClick={() => onContinueInStudio(node)}
                            style={{
                              background: isLight ? '#eff6ff' : 'rgba(2, 132, 199, 0.15)',
                              border: '1px solid rgba(2, 132, 199, 0.35)',
                              color: '#0284c7',
                              padding: '4px 10px',
                              borderRadius: '8px',
                              fontSize: '0.72rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <MessageSquare size={12} /> Continue
                          </button>
                        )}
                        {col.id !== 'done' && (
                          <button
                            type="button"
                            onClick={() => {
                              const idx = STAGE_ORDER.indexOf(col.id);
                              if (idx >= 0 && idx < STAGE_ORDER.length - 1) {
                                updateNodeStage(node.id, STAGE_ORDER[idx + 1]);
                              }
                            }}
                            style={{
                              background: `${col.color}15`,
                              border: `1px solid ${col.color}44`,
                              color: col.color,
                              padding: '4px 10px',
                              borderRadius: '8px',
                              fontSize: '0.72rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            Advance <ArrowRight size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {colNodes.length === 0 && (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '28px 16px',
                      color: subtextColor,
                      fontSize: '0.8rem',
                      border: `1px dashed ${borderSubtle}`,
                      borderRadius: '12px',
                      opacity: 0.65,
                    }}
                  >
                    {col.id === 'captured' && 'Save from AI Studio or add an idea above'}
                    {col.id === 'in_progress' && 'Drag here when preview is open or you are building'}
                    {col.id === 'done' && 'Drag here when published or the outcome is finished'}
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
