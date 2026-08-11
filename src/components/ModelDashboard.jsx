import React, { useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Cpu, Sparkles } from 'lucide-react';

const FILTERS = [
  { id: 'ready', label: 'Ready' },
  { id: 'free', label: 'Free' },
  { id: 'new', label: 'New' },
  { id: 'offline', label: 'Offline' },
];

function statusTheme(status) {
  if (status === 'available') return { label: 'Available', color: '#059669', bg: 'rgba(16, 185, 129, 0.12)', icon: CheckCircle2 };
  if (status === 'testing') return { label: 'Testing', color: '#7c3aed', bg: 'rgba(139, 92, 246, 0.12)', icon: Activity };
  if (status === 'discovered') return { label: 'Discovered', color: '#0284c7', bg: 'rgba(14, 165, 233, 0.12)', icon: Sparkles };
  return { label: status === 'retired' ? 'Retired' : 'Offline', color: '#dc2626', bg: 'rgba(239, 68, 68, 0.1)', icon: AlertTriangle };
}

export default function ModelDashboard({ data, availableModels, selectedModel, onSelectModel, autoSelectEnabled, onToggleAutoSelect, isLight }) {
  const [filter, setFilter] = useState('ready');
  const [showAll, setShowAll] = useState(false);
  const textColor = isLight ? '#0f172a' : '#f8fafc';
  const subtextColor = isLight ? '#64748b' : '#94a3b8';
  const borderColor = isLight ? '#dbe4ee' : 'rgba(255,255,255,0.1)';

  const fallback = useMemo(() => (availableModels || []).map((model) => ({
    ...model,
    status: model.available === false ? 'offline' : 'available',
    pricingKind: model.pricingKind || 'unknown',
    isNew: false,
    isUpdated: false,
    selectable: model.available !== false,
  })), [availableModels]);

  const models = data?.models?.length ? data.models : fallback;
  const visibleModels = models
    .filter((model) => {
      if (filter === 'ready') return model.status === 'available';
      if (filter === 'free') return model.pricingKind === 'free' || model.pricingKind === 'free-tier';
      if (filter === 'new') return model.isNew || model.isUpdated;
      if (filter === 'offline') return ['offline', 'retired'].includes(model.status);
      return true;
    })
    .sort((a, b) => {
      const rank = (model) => {
        if (model.id === selectedModel?.id) return 0;
        if (model.status === 'available' && (model.pricingKind === 'free' || model.pricingKind === 'free-tier')) return 1;
        if (model.status === 'available') return 2;
        if (model.isNew || model.isUpdated) return 3;
        if (model.status === 'discovered') return 4;
        return 5;
      };
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });
  const displayedModels = showAll ? visibleModels : visibleModels.slice(0, 6);

  const summary = data?.summary || {
    available: models.filter((model) => model.status === 'available').length,
    free: models.filter((model) => model.pricingKind === 'free' || model.pricingKind === 'free-tier').length,
    new: 0,
    offline: models.filter((model) => model.status === 'offline').length,
  };

  return (
    <div style={{ border: `1px solid ${borderColor}`, borderRadius: '12px', background: isLight ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.035)', overflow: 'hidden' }}>
      <div style={{ padding: '10px', borderBottom: `1px solid ${borderColor}` }}>
        <button
          type="button"
          onClick={() => onToggleAutoSelect?.(!autoSelectEnabled)}
          aria-pressed={autoSelectEnabled}
          style={{ width: '100%', marginBottom: '9px', padding: '9px 10px', borderRadius: '10px', border: autoSelectEnabled ? '1px solid rgba(249,115,22,0.45)' : `1px solid ${borderColor}`, background: autoSelectEnabled ? (isLight ? '#fff7ed' : 'rgba(249,115,22,0.12)') : 'transparent', color: textColor, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '9px', textAlign: 'left' }}
        >
          <Sparkles size={15} color="#f97316" />
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: '800' }}>Best Free Model — Auto Select</span>
            <span style={{ display: 'block', marginTop: '2px', color: subtextColor, fontSize: '0.58rem' }}>Quantora chooses a ready free model for each request.</span>
          </span>
          <span style={{ color: autoSelectEnabled ? '#059669' : subtextColor, fontSize: '0.6rem', fontWeight: '800' }}>{autoSelectEnabled ? 'ON' : 'OFF'}</span>
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
          {[
            { id: 'ready', label: 'Ready', value: summary.available || 0, color: '#059669' },
            { id: 'free', label: 'Free', value: summary.free || 0, color: '#0284c7' },
            { id: 'new', label: 'New', value: summary.new || 0, color: '#7c3aed' },
          ].map((item) => (
            <button type="button" key={item.label} onClick={() => { setFilter(item.id); setShowAll(false); }} aria-label={`Show ${item.value} ${item.label.toLowerCase()} models`} style={{ padding: '7px 4px', borderRadius: '9px', textAlign: 'center', border: filter === item.id ? `1px solid ${item.color}` : '1px solid transparent', cursor: 'pointer', background: isLight ? '#f8fafc' : 'rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '0.9rem', lineHeight: 1, fontWeight: '800', color: item.color }}>{item.value}</div>
              <div style={{ marginTop: '4px', fontSize: '0.58rem', color: subtextColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
          {FILTERS.map((item) => (
            <button key={item.id} onClick={() => { setFilter(item.id); setShowAll(false); }} style={{ flex: 1, border: 'none', borderRadius: '7px', padding: '7px 3px', fontSize: '0.68rem', fontWeight: '700', cursor: 'pointer', color: filter === item.id ? '#ffffff' : subtextColor, background: filter === item.id ? '#f97316' : 'transparent' }}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxHeight: 'min(440px, calc(100vh - 320px))', overflowY: 'auto', padding: '8px' }}>
        {visibleModels.length === 0 ? (
          <div style={{ padding: '18px 8px', color: subtextColor, fontSize: '0.72rem', textAlign: 'center' }}>No models in this category.</div>
        ) : displayedModels.map((model) => {
          const theme = statusTheme(model.status);
          const StatusIcon = theme.icon;
          const selectable = model.selectable !== false && model.status === 'available';
          const isSelected = selectedModel?.id === model.id;
          return (
            <button
              key={`${model.category || 'model'}:${model.id}`}
              onClick={() => selectable && onSelectModel?.(model)}
              title={selectable ? `Use ${model.name}` : model.status === 'discovered' ? 'Discovered and awaiting Quantora qualification' : `${model.name} is not currently selectable`}
              style={{ width: '100%', border: isSelected ? '1px solid rgba(249,115,22,0.45)' : '1px solid transparent', background: isSelected ? (isLight ? '#fff7ed' : 'rgba(249,115,22,0.12)') : 'transparent', borderRadius: '9px', padding: '8px', display: 'flex', gap: '8px', alignItems: 'flex-start', textAlign: 'left', cursor: selectable ? 'pointer' : 'default', opacity: ['offline', 'retired'].includes(model.status) ? 0.68 : 1 }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme.bg }}>
                <Cpu size={13} color={theme.color} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <span style={{ minWidth: 0, flex: 1, color: textColor, fontSize: '0.72rem', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{model.name}</span>
                  {(model.isNew || model.isUpdated) && <span style={{ color: '#7c3aed', fontSize: '0.52rem', fontWeight: '800' }}>{model.isUpdated ? 'UPDATED' : 'NEW'}</span>}
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '4px', alignItems: 'center', color: subtextColor, fontSize: '0.6rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: theme.color }}><StatusIcon size={10} /> {theme.label}</span>
                  <span>•</span>
                  <span>{model.pricingKind === 'free-tier' ? 'Free tier' : model.pricingKind || 'Unknown cost'}</span>
                  {model.contextWindow && <><span>•</span><span>{model.contextWindow}</span></>}
                  {model.quality?.score != null && <><span>•</span><span title={`Based on ${model.quality.sampleSize} anonymous completed requests`}>{model.quality.score}% quality</span></>}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {visibleModels.length > 6 && (
        <button
          onClick={() => setShowAll((current) => !current)}
          style={{ width: '100%', border: 'none', borderTop: `1px solid ${borderColor}`, background: 'transparent', color: '#0284c7', padding: '9px', fontSize: '0.68rem', fontWeight: '700', cursor: 'pointer' }}
        >
          {showAll ? 'Show recommended only' : `View ${visibleModels.length - 6} more`}
        </button>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 10px', borderTop: `1px solid ${borderColor}`, color: subtextColor, fontSize: '0.58rem' }}>
        <Clock3 size={10} />
        {data?.source === 'live' ? 'Live provider catalogue' : 'Resilient fallback'}
        {data?.fetchedAt && ` · ${new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
      </div>
    </div>
  );
}
