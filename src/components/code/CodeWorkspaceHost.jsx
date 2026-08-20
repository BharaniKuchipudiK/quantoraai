import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Braces,
  CheckCircle2,
  ChevronRight,
  Code2,
  FileCode2,
  FilePlus2,
  FolderOpen,
  Play,
  RefreshCw,
  Sparkles,
  TerminalSquare,
  Trash2,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import LivePreviewCanvas from '../LivePreviewCanvas.jsx';
import MonacoSurface from './MonacoSurface.jsx';

const STORAGE_KEY = 'quantora_code_workspace_v1';

const STARTER_FILES = {
  'index.html': {
    language: 'html',
    content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Quantora Code</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #070b16;
      color: #f8fafc;
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    }
    .card {
      width: min(760px, calc(100vw - 48px));
      padding: 42px;
      border: 1px solid rgba(148, 163, 184, .22);
      border-radius: 28px;
      background: radial-gradient(circle at 20% 0%, rgba(249,115,22,.18), transparent 34%), #0f172a;
      box-shadow: 0 32px 80px rgba(0,0,0,.38);
    }
    .eyebrow { color: #fb923c; font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 12px 0 10px; font-size: clamp(38px, 7vw, 72px); line-height: .95; letter-spacing: -.055em; }
    p { margin: 0; max-width: 560px; color: #94a3b8; font-size: 18px; line-height: 1.65; }
    .orb {
      width: 72px; height: 72px; margin-top: 28px; border-radius: 50%;
      background: linear-gradient(135deg, #f97316, #ec4899);
      box-shadow: 0 0 50px rgba(249,115,22,.38);
      animation: float 2.6s ease-in-out infinite;
    }
    @keyframes float { 50% { transform: translateY(-12px) rotate(8deg); } }
  </style>
</head>
<body>
  <main class="card">
    <div class="eyebrow">Quantora Code</div>
    <h1>Build something.</h1>
    <p>Write real code, run it, break it, repair it and understand what changed.</p>
    <div class="orb" aria-label="animated preview"></div>
  </main>
</body>
</html>`,
  },
  'README.md': {
    language: 'markdown',
    content: `# Quantora Code starter

Describe what you want to build in the Quantora panel. PCL will infer the project's purpose, objective, architecture and runtime needs before an agent changes the code.
`,
  },
};

function restoreWorkspace() {
  if (typeof window === 'undefined') return { files: STARTER_FILES, projectPrompt: '' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { files: STARTER_FILES, projectPrompt: '' };
    const parsed = JSON.parse(raw);
    if (!parsed?.files || typeof parsed.files !== 'object') throw new Error('invalid');
    return { files: parsed.files, projectPrompt: String(parsed.projectPrompt || '') };
  } catch {
    return { files: STARTER_FILES, projectPrompt: '' };
  }
}

function languageForPath(path = '') {
  const lower = path.toLowerCase();
  if (lower.endsWith('.html')) return 'html';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.tsx') || lower.endsWith('.ts')) return 'typescript';
  if (lower.endsWith('.jsx') || lower.endsWith('.js')) return 'javascript';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md')) return 'markdown';
  return 'plaintext';
}

function filePayload(files) {
  return Object.entries(files).map(([path, file]) => ({ path, content: file.content || '', language: file.language || languageForPath(path) }));
}

function previewEntry(files, selectedPath) {
  if (files['index.html']) return files['index.html'].content;
  if (files['presentation.html']) return files['presentation.html'].content;
  return files[selectedPath]?.content || '';
}

function diagnosticKey(diagnostic) {
  return `${diagnostic.source || 'unknown'}:${diagnostic.path || ''}:${diagnostic.line || 0}:${diagnostic.column || 0}:${diagnostic.message}`;
}

function compactDiagnostics(items) {
  const map = new Map();
  for (const item of items) map.set(diagnosticKey(item), item);
  return [...map.values()];
}

function runtimeLabel(runtime) {
  if (!runtime?.preferred) return 'Understanding runtime…';
  if (runtime.preferred.tier === 'browser') return 'Browser runtime';
  if (runtime.preferred.tier === 'sandbox') return 'Isolated Linux sandbox';
  return 'GPU render worker';
}

export default function CodeWorkspaceHost() {
  const restoredRef = useRef(restoreWorkspace());
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState(restoredRef.current.files);
  const [selectedPath, setSelectedPath] = useState(Object.keys(restoredRef.current.files)[0] || 'index.html');
  const [projectPrompt, setProjectPrompt] = useState(restoredRef.current.projectPrompt);
  const [promptDraft, setPromptDraft] = useState(restoredRef.current.projectPrompt);
  const [cognition, setCognition] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [repairPolicy, setRepairPolicy] = useState(null);
  const [cognitionBusy, setCognitionBusy] = useState(false);
  const [editorDiagnostics, setEditorDiagnostics] = useState({});
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState([]);
  const [previewStatus, setPreviewStatus] = useState('idle');
  const [activity, setActivity] = useState([{ id: 1, kind: 'info', text: 'Workspace ready. Describe what you want to build.' }]);
  const [autoHeal, setAutoHeal] = useState(true);
  const [repairBusy, setRepairBusy] = useState(false);
  const [pendingPatch, setPendingPatch] = useState(null);
  const [bottomTab, setBottomTab] = useState('problems');
  const lastAutoRepairRef = useRef('');

  const selectedFile = files[selectedPath] || { content: '', language: languageForPath(selectedPath) };
  const allDiagnostics = useMemo(() => compactDiagnostics([
    ...Object.values(editorDiagnostics).flat(),
    ...runtimeDiagnostics,
  ]), [editorDiagnostics, runtimeDiagnostics]);
  const errorCount = allDiagnostics.filter((item) => item.severity === 'error').length;

  const appendActivity = useCallback((text, kind = 'info') => {
    setActivity((previous) => [...previous.slice(-29), { id: Date.now() + Math.random(), text, kind }]);
  }, []);

  useEffect(() => {
    const openWorkspace = (event) => {
      setOpen(true);
      if (event?.detail?.prompt) {
        setProjectPrompt(String(event.detail.prompt));
        setPromptDraft(String(event.detail.prompt));
      }
    };
    const closeWorkspace = () => setOpen(false);
    window.addEventListener('quantora:open-code-workspace', openWorkspace);
    window.addEventListener('quantora:close-code-workspace', closeWorkspace);
    return () => {
      window.removeEventListener('quantora:open-code-workspace', openWorkspace);
      window.removeEventListener('quantora:close-code-workspace', closeWorkspace);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ files, projectPrompt }));
    } catch {
      // Browser storage is a convenience layer; the future persistent project store is server-backed.
    }
  }, [files, projectPrompt]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !pendingPatch) setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, pendingPatch]);

  useEffect(() => {
    if (!open) return undefined;
    const onPreviewMessage = (event) => {
      const data = event.data;
      if (!data || data.__quantora !== true) return;
      if (data.kind === 'error' || data.kind === 'resource-error') {
        const message = String(data.message || 'Runtime error');
        setRuntimeDiagnostics([{
          id: `runtime:${message}`,
          source: 'runtime',
          severity: 'error',
          message,
          path: files['index.html'] ? 'index.html' : selectedPath,
        }]);
        appendActivity(`Runtime reported: ${message}`, 'error');
        setBottomTab('problems');
      }
      if (data.kind === 'loaded') {
        setRuntimeDiagnostics([]);
      }
    };
    window.addEventListener('message', onPreviewMessage);
    return () => window.removeEventListener('message', onPreviewMessage);
  }, [open, files, selectedPath, appendActivity]);

  const refreshCognition = useCallback(async () => {
    if (!open) return;
    setCognitionBusy(true);
    try {
      const response = await fetch('/api/code/cognition', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: 'Quantora Code project',
          prompt: projectPrompt,
          files: filePayload(files),
          autoHeal,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Project cognition failed (${response.status})`);
      setCognition(data.cognition || null);
      setRuntime(data.runtime || null);
      setRepairPolicy(data.repairPolicy || null);
    } catch (error) {
      appendActivity(error?.message || 'Unable to refresh project understanding.', 'error');
    } finally {
      setCognitionBusy(false);
    }
  }, [open, projectPrompt, files, autoHeal, appendActivity]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(refreshCognition, 650);
    return () => window.clearTimeout(timer);
  }, [open, projectPrompt, files, autoHeal, refreshCognition]);

  const updateSelectedFile = useCallback((content) => {
    setFiles((previous) => ({
      ...previous,
      [selectedPath]: {
        ...(previous[selectedPath] || {}),
        content,
        language: previous[selectedPath]?.language || languageForPath(selectedPath),
      },
    }));
  }, [selectedPath]);

  const handleEditorDiagnostics = useCallback((diagnostics) => {
    setEditorDiagnostics((previous) => ({ ...previous, [selectedPath]: diagnostics }));
  }, [selectedPath]);

  const requestRepair = useCallback(async ({ automatic = false } = {}) => {
    if (repairBusy || !selectedFile?.content) return;
    const blocking = allDiagnostics.filter((item) => item.severity === 'error');
    if (!blocking.length) {
      appendActivity('No blocking diagnostics to repair.', 'success');
      return;
    }

    setRepairBusy(true);
    appendActivity(`Diagnosing ${blocking.length} blocking issue${blocking.length === 1 ? '' : 's'}…`, 'working');
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'repair',
          code: selectedFile.content,
          framework: selectedFile.language || languageForPath(selectedPath),
          error: blocking.map((item) => `${item.path || selectedPath}${item.line ? `:${item.line}` : ''} — ${item.message}`).join('\n'),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Repair failed (${response.status})`);
      const nextCode = typeof data.code === 'string' ? data.code : '';
      if (!nextCode || data.unchanged || nextCode.trim() === selectedFile.content.trim()) {
        throw new Error('The repair agent did not produce a meaningful patch.');
      }

      const patch = {
        path: selectedPath,
        before: selectedFile.content,
        after: nextCode,
        reason: blocking.map((item) => item.message).join(' • '),
      };

      if (automatic) {
        updateSelectedFile(nextCode);
        setPendingPatch(null);
        appendActivity(`Applied a bounded repair to ${selectedPath}. Re-running verification…`, 'working');
      } else {
        setPendingPatch(patch);
        appendActivity(`Prepared a reviewable repair for ${selectedPath}.`, 'success');
      }
    } catch (error) {
      appendActivity(error?.message || 'Repair failed.', 'error');
    } finally {
      setRepairBusy(false);
    }
  }, [repairBusy, selectedFile, selectedPath, allDiagnostics, updateSelectedFile, appendActivity]);

  useEffect(() => {
    if (!open || !autoHeal || repairBusy || !runtimeDiagnostics.length) return;
    const signature = runtimeDiagnostics.map(diagnosticKey).join('|');
    if (!signature || signature === lastAutoRepairRef.current) return;
    lastAutoRepairRef.current = signature;
    const timer = window.setTimeout(() => requestRepair({ automatic: true }), 450);
    return () => window.clearTimeout(timer);
  }, [open, autoHeal, repairBusy, runtimeDiagnostics, requestRepair]);

  useEffect(() => {
    if (previewStatus === 'clean') {
      appendActivity('Preview verified clean.', 'success');
      lastAutoRepairRef.current = '';
    }
  }, [previewStatus]);

  const createFile = () => {
    const name = window.prompt('New file path', 'src/new-file.js');
    if (!name) return;
    const path = name.trim().replace(/^\/+/, '');
    if (!path || files[path]) return;
    setFiles((previous) => ({ ...previous, [path]: { content: '', language: languageForPath(path) } }));
    setSelectedPath(path);
  };

  const deleteFile = (path) => {
    if (Object.keys(files).length <= 1) return;
    if (!window.confirm(`Delete ${path}?`)) return;
    setFiles((previous) => {
      const next = { ...previous };
      delete next[path];
      return next;
    });
    if (selectedPath === path) setSelectedPath(Object.keys(files).find((item) => item !== path) || '');
  };

  const resetStarter = () => {
    if (!window.confirm('Reset this local Code workspace to the starter project?')) return;
    setFiles(STARTER_FILES);
    setSelectedPath('index.html');
    setProjectPrompt('');
    setPromptDraft('');
    setRuntimeDiagnostics([]);
    setEditorDiagnostics({});
    setPendingPatch(null);
    appendActivity('Starter workspace restored.', 'info');
  };

  if (!open) return null;

  const surface = '#0a0f1d';
  const surface2 = '#0f172a';
  const border = 'rgba(148,163,184,.18)';
  const muted = '#94a3b8';
  const text = '#e2e8f0';
  const orange = '#f97316';

  return (
    <div data-quantora-code-workspace="true" style={{ position: 'fixed', inset: 0, zIndex: 12000, background: '#060914', color: text, display: 'flex', flexDirection: 'column', fontFamily: 'Inter, Plus Jakarta Sans, system-ui, sans-serif' }}>
      <header style={{ height: 58, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 0 18px', borderBottom: `1px solid ${border}`, background: 'rgba(6,9,20,.98)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, rgba(249,115,22,.2), rgba(236,72,153,.18))', border: '1px solid rgba(249,115,22,.3)' }}>
            <Code2 size={19} color={orange} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, letterSpacing: '-.02em' }}>Quantora Code <span style={{ fontSize: 10, color: '#fdba74', border: '1px solid rgba(249,115,22,.28)', borderRadius: 999, padding: '2px 7px' }}>FOUNDATION</span></div>
            <div style={{ color: muted, fontSize: 11, marginTop: 1 }}>Build · Run · Diagnose · Repair · Verify</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => { setRuntimeDiagnostics([]); setPreviewStatus('running'); appendActivity('Manual run requested.', 'working'); }} style={topButtonStyle(false)}><Play size={14} fill="currentColor" /> Run</button>
          <button onClick={() => requestRepair({ automatic: false })} disabled={repairBusy || errorCount === 0} style={topButtonStyle(errorCount > 0)}><Wrench size={14} /> {repairBusy ? 'Repairing…' : 'Fix Problems'}</button>
          <button onClick={() => setOpen(false)} aria-label="Close Quantora Code" title="Close Code workspace" style={{ ...iconButtonStyle, marginLeft: 4 }}><X size={18} /></button>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '220px minmax(480px, 1fr) 330px' }}>
        <aside style={{ minWidth: 0, background: surface, borderRight: `1px solid ${border}`, display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 42, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px 0 14px', borderBottom: `1px solid ${border}`, color: muted, fontSize: 11, fontWeight: 800, letterSpacing: '.08em' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><FolderOpen size={14} /> FILES</span>
            <button onClick={createFile} title="New file" style={iconButtonStyle}><FilePlus2 size={15} /></button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 7 }}>
            {Object.keys(files).sort().map((path) => {
              const active = path === selectedPath;
              return (
                <div key={path} style={{ display: 'flex', alignItems: 'center', borderRadius: 7, background: active ? 'rgba(249,115,22,.11)' : 'transparent', color: active ? '#fed7aa' : '#cbd5e1' }}>
                  <button onClick={() => setSelectedPath(path)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', border: 0, color: 'inherit', padding: '8px 8px', textAlign: 'left', cursor: 'pointer', fontSize: 12.5 }}>
                    <FileCode2 size={14} color={active ? orange : '#64748b'} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</span>
                  </button>
                  {Object.keys(files).length > 1 && <button onClick={() => deleteFile(path)} title={`Delete ${path}`} style={{ ...iconButtonStyle, opacity: .5, marginRight: 3 }}><Trash2 size={12} /></button>}
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: `1px solid ${border}`, padding: 10 }}>
            <button onClick={resetStarter} style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 7, border: `1px solid ${border}`, borderRadius: 8, background: 'transparent', color: muted, padding: '8px 10px', cursor: 'pointer', fontSize: 11.5 }}><RefreshCw size={13} /> Reset starter</button>
          </div>
        </aside>

        <main style={{ minWidth: 0, minHeight: 0, display: 'grid', gridTemplateRows: 'minmax(260px, 58%) minmax(180px, 30%) minmax(92px, 12%)', background: '#070b16' }}>
          <section style={{ minHeight: 0, borderBottom: `1px solid ${border}`, display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', background: surface2, borderBottom: `1px solid ${border}`, color: '#cbd5e1', fontSize: 11.5 }}>
              <FileCode2 size={13} color={orange} /> {selectedPath}
              <span style={{ color: '#475569' }}>•</span>
              <span style={{ color: muted }}>{selectedFile.language || languageForPath(selectedPath)}</span>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <MonacoSurface
                path={selectedPath}
                value={selectedFile.content || ''}
                onChange={updateSelectedFile}
                onDiagnostics={handleEditorDiagnostics}
              />
            </div>
          </section>

          <section style={{ minHeight: 0, borderBottom: `1px solid ${border}`, background: '#0b1020', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 11px', borderBottom: `1px solid ${border}`, color: muted, fontSize: 11, fontWeight: 700 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Play size={12} /> LIVE PREVIEW</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: previewStatus === 'clean' ? '#34d399' : previewStatus === 'failed' ? '#f87171' : muted }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: 'currentColor' }} /> {String(previewStatus || 'idle')}
              </span>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <LivePreviewCanvas
                code={previewEntry(files, selectedPath)}
                vfs={files}
                isLight={false}
                onClose={() => {}}
                hideHeader={true}
                verifyOnly={true}
                onVerificationStatusChange={(status) => {
                  if (typeof status === 'string') setPreviewStatus(status);
                }}
                suggestedProjectName="quantora-code-project"
              />
            </div>
          </section>

          <section style={{ minHeight: 0, background: surface, display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, borderBottom: `1px solid ${border}`, padding: '0 8px' }}>
              <button onClick={() => setBottomTab('problems')} style={tabButtonStyle(bottomTab === 'problems')}><AlertTriangle size={12} /> Problems {errorCount ? <span style={{ color: '#fca5a5' }}>{errorCount}</span> : ''}</button>
              <button onClick={() => setBottomTab('activity')} style={tabButtonStyle(bottomTab === 'activity')}><TerminalSquare size={12} /> Activity</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10.8, lineHeight: 1.55 }}>
              {bottomTab === 'problems' ? (
                allDiagnostics.length ? allDiagnostics.map((item) => (
                  <div key={diagnosticKey(item)} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, color: item.severity === 'error' ? '#fca5a5' : '#facc15', padding: '2px 0' }}>
                    <AlertTriangle size={11} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span><strong>{item.path || 'runtime'}{item.line ? `:${item.line}` : ''}</strong> — {item.message}</span>
                  </div>
                )) : <div style={{ color: '#64748b', display: 'flex', gap: 7, alignItems: 'center' }}><CheckCircle2 size={12} color="#34d399" /> No blocking diagnostics.</div>
              ) : activity.slice().reverse().map((item) => (
                <div key={item.id} style={{ color: item.kind === 'error' ? '#fca5a5' : item.kind === 'success' ? '#6ee7b7' : item.kind === 'working' ? '#fdba74' : '#94a3b8', padding: '2px 0' }}>› {item.text}</div>
              ))}
            </div>
          </section>
        </main>

        <aside style={{ minWidth: 0, minHeight: 0, background: surface, borderLeft: `1px solid ${border}`, display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 42, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 13px', borderBottom: `1px solid ${border}` }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800 }}><Sparkles size={15} color={orange} /> QUANTORA</span>
            <button onClick={refreshCognition} title="Refresh project understanding" style={iconButtonStyle}>{cognitionBusy ? <RefreshCw size={13} className="animate-spin" /> : <Activity size={13} />}</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 13 }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: muted, fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', marginBottom: 7 }}>WHAT ARE YOU BUILDING?</div>
              <textarea
                value={promptDraft}
                onChange={(event) => setPromptDraft(event.target.value)}
                placeholder="e.g. Build a quadcopter simulator where I can tune rotor speeds…"
                rows={4}
                style={{ width: '100%', resize: 'vertical', minHeight: 78, maxHeight: 180, border: `1px solid ${border}`, borderRadius: 10, background: '#0b1020', color: text, padding: 10, outline: 'none', font: '12px/1.5 inherit' }}
              />
              <button onClick={() => { setProjectPrompt(promptDraft.trim()); appendActivity('Project objective updated. PCL is re-reading the workspace.', 'working'); }} style={{ marginTop: 7, width: '100%', border: '1px solid rgba(249,115,22,.35)', borderRadius: 9, background: 'rgba(249,115,22,.10)', color: '#fdba74', padding: '8px 10px', cursor: 'pointer', fontSize: 11.5, fontWeight: 750 }}>Understand this project</button>
            </div>

            <div style={{ border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 12, background: '#0b1020' }}>
              <div style={{ padding: '10px 11px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#cbd5e1' }}>PCL PROJECT COGNITION</span>
                <span style={{ fontSize: 10, color: cognition?.confidence >= .75 ? '#6ee7b7' : '#facc15' }}>{cognition ? `${Math.round(cognition.confidence * 100)}%` : '…'}</span>
              </div>
              <div style={{ padding: 11, display: 'grid', gap: 10 }}>
                <InfoRow label="Purpose" value={cognition?.purposeLabel || 'Reading project…'} />
                <InfoRow label="Intent" value={cognition?.intent || '—'} />
                <InfoRow label="Runtime" value={runtimeLabel(runtime)} />
                <InfoRow label="Architecture" value={cognition?.architecture?.length ? cognition.architecture.join(' · ') : '—'} />
                <InfoRow label="Stack" value={[...(cognition?.languages || []), ...(cognition?.frameworks || [])].slice(0, 6).join(' · ') || '—'} />
              </div>
            </div>

            <div style={{ border: `1px solid ${border}`, borderRadius: 12, padding: 11, marginBottom: 12, background: '#0b1020' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 7 }}><Zap size={13} color="#f59e0b" /> Self-heal</div>
                  <div style={{ color: muted, fontSize: 10.5, marginTop: 3, lineHeight: 1.4 }}>Runtime failures can trigger a bounded repair loop. Diagnostics stay visible.</div>
                </div>
                <button onClick={() => setAutoHeal((value) => !value)} aria-pressed={autoHeal} style={{ width: 42, height: 23, borderRadius: 999, border: `1px solid ${autoHeal ? 'rgba(52,211,153,.45)' : border}`, background: autoHeal ? 'rgba(16,185,129,.22)' : '#111827', padding: 2, cursor: 'pointer' }}>
                  <span style={{ display: 'block', width: 17, height: 17, borderRadius: 99, background: autoHeal ? '#34d399' : '#64748b', transform: autoHeal ? 'translateX(17px)' : 'translateX(0)', transition: 'transform .16s ease' }} />
                </button>
              </div>
              {repairPolicy && <div style={{ marginTop: 9, color: '#64748b', fontSize: 10 }}>Max {repairPolicy.maxAttempts} attempts · reviewable diff · verification required</div>}
            </div>

            <ActionButton icon={<Braces size={14} />} label="Review current project" detail="Project cognition is active; deep agent review is the next adapter layer." disabled />
            <ActionButton icon={<Wrench size={14} />} label="Fix blocking problems" detail={errorCount ? `${errorCount} blocking diagnostic${errorCount === 1 ? '' : 's'} ready for repair.` : 'No blocking diagnostic right now.'} onClick={() => requestRepair({ automatic: false })} disabled={!errorCount || repairBusy} />
          </div>
        </aside>
      </div>

      {pendingPatch && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 4, background: 'rgba(2,6,23,.72)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div style={{ width: 'min(880px, 92vw)', maxHeight: '82vh', overflow: 'hidden', borderRadius: 16, background: '#0b1020', border: `1px solid ${border}`, boxShadow: '0 30px 90px rgba(0,0,0,.55)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '13px 15px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><strong style={{ fontSize: 13 }}>Review repair</strong><div style={{ color: muted, fontSize: 10.5, marginTop: 2 }}>{pendingPatch.path} · nothing is applied until you accept</div></div>
              <button onClick={() => setPendingPatch(null)} style={iconButtonStyle}><X size={16} /></button>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              <PatchPane title="Before" code={pendingPatch.before} color="#fca5a5" />
              <PatchPane title="After" code={pendingPatch.after} color="#6ee7b7" />
            </div>
            <div style={{ padding: 12, borderTop: `1px solid ${border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setPendingPatch(null)} style={secondaryButtonStyle}>Reject</button>
              <button onClick={() => { updateSelectedFile(pendingPatch.after); appendActivity(`Accepted repair for ${pendingPatch.path}. Re-running verification…`, 'working'); setPendingPatch(null); }} style={primaryButtonStyle}>Apply repair <ChevronRight size={14} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return <div><div style={{ color: '#64748b', fontSize: 9.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase' }}>{label}</div><div style={{ color: '#cbd5e1', fontSize: 11.5, marginTop: 3, lineHeight: 1.4 }}>{value}</div></div>;
}

function ActionButton({ icon, label, detail, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: '100%', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', border: '1px solid rgba(148,163,184,.16)', borderRadius: 10, background: disabled ? 'rgba(15,23,42,.45)' : '#0b1020', color: disabled ? '#64748b' : '#e2e8f0', padding: '10px 11px', cursor: disabled ? 'default' : 'pointer' }}>
      <span style={{ color: '#fb923c', display: 'flex' }}>{icon}</span>
      <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontSize: 11.5, fontWeight: 750 }}>{label}</span><span style={{ display: 'block', color: '#64748b', fontSize: 9.8, lineHeight: 1.35, marginTop: 2 }}>{detail}</span></span>
    </button>
  );
}

function PatchPane({ title, code, color }) {
  return <div style={{ minWidth: 0, overflow: 'auto', borderRight: title === 'Before' ? '1px solid rgba(148,163,184,.16)' : 0 }}><div style={{ position: 'sticky', top: 0, padding: '7px 10px', background: '#0f172a', color, fontSize: 10.5, fontWeight: 800 }}>{title}</div><pre style={{ margin: 0, padding: 12, color: '#cbd5e1', font: '10.8px/1.55 JetBrains Mono, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{code}</pre></div>;
}

const iconButtonStyle = { border: 0, background: 'transparent', color: '#94a3b8', padding: 6, borderRadius: 7, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
const secondaryButtonStyle = { border: '1px solid rgba(148,163,184,.2)', background: 'transparent', color: '#cbd5e1', borderRadius: 9, padding: '8px 12px', cursor: 'pointer', fontSize: 11.5 };
const primaryButtonStyle = { border: 0, background: '#f97316', color: '#fff', borderRadius: 9, padding: '8px 13px', cursor: 'pointer', fontSize: 11.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 5 };

function topButtonStyle(active) {
  return { border: active ? '1px solid rgba(249,115,22,.42)' : '1px solid rgba(148,163,184,.18)', background: active ? 'rgba(249,115,22,.12)' : '#0f172a', color: active ? '#fdba74' : '#cbd5e1', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', fontSize: 11.5, fontWeight: 750, display: 'inline-flex', alignItems: 'center', gap: 6 };
}

function tabButtonStyle(active) {
  return { height: '100%', display: 'inline-flex', alignItems: 'center', gap: 5, border: 0, borderBottom: active ? '1px solid #f97316' : '1px solid transparent', background: 'transparent', color: active ? '#e2e8f0' : '#64748b', fontSize: 10.5, cursor: 'pointer', padding: '0 7px' };
}
