import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { bridge } from "../lib/bridge.js";

/*
 * A real terminal (xterm ↔ node-pty in the host) when the host has a pty,
 * and an honest fallback — one command, collected output — when it does
 * not. The fallback says so; it never pretends to be a shell.
 */

export function TerminalPane({ enabled, hasPty }: { enabled: boolean; hasPty: boolean }) {
  if (!hasPty) return <CollectedShell />;
  return <PtyTerminal enabled={enabled} />;
}

function PtyTerminal({ enabled }: { enabled: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled || !hostRef.current) return undefined;
    const api = bridge();
    const term = new Terminal({
      fontFamily: "SF Mono, Menlo, Monaco, Consolas, monospace",
      fontSize: 12,
      cursorBlink: true,
      theme: { background: "#0b0d12", foreground: "#e6e9ef", cursor: "#f97316", selectionBackground: "rgba(249,115,22,0.3)" },
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();

    let id: string | null = null;
    let disposed = false;
    const offData = api.pty.onData(({ id: from, chunk }) => { if (from === id) term.write(chunk); });
    const offExit = api.pty.onExit(({ id: from, exitCode }) => {
      if (from !== id) return;
      term.write(`\r\n\x1b[2m[process exited with code ${exitCode}]\x1b[0m\r\n`);
      id = null;
    });
    api.pty.open({ cols: term.cols, rows: term.rows }).then((result) => {
      if (disposed) return;
      if (!result.ok) { setError(result.error); return; }
      id = result.id;
      term.focus();
    });
    const input = term.onData((data) => { if (id) void api.pty.write(id, data); });
    const observer = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* not laid out yet */ }
      if (id) void api.pty.resize(id, term.cols, term.rows);
    });
    observer.observe(hostRef.current);

    return () => {
      disposed = true;
      observer.disconnect();
      input.dispose();
      offData();
      offExit();
      if (id) void api.pty.close(id);
      term.dispose();
    };
  }, [enabled]);

  return (
    <div className="terminal-host" data-qd-terminal="pty">
      {error ? <div className="error" style={{ padding: 8 }}>{error}</div> : null}
      <div ref={hostRef} style={{ height: "100%" }} />
    </div>
  );
}

function CollectedShell() {
  const [lines, setLines] = useState<string[]>(["The interactive terminal is unavailable on this machine (node-pty did not load). Commands still run in the folder; output is shown when they finish."]);
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [lines, busy]);

  async function run() {
    const line = command.trim();
    if (!line || busy) return;
    setCommand("");
    setBusy(true);
    setLines((prev) => [...prev, `$ ${line}`]);
    try {
      const result = await bridge().runCollected(line);
      setLines((prev) => [...prev, result.output || (result.ok ? "" : `(exit ${result.exitCode ?? "?"})`)]);
    } catch (err: any) {
      setLines((prev) => [...prev, err?.message || "The command could not run."]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="collected-shell" data-qd-terminal="collected">
      <div ref={logRef} className="collected-log" data-qd-terminal-log="true">
        {lines.map((line, index) => <div key={index} style={{ color: line.startsWith("$ ") ? "var(--accent)" : undefined }}>{line}</div>)}
        {busy ? <div className="faint">running…</div> : null}
      </div>
      <form className="collected-input" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <span style={{ color: "var(--accent)" }}>$</span>
        <input data-qd-terminal-input="true" value={command} disabled={busy} onChange={(e) => setCommand(e.target.value)} placeholder="ls" />
      </form>
    </div>
  );
}
