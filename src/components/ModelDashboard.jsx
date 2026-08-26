import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Cpu, FlaskConical, Globe2, RefreshCw, Sparkles, ThumbsUp, ThumbsDown } from 'lucide-react';
import { rankPublicDashboardModels } from '../../shared/model-dashboard-ranking.js';

function statusTheme(status) {
  if (status === 'available') return { label: 'Active', color: '#059669', bg: 'rgba(16, 185, 129, 0.12)', icon: CheckCircle2 };
  if (status === 'testing') return { label: 'Testing', color: '#7c3aed', bg: 'rgba(139, 92, 246, 0.12)', icon: Activity };
  if (status === 'discovered') return { label: 'New', color: '#0284c7', bg: 'rgba(14, 165, 233, 0.12)', icon: Sparkles };
  if (status === 'catalog') return { label: 'Catalog', color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)', icon: Globe2 };
  return { label: status === 'retired' ? 'Retired' : 'Offline', color: '#dc2626', bg: 'rgba(239, 68, 68, 0.1)', icon: AlertTriangle };
}

function pricingLabel(model) {
  if (model.pricingKind === 'free-tier') return 'Free tier';
  if (model.pricingKind === 'free') return 'Free';
  if (model.pricingKind === 'paid' || model.paidOnly) return 'Paid only';
  return model.pricingKind || 'Unknown cost';
}

const ADMIN_TABS = [
  { id: 'active', label: 'Active' },
  { id: 'newlyAdded', label: 'Newly added' },
  { id: 'internetAvailable', label: 'Available on internet' },
];

export default function ModelDashboard({
  data,
  availableModels,
  selectedModel,
  onSelectModel,
  autoSelectEnabled,
  onToggleAutoSelect,
  isLight,
  isAdmin,
  onModelsRefresh,
}) {
  const [showAll, setShowAll] = useState(false);
  const [adminLists, setAdminLists] = useState({ active: [], newlyAdded: [], internetAvailable: [], summary: null });
  const [adminTab, setAdminTab] = useState('active');
  const [adminLoading, setAdminLoading] = useState(false);
  const [discoverPending, setDiscoverPending] = useState(false);
  const [discoverSummary, setDiscoverSummary] = useState(null);
  const [actionPending, setActionPending] = useState(null);
  const [actionError, setActionError] = useState(null);
  const textColor = isLight ? '#0f172a' : '#f8fafc';
  const subtextColor = isLight ? '#64748b' : '#94a3b8';
  const borderColor = isLight ? '#dbe4ee' : 'rgba(255,255,255,0.1)';

  const fetchAdminLists = useCallback(async () => {
    if (!isAdmin) return;
    setAdminLoading(true);
    try {
      const res = await fetch('/api/admin/models');
      if (res.ok) {
        const payload = await res.json();
        setAdminLists({
          active: payload.active || [],
          newlyAdded: payload.newlyAdded || [],
          internetAvailable: payload.internetAvailable || [],
          summary: payload.summary || null,
          catalogs: payload.catalogs || null,
        });
      }
    } catch (error) {
      console.error('Failed to fetch admin model lists:', error);
    } finally {
      setAdminLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) fetchAdminLists();
  }, [isAdmin, fetchAdminLists]);

  const handleApprovalAction = async (modelId, action, event) => {
    event.stopPropagation();
    event.preventDefault();
    setActionError(null);
    setActionPending(`${modelId}:${action}`);
    try {
      const res = await fetch('/api/admin/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId, action }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        await fetchAdminLists();
        onModelsRefresh?.();
      } else {
        setActionError(payload.error || `Action failed (${res.status})`);
      }
    } catch (error) {
      console.error('Model approval action failed:', error);
      setActionError('Network error — try again.');
    } finally {
      setActionPending(null);
    }
  };

  const handleSmokeTest = async (modelId, event) => {
    event.stopPropagation();
    event.preventDefault();
    setActionError(null);
    setActionPending(`${modelId}:smoke-test`);
    try {
      const res = await fetch('/api/admin/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId, action: 'smoke-test' }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        await fetchAdminLists();
      } else {
        setActionError(payload.error || `Smoke test failed (${res.status})`);
      }
    } catch (error) {
      console.error('Model smoke test failed:', error);
      setActionError('Smoke test network error — try again.');
    } finally {
      setActionPending(null);
    }
  };

  const handleRunDiscovery = async () => {
    setActionError(null);
    setDiscoverPending(true);
    setDiscoverSummary(null);
    try {
      const res = await fetch('/api/admin/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'discover' }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        setAdminLists({
          active: payload.active || [],
          newlyAdded: payload.newlyAdded || [],
          internetAvailable: payload.internetAvailable || [],
          summary: payload.summary || null,
          catalogs: payload.catalogs || null,
        });
        setDiscoverSummary(payload.discovery?.canaries || payload.discovery || null);
        onModelsRefresh?.();
      } else {
        setActionError(payload.error || `Discovery failed (${res.status})`);
      }
    } catch (error) {
      console.error('Model discovery failed:', error);
      setActionError('Discovery network error — try again.');
    } finally {
      setDiscoverPending(false);
    }
  };

  const fallback = useMemo(() => (availableModels || []).map((model) => ({
    ...model,
    status: model.available === false ? 'offline' : 'available',
    pricingKind: model.pricingKind || 'unknown',
    isNew: false,
    isUpdated: false,
    selectable: model.available !== false,
  })), [availableModels]);

  const publicModels = data?.models?.length ? data.models : fallback;

  const adminModels = adminLists[adminTab] || [];
  const models = isAdmin ? adminModels : publicModels;

  const visibleModels = isAdmin
    ? models
    : rankPublicDashboardModels(models, { selectedModelId: selectedModel?.id });

  const displayedModels = showAll ? visibleModels : visibleModels.slice(0, 15);

  return (
    <div style={{ border: `1px solid ${borderColor}`, borderRadius: '12px', background: isLight ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.035)', overflow: 'hidden' }}>
      <div style={{ padding: '16px', borderBottom: `1px solid ${borderColor}`, background: isLight ? '#f8fafc' : 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: textColor, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu size={16} color="#0284c7" /> AI Models
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: subtextColor }}>
              {isAdmin
                ? 'Active routes, newly discovered models, and live provider catalogues. Free models auto-promote only after canary pass.'
                : 'All available free and discovered models.'}
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              disabled={discoverPending || Boolean(actionPending)}
              onClick={handleRunDiscovery}
              style={{
                flexShrink: 0,
                padding: '6px 10px',
                fontSize: '0.65rem',
                fontWeight: 700,
                borderRadius: '8px',
                border: '1px solid rgba(2, 132, 199, 0.35)',
                background: isLight ? '#fff' : 'rgba(2, 132, 199, 0.12)',
                color: '#0284c7',
                cursor: discoverPending ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <RefreshCw size={12} />
              {discoverPending ? 'Discovering…' : 'Run discovery'}
            </button>
          )}
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
            {ADMIN_TABS.map((tab) => {
              const count = (adminLists[tab.id] || []).length;
              const selected = adminTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => { setAdminTab(tab.id); setShowAll(false); }}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '999px',
                    border: selected ? '1px solid rgba(2, 132, 199, 0.45)' : `1px solid ${borderColor}`,
                    background: selected ? (isLight ? '#e0f2fe' : 'rgba(2, 132, 199, 0.18)') : 'transparent',
                    color: selected ? '#0284c7' : subtextColor,
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {tab.label} ({count})
                </button>
              );
            })}
          </div>
        )}

        {discoverSummary && (
          <div style={{ marginTop: '10px', fontSize: '0.62rem', color: subtextColor }}>
            Last discovery canaries: {discoverSummary.attempted ?? 0} attempted · {discoverSummary.promoted ?? 0} promoted · {discoverSummary.failed ?? 0} failed
          </div>
        )}
      </div>

      <div style={{ maxHeight: 'min(500px, calc(100vh - 280px))', overflowY: 'auto', padding: '8px' }}>
        {adminLoading && visibleModels.length === 0 ? (
          <div style={{ padding: '18px 8px', color: subtextColor, fontSize: '0.72rem', textAlign: 'center' }}>Loading models…</div>
        ) : visibleModels.length === 0 ? (
          <div style={{ padding: '18px 8px', color: subtextColor, fontSize: '0.72rem', textAlign: 'center' }}>
            {isAdmin && adminTab === 'internetAvailable'
              ? 'Provider catalogues unavailable (check OPENROUTER_API_KEY / GEMINI_API_KEY).'
              : 'No models in this list.'}
          </div>
        ) : displayedModels.map((model) => {
          const theme = statusTheme(model.status);
          const StatusIcon = theme.icon;
          const selectable = model.selectable !== false && model.status === 'available';
          const isSelected = selectedModel?.id === model.id;
          const isDiscoveredTab = model.status === 'discovered' || (isAdmin && adminTab === 'newlyAdded' && !model.approved);
          const smokePassed = model.smokeTest?.passed === true;
          const smokeResults = model.smokeTest?.results || [];
          const smokePending = actionPending === `${model.id}:smoke-test`;
          const approvePending = actionPending === `${model.id}:approve`;
          return (
            <button
              key={`${model.list || model.category || 'model'}:${model.id}`}
              onClick={() => selectable && onSelectModel?.(model)}
              title={selectable ? `Use ${model.name}` : model.paidOnly ? 'Paid only — not enabled on free Studio' : isDiscoveredTab ? 'Awaiting canary or admin approval' : `${model.name} is not currently selectable`}
              style={{ width: '100%', border: isSelected ? '1px solid rgba(249,115,22,0.45)' : '1px solid transparent', background: isSelected ? (isLight ? '#fff7ed' : 'rgba(249,115,22,0.12)') : 'transparent', borderRadius: '9px', padding: '8px', display: 'flex', gap: '8px', alignItems: 'flex-start', textAlign: 'left', cursor: selectable ? 'pointer' : 'default', opacity: ['offline', 'retired'].includes(model.status) ? 0.68 : 1 }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme.bg }}>
                <Cpu size={13} color={theme.color} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <span style={{ minWidth: 0, flex: 1, color: textColor, fontSize: '0.72rem', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{model.name}</span>
                  {(model.isNew || model.isUpdated) && <span style={{ color: '#7c3aed', fontSize: '0.52rem', fontWeight: '800' }}>{model.isUpdated ? 'UPDATED' : 'NEW'}</span>}
                  {model.paidOnly && <span style={{ color: '#b45309', fontSize: '0.52rem', fontWeight: '800' }}>PAID</span>}
                  {isDiscoveredTab && <span style={{ color: '#0284c7', fontSize: '0.52rem', fontWeight: '800' }}>NEW</span>}
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '4px', alignItems: 'center', color: subtextColor, fontSize: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: theme.color }}><StatusIcon size={10} /> {theme.label}</span>
                  <span>•</span>
                  <span>{pricingLabel(model)}</span>
                  {model.source && <><span>•</span><span>{model.source}</span></>}
                  {model.contextWindow && <><span>•</span><span>{model.contextWindow}</span></>}
                  {model.quality?.score != null && <><span>•</span><span title={`Based on ${model.quality.sampleSize} anonymous completed requests`}>{model.quality.score}% quality</span></>}
                </div>
                {isDiscoveredTab && isAdmin && (
                  <>
                    {model.smokeTest && (
                      <div style={{ marginTop: '6px', fontSize: '0.58rem', color: smokePassed ? '#059669' : '#dc2626', fontWeight: '700' }}>
                        {smokePassed
                          ? `Canary/smoke passed (${smokeResults.filter((item) => item.passed).length}/${smokeResults.length || 1})`
                          : `Canary/smoke failed (${smokeResults.filter((item) => item.passed).length}/${smokeResults.length || 1})`}
                        {model.smokeTest.ranAt && ` · ${new Date(model.smokeTest.ranAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                      </div>
                    )}
                    {smokeResults.length > 0 && (
                      <div style={{ marginTop: '4px', display: 'grid', gap: '3px' }}>
                        {smokeResults.map((item) => (
                          <div key={item.id} style={{ fontSize: '0.56rem', color: item.passed ? '#059669' : '#dc2626' }}>
                            {item.passed ? '✓' : '✗'} {item.label}{item.latencyMs != null ? ` · ${item.latencyMs}ms` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      disabled={Boolean(actionPending) || discoverPending}
                      onClick={(event) => handleSmokeTest(model.id, event)}
                      style={{ padding: '4px 10px', fontSize: '0.65rem', borderRadius: '6px', border: '1px solid rgba(139, 92, 246, 0.4)', background: 'transparent', color: '#7c3aed', cursor: actionPending ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '700' }}>
                      <FlaskConical size={12} /> {smokePending ? 'Testing…' : 'Smoke Test'}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(actionPending) || discoverPending}
                      onClick={(event) => handleApprovalAction(model.id, 'approve', event)}
                      style={{ padding: '4px 10px', fontSize: '0.65rem', borderRadius: '6px', border: 'none', background: '#059669', color: '#fff', cursor: actionPending ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '700' }}>
                      <ThumbsUp size={12} /> {approvePending ? 'Approving…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(actionPending) || discoverPending}
                      onClick={(event) => handleApprovalAction(model.id, 'reject', event)}
                      style={{ padding: '4px 10px', fontSize: '0.65rem', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.4)', background: 'transparent', color: '#dc2626', cursor: actionPending ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '700' }}>
                      <ThumbsDown size={12} /> Reject
                    </button>
                    </div>
                  </>
                )}
              </div>
            </button>
          );
        })}
        {visibleModels.length > displayedModels.length && (
          <button type="button" onClick={() => setShowAll(true)} style={{ width: '100%', marginTop: '8px', padding: '8px', border: 'none', background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', borderRadius: '8px', color: '#0284c7', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer' }}>
            View {visibleModels.length - displayedModels.length} more
          </button>
        )}
      </div>

      {actionError && (
        <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '0.65rem', borderTop: `1px solid ${borderColor}`, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}>
          <AlertTriangle size={12} /> {actionError}
        </div>
      )}

      <div style={{ padding: '8px 12px', background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.02)', borderTop: `1px solid ${borderColor}`, color: subtextColor, fontSize: '0.6rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Clock3 size={10} />
        {isAdmin
          ? `Admin lists · OpenRouter ${adminLists.catalogs?.openRouter ? 'live' : 'offline'} · Gemini ${adminLists.catalogs?.gemini ? 'live' : 'offline'}`
          : (data?.source === 'live' ? 'Live provider catalogue' : 'Resilient fallback')}
        {data?.fetchedAt && ` · ${new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
      </div>
    </div>
  );
}
