import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  Inbox,
  Lightbulb,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import '../styles/admin-feedback.css';

const STATUS_LABELS = {
  new: 'New',
  reviewed: 'Reviewed',
  planned: 'Planned',
  done: 'Done',
  closed: 'Closed',
};

const STATUS_ORDER = ['new', 'reviewed', 'planned', 'done', 'closed'];

function relativeTime(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Unknown time';
  const delta = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function personLabel(item) {
  return item?.user?.name || item?.user?.email || 'Quantora user';
}

function personSecondary(item) {
  return item?.user?.email || (item?.userSub ? `User ${item.userSub.slice(-8)}` : 'Authenticated user');
}

export default function AdminFeedbackPanel() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const load = async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/feedback?limit=250', {
        credentials: 'include',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Could not load feedback (${response.status}).`);
      setItems(Array.isArray(data.items) ? data.items : []);
      setSummary(data.summary || null);
      setSelected((current) => {
        if (!current) return null;
        return (data.items || []).find((item) => item.id === current.id) || null;
      });
    } catch (loadError) {
      setError(loadError?.message || 'Could not load feedback.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== 'all' && item.feedbackType !== typeFilter) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!needle) return true;
      return [
        item.message,
        item.surface,
        item.pagePath,
        item.user?.name,
        item.user?.email,
      ].some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [items, query, statusFilter, typeFilter]);

  const counts = summary || {
    total: items.length,
    new: items.filter((item) => item.status === 'new').length,
    planned: items.filter((item) => item.status === 'planned').length,
    done: items.filter((item) => item.status === 'done').length,
  };

  const updateStatus = async (status) => {
    if (!selected || status === selected.status || updatingStatus) return;
    setUpdatingStatus(true);
    setError('');
    try {
      const response = await fetch('/api/admin/feedback', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not update feedback status.');
      const updated = { ...selected, ...(data.item || {}), status };
      setSelected(updated);
      setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSummary(null); // recompute from live items until next refresh
    } catch (updateError) {
      setError(updateError?.message || 'Could not update feedback status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="q-admin-feedback">
      <section className="q-admin-feedback__intro">
        <div>
          <span className="q-admin-feedback__eyebrow">Voice of the user</span>
          <h2>Feedback</h2>
          <p>Understand what users are asking for, decide what matters, and close the loop.</p>
        </div>
        <button type="button" className="q-admin-feedback__refresh" onClick={() => load({ quiet: true })} disabled={refreshing}>
          <RefreshCw size={15} className={refreshing ? 'is-spinning' : ''} />
          Refresh
        </button>
      </section>

      <section className="q-admin-feedback__kpis" aria-label="Feedback summary">
        <Kpi label="Total" value={counts.total || 0} tone="neutral" />
        <Kpi label="New" value={counts.new || 0} tone="orange" />
        <Kpi label="Planned" value={counts.planned || 0} tone="violet" />
        <Kpi label="Done" value={counts.done || 0} tone="green" />
      </section>

      <section className="q-admin-feedback__toolbar">
        <div className="q-admin-feedback__types" role="group" aria-label="Feedback type filter">
          {[
            ['all', 'All'],
            ['feedback', 'Feedback'],
            ['suggestion', 'Suggestions'],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={typeFilter === value ? 'is-active' : ''}
              onClick={() => setTypeFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="q-admin-feedback__tools">
          <label className="q-admin-feedback__search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search feedback" />
          </label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
            <option value="all">All statuses</option>
            {STATUS_ORDER.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
          </select>
        </div>
      </section>

      {error && <div className="q-admin-feedback__error" role="alert">{error}</div>}

      <section className="q-admin-feedback__list" aria-busy={loading}>
        {loading ? (
          <div className="q-admin-feedback__empty">
            <Loader2 size={24} className="is-spinning" />
            <strong>Loading feedback</strong>
            <span>Connecting to the product feedback queue…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="q-admin-feedback__empty">
            <Inbox size={25} />
            <strong>{items.length === 0 ? 'No feedback yet' : 'Nothing matches these filters'}</strong>
            <span>{items.length === 0 ? 'New user feedback will appear here automatically.' : 'Try a different status, type, or search.'}</span>
          </div>
        ) : (
          filtered.map((item) => (
            <button type="button" className="q-feedback-row" key={item.id} onClick={() => setSelected(item)}>
              <div className={`q-feedback-row__icon q-feedback-row__icon--${item.feedbackType}`}>
                {item.feedbackType === 'suggestion' ? <Lightbulb size={17} /> : <MessageSquareText size={17} />}
              </div>
              <div className="q-feedback-row__body">
                <div className="q-feedback-row__meta">
                  <span className={`q-feedback-status q-feedback-status--${item.status}`}>{STATUS_LABELS[item.status] || item.status}</span>
                  <span>{item.feedbackType === 'suggestion' ? 'Suggestion' : 'Feedback'}</span>
                  <span>·</span>
                  <span>{relativeTime(item.createdAt)}</span>
                </div>
                <strong>{item.message}</strong>
                <div className="q-feedback-row__person">
                  <span>{personLabel(item)}</span>
                  <span>{personSecondary(item)}</span>
                  {item.surface && <span>· {item.surface}</span>}
                </div>
              </div>
              <ChevronRight size={18} className="q-feedback-row__chevron" />
            </button>
          ))
        )}
      </section>

      {selected && (
        <div className="q-feedback-drawer-root" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelected(null);
        }}>
          <aside className="q-feedback-drawer" role="dialog" aria-modal="true" aria-label="Feedback details">
            <header className="q-feedback-drawer__header">
              <div>
                <span className="q-admin-feedback__eyebrow">{selected.feedbackType === 'suggestion' ? 'Suggestion' : 'Feedback'}</span>
                <h3>User feedback</h3>
              </div>
              <button type="button" aria-label="Close feedback details" onClick={() => setSelected(null)}><X size={18} /></button>
            </header>

            <div className="q-feedback-drawer__message">{selected.message}</div>

            <div className="q-feedback-drawer__person">
              <div className="q-feedback-drawer__avatar">
                {selected.user?.picture ? <img src={selected.user.picture} alt="" /> : <UserRound size={18} />}
              </div>
              <div>
                <strong>{personLabel(selected)}</strong>
                <span>{personSecondary(selected)}</span>
              </div>
            </div>

            <dl className="q-feedback-drawer__context">
              <div><dt>Submitted</dt><dd><Clock3 size={14} /> {new Date(selected.createdAt).toLocaleString()}</dd></div>
              <div><dt>Surface</dt><dd>{selected.surface || 'Unknown'}</dd></div>
              <div><dt>Page</dt><dd>{selected.pagePath || 'Not captured'}</dd></div>
            </dl>

            <section className="q-feedback-drawer__workflow">
              <div>
                <span>Workflow status</span>
                <small>Keep the product team aligned on what happens next.</small>
              </div>
              <div className="q-feedback-drawer__statuses">
                {STATUS_ORDER.map((status) => (
                  <button
                    type="button"
                    key={status}
                    className={selected.status === status ? 'is-active' : ''}
                    disabled={updatingStatus}
                    onClick={() => updateStatus(status)}
                  >
                    {status === 'done' && <CheckCircle2 size={14} />}
                    {STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }) {
  return (
    <div className={`q-admin-feedback-kpi q-admin-feedback-kpi--${tone}`}>
      <span>{label}</span>
      <strong>{Number(value || 0).toLocaleString()}</strong>
    </div>
  );
}
