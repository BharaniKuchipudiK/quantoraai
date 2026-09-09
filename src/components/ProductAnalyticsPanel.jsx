import React from 'react';

function compact(value) {
  if (value == null || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(number);
}

function count(value) {
  if (value == null || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : '—';
}

function percent(part, whole) {
  if (part == null || whole == null) return null;
  const a = Number(part);
  const b = Number(whole);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return b > 0 ? Math.round((a / b) * 100) : null;
}

function shortModel(id) {
  const value = String(id || '').trim();
  if (!value) return 'Unrecorded';
  return value.split('/').pop()?.slice(0, 28) || value;
}

function humanize(value, fallback = 'Unknown') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceAvailable(source, value) {
  if (source == null) return value != null;
  return source === 'measured' || source === 'no-rows';
}

function KpiCard({ label, value, note, emphasis = false }) {
  return (
    <div style={{
      minWidth: 0,
      background: emphasis ? 'linear-gradient(145deg, rgba(37,99,235,0.14), #09090b 58%)' : '#09090b',
      border: emphasis ? '1px solid rgba(59,130,246,0.32)' : '1px solid #1f2937',
      borderRadius: '14px',
      padding: '18px 18px 16px',
      boxShadow: emphasis ? 'inset 0 1px 0 rgba(255,255,255,0.03)' : 'none',
    }}>
      <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 650, marginBottom: '10px', letterSpacing: '0.01em' }}>{label}</div>
      <div style={{ fontSize: '1.78rem', color: '#f8fafc', fontWeight: 780, letterSpacing: '-0.035em', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '9px', minHeight: '1em', lineHeight: 1.35 }}>{note}</div>
    </div>
  );
}

function MetricChip({ label, value, note }) {
  return (
    <div style={{ minWidth: '116px', padding: '9px 11px', border: '1px solid #1f2937', borderRadius: '10px', background: 'rgba(15,23,42,0.36)' }}>
      <div style={{ color: '#64748b', fontSize: '0.59rem', marginBottom: '4px' }}>{label}</div>
      <div style={{ color: '#e2e8f0', fontSize: '0.86rem', fontWeight: 720, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {note && <div style={{ color: '#475569', fontSize: '0.55rem', marginTop: '2px' }}>{note}</div>}
    </div>
  );
}

function UsageTrend({ daily, windowDays }) {
  const usage = daily?.usage;
  const days = Array.isArray(usage) ? usage.slice().reverse() : [];
  if (!days.length) {
    const message = usage == null
      ? 'Daily usage telemetry is unavailable.'
      : 'No daily usage has been recorded in this window.';
    return (
      <section style={panelStyle}>
        <SectionHeader title="Usage trend" subtitle={`Prompts and token intensity over the measured ${windowDays || 14}-day window`} />
        <EmptyState>{message}</EmptyState>
      </section>
    );
  }

  const maxRequests = Math.max(...days.map((d) => Number(d.requests) || 0), 1);
  const maxTokens = Math.max(...days.map((d) => Number(d.tokens_est) || 0), 1);
  const totalRequests = days.reduce((sum, d) => sum + (Number(d.requests) || 0), 0);
  const totalTokens = days.reduce((sum, d) => sum + (Number(d.tokens_est) || 0), 0);
  const peak = days.reduce((best, day) => ((Number(day.requests) || 0) > (Number(best?.requests) || -1) ? day : best), null);

  return (
    <section style={{ ...panelStyle, padding: '22px 22px 18px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '18px', marginBottom: '18px' }}>
        <div>
          <SectionHeader title="Usage trend" subtitle="Daily prompts and estimated token intensity, each scaled independently so both shapes remain readable" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '13px' }}>
            <MetricChip label="Prompts in window" value={count(totalRequests)} note={`${windowDays || days.length}d`} />
            <MetricChip label="Estimated tokens" value={compact(totalTokens)} note={`${windowDays || days.length}d`} />
            <MetricChip
              label="Peak prompt day"
              value={peak ? count(peak.requests) : '—'}
              note={peak ? new Date(peak.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '14px', color: '#94a3b8', fontSize: '0.66rem', whiteSpace: 'nowrap', paddingTop: '2px' }}>
          <LegendSwatch color="#2563eb" label="Prompts" />
          <LegendSwatch color="#8b5cf6" label="Token intensity" />
        </div>
      </div>

      <div style={{ position: 'relative', height: '300px', overflowX: 'auto', paddingTop: '8px' }}>
        <div style={{ position: 'absolute', inset: '8px 0 27px 0', pointerEvents: 'none' }}>
          {[25, 50, 75, 100].map((mark) => (
            <div key={mark} style={{ position: 'absolute', left: 0, right: 0, bottom: `${mark}%`, borderTop: '1px solid rgba(51,65,85,0.34)' }} />
          ))}
        </div>

        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', alignItems: 'stretch', gap: '8px', minWidth: `${Math.max(760, days.length * 58)}px`, borderBottom: '1px solid #1f2937' }}>
          {days.map((day) => {
            const requests = Number(day.requests) || 0;
            const tokens = Number(day.tokens_est) || 0;
            const requestPct = Math.max(requests > 0 ? 3 : 0, (requests / maxRequests) * 100);
            const tokenPct = Math.max(tokens > 0 ? 3 : 0, (tokens / maxTokens) * 100);
            return (
              <div
                key={day.day}
                title={`${day.day}: ${requests.toLocaleString()} prompts · ${tokens.toLocaleString()} estimated tokens`}
                style={{ flex: '1 0 48px', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'stretch', gap: '8px' }}
              >
                <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '4px', minHeight: 0, padding: '0 4px' }}>
                  <div style={{
                    width: '58%',
                    height: `${requestPct}%`,
                    minHeight: requests ? '4px' : 0,
                    background: 'linear-gradient(to top, rgba(30,64,175,0.68), #2563eb 62%, #3b82f6)',
                    borderRadius: '7px 7px 2px 2px',
                    boxShadow: requests ? '0 0 0 1px rgba(59,130,246,0.08), 0 -8px 24px rgba(37,99,235,0.08)' : 'none',
                  }} />
                  <div style={{
                    width: '26%',
                    height: `${tokenPct}%`,
                    minHeight: tokens ? '4px' : 0,
                    background: 'linear-gradient(to top, rgba(109,40,217,0.55), #8b5cf6)',
                    borderRadius: '6px 6px 2px 2px',
                    opacity: 0.9,
                  }} />
                </div>
                <div style={{ height: '18px', fontSize: '0.59rem', color: '#64748b', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {new Date(day.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ marginTop: '10px', color: '#475569', fontSize: '0.61rem' }}>
        Hover a day for exact values. Token bars are independently scaled and should be read as intensity, not against the prompt axis.
      </div>
    </section>
  );
}

function AcquisitionCard({ traffic, growth }) {
  const available = sourceAvailable(traffic?.source, traffic?.summary);
  const summary = available ? traffic?.summary : null;
  const daily = available && Array.isArray(traffic?.daily) ? traffic.daily.slice().reverse() : [];
  const maxHits = Math.max(...daily.map((row) => Number(row.hits) || 0), 1);

  return (
    <section style={panelStyle}>
      <SectionHeader title="Audience acquisition" subtitle="Signed-out Quantora app loads plus measured registration growth" />
      {!available ? (
        <EmptyState>Signed-out traffic telemetry is unavailable until the traffic counter migration is active.</EmptyState>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', marginTop: '18px' }}>
            <MetricTile label="Signed-out loads" value={count(summary?.signed_out_hits_24h)} note="last 24h" />
            <MetricTile label="Signed-out loads" value={count(summary?.signed_out_hits_7d)} note="last 7d" />
            <MetricTile label="New users" value={count(growth?.newUsers7d)} note="last 7d" />
            <MetricTile label="14-day reach" value={count(summary?.signed_out_hits_14d)} note="signed-out loads" />
          </div>

          <div style={{ height: '82px', display: 'flex', alignItems: 'flex-end', gap: '4px', marginTop: '18px', paddingTop: '8px', borderBottom: '1px solid #1f2937' }}>
            {daily.map((row) => {
              const hits = Number(row.hits) || 0;
              const height = Math.max(hits > 0 ? 6 : 1, Math.round((hits / maxHits) * 100));
              return (
                <div key={row.day} title={`${row.day}: ${hits.toLocaleString()} signed-out loads`} style={{ flex: 1, height: `${height}%`, minWidth: '4px', background: hits ? 'linear-gradient(to top, rgba(14,116,144,0.45), #22d3ee)' : '#172033', borderRadius: '4px 4px 1px 1px', opacity: hits ? 0.92 : 0.55 }} />
              );
            })}
          </div>
          <div style={{ marginTop: '10px', color: '#475569', fontSize: '0.61rem', lineHeight: 1.45 }}>
            Counts are page/app loads with no active Quantora session — not unique people. Collection starts with this release; there is no retroactive backfill.
          </div>
        </>
      )}
    </section>
  );
}

function ProductPulseCard({ technical, growth }) {
  const completion = technical?.completion;
  const activeRate = percent(growth?.activeUsers7d, growth?.totalUsers);
  const publishRate = percent(completion?.publishes_completed, completion?.previews_opened);
  const latency = technical?.latencySummary?.avg_latency_ms;

  const items = [
    ['Active / registered', activeRate == null ? '—' : `${activeRate}%`, '7d active share'],
    ['Previews opened', completion ? count(completion.previews_opened) : '—', 'last 7d'],
    ['Publishes completed', completion ? count(completion.publishes_completed) : '—', 'last 7d'],
    ['Preview → publish', publishRate == null ? '—' : `${publishRate}%`, 'observed event ratio'],
    ['Avg AI latency', latency == null ? '—' : `${count(latency)} ms`, 'last 7d'],
    ['New registrations', growth ? count(growth.newUsers7d) : '—', 'last 7d'],
  ];

  return (
    <section style={panelStyle}>
      <SectionHeader title="Product pulse" subtitle="Measured activation, creation and delivery signals" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', marginTop: '18px' }}>
        {items.map(([label, value, note]) => <MetricTile key={label} label={label} value={value} note={note} />)}
      </div>
    </section>
  );
}

function FeatureReachCard({ product }) {
  const modes = Array.isArray(product?.modes)
    ? product.modes.filter((row) => row?.studio_mode && row.studio_mode !== 'unknown' && Number(row.requests) > 0).slice(0, 5)
    : [];
  const countries = Array.isArray(product?.geoUsers)
    ? product.geoUsers.filter((row) => row?.country_code && row.country_code !== 'unknown' && Number(row.active_users) > 0).slice(0, 5)
    : [];

  const maxMode = Math.max(...modes.map((row) => Number(row.requests) || 0), 1);
  const maxUsers = Math.max(...countries.map((row) => Number(row.active_users) || 0), 1);

  return (
    <section style={panelStyle}>
      <SectionHeader title="Feature & geographic reach" subtitle="What people use and where active users are coming from" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '24px', marginTop: '18px' }}>
        <MiniRanking
          title="Workspace mix"
          rows={modes.map((row) => ({ label: humanize(row.studio_mode), value: Number(row.requests) || 0 }))}
          max={maxMode}
          empty="No workspace mix recorded yet."
          unit="prompts"
        />
        <MiniRanking
          title="Active users by country"
          rows={countries.map((row) => ({ label: String(row.country_code).toUpperCase(), value: Number(row.active_users) || 0 }))}
          max={maxUsers}
          empty="No geographic user signal recorded yet."
          unit="users"
        />
      </div>
    </section>
  );
}

function MetricTile({ label, value, note }) {
  return (
    <div style={{ minWidth: 0, padding: '12px 13px', borderRadius: '10px', border: '1px solid rgba(51,65,85,0.62)', background: 'rgba(15,23,42,0.30)' }}>
      <div style={{ color: '#64748b', fontSize: '0.62rem', marginBottom: '6px' }}>{label}</div>
      <div style={{ color: '#f8fafc', fontSize: '1.03rem', fontWeight: 730, letterSpacing: '-0.015em' }}>{value}</div>
      <div style={{ color: '#475569', fontSize: '0.57rem', marginTop: '3px' }}>{note}</div>
    </div>
  );
}

function MiniRanking({ title, rows, max, empty, unit }) {
  return (
    <div>
      <div style={{ color: '#94a3b8', fontSize: '0.66rem', fontWeight: 650, marginBottom: '12px' }}>{title}</div>
      {!rows.length ? (
        <div style={{ color: '#475569', fontSize: '0.65rem', padding: '16px 0' }}>{empty}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {rows.map((row) => (
            <div key={row.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', color: '#cbd5e1', fontSize: '0.64rem', marginBottom: '5px' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
                <span style={{ color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{count(row.value)} {unit}</span>
              </div>
              <div style={{ height: '4px', borderRadius: '999px', background: '#172033', overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(4, Math.round((row.value / max) * 100))}%`, height: '100%', borderRadius: '999px', background: '#334155' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RankingCard({ title, subtitle, rows, kind, windowHours, source }) {
  const available = sourceAvailable(source, rows);
  let emptyMessage = 'No measured usage in this window.';
  if (!available) {
    emptyMessage = source === 'not_configured'
      ? 'Workspace telemetry is not configured.'
      : 'Workspace telemetry is unavailable.';
  }

  return (
    <section style={panelStyle}>
      <SectionHeader title={title} subtitle={subtitle} />
      {!available || !rows?.length ? (
        <EmptyState>{emptyMessage}</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '13px', marginTop: '20px' }}>
          {rows.slice(0, 6).map((row, index) => {
            const name = kind === 'workspace' ? row.workspace : shortModel(row.modelId);
            const turns = Number(row.turns) || 0;
            const maxTurns = Math.max(...rows.map((r) => Number(r.turns) || 0), 1);
            const width = Math.max(5, Math.round((turns / maxTurns) * 100));
            const meta = kind === 'workspace'
              ? `${Number(row.users || 0).toLocaleString()} users · ${compact(row.serverKeyTokens)} platform-key tokens · ${shortModel(row.topModel)}`
              : `${row.sharePercent ?? 0}% of turns · ${compact(row.serverKeyTokens)} platform-key tokens · ${Number(row.users || 0).toLocaleString()} users`;
            return (
              <div key={`${name}-${index}`}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
                  <div style={{ minWidth: 0, color: '#e2e8f0', fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</div>
                  <div style={{ color: '#f8fafc', fontSize: '0.76rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{turns.toLocaleString()}</div>
                </div>
                <div style={{ height: '5px', borderRadius: '999px', overflow: 'hidden', background: '#172033' }}>
                  <div style={{ width: `${width}%`, height: '100%', borderRadius: '999px', background: kind === 'workspace' ? '#2563eb' : '#8b5cf6' }} />
                </div>
                <div style={{ marginTop: '5px', color: '#64748b', fontSize: '0.63rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ marginTop: '16px', fontSize: '0.62rem', color: '#475569' }}>Measured over the last {windowHours || 24}h.</div>
    </section>
  );
}

function InsightStrip({ product, growth, workspaceUse }) {
  const workspaceAvailable = sourceAvailable(workspaceUse?.source, workspaceUse);
  const choiceRate = product?.choiceEngagement?.total_requests
    ? percent(product.choiceEngagement.choice_selections, product.choiceEngagement.total_requests)
    : null;
  const serverKeyShare = workspaceAvailable ? percent(workspaceUse?.serverKeyTurns, workspaceUse?.turns) : null;
  const activeWorkspaces = workspaceAvailable && Array.isArray(workspaceUse?.workspaces)
    ? workspaceUse.workspaces.length.toLocaleString()
    : '—';
  const billableShare = percent(growth?.billableRequests7d, growth?.requests7d);

  const items = [
    ['Prompts / active user', product?.promptsPerActiveUser7d ?? '—', '7d'],
    ['Billable prompt share', billableShare == null ? '—' : `${billableShare}%`, '7d'],
    ['Platform-key turn share', serverKeyShare == null ? '—' : `${serverKeyShare}%`, `${workspaceUse?.windowHours || 24}h`],
    ['Choice-card engagement', choiceRate == null ? '—' : `${choiceRate}%`, '7d'],
    ['Active workspaces', activeWorkspaces, `${workspaceUse?.windowHours || 24}h`],
  ];

  return (
    <section style={{ ...panelStyle, padding: '18px 20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        {items.map(([label, value, note]) => (
          <div key={label} style={{ padding: '4px 10px' }}>
            <div style={{ color: '#64748b', fontSize: '0.65rem', marginBottom: '7px' }}>{label}</div>
            <div style={{ color: '#f8fafc', fontSize: '1.08rem', fontWeight: 720 }}>{value}</div>
            <div style={{ color: '#475569', fontSize: '0.6rem', marginTop: '3px' }}>{note}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div>
      <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: '0.99rem', fontWeight: 690, letterSpacing: '-0.01em' }}>{title}</h3>
      <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: '0.7rem', lineHeight: 1.45 }}>{subtitle}</p>
    </div>
  );
}

function LegendSwatch({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: color }} /> {label}
    </span>
  );
}

function EmptyState({ children }) {
  return <div style={{ minHeight: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#64748b', fontSize: '0.76rem', padding: '20px', lineHeight: 1.5 }}>{children}</div>;
}

const panelStyle = {
  background: '#09090b',
  border: '1px solid #1f2937',
  borderRadius: '14px',
  padding: '20px',
  minWidth: 0,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.018)',
};

/**
 * Executive usage view built only from measured admin telemetry.
 * Different source windows are labelled rather than blended into a fake common period.
 */
export default function ProductAnalyticsPanel({ product, growth, workspaceUse, window, daily, technical, source }) {
  const growthAvailable = sourceAvailable(source, growth);
  const workspaceAvailable = sourceAvailable(workspaceUse?.source, workspaceUse);
  const trafficAvailable = sourceAvailable(product?.traffic?.source, product?.traffic?.summary);
  const recentlyActiveNote = workspaceUse?.recentWindowMinutes
    ? `activity in last ${workspaceUse.recentWindowMinutes}m`
    : 'recent activity';

  const kpis = [
    ['Signed-out loads', trafficAvailable ? count(product?.traffic?.summary?.signed_out_hits_7d) : '—', 'last 7d · page loads, not unique people', true],
    ['Registered users', growthAvailable ? count(growth?.totalUsers) : '—', 'all time'],
    ['New users', growthAvailable ? count(growth?.newUsers7d) : '—', 'last 7d'],
    ['Active users', growthAvailable ? count(growth?.activeUsers7d) : '—', 'last 7d'],
    ['Prompts', growthAvailable ? count(growth?.requests7d) : '—', 'last 7d'],
    ['Estimated tokens', compact(window?.tokensEstimated), `measured ${window?.days || 14}d`],
    ['Recently active', workspaceAvailable ? count(workspaceUse?.recentlyActiveUsers) : '—', recentlyActiveNote],
    ['Prompts / active user', growthAvailable ? (product?.promptsPerActiveUser7d ?? '—') : '—', 'last 7d'],
  ];

  return (
    <div data-quantora-executive-analytics={source || 'unknown'} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {workspaceUse?.truncated && (
        <div style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.08)', color: '#fbbf24', fontSize: '0.7rem' }}>
          The {workspaceUse.windowHours || 24}h workspace window reached its row cap. Workspace/model figures shown here are floors, not complete totals.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '12px' }}>
        {kpis.map(([label, value, note, emphasis]) => <KpiCard key={label} label={label} value={value} note={note} emphasis={emphasis === true} />)}
      </div>

      <UsageTrend daily={daily} windowDays={window?.days} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        <AcquisitionCard traffic={product?.traffic} growth={growthAvailable ? growth : null} />
        <ProductPulseCard technical={technical} growth={growthAvailable ? growth : null} />
      </div>

      <FeatureReachCard product={product} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        <RankingCard
          title="Top workspaces"
          subtitle="Where users are sending the most prompts — with users, token burn and dominant model in context"
          rows={workspaceUse?.workspaces || []}
          kind="workspace"
          windowHours={workspaceUse?.windowHours}
          source={workspaceUse?.source}
        />
        <RankingCard
          title="Top models"
          subtitle="Most-used models ranked by turns, with share and platform-key token consumption"
          rows={workspaceUse?.models || []}
          kind="model"
          windowHours={workspaceUse?.windowHours}
          source={workspaceUse?.source}
        />
      </div>

      <InsightStrip product={product} growth={growthAvailable ? growth : null} workspaceUse={workspaceUse} />
    </div>
  );
}
