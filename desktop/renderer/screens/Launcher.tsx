import { useEffect, useState } from "react";
import { bridge, type HostInfo, type RecentWorkspace, type SessionUser } from "../lib/bridge.ts";
import { isCloneableRepositoryUrl } from "@shared/desktop-bridge-contract.js";

export function Launcher({ user, host, onOpened, onSignedOut }: {
  user: SessionUser | null;
  host: HostInfo | null;
  onOpened: () => Promise<void>;
  onSignedOut: () => Promise<void>;
}) {
  const [recent, setRecent] = useState<RecentWorkspace[]>([]);
  const [cloneUrl, setCloneUrl] = useState("");
  const [busy, setBusy] = useState<"open" | "clone" | "">("");
  const [error, setError] = useState("");
  const isMac = host?.platform === "darwin";

  useEffect(() => {
    bridge().workspace.recent().then(setRecent).catch(() => setRecent([]));
  }, []);

  async function openFolder() {
    setError("");
    setBusy("open");
    try {
      const info = await bridge().workspace.open();
      if (info.error) setError(info.error);
      if (info.attached) await onOpened();
    } finally {
      setBusy("");
    }
  }

  async function openRecent(item: RecentWorkspace) {
    setError("");
    const info = await bridge().workspace.openPath(item.path);
    if (info.error) setError(info.error);
    if (info.attached) await onOpened();
  }

  async function clone() {
    const url = cloneUrl.trim();
    if (!isCloneableRepositoryUrl(url)) {
      setError("Enter an https:// or git@ repository URL.");
      return;
    }
    setError("");
    setBusy("clone");
    try {
      const result = await bridge().workspace.clone(url);
      if (result.cancelled) return;
      if (!result.ok) { setError(result.output || "Clone failed."); return; }
      if (result.workspace?.attached) await onOpened();
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="launcher" data-qd-screen="launcher">
      <div className={`titlebar drag${isMac ? "" : " linux"}`}><span className="titlebar-name">Quantora</span></div>
      <div className="launcher-body">
        <div>
          <div className="brand"><div className="brand-mark">Q</div><div><div className="brand-name">Quantora</div><div className="brand-sub">Desktop</div></div></div>
          <h1>Start</h1>
          <p className="muted">Open a folder or clone a repository. The chat, the terminal and git all work on that folder.</p>
          <h2>Open</h2>
          <div className="action-list">
            <button type="button" className="action" data-qd-open-folder="true" disabled={busy !== ""} onClick={openFolder}>
              <span><span className="action-title">Open folder…</span><br /><span className="action-hint">An existing project on this Mac</span></span>
              <span className="kbd">{isMac ? "⌘O" : "Ctrl+O"}</span>
            </button>
          </div>
          <h2>Clone</h2>
          <div className="clone-row">
            <input
              className="input"
              data-qd-clone-url="true"
              placeholder="https://github.com/owner/repo"
              value={cloneUrl}
              onChange={(e) => setCloneUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") clone(); }}
            />
            <button type="button" className="btn" disabled={busy !== "" || !cloneUrl.trim()} onClick={clone}>{busy === "clone" ? "Cloning…" : "Clone"}</button>
          </div>
          {error ? <p className="error" style={{ marginTop: 12 }}>{error}</p> : null}
        </div>
        <div>
          <h2 style={{ marginTop: 0 }}>Recent</h2>
          {recent.length === 0 ? (
            <p className="faint">Folders you open will appear here.</p>
          ) : (
            <div className="recent" data-qd-recent="true">
              {recent.map((item) => (
                <button type="button" key={item.path} className="recent-item" onClick={() => openRecent(item)}>
                  <span className="recent-name">{item.name}</span>
                  <span className="recent-path">{item.path}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="launcher-footer">
        <span data-qd-user="true">{user ? `Signed in as ${user.email}` : "Signed in"}</span>
        <span className="faint">Quantora Desktop {host?.version || ""}</span>
        <button type="button" className="btn btn-ghost btn-sm" data-qd-signout="true" onClick={() => { bridge().auth.signOut().then(() => onSignedOut()).catch(() => {}); }}>Sign out</button>
      </div>
    </div>
  );
}
