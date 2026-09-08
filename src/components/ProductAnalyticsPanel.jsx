import React from 'react';

function compact(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(number);
}

function percent(part, whole) {
  const a = Number(part) || 0;
  const b = Number(whole) || 0;
  return b > 0 ? Math.round((a / b) * 100) : null;
}

function shortModel(id) {
  const value = String(id || '').trim();
  if (!value) return 'Unrecorded';
  return value.split('/').pop()?.slice(0, 28) || value;
}

function KpiCard({ label, value, note }) {
  return (
    <div style={{
      minWidth: 0,
      background: '#09090b',
      border: '1px solid #1f2937',
      borderRadius: '12px',
      padding: '18px 18px 16px',
    }}>
      <div style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600, marginBottom: '10px' }}>{label}</div>
      <div style={{ fontSize: '1.72rem', color: '#f8fafc', fontWeight: 760, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '9px', minHeight: '1em' }}>{note}</div>
    </div>
  );
}

function UsageTrend({ daily }) {
  const days = Array.isArray(daily?.usage) ? daily.usage.slice().reverse() : [];
  if (!days.length) {
    return (
      <section style={panelStyle}>
        <SectionHeader title="Usage trend" subtitle="Prompts and token intensity over the measured 14-day window" />
        <EmptyState>No daily usage history is available yet.</EmptyState>
      </section>
    );
  }

  const maxRequests = Math.max(...days.map((d) => Number(d.requests) || 0), 1);
  const maxTokens = Math.max(...days.map((d) => Number(d.tokens_est) || 0), 1);

  return (
    <section style={panelStyle}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '22px' }}>
        <SectionHeader title="Usage trend" subtitle="Daily prompts with token intensity scaled independently for readability" />
        <div style={{ display: 'flex', gap: '14px', color: '#94a3b8', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
          <LegendDot color="#2563eb" label="Prompts" />
          <LegendDot color="#8b5cf6" label="Tokens (scaled)" />
        </div>
      </div>
      <div style={{ height: '260px', display: 'flex', alignItems: 'stretch', gap: '5px', borderBottom: '1px solid #1f2937', padding: '10px 0 0', overflowX: 'auto' }}>
        {days.map((day) => {
          const requests = Number(day.requests) || 0;
          const tokens = Number(day.tokens_est) || 0;
          const requestPct = Math.max(requests > 0 ? 4 : 0, Math.round((requests / maxRequests) * 100));
          const tokenPct = Math.max(tokens > 0 ? 3 : 0, Math.round((tokens / maxTokens) * 100));
          return (
            <div key={day.day} title={`${day.day}: ${requests.toLocaleString()} prompts · ${tokens.toLocaleString()} estimated tokens`} style={{ flex: '1 0 42px', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'stretch', gap: '7px' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '2px', minHeight: 0 }}>
                <div style={{ flex: 1, height: `${requestPct}%`, minHeight: requests ? '3px' : 0, background: 'linear-gradient(to top, rgba(37,99,235,0.38), #2563eb)', borderRadius: '3px 3px 0 0' }} />
                <div style={{ width: '3px', height: `${tokenPct}%`, minHeight: tokens ? '3px' : 0, background: '#8b5cf6', borderRadius: '3px 3px 0 0', opacity: 0.9 }} />
              </div>
              <div style={{ height: '16px', fontSize: '0.58rem', color: '#64748b', textAlign: 'center', whiteSpace: 'nowrap' }}>
                {new Date(day.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RankingCard({ title, subtitle, rows, kind, windowHours }) {
  return (
    <section style={panelStyle}>
      <SectionHeader title={title} subtitle={subtitle} />
      {!rows?.length ? (
        <EmptyState>No measured usage in this window.</EmptyState>
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
  const choiceRate = product?.choiceEngagement?.total_requests
    ? percent(product.choiceEngagement.choice_selections, product.choiceEngagement.total_requests)
    : null;
  const serverKeyShare = percent(workspaceUse?.serverKeyTurns, workspaceUse?.turns);
  const activeWorkspaces = Array.isArray(workspaceUse?.workspaces) ? workspaceUse.workspaces.length : 0;

  const items = [
    ['Prompts / active user', product?.promptsPerActiveUser7d ?? '—', '7d'],
    ['Billable prompt share', percent(growth?.billableRequests7d, growth?.requests7d) == null ? '—' : `${percent(growth?.billableRequests7d, growth?.requests7d)}%`, '7d'],
    ['Platform-key turn share', serverKeyShare == null ? '—' : `${serverKeyShare}%`, `${workspaceUse?.windowHours || 24}h`],
    ['Choice-card engagement', choiceRate == null ? '—' : `${choiceRate}%`, '7d'],
    ['Active workspaces', activeWorkspaces.toLocaleString(), `${workspaceUse?.windowHours || 24}h`],
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
      <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: '0.98rem', fontWeight: 680, letterSpacing: '-0.01em' }}>{title}</h3>
      <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: '0.7rem', lineHeight: 1.4 }}>{subtitle}</p>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color }} /> {label}
    </span>
  );
}

function EmptyState({ children }) {
  return <div style={{ minHeight: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#64748b', fontSize: '0.76rem', padding: '20px' }}>{children}</div>;
}

const panelStyle = {
  background: '#09090b',
  border: '1px solid #1f2937',
  borderRadius: '12px',
  padding: '20px',
  minWidth: 0,
};

/**
 * Executive usage view built only from measured admin telemetry.
 * Different source windows are labelled rather than blended into a fake common period.
 */
export default function ProductAnalyticsPanel({ product, growth, workspaceUse, window, daily }) {
  const recentlyActiveNote = workspaceUse?.recentWindowMinutes
    ? `activity in last ${workspaceUse.recentWindowMinutes}m`
    : 'recent activity';

  const kpis = [
    ['Registered users', (growth?.totalUsers ?? 0).toLocaleString(), 'all time'],
    ['Active users', (growth?.activeUsers7d ?? 0).toLocaleString(), 'last 7d'],
    ['Prompts', (growth?.requests7d ?? 0).toLocaleString(), 'last 7d'],
    ['Estimated tokens', compact(window?.tokensEstimated), `measured ${window?.days || 14}d`],
    ['Prompts / active user', product?.promptsPerActiveUser7d ?? '—', 'last 7d'],
    ['Recently active', (workspaceUse?.recentlyActiveUsers ?? 0).toLocaleString(), recentlyActiveNote],
  ];

  return (
    <div data-quantora-executive-analytics="measured" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {workspaceUse?.truncated && (
        <div style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.08)', color: '#fbbf24', fontSize: '0.7rem' }}>
          The {workspaceUse.windowHours || 24}h workspace window reached its row cap. Workspace/model figures shown here are floors, not complete totals.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '12px' }}>
        {kpis.map(([label, value, note]) => <KpiCard key={label} label={label} value={value} note={note} />)}
      </div>

      <UsageTrend daily={daily} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        <RankingCard
          title="Top workspaces"
          subtitle="Where users are sending the most prompts — with users, token burn and dominant model in context"
          rows={workspaceUse?.workspaces || []}
          kind="workspace"
          windowHours={workspaceUse?.windowHours}
        />
        <RankingCard
          title="Top models"
          subtitle="Most-used models ranked by turns, with share and platform-key token consumption"
          rows={workspaceUse?.models || []}
          kind="model"
          windowHours={workspaceUse?.windowHours}
        />
      </div>

      <InsightStrip product={product} growth={growth} workspaceUse={workspaceUse} />
    </div>
  );
}
