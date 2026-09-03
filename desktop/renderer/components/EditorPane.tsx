import Editor, { loader } from "@monaco-editor/react";
import { languageFromPath } from "@web/lib/workspace-editor-language.js";

loader.config({ paths: { vs: "/monaco/vs" } });

export type OpenFile = { path: string; content: string; saved: string; loading?: boolean; error?: string };

export function EditorPane({ files, activePath, onActivate, onClose, onChange }: {
  files: OpenFile[];
  activePath: string | null;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  onChange: (path: string, content: string) => void;
}) {
  const active = files.find((f) => f.path === activePath) || null;
  return (
    <div className="editor-area">
      <div className="tabs" data-qd-tabs="true">
        {files.map((file) => (
          <button
            type="button"
            key={file.path}
            className={`tab${file.path === activePath ? " active" : ""}`}
            data-qd-tab={file.path}
            onClick={() => onActivate(file.path)}
            title={file.path}
          >
            {file.content !== file.saved ? <span className="dirty">●</span> : null}
            <span>{file.path.split("/").pop()}</span>
            <span className="close" onClick={(e) => { e.stopPropagation(); onClose(file.path); }}>✕</span>
          </button>
        ))}
      </div>
      <div className="editor-host" data-qd-editor={active ? active.path : undefined}>
        {!active ? (
          <div className="empty-editor">
            <div>Open a file from the sidebar, or ask Quantora to build something.</div>
            <div className="faint" style={{ fontSize: 12 }}>⌘S saves · ⌘` terminal · ⌘J chat</div>
          </div>
        ) : active.error ? (
          <div className="empty-editor"><div className="error">{active.error}</div></div>
        ) : (
          <Editor
            height="100%"
            theme="vs-dark"
            path={active.path}
            language={languageFromPath(active.path)}
            value={active.content}
            loading={<div className="faint" style={{ padding: 16 }}>Loading editor…</div>}
            onChange={(next: string | undefined) => { if (typeof next === "string") onChange(active.path, next); }}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "SF Mono, Menlo, Monaco, Consolas, monospace",
              automaticLayout: true,
              scrollBeyondLastLine: false,
              tabSize: 2,
              wordWrap: "off",
              renderLineHighlight: "line",
              smoothScrolling: true,
            }}
          />
        )}
      </div>
    </div>
  );
}
