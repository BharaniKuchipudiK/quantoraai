import React from 'react';

function shortModel(id) {
  if (!id) return 'unknown';
  return id.split('/').pop()?.slice(0, 28) || id;
}

function BarChart({ title, rows, labelKey, valueKey, color, emptyLabel, valueSuffix = '' }) {
  if (!rows?.length) {
    return (
      <div className="product-analytics-panel__chart product-analytics-panel__chart--empty">
        <h4>{title}</h4>
        <p>{emptyLabel}</p>
      </div>
    );
  }

  const max = Math.max(...rows.map((r) => Number(r[valueKey]) || 0), 1);

  return (
    <div className="product-analytics-panel__chart">
      <h4>{title}</h4>
      <div className="product-analytics-panel__bars">
        {rows.map((row) => {
          const value = Number(row[valueKey]) || 0;
          const label = String(row[labelKey] ?? 'unknown');
          const pct = Math.max(4, Math.round((value / max) * 100));
          return (
            <div key={label} className="product-analytics-panel__bar-row">
              <span className="product-analytics-panel__bar-label" title={label}>{label}</span>
              <div className="product-analytics-panel__bar-track">
                <div
                  className="product-analytics-panel__bar-fill"
                  style={{ width: `${pct}%`, background: color }}
                />
              </div>
              <span className="product-analytics-panel__bar-value">{`${value.toLocaleString()}${valueSuffix}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LatencyTrendChart({ usageDays }) {
  if (!usageDays?.length) {
    return (
      <div className="product-analytics-panel__chart product-analytics-panel__chart--empty">
        <h4>Latency trend (14d)</h4>
        <p>No latency history yet.</p>
      </div>
    );
  }

  const days = usageDays.slice().reverse();
  const max = Math.max(...days.map((d) => Number(d.avg_latency_ms) || 0), 1);

  return (
    <div className="product-analytics-panel__chart">
      <h4>Latency trend (14d)</h4>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '180px', width: '100%', marginTop: '12px' }}>
        {days.map((day, i) => {
          const ms = Number(day.avg_latency_ms) || 0;
          const heightPct = max ? (ms / max) * 100 : 0;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.6rem', color: '#64748b', fontFamily: 'monospace' }}>{ms}ms</span>
              <div style={{
                width: '100%',
                height: `${Math.max(heightPct, 4)}%`,
                background: 'linear-gradient(to top, rgba(245, 158, 11, 0.2), #f59e0b)',
                borderRadius: '4px 4px 0 0',
              }} />
              <span style={{ fontSize: '0.6rem', color: '#64748b' }}>
                {new Date(day.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/*
 * Module scope, deliberately. This was declared inside LatencyTrendChart and
 * used from TechnicalAnalyticsPanel, so it was out of scope at the only place
 * that renders it: any account with recentConversationInsights threw
 * ReferenceError and took the panel down. Nothing here reads the enclosing
 * function's state, so the nesting bought nothing and cost a crash.
 */

function ConversationInsightCard({ row, isLight }) {
  const conversation = row.conversation || {};
  const routing = conversation.routing || {};
  const evaluation = conversation.evaluation || {};
  const responseContract = conversation.responseContract || {};
  const chips = [
    conversation.move && `move: ${conversation.move}`,
    responseContract.action && `action: ${responseContract.action}`,
    routing.reason && `routing: ${routing.reason}`,
    routing.selectionSource && `source: ${routing.selectionSource}`,
    evaluation.verifierStatus && `verify: ${evaluation.verifierStatus}`,
    Number.isFinite(evaluation.score) && `score: ${evaluation.score}`,
  ].filter(Boolean);

  return (
    <div style={{
      padding: '12px',
      background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
      border: isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
      borderRadius: '10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: isLight ? '#0f172a' : '#f1f5f9' }}>
            {shortModel(row.model_id)}
          </div>
          <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '2px' }}>
            {[row.studio_mode, row.provider, row.used_server_key ? 'server key' : 'BYOK'].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, fontFamily: 'monospace', fontSize: '0.72rem', color: '#64748b' }}>
          <div>{row.latency_ms ?? '—'}ms</div>
          <div>{new Date(row.created_at).toLocaleTimeString()}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {chips.map((chip) => (
          <span
            key={chip}
            style={{
              fontSize: '0.66rem',
              padding: '4px 8px',
              borderRadius: '999px',
              background: isLight ? 'rgba(14,165,233,0.08)' : 'rgba(14,165,233,0.16)',
              color: isLight ? '#0c4a6e' : '#7dd3fc',
              border: isLight ? '1px solid rgba(14,165,233,0.12)' : '1px solid rgba(125,211,252,0.14)',
            }}
          >
            {chip}
          </span>
        ))}
      </div>
      {(conversation.reasonCode || responseContract.tone || responseContract.depth || responseContract.safetyLevel || evaluation.qualitySignal) && (
        <div style={{ fontSize: '0.68rem', color: '#64748b', lineHeight: 1.45 }}>
          {conversation.reasonCode ? `reason ${conversation.reasonCode}` : 'reason unavailable'}
          {responseContract.tone ? ` · tone ${responseContract.tone}` : ''}
          {responseContract.depth ? ` · depth ${responseContract.depth}` : ''}
          {responseContract.safetyLevel ? ` · safety ${responseContract.safetyLevel}` : ''}
          {evaluation.qualitySignal ? ` · quality ${evaluation.qualitySignal}` : ''}
        </div>
      )}
    </div>
  );
}

/**
 * Infrastructure KPIs — cost, latency, model health, build completion.
 * Replaces legacy telemetry table + misleading "network ingress" labels.
 */
export default function TechnicalAnalyticsPanel({ technical, window, daily, isLight }) {
  const tracking = technical?.tracking;
  const keyMix = technical?.keyMix;
  const latency = technical?.latencySummary;
  const completion = technical?.completion;

  const billablePct = keyMix?.total_requests
    ? Math.round((Number(keyMix.server_key_requests) / Number(keyMix.total_requests)) * 100)
    : null;

  const publishRate = completion?.previews_opened
    ? Math.round((Number(completion.publishes_completed) / Number(completion.previews_opened)) * 100)
    : null;

  const kpis = [
    {
      label: 'Server-key reqs (7d)',
      value: keyMix ? Number(keyMix.server_key_requests).toLocaleString() : '—',
      hint: 'Costs your API keys',
      color: '#ef4444',
    },
    {
      label: 'BYOK reqs (7d)',
      value: keyMix ? Number(keyMix.byok_requests).toLocaleString() : '—',
      hint: 'User-supplied keys',
      color: '#10b981',
    },
    {
      label: 'Avg latency (7d)',
      value: latency?.avg_latency_ms != null ? `${latency.avg_latency_ms}ms` : '—',
      hint: 'Weighted mean',
      color: '#f59e0b',
    },
    {
      label: 'P95 latency (7d)',
      value: latency?.p95_latency_ms != null ? `${latency.p95_latency_ms}ms` : '—',
      hint: 'Slow tail',
      color: '#f97316',
    },
    {
      label: 'Previews opened (7d)',
      value: completion ? Number(completion.previews_opened).toLocaleString() : '—',
      hint: 'Build completion signal',
      color: '#0ea5e9',
    },
    {
      label: 'Sites published (7d)',
      value: completion ? Number(completion.publishes_completed).toLocaleString() : '—',
      hint: publishRate != null ? `${publishRate}% of previews` : 'North-star outcome',
      color: '#8b5cf6',
    },
  ];

  const modelRows = (technical?.modelLatency || []).map((row) => ({
    model_id: shortModel(row.model_id),
    avg_latency_ms: row.avg_latency_ms,
  }));

  const usageDays = daily?.usage || [];
  const requestDays = usageDays.slice().reverse().map((d) => ({
    day: new Date(d.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    requests: d.requests,
  }));

  return (
    <div className={`product-analytics-panel${isLight ? ' is-light' : ' is-dark'}`}>
      <div className="product-analytics-panel__header">
        <span className="product-analytics-panel__live-dot" aria-hidden="true" />
        <div>
          <h3>Technical & Reliability</h3>
          <p>
            {tracking?.viewsReachable
              ? 'Cost, latency, and build-completion signals from Supabase — no fabricated uptime.'
              : 'Run migration 0011 in Supabase to enable technical KPI views.'}
          </p>
        </div>
      </div>

      {tracking?.viewsReachable && !tracking?.hasUsage7d && (
        <div className="product-analytics-panel__status" style={{
          marginBottom: '12px',
          padding: '8px 10px',
          borderRadius: '8px',
          fontSize: '0.72rem',
          fontWeight: 600,
          color: isLight ? '#92400e' : '#fdba74',
          background: isLight ? 'rgba(249,115,22,0.08)' : 'rgba(249,115,22,0.12)',
        }}>
          Views connected — send a few Studio prompts to populate latency and cost charts.
        </div>
      )}

      {billablePct != null && tracking?.hasUsage7d && (
        <div className="product-analytics-panel__status" style={{
          marginBottom: '12px',
          padding: '8px 10px',
          borderRadius: '8px',
          fontSize: '0.72rem',
          fontWeight: 600,
          color: billablePct > 70 ? (isLight ? '#92400e' : '#fdba74') : '#059669',
          background: billablePct > 70
            ? (isLight ? 'rgba(249,115,22,0.08)' : 'rgba(249,115,22,0.12)')
            : (isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.12)'),
        }}>
          {billablePct}% of requests use server keys ({Number(keyMix?.server_key_tokens_est || 0).toLocaleString()} est. tokens on your dime).
        </div>
      )}

      <div className="product-analytics-panel__kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        {kpis.map((kpi) => (
          <div key={kpi.label} className="product-analytics-panel__kpi" title={kpi.hint}>
            <div className="product-analytics-panel__kpi-value" style={{ color: kpi.color, fontSize: '1.35rem' }}>{kpi.value}</div>
            <div className="product-analytics-panel__kpi-label">{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className="product-analytics-panel__charts">
        <BarChart
          title="API request volume (14d)"
          rows={requestDays}
          labelKey="day"
          valueKey="requests"
          color="#0ea5e9"
          emptyLabel="No request history yet."
        />
        <LatencyTrendChart usageDays={usageDays} />
        <BarChart
          title="Model latency — avg ms (7d, min 3 reqs)"
          rows={modelRows}
          labelKey="model_id"
          valueKey="avg_latency_ms"
          color="#f59e0b"
          valueSuffix="ms"
          emptyLabel={tracking?.viewsReachable ? 'Need more requests per model to rank latency.' : 'Run migration 0011.'}
        />
      </div>

      <div className="product-analytics-panel__chart" style={{ marginTop: '16px' }}>
        <h4>Recent inference requests</h4>
        {technical?.recentRequests?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            {technical.recentRequests.map((row) => (
              <div key={row.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 12px',
                background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                border: isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: '8px',
                gap: '12px',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: isLight ? '#0f172a' : '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {shortModel(row.model_id)}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '2px' }}>
                    {[row.studio_mode, row.provider, row.used_server_key ? 'server key' : 'BYOK'].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  <div style={{ color: '#10b981' }}>{row.latency_ms ?? '—'}ms</div>
                  <div style={{ color: '#64748b', marginTop: '2px' }}>{row.tokens_est ?? 0} tk</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '12px 0 0' }}>No recent requests yet.</p>
        )}
      </div>

      <div className="product-analytics-panel__chart" style={{ marginTop: '16px' }}>
        <h4>Recent communication decisions</h4>
        {technical?.recentConversationInsights?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
            {technical.recentConversationInsights.map((row) => (
              <ConversationInsightCard key={row.id} row={row} isLight={isLight} />
            ))}
          </div>
        ) : (
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '12px 0 0' }}>
            No communication metadata captured yet. New Studio requests will populate policy, routing, and verification decisions here.
          </p>
        )}
      </div>

      {window?.requests != null && (
        <p style={{ margin: '16px 0 0', fontSize: '0.72rem', color: '#64748b' }}>
          14-day totals: {Number(window.requests).toLocaleString()} requests · {Number(window.tokensEstimated || 0).toLocaleString()} est. tokens · {window.avgLatencyMs ?? '—'}ms avg latency
        </p>
      )}
    </div>
  );
}
