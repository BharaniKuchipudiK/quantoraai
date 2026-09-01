import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpenText, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import {
  createStudyNotebookNote,
  deleteStudyNotebookNote,
  loadStudyNotebook,
  updateStudyNotebookNote,
} from '../lib/study-notebook-client.js';
import './study-notebook.css';

function blankDraft(topic) {
  return {
    id: null,
    subject: '',
    topic: String(topic || '').trim().slice(0, 200),
    title: '',
    body: '',
  };
}

function draftFromNote(note) {
  return {
    id: note.id,
    subject: note.subject || '',
    topic: note.topic || '',
    title: note.title || '',
    body: note.body || '',
  };
}

function signature(note) {
  return JSON.stringify({
    subject: String(note?.subject || '').trim(),
    topic: String(note?.topic || '').trim(),
    title: String(note?.title || '').trim(),
    body: String(note?.body || ''),
  });
}

function formatUpdated(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

export default function StudyNotebook({ topic, onClose }) {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState(() => blankDraft(topic));
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [saveState, setSaveState] = useState('idle');
  const lastSavedRef = useRef('');

  const load = async () => {
    setStatus('loading');
    setError('');
    try {
      const loaded = await loadStudyNotebook();
      setNotes(loaded);
      if (loaded.length > 0) {
        const first = draftFromNote(loaded[0]);
        setDraft(first);
        lastSavedRef.current = signature(first);
      } else {
        const empty = blankDraft(topic);
        setDraft(empty);
        lastSavedRef.current = signature(empty);
      }
      setStatus('ready');
    } catch (loadError) {
      setError(loadError?.message || 'Your Notebook is unavailable right now.');
      setStatus('error');
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (status !== 'ready' || !draft.id) return undefined;
    const nextSignature = signature(draft);
    if (nextSignature === lastSavedRef.current) return undefined;
    if (!draft.subject.trim() || !draft.title.trim()) {
      setSaveState('needs-fields');
      return undefined;
    }

    setSaveState('pending');
    const timer = window.setTimeout(async () => {
      const requestSignature = signature(draft);
      setSaveState('saving');
      try {
        const saved = await updateStudyNotebookNote(draft);
        lastSavedRef.current = requestSignature;
        setNotes((current) => [saved, ...current.filter((note) => note.id !== saved.id)]);
        setSaveState(signature(draft) === requestSignature ? 'saved' : 'pending');
      } catch (saveError) {
        setError(saveError?.message || 'Your note could not be saved right now.');
        setSaveState('error');
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draft, status]);

  const subjects = useMemo(
    () => [...new Set(notes.map((note) => String(note.subject || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [notes],
  );

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return notes.filter((note) => {
      if (subjectFilter !== 'all' && note.subject !== subjectFilter) return false;
      if (!query) return true;
      return [note.subject, note.topic, note.title, note.body]
        .some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [notes, search, subjectFilter]);

  const selectNote = (note) => {
    const next = draftFromNote(note);
    setDraft(next);
    lastSavedRef.current = signature(next);
    setSaveState('idle');
    setError('');
  };

  const startNew = () => {
    const next = blankDraft(topic);
    setDraft(next);
    lastSavedRef.current = signature(next);
    setSaveState('idle');
    setError('');
  };

  const createNote = async () => {
    if (!draft.subject.trim() || !draft.title.trim()) return;
    setSaveState('saving');
    setError('');
    try {
      const created = await createStudyNotebookNote(draft);
      const next = draftFromNote(created);
      setNotes((current) => [created, ...current]);
      setDraft(next);
      lastSavedRef.current = signature(next);
      setSaveState('saved');
    } catch (createError) {
      setError(createError?.message || 'Your note could not be created right now.');
      setSaveState('error');
    }
  };

  const removeNote = async () => {
    if (!draft.id) {
      startNew();
      return;
    }
    if (!window.confirm('Delete this note?')) return;
    setSaveState('saving');
    setError('');
    try {
      await deleteStudyNotebookNote(draft.id);
      const remaining = notes.filter((note) => note.id !== draft.id);
      setNotes(remaining);
      if (remaining.length > 0) selectNote(remaining[0]);
      else startNew();
    } catch (deleteError) {
      setError(deleteError?.message || 'Your note could not be deleted right now.');
      setSaveState('error');
    }
  };

  return (
    <section className="study-h1-notebook" aria-labelledby="quantora-study-notebook-title" data-quantora-study-notebook="true">
      <div className="study-h1-hub__header">
        <div style={{ minWidth: 0 }}>
          <div id="quantora-study-notebook-title" className="study-h1-hub__title">Notebook</div>
          <div className="study-h1-hub__topic">Your private Study notes</div>
        </div>
        <button type="button" className="study-h1-icon-button" aria-label="Back to Study tools" onClick={onClose}>
          <ArrowLeft size={16} />
        </button>
      </div>

      {status === 'loading' ? (
        <div className="study-h1-notebook__state" role="status">Loading your notes…</div>
      ) : null}

      {status === 'error' ? (
        <div className="study-h1-notebook__state" role="alert">
          <BookOpenText size={18} aria-hidden="true" />
          <div><strong>Notebook is unavailable right now.</strong><span>{error}</span></div>
          <button type="button" className="study-h1-action" onClick={load}><RotateCcw size={14} /> Retry</button>
        </div>
      ) : null}

      {status === 'ready' ? (
        <div className="study-h1-notebook__workspace">
          <aside className="study-h1-notebook__rail" aria-label="Your notes">
            <button type="button" className="study-h1-action study-h1-notebook__new" onClick={startNew}>
              <Plus size={14} aria-hidden="true" /> New note
            </button>
            <label className="study-h1-notebook__search">
              <Search size={14} aria-hidden="true" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes" aria-label="Search notes" />
            </label>
            {subjects.length > 1 ? (
              <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} aria-label="Filter notes by subject">
                <option value="all">All subjects</option>
                {subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
              </select>
            ) : null}
            <div className="study-h1-notebook__notes">
              {filteredNotes.map((note) => (
                <button
                  type="button"
                  key={note.id}
                  className="study-h1-notebook__note"
                  aria-current={draft.id === note.id ? 'true' : undefined}
                  onClick={() => selectNote(note)}
                >
                  <strong>{note.title}</strong>
                  <span>{note.subject}{note.topic ? ` · ${note.topic}` : ''}</span>
                  <small>{formatUpdated(note.updatedAt)}</small>
                </button>
              ))}
              {filteredNotes.length === 0 && notes.length > 0 ? <div className="study-h1-notebook__empty">No matching notes.</div> : null}
            </div>
          </aside>

          <div className="study-h1-notebook__editor">
            <div className="study-h1-notebook__fields">
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value.slice(0, 200) }))}
                placeholder="Note title"
                aria-label="Note title"
              />
              <div className="study-h1-notebook__context-fields">
                <input
                  value={draft.subject}
                  onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value.slice(0, 100) }))}
                  placeholder="Subject"
                  aria-label="Note subject"
                />
                <input
                  value={draft.topic}
                  onChange={(event) => setDraft((current) => ({ ...current, topic: event.target.value.slice(0, 200) }))}
                  placeholder="Topic (optional)"
                  aria-label="Note topic"
                />
              </div>
            </div>
            <textarea
              value={draft.body}
              onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value.slice(0, 20_000) }))}
              placeholder="Write your own notes here…"
              aria-label="Note body"
            />
            <div className="study-h1-notebook__footer">
              <span className="study-h1-notebook__truth">Personal notes do not change mastery.</span>
              <div className="study-h1-notebook__actions">
                <span className="study-h1-notebook__save" role="status">
                  {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Not saved' : saveState === 'needs-fields' ? 'Add subject and title' : ''}
                </span>
                {draft.id ? (
                  <button type="button" className="study-h1-icon-button" aria-label="Delete note" onClick={removeNote}><Trash2 size={15} /></button>
                ) : (
                  <button type="button" className="study-h1-action study-h1-action--primary" disabled={!draft.subject.trim() || !draft.title.trim() || saveState === 'saving'} onClick={createNote}>Create note</button>
                )}
              </div>
            </div>
            {error && status === 'ready' ? <div className="study-h1-notebook__error" role="alert">{error}</div> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
