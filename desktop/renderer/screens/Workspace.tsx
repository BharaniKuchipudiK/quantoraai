import { useCallback, useEffect, useRef, useState } from "react";
import { bridge, type HostInfo, type SessionUser, type TreeEntry, type WorkspaceInfo } from "../lib/bridge.js";
import type { MenuBus } from "../app.js";
import { FileTree } from "../components/FileTree.js";
import { EditorPane, type OpenFile } from "../components/EditorPane.js";
import { TerminalPane } from "../components/TerminalPane.js";
import { GitPanel } from "../components/GitPanel.js";
import { ChatPanel } from "../components/ChatPanel.js";

export function Workspace({ workspace, user, host, menu, onClosed }: {
  workspace: WorkspaceInfo;
  user: SessionUser | null;
  host: HostInfo | null;
  menu: MenuBus;
  onClosed: () => Promise<void>;
}) {
  const api = bridge();
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [files, setFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [bottomOpen, setBottomOpen] = useState(true);
  const [bottomTab, setBottomTab] = useState<"terminal" | "git">("terminal");
  const [chatOpen, setChatOpen] = useState(true);
  const [chatReset, setChatReset] = useState(0);
  const [status, setStatus] = useState("");
  const filesRef = useRef(files);
  filesRef.current = files;
  const activeRef = useRef(activePath);
  activeRef.current = activePath;

  const refreshTree = useCallback(async () => {
    const tree = await api.files.tree();
    setEntries(tree.entries);
    setTruncated(tree.truncated);
  }, [api]);

  const openFile = useCallback(async (path: string) => {
    setActivePath(path);
    if (filesRef.current.some((f) => f.path === path)) return;
    setFiles((prev) => [...prev, { path, content: "", saved: "", loading: true }]);
    const result = await api.files.read(path);
    setFiles((prev) => prev.map((f) => (f.path !== path ? f : result.ok
      ? { path, content: result.content, saved: result.content }
      : { path, content: "", saved: "", error: result.error })));
  }, [api]);

  const reloadIfClean = useCallback(async (paths: string[]) => {
    for (const path of paths) {
      const open = filesRef.current.find((f) => f.path === path);
      if (!open || open.content !== open.saved) continue;
      const result = await api.files.read(path);
      if (!result.ok) continue;
      setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content: result.content, saved: result.content } : f)));
    }
  }, [api]);

  const save = useCallback(async (path?: string | null) => {
    const target = path || activeRef.current;
    if (!target) return;
    const file = filesRef.current.find((f) => f.path === target);
    if (!file || file.content === file.saved) return;
    const result = await api.files.write(target, file.content);
    if (result.ok) {
      setFiles((prev) => prev.map((f) => (f.path === target ? { ...f, saved: f.content } : f)));
      setStatus(`Saved ${target}`);
    } else {
      setStatus(`Could not save ${target}: ${result.error}`);
    }
  }, [api]);

  useEffect(() => { refreshTree().catch(() => {}); }, [refreshTree]);

  useEffect(() => api.workspace.onChanged(({ paths }) => {
    refreshTree().catch(() => {});
    reloadIfClean(paths).catch(() => {});
  }), [api, refreshTree, reloadIfClean]);

  useEffect(() => menu.subscribe((action) => {
    if (action === "toggle-terminal") setBottomOpen((v) => !v);
    if (action === "toggle-chat") setChatOpen((v) => !v);
    if (action === "save-file") save().catch(() => {});
    if (action === "new-chat") setChatReset((n) => n + 1);
  }), [menu, save]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "s") { e.preventDefault(); save().catch(() => {}); }
      if (e.key === "`") { e.preventDefault(); setBottomOpen((v) => !v); }
      if (e.key === "j") { e.preventDefault(); setChatOpen((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const root = workspace.root || "";
  const name = root.split(/[\\/]/).filter(Boolean).pop() || "Workspace";
  const isMac = host?.platform === "darwin";
  const caps = workspace.capabilities;

  return (
    <div className={`workspace${chatOpen ? "" : " no-chat"}`} data-qd-screen="workspace" data-qd-workspace={root}>
      <div className={`titlebar drag${isMac ? "" : " linux"}`}>
        <span className="titlebar-name">{name}</span>
        <span className="faint" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{root}</span>
        <span className="titlebar-spacer" />
        <button type="button" className="btn btn-ghost btn-sm no-drag" onClick={() => setBottomOpen((v) => !v)}>Terminal</button>
        <button type="button" className="btn btn-ghost btn-sm no-drag" onClick={() => setChatOpen((v) => !v)}>Chat</button>
        <button type="button" className="btn btn-ghost btn-sm no-drag" data-qd-close-workspace="true" onClick={() => { api.workspace.close().then(() => onClosed()).catch(() => {}); }}>Close</button>
      </div>

      <aside className="sidebar">
        <div className="sidebar-head"><span>Explorer</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => refreshTree()}>↻</button></div>
        <FileTree entries={entries} truncated={truncated} activePath={activePath} onOpen={openFile} />
      </aside>

      <main className={`main${bottomOpen ? " bottom-open" : ""}`}>
        <EditorPane
          files={files}
          activePath={activePath}
          onActivate={setActivePath}
          onClose={(path) => {
            setFiles((prev) => prev.filter((f) => f.path !== path));
            if (activePath === path) setActivePath(files.find((f) => f.path !== path)?.path || null);
          }}
          onChange={(path, content) => setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content } : f)))}
        />
        {bottomOpen ? (
          <div className="bottom" data-qd-bottom="true">
            <div className="bottom-tabs">
              <button type="button" className={`bottom-tab${bottomTab === "terminal" ? " active" : ""}`} data-qd-bottom-terminal="true" onClick={() => setBottomTab("terminal")}>Terminal</button>
              <button type="button" className={`bottom-tab${bottomTab === "git" ? " active" : ""}`} data-qd-bottom-git="true" onClick={() => setBottomTab("git")}>Git</button>
            </div>
            <div className="bottom-body">
              {bottomTab === "terminal" ? <TerminalPane enabled={bottomOpen} hasPty={caps.terminal} /> : <GitPanel onChanged={() => refreshTree()} />}
            </div>
          </div>
        ) : null}
      </main>

      {chatOpen ? (
        <ChatPanel
          resetToken={chatReset}
          onFilesWritten={(paths) => { refreshTree().catch(() => {}); reloadIfClean(paths).catch(() => {}); }}
        />
      ) : null}

      <div className="statusbar">
        <span><span className={`dot${caps.terminal ? "" : " off"}`} />{caps.terminal ? "Terminal" : "Terminal (collected output)"}</span>
        <span><span className={`dot${caps.git ? "" : " off"}`} />Git</span>
        <span className="faint">{status}</span>
        <span className="titlebar-spacer" />
        <span>{user?.email || ""}</span>
        <span className="faint">Quantora Desktop {host?.version || ""}</span>
      </div>
    </div>
  );
}
