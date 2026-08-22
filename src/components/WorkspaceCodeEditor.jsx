import React from 'react';
import Editor from '@monaco-editor/react';
import { languageFromPath } from '../lib/workspace-editor-language.js';

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
