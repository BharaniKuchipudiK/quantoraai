import React from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { languageFromPath } from '../lib/workspace-editor-language.js';

if (typeof globalThis !== 'undefined' && !globalThis.MonacoEnvironment) {
  globalThis.MonacoEnvironment = {
    getWorker(_, label) {
      if (label === 'json') return new jsonWorker();
      if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
      if (label === 'typescript' || label === 'javascript') return new tsWorker();
      return new editorWorker();
    },
  };
}

loader.config({ monaco });

/**
 * Studio file editor. Preview stays in LivePreviewCanvas. Advisors do not
 * auto-open this workspace.
 */
export default function WorkspaceCodeEditor({ path, value, onChange, isLight }) {
  return (
    <div data-quantora-monaco="true" style={{ position: 'absolute', inset: 0 }}>
      <Editor
        height="100%"
        theme={isLight ? 'vs' : 'vs-dark'}
        language={languageFromPath(path)}
        value={value || ''}
        loading={<div style={{ padding: 24, color: isLight ? '#64748b' : '#94a3b8' }}>Loading editor…</div>}
        onChange={(next) => onChange(typeof next === 'string' ? next : '')}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          wordWrap: 'on',
          automaticLayout: true,
          scrollBeyondLastLine: false,
          tabSize: 2,
        }}
      />
    </div>
  );
}
