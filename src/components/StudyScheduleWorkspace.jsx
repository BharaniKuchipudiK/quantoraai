import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  createStudyScheduleBlock,
  deleteStudyScheduleBlock,
  loadStudySchedule,
  updateStudyScheduleBlock,
} from '../lib/study-schedule-client.js';
import './study-schedule.css';

const DAY_MS = 24 * 60 * 60 * 1000;
const DURATION_CHOICES = [30, 45, 60, 90, 120];

function startOfWeek(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return date;
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function dateKey(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timeValue(value) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function combineLocal(dateText, timeText) {
  const [year, month, day] = String(dateText || '').split('-').map(Number);
  const [hours, minutes] = String(timeText || '').split(':').map(Number);
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function minutesBetween(start, end) {
  const duration = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
  return Number.isFinite(duration) && duration > 0 ? duration : 60;
}

function emptyDraft(defaultSubject = '', defaultTopic = '', date = new Date()) {
  const start = new Date(date);
  start.setMinutes(0, 0, 0);
  if (start.getTime() <= Date.now()) start.setHours(start.getHours() + 1);
  return {
    id: null,
    subject: String(defaultSubject || '').trim().slice(0, 100),
    topic: String(defaultTopic || '').trim().slice(0, 200),
    title: '',
    date: dateKey(start),
    startTime: timeValue(start),
    duration: 60,
    kind: 'study',
    status: 'planned',
    notes: '',
  };
}

function draftFromBlock(block) {
  return {
    id: block.id,
    subject: block.subject || '',
    topic: block.topic || '',
    title: block.title || '',
    date: dateKey(block.startsAt),
    startTime: timeValue(block.startsAt),
    duration: minutesBetween(block.startsAt, block.endsAt),
    kind: block.kind || 'study',
    status: block.status || 'planned',
    notes: block.notes || '',
  };
}

function payloadFromDraft(draft) {
  const startsAt = combineLocal(draft.date, draft.startTime);
  if (!startsAt) return null;
  const duration = Math.max(15, Math.min(24 * 60, Number(draft.duration) || 60));
  const endsAt = new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString();
  return {
    ...(draft.id ? { id: draft.id } : {}),
    subject: String(draft.subject || '').trim(),
    topic: String(draft.topic || '').trim(),
    title: String(draft.title || '').trim(),
    startsAt,
    endsAt,
    kind: draft.kind,
    status: draft.status,
    notes: String(draft.notes || ''),
  };
}

function dayLabel(date) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

function weekLabel(start) {
  const end = addDays(start, 6);
  const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  return `${formatter.format(start)} – ${formatter.format(end)}, ${end.getFullYear()}`;
}

function blockTime(block) {
  const formatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${formatter.format(new Date(block.startsAt))} – ${formatter.format(new Date(block.endsAt))}`;
}

function kindLabel(kind) {
  if (kind === 'exam') return 'Exam';
  if (kind === 'deadline') return 'Deadline';
  return 'Study';
}

export default function StudyScheduleWorkspace({ defaultSubject = '', defaultTopic = '', onClose }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek());
  const [blocks, setBlocks] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(() => emptyDraft(defaultSubject, defaultTopic));
  const [saving, setSaving] = useState(false);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const newBlockDay = useMemo(() => {
    const now = new Date();
    return now >= weekStart && now < weekEnd ? now : weekStart;
  }, [weekEnd, weekStart]);

  const blocksByDay = useMemo(() => {
    const grouped = new Map(days.map((day) => [dateKey(day), []]));
    blocks.forEach((block) => {
      const key = dateKey(block.startsAt);
      if (grouped.has(key)) grouped.get(key).push(block);
    });
    grouped.forEach((entries) => entries.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)));
    return grouped;
  }, [blocks, days]);

  const load = async () => {
    setStatus('loading');
    setError('');
    try {
      const loaded = await loadStudySchedule({ from: weekStart.toISOString(), to: weekEnd.toISOString() });
      setBlocks(loaded);
      setStatus('ready');
    } catch (loadError) {
      setError(loadError?.message || 'Your Study schedule is unavailable right now.');
      setStatus('error');
    }
  };

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError('');
    loadStudySchedule({ from: weekStart.toISOString(), to: weekEnd.toISOString() })
      .then((loaded) => {
        if (!active) return;
        setBlocks(loaded);
        setStatus('ready');
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError?.message || 'Your Study schedule is unavailable right now.');
        setStatus('error');
      });
    return () => { active = false; };
  }, [weekStart, weekEnd]);

  const startNew = (day = new Date()) => {
    setDraft(emptyDraft(defaultSubject, defaultTopic, day));
    setError('');
    setEditorOpen(true);
  };

  const editBlock = (block) => {
    setDraft(draftFromBlock(block));
    setError('');
    setEditorOpen(true);
  };

  const saveDraft = async () => {
    const payload = payloadFromDraft(draft);
    if (!payload?.subject || !payload?.title) {
      setError('Add a subject and title before saving this study block.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = draft.id
        ? await updateStudyScheduleBlock(payload)
        : await createStudyScheduleBlock(payload);
      setBlocks((current) => [saved, ...current.filter((block) => block.id !== saved.id)]);
      setEditorOpen(false);
      setDraft(emptyDraft(defaultSubject, defaultTopic));
    } catch (saveError) {
      setError(saveError?.message || 'Your study block could not be saved right now.');
    } finally {
      setSaving(false);
    }
  };

  const removeBlock = async () => {
    if (!draft.id || !window.confirm('Delete this study block?')) return;
    setSaving(true);
    setError('');
    try {
      await deleteStudyScheduleBlock(draft.id);
      setBlocks((current) => current.filter((block) => block.id !== draft.id));
      setEditorOpen(false);
      setDraft(emptyDraft(defaultSubject, defaultTopic));
    } catch (deleteError) {
      setError(deleteError?.message || 'Your study block could not be deleted right now.');
    } finally {
      setSaving(false);
    }
  };

  const toggleComplete = async (block) => {
    const nextStatus = block.status === 'completed' ? 'planned' : 'completed';
    setError('');
    try {
      const saved = await updateStudyScheduleBlock({ ...block, status: nextStatus });
      setBlocks((current) => current.map((entry) => entry.id === saved.id ? saved : entry));
    } catch (updateError) {
      setError(updateError?.message || 'That study block could not be updated right now.');
    }
  };

  const moveWeek = (daysToMove) => {
    setEditorOpen(false);
    setWeekStart((current) => addDays(current, daysToMove));
  };

  return (
    <div className="study-schedule-backdrop" data-quantora-study-schedule="true">
      <section
        className="study-schedule-workspace"
        role="dialog"
        aria-modal="true"
        aria-labelledby="study-schedule-title"
        style={{
          height: 'min(850px, calc(100vh - 44px))',
          minHeight: 'min(560px, calc(100vh - 44px))',
          maxHeight: 'calc(100vh - 44px)',
          overflowY: 'auto',
        }}
      >
        <header className="study-schedule-header">
          <div>
            <span className="study-schedule-eyebrow">Planning workspace</span>
            <h1 id="study-schedule-title">Study Schedule</h1>
            <p>Plan the work. Completing a schedule block does not change mastery.</p>
          </div>
          <button type="button" className="study-h1-icon-button" aria-label="Close Study Schedule" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        <div className="study-schedule-toolbar">
          <div className="study-schedule-week-nav" aria-label="Week navigation">
            <button type="button" className="study-h1-icon-button" aria-label="Previous week" onClick={() => moveWeek(-7)}><ChevronLeft size={16} /></button>
            <button type="button" className="study-h1-action" onClick={() => { setEditorOpen(false); setWeekStart(startOfWeek()); }}>Today</button>
            <button type="button" className="study-h1-icon-button" aria-label="Next week" onClick={() => moveWeek(7)}><ChevronRight size={16} /></button>
            <strong>{weekLabel(weekStart)}</strong>
          </div>
          <button type="button" className="study-h1-action study-h1-action--primary" onClick={() => startNew(newBlockDay)}>
            <Plus size={14} aria-hidden="true" /> Add study block
          </button>
        </div>

        {error ? <div className="study-schedule-error" role="alert">{error}</div> : null}

        {status === 'loading' ? (
          <div className="study-schedule-state" role="status"><CalendarDays size={19} /> Loading your week…</div>
        ) : null}

        {status === 'error' ? (
          <div className="study-schedule-state">
            <CalendarDays size={19} aria-hidden="true" />
            <span>Your schedule could not be loaded.</span>
            <button type="button" className="study-h1-action" onClick={() => void load()}><RotateCcw size={14} /> Retry</button>
          </div>
        ) : null}

        {status === 'ready' ? (
          <div className={`study-schedule-content${editorOpen ? ' study-schedule-content--editing' : ''}`}>
            <div className="study-schedule-week" aria-label="Weekly Study Schedule">
              {days.map((day) => {
                const key = dateKey(day);
                const entries = blocksByDay.get(key) || [];
                const today = key === dateKey(new Date());
                return (
                  <section key={key} className={`study-schedule-day${today ? ' study-schedule-day--today' : ''}`} data-study-schedule-day={key}>
                    <div className="study-schedule-day__head">
                      <div>
                        <span>{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day)}</span>
                        <strong>{day.getDate()}</strong>
                      </div>
                      <button type="button" className="study-schedule-day__add" aria-label={`Add study block on ${dayLabel(day)}`} onClick={() => startNew(day)}><Plus size={13} /></button>
                    </div>
                    <div className="study-schedule-day__blocks">
                      {entries.map((block) => (
                        <article
                          key={block.id}
                          className={`study-schedule-block study-schedule-block--${block.kind}${block.status === 'completed' ? ' study-schedule-block--completed' : ''}`}
                          data-study-schedule-block={block.id}
                        >
                          <div className="study-schedule-block__topline">
                            <span>{kindLabel(block.kind)}</span>
                            <button type="button" aria-label={block.status === 'completed' ? 'Mark planned' : 'Mark complete'} onClick={() => void toggleComplete(block)}>
                              {block.status === 'completed' ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                            </button>
                          </div>
                          <strong>{block.title}</strong>
                          <span className="study-schedule-block__subject">{block.subject}{block.topic ? ` · ${block.topic}` : ''}</span>
                          <span className="study-schedule-block__time"><Clock3 size={12} aria-hidden="true" /> {blockTime(block)}</span>
                          <button type="button" className="study-schedule-block__edit" aria-label={`Edit ${block.title}`} onClick={() => editBlock(block)}><Pencil size={12} /> Edit</button>
                        </article>
                      ))}
                      {entries.length === 0 ? <button type="button" className="study-schedule-day__empty" onClick={() => startNew(day)}>Plan this day</button> : null}
                    </div>
                  </section>
                );
              })}
            </div>

            {editorOpen ? (
              <aside className="study-schedule-editor" aria-label={draft.id ? 'Edit study block' : 'New study block'}>
                <div className="study-schedule-editor__header">
                  <div>
                    <span className="study-schedule-eyebrow">{draft.id ? 'Edit block' : 'New block'}</span>
                    <h2>{draft.id ? 'Update your plan' : 'Plan study time'}</h2>
                  </div>
                  <button type="button" className="study-h1-icon-button" aria-label="Close editor" onClick={() => setEditorOpen(false)}><X size={15} /></button>
                </div>

                <label className="study-schedule-field">
                  <span>Title</span>
                  <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value.slice(0, 200) }))} placeholder="e.g. Newton laws practice" />
                </label>

                <div className="study-schedule-field-grid">
                  <label className="study-schedule-field">
                    <span>Subject</span>
                    <input value={draft.subject} onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value.slice(0, 100) }))} placeholder="Physics" />
                  </label>
                  <label className="study-schedule-field">
                    <span>Topic</span>
                    <input value={draft.topic} onChange={(event) => setDraft((current) => ({ ...current, topic: event.target.value.slice(0, 200) }))} placeholder="Optional" />
                  </label>
                </div>

                <div className="study-schedule-field-grid study-schedule-field-grid--three">
                  <label className="study-schedule-field">
                    <span>Date</span>
                    <input type="date" value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} />
                  </label>
                  <label className="study-schedule-field">
                    <span>Start</span>
                    <input type="time" value={draft.startTime} onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))} />
                  </label>
                  <label className="study-schedule-field">
                    <span>Duration</span>
                    <select value={draft.duration} onChange={(event) => setDraft((current) => ({ ...current, duration: Number(event.target.value) }))}>
                      {DURATION_CHOICES.map((minutes) => <option key={minutes} value={minutes}>{minutes < 60 ? `${minutes} min` : `${minutes / 60} hr${minutes > 60 ? 's' : ''}`}</option>)}
                    </select>
                  </label>
                </div>

                <fieldset className="study-schedule-kinds">
                  <legend>Type</legend>
                  {[
                    ['study', 'Study'],
                    ['exam', 'Exam'],
                    ['deadline', 'Deadline'],
                  ].map(([value, label]) => (
                    <button key={value} type="button" aria-pressed={draft.kind === value} onClick={() => setDraft((current) => ({ ...current, kind: value }))}>{label}</button>
                  ))}
                </fieldset>

                <label className="study-schedule-field study-schedule-field--notes">
                  <span>Notes</span>
                  <textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value.slice(0, 2_000) }))} placeholder="Optional preparation note" />
                </label>

                <div className="study-schedule-editor__truth">
                  <Check size={13} aria-hidden="true" /> Marking this complete records planning progress only. It never creates mastery evidence.
                </div>

                <div className="study-schedule-editor__actions">
                  {draft.id ? (
                    <button type="button" className="study-h1-action" disabled={saving} onClick={() => void removeBlock()}><Trash2 size={14} /> Delete</button>
                  ) : <span />}
                  <button type="button" className="study-h1-action study-h1-action--primary" disabled={saving || !draft.subject.trim() || !draft.title.trim()} onClick={() => void saveDraft()}>
                    {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Add to schedule'}
                  </button>
                </div>
              </aside>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
