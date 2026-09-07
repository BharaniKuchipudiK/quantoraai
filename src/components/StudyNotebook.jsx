import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpenText,
  FileText,
  Maximize2,
  Minimize2,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  createStudyNotebookNote,
  deleteStudyNotebookNote,
  loadStudyNotebook,
  updateStudyNotebookNote,
} from '../lib/study-notebook-client.js';
import './study-notebook.css';

const NOTE_LIMIT = 200;
const ALL_NOTEBOOKS = 'all';
const ALL_SECTIONS = 'all';

function blankDraft(topic, subject = '', section = '') {
  return {
    id: null,
    subject: String(subject || '').trim().slice(0, 100),
    topic: String(section || topic || '').trim().slice(0, 200),
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

function updatedTime(note) {
  const value = new Date(note?.updatedAt || note?.createdAt || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function noteMatchesQuery(note, query) {
  if (!query) return true;
  return [note.subject, note.topic, note.title, note.body]
    .some((value) => String(value || '').toLowerCase().includes(query));
}

export default function StudyNotebook({
  topic,
  onClose,
  registerCloseGuard,
  expanded = false,
  onToggleExpanded,
}) {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState(() => blankDraft(topic));
  const [search, setSearch] = useState('');
  const [selectedNotebook, setSelectedNotebook] = useState(ALL_NOTEBOOKS);
  const [selectedSection, setSelectedSection] = useState(ALL_SECTIONS);
  const [saveState, setSaveState] = useState('idle');
  const lastSavedRef = useRef('');
  const draftRef = useRef(draft);
  const savePromiseRef = useRef(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const syncNavigationToNote = useCallback((note) => {
    setSelectedNotebook(String(note?.subject || '').trim() || ALL_NOTEBOOKS);
    setSelectedSection(String(note?.topic || '').trim() || ALL_SECTIONS);
  }, []);

  const load = async () => {
    setStatus('loading');
    setError('');
    try {
      const loaded = await loadStudyNotebook();
      const ordered = [...loaded].sort((a, b) => updatedTime(b) - updatedTime(a));
      setNotes(ordered);
      if (ordered.length > 0) {
        const first = draftFromNote(ordered[0]);
        setDraft(first);
        draftRef.current = first;
        lastSavedRef.current = signature(first);
        syncNavigationToNote(ordered[0]);
      } else {
        const empty = blankDraft(topic);
        setDraft(empty);
        draftRef.current = empty;
        lastSavedRef.current = signature(empty);
        setSelectedNotebook(ALL_NOTEBOOKS);
        setSelectedSection(ALL_SECTIONS);
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

  const flushPendingSave = useCallback(async () => {
    for (let pass = 0; pass < 3; pass += 1) {
      const current = draftRef.current;
      const currentSignature = signature(current);
      if (!current.id || currentSignature === lastSavedRef.current) return true;
      if (!current.subject.trim() || !current.title.trim()) {
        setSaveState('needs-fields');
        setError('Add a subject and title before leaving this page.');
        return false;
      }

      if (savePromiseRef.current) {
        try {
          await savePromiseRef.current;
        } catch {
          return false;
        }
        continue;
      }

      setSaveState('saving');
      setError('');
      const requestSignature = currentSignature;
      const request = updateStudyNotebookNote(current);
      savePromiseRef.current = request;
      try {
        const saved = await request;
        lastSavedRef.current = requestSignature;
        setNotes((existing) => [saved, ...existing.filter((note) => note.id !== saved.id)]);
        setSaveState(signature(draftRef.current) === requestSignature ? 'saved' : 'pending');
      } catch (saveError) {
        setError(saveError?.message || 'Your page could not be saved right now.');
        setSaveState('error');
        return false;
      } finally {
        if (savePromiseRef.current === request) savePromiseRef.current = null;
      }
    }
    return signature(draftRef.current) === lastSavedRef.current;
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
    const timer = window.setTimeout(() => {
      void flushPendingSave();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draft, status, flushPendingSave]);

  useEffect(() => {
    if (!registerCloseGuard) return undefined;
    return registerCloseGuard(flushPendingSave);
  }, [flushPendingSave, registerCloseGuard]);

  const notebooks = useMemo(() => {
    const counts = new Map();
    notes.forEach((note) => {
      const subject = String(note.subject || '').trim();
      if (!subject) return;
      counts.set(subject, (counts.get(subject) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [notes]);

  const sections = useMemo(() => {
    const source = selectedNotebook === ALL_NOTEBOOKS
      ? notes
      : notes.filter((note) => note.subject === selectedNotebook);
    const counts = new Map();
    source.forEach((note) => {
      const section = String(note.topic || '').trim();
      if (!section) return;
      counts.set(section, (counts.get(section) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [notes, selectedNotebook]);

  const visiblePages = useMemo(() => {
    const query = search.trim().toLowerCase();
    return notes
      .filter((note) => {
        if (selectedNotebook !== ALL_NOTEBOOKS && note.subject !== selectedNotebook) return false;
        if (selectedSection !== ALL_SECTIONS && note.topic !== selectedSection) return false;
        return noteMatchesQuery(note, query);
      })
      .sort((a, b) => updatedTime(b) - updatedTime(a));
  }, [notes, search, selectedNotebook, selectedSection]);

  const selectNote = async (note) => {
    if (!(await flushPendingSave())) return;
    const next = draftFromNote(note);
    setDraft(next);
    draftRef.current = next;
    lastSavedRef.current = signature(next);
    syncNavigationToNote(note);
    setSaveState('idle');
    setError('');
  };

  const selectNotebook = async (notebook) => {
    if (!(await flushPendingSave())) return;
    setSelectedNotebook(notebook);
    setSelectedSection(ALL_SECTIONS);
    setSearch('');
    const candidate = notebook === ALL_NOTEBOOKS
      ? notes[0]
      : notes.find((note) => note.subject === notebook);
    if (candidate) {
      const next = draftFromNote(candidate);
      setDraft(next);
      draftRef.current = next;
      lastSavedRef.current = signature(next);
      setSaveState('idle');
    }
    setError('');
  };

  const selectSection = async (section) => {
    if (!(await flushPendingSave())) return;
    setSelectedSection(section);
    setSearch('');
    const candidate = notes.find((note) => {
      if (selectedNotebook !== ALL_NOTEBOOKS && note.subject !== selectedNotebook) return false;
      return section === ALL_SECTIONS || note.topic === section;
    });
    if (candidate) {
      const next = draftFromNote(candidate);
      setDraft(next);
      draftRef.current = next;
      lastSavedRef.current = signature(next);
      setSaveState('idle');
    }
    setError('');
  };

  const startNew = async () => {
    if (notes.length >= NOTE_LIMIT) {
      setError(`Notebook supports up to ${NOTE_LIMIT} pages. Delete an older page before creating another.`);
      return;
    }
    if (!(await flushPendingSave())) return;
    const subject = selectedNotebook === ALL_NOTEBOOKS ? '' : selectedNotebook;
    const section = selectedSection === ALL_SECTIONS ? '' : selectedSection;
    const next = blankDraft(topic, subject, section);
    setDraft(next);
    draftRef.current = next;
    lastSavedRef.current = signature(next);
    setSaveState('idle');
    setError('');
  };

  const createNote = async () => {
    if (!draft.subject.trim() || !draft.title.trim()) return;
    if (notes.length >= NOTE_LIMIT) {
      setError(`Notebook supports up to ${NOTE_LIMIT} pages. Delete an older page before creating another.`);
      return;
    }
    setSaveState('saving');
    setError('');
    try {
      const created = await createStudyNotebookNote(draft);
      const next = draftFromNote(created);
      setNotes((current) => [created, ...current]);
      setDraft(next);
      draftRef.current = next;
      lastSavedRef.current = signature(next);
      syncNavigationToNote(created);
      setSaveState('saved');
    } catch (createError) {
      setError(createError?.message || 'Your page could not be created right now.');
      setSaveState('error');
    }
  };

  const removeNote = async () => {
    if (!draft.id) {
      await startNew();
      return;
    }
    if (!window.confirm('Delete this page?')) return;
    setSaveState('saving');
    setError('');
    try {
      await deleteStudyNotebookNote(draft.id);
      const remaining = notes.filter((note) => note.id !== draft.id);
      setNotes(remaining);
      if (remaining.length > 0) {
        const nextNote = remaining[0];
        const next = draftFromNote(nextNote);
        setDraft(next);
        draftRef.current = next;
        lastSavedRef.current = signature(next);
        syncNavigationToNote(nextNote);
        setSaveState('idle');
      } else {
        const next = blankDraft(topic);
        setDraft(next);
        draftRef.current = next;
        lastSavedRef.current = signature(next);
        setSelectedNotebook(ALL_NOTEBOOKS);
        setSelectedSection(ALL_SECTIONS);
        setSaveState('idle');
      }
    } catch (deleteError) {
      setError(deleteError?.message || 'Your page could not be deleted right now.');
      setSaveState('error');
    }
  };

  const leaveNotebook = async () => {
    if (await flushPendingSave()) onClose?.();
  };

  const atNoteLimit = notes.length >= NOTE_LIMIT;
  const currentNotebookLabel = selectedNotebook === ALL_NOTEBOOKS ? 'All notebooks' : selectedNotebook;
  const currentSectionLabel = selectedSection === ALL_SECTIONS ? 'All sections' : selectedSection;

  return (
    <section
      className="study-h1-notebook"
      aria-labelledby="quantora-study-notebook-title"
      data-quantora-study-notebook="true"
      data-quantora-study-notebook-expanded={expanded ? 'true' : 'false'}
    >
      <div className="study-h1-notebook__header">
        <div className="study-h1-notebook__heading">
          <div id="quantora-study-notebook-title" className="study-h1-hub__title">Notebook</div>
          <div className="study-h1-hub__topic">Notebooks → sections → pages · private to your Study workspace</div>
        </div>
        <div className="study-h1-notebook__header-actions">
          {onToggleExpanded ? (
            <button
              type="button"
              className="study-h1-icon-button"
              aria-label={expanded ? 'Collapse Notebook workspace' : 'Expand Notebook workspace'}
              title={expanded ? 'Collapse workspace' : 'Expand workspace'}
              onClick={onToggleExpanded}
            >
              {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          ) : null}
          <button type="button" className="study-h1-icon-button" aria-label="Back to Study tools" onClick={() => void leaveNotebook()}>
            <ArrowLeft size={16} />
          </button>
        </div>
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
          <aside className="study-h1-notebook__notebooks" aria-label="Notebooks">
            <div className="study-h1-notebook__rail-title">Notebooks</div>
            <button
              type="button"
              className="study-h1-notebook__nav-item"
              aria-current={selectedNotebook === ALL_NOTEBOOKS ? 'true' : undefined}
              onClick={() => void selectNotebook(ALL_NOTEBOOKS)}
            >
              <BookOpenText size={14} aria-hidden="true" />
              <span>All notes</span>
              <small>{notes.length}</small>
            </button>
            <div className="study-h1-notebook__notebook-list">
              {notebooks.map((notebook) => (
                <button
                  type="button"
                  key={notebook.name}
                  className="study-h1-notebook__nav-item"
                  aria-current={selectedNotebook === notebook.name ? 'true' : undefined}
                  onClick={() => void selectNotebook(notebook.name)}
                >
                  <span className="study-h1-notebook__notebook-mark" aria-hidden="true" />
                  <span>{notebook.name}</span>
                  <small>{notebook.count}</small>
                </button>
              ))}
            </div>
            <div className="study-h1-notebook__truth">Personal notes do not change mastery.</div>
          </aside>

          <aside className="study-h1-notebook__pages" aria-label="Sections and pages">
            <div className="study-h1-notebook__pages-head">
              <div>
                <div className="study-h1-notebook__rail-title">{currentNotebookLabel}</div>
                <div className="study-h1-notebook__rail-subtitle">{currentSectionLabel}</div>
              </div>
              <button
                type="button"
                className="study-h1-icon-button"
                aria-label="New note"
                title="New page"
                onClick={() => void startNew()}
                disabled={atNoteLimit}
              >
                <Plus size={15} />
              </button>
            </div>

            {atNoteLimit ? <div className="study-h1-notebook__limit" role="status">{NOTE_LIMIT} page limit reached.</div> : null}

            <label className="study-h1-notebook__search">
              <Search size={14} aria-hidden="true" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes" aria-label="Search notes" />
            </label>

            <div className="study-h1-notebook__section-strip" aria-label="Sections">
              <button
                type="button"
                className="study-h1-notebook__section"
                aria-pressed={selectedSection === ALL_SECTIONS}
                onClick={() => void selectSection(ALL_SECTIONS)}
              >
                All
              </button>
              {sections.map((section) => (
                <button
                  type="button"
                  key={section.name}
                  className="study-h1-notebook__section"
                  aria-pressed={selectedSection === section.name}
                  onClick={() => void selectSection(section.name)}
                  title={`${section.count} ${section.count === 1 ? 'page' : 'pages'}`}
                >
                  {section.name}
                </button>
              ))}
            </div>

            <div className="study-h1-notebook__notes">
              {visiblePages.map((note) => (
                <button
                  type="button"
                  key={note.id}
                  className="study-h1-notebook__note"
                  aria-current={draft.id === note.id ? 'true' : undefined}
                  onClick={() => void selectNote(note)}
                >
                  <span className="study-h1-notebook__page-icon" aria-hidden="true"><FileText size={13} /></span>
                  <span className="study-h1-notebook__page-copy">
                    <strong>{note.title}</strong>
                    <span>{note.topic || 'Unsectioned'}</span>
                  </span>
                  <small>{formatUpdated(note.updatedAt)}</small>
                </button>
              ))}
              {visiblePages.length === 0 && notes.length > 0 ? <div className="study-h1-notebook__empty">No matching pages.</div> : null}
              {notes.length === 0 ? <div className="study-h1-notebook__empty">Create your first page to start this notebook.</div> : null}
            </div>
          </aside>

          <main className="study-h1-notebook__editor">
            <div className="study-h1-notebook__editor-head">
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value.slice(0, 200) }))}
                placeholder="Untitled page"
                aria-label="Note title"
              />
              <div className="study-h1-notebook__context-fields">
                <label>
                  <span>Notebook</span>
                  <input
                    value={draft.subject}
                    onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value.slice(0, 100) }))}
                    placeholder="Subject"
                    aria-label="Note subject"
                  />
                </label>
                <label>
                  <span>Section</span>
                  <input
                    value={draft.topic}
                    onChange={(event) => setDraft((current) => ({ ...current, topic: event.target.value.slice(0, 200) }))}
                    placeholder="Topic (optional)"
                    aria-label="Note topic"
                  />
                </label>
              </div>
            </div>

            <textarea
              value={draft.body}
              onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value.slice(0, 20_000) }))}
              placeholder="Write your Study notes here…"
              aria-label="Note body"
            />

            <div className="study-h1-notebook__footer">
              <div className="study-h1-notebook__page-meta">
                <span>{draft.body.length.toLocaleString()} / 20,000 characters</span>
                <span className="study-h1-notebook__save" role="status">
                  {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Not saved' : saveState === 'needs-fields' ? 'Add notebook and title' : ''}
                </span>
              </div>
              <div className="study-h1-notebook__actions">
                {draft.id ? (
                  <button type="button" className="study-h1-icon-button" aria-label="Delete note" onClick={removeNote}><Trash2 size={15} /></button>
                ) : (
                  <button type="button" className="study-h1-action study-h1-action--primary" disabled={!draft.subject.trim() || !draft.title.trim() || saveState === 'saving' || atNoteLimit} onClick={createNote}>Create note</button>
                )}
              </div>
            </div>
            {error && status === 'ready' ? <div className="study-h1-notebook__error" role="alert">{error}</div> : null}
          </main>
        </div>
      ) : null}
    </section>
  );
}