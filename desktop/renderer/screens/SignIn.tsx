import { useState } from "react";
import { bridge } from "../lib/bridge.js";

export function SignIn({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setError("");
    setWaiting(true);
    try {
      await bridge().auth.signIn();
    } catch (err: any) {
      setWaiting(false);
      setError(err?.message || "Could not open your browser.");
    }
  }

  return (
    <div className="screen-center drag" data-qd-screen="signin">
      <div className="card no-drag">
        <div className="brand">
          <div className="brand-mark">Q</div>
          <div>
            <div className="brand-name">Quantora</div>
            <div className="brand-sub">Desktop</div>
          </div>
        </div>
        <p className="muted" style={{ margin: "24px 0 20px", lineHeight: 1.6 }}>
          Sign in with your browser. Google, GitHub or email — the same account as the web. Your session is kept in the system keychain, never in this window.
        </p>
        <button type="button" className="btn btn-primary" data-qd-signin="true" disabled={waiting} onClick={start} style={{ width: "100%", justifyContent: "center", padding: "10px 14px" }}>
          {waiting ? "Waiting for your browser…" : "Continue in browser"}
        </button>
        {waiting ? (
          <p className="faint" style={{ marginTop: 14, fontSize: 12 }}>
            Finish signing in, then come back here. <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setWaiting(false); }}>Start over</button>
          </p>
        ) : null}
        {error ? <p className="error" style={{ marginTop: 14 }}>{error}</p> : null}
        <button type="button" hidden onClick={() => { onSignedIn().catch(() => {}); }} />
      </div>
    </div>
  );
}
