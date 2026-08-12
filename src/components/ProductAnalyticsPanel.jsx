import React from 'react';

function BarChart({ title, rows, labelKey, valueKey, color, emptyLabel }) {
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
              <span className="product-analytics-panel__bar-value">{value.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Measured product KPIs from Supabase usage — replaces decorative LiveUsersMap.
 */
export default function ProductAnalyticsPanel({ product, growth, isLight }) {
  const choiceRate = product?.choiceEngagement?.total_requests
    ? Math.round((product.choiceEngagement.choice_selections / product.choiceEngagement.total_requests) * 100)
    : null;

  const kpis = [
    {
      label: 'Prompts (7d)',
      value: (growth?.requests7d ?? 0).toLocaleString(),
      color: '#0ea5e9',
    },
    {
      label: 'Prompts / active user',
      value: product?.promptsPerActiveUser7d != null ? String(product.promptsPerActiveUser7d) : '—',
      color: '#10b981',
    },
    {
      label: 'Choice card taps',
      value: choiceRate != null ? `${choiceRate}%` : '—',
      color: '#f97316',
    },
    {
      label: 'Top model',
      value: product?.models?.[0]?.model_id?.split('/').pop()?.slice(0, 18) || '—',
      color: '#8b5cf6',
    },
  ];

  return (
    <div className={`product-analytics-panel${isLight ? ' is-light' : ' is-dark'}`}>
      <div className="product-analytics-panel__header">
        <span className="product-analytics-panel__live-dot" aria-hidden="true" />
        <div>
          <h3>Product Engagement</h3>
          <p>Measured from Supabase usage — no simulated geo data.</p>
        </div>
      </div>

      <div className="product-analytics-panel__kpis">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="product-analytics-panel__kpi">
            <div className="product-analytics-panel__kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
            <div className="product-analytics-panel__kpi-label">{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className="product-analytics-panel__charts">
        <BarChart
          title="Models used (7d)"
          rows={product?.models}
          labelKey="model_id"
          valueKey="requests"
          color="#0ea5e9"
          emptyLabel="No model usage recorded yet."
        />
        <BarChart
          title="Studio modes (7d)"
          rows={product?.modes}
          labelKey="studio_mode"
          valueKey="requests"
          color="#f97316"
          emptyLabel="Mode tracking starts after migration 0007 is applied."
        />
        <BarChart
          title="Domain focus (7d)"
          rows={product?.domains}
          labelKey="studio_domain"
          valueKey="requests"
          color="#10b981"
          emptyLabel="Domain tracking starts after migration 0007 is applied."
        />
      </div>
    </div>
  );
}
