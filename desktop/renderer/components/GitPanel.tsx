import { useState } from "react";
import { bridge } from "../lib/bridge.ts";

function classify(line: string): string {
  if (line.startsWith("$ ")) return "cmd";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("diff --git ") || line.startsWith("--- ") || line.startsWith("+++ ")) return "file";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "";
}

export function GitPanel({ onChanged }: { onChanged?: () => void }) {
  const [log, setLog] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: "init" | "status" | "diff" | "commit") {
    if (busy) return;
    setBusy(true);
    setLog((prev) => [...prev, `$ git ${action}`]);
    try {
      const result = await bridge().git.run({ action, message });
      setLog((prev) => [...prev, ...(result.output || (result.ok ? "done" : "(git failed)")).split("\n")]);
      if (action === "commit" && result.ok) { setMessage(""); onChanged?.(); }
    } catch (err: any) {
      setLog((prev) => [...prev, err?.message || "git could not run."]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="git" data-qd-git="true">
      <div className="git-actions">
        <button type="button" className="btn btn-sm" data-qd-git-status="true" disabled={busy} onClick={() => run("status")}>Status</button>
        <button type="button" className="btn btn-sm" data-qd-git-diff="true" disabled={busy} onClick={() => run("diff")}>Diff</button>
        <button type="button" className="btn btn-sm" data-qd-git-init="true" disabled={busy} onClick={() => run("init")}>Init</button>
        <input className="input" data-qd-git-message="true" placeholder="Commit message" value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && message.trim()) run("commit"); }} />
        <button type="button" className="btn btn-sm btn-primary" data-qd-git-commit="true" disabled={busy || !message.trim()} onClick={() => run("commit")}>Commit</button>
      </div>
      <div className="git-output" data-qd-git-output="true">
        {log.length === 0 ? <span className="faint">Status, diff and commit run in this folder. Push happens in your terminal.</span> : null}
        {log.map((line, index) => <div key={index} className={classify(line)}>{line}</div>)}
      </div>
    </div>
  );
}
