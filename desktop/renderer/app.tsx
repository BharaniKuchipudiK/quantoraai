import { useCallback, useEffect, useRef, useState } from "react";
import { bridge, bridgeAvailable, type AuthStatus, type HostInfo, type WorkspaceInfo } from "./lib/bridge.js";
import { SignIn } from "./screens/SignIn.js";
import { Launcher } from "./screens/Launcher.js";
import { Workspace } from "./screens/Workspace.js";

/*
 * Three screens, one rule: you are either signed out, choosing a folder, or
 * working in one. The host owns the truth for all three (session in the
 * keychain, folder in the runtime); this component only asks and reacts.
 */

type Screen = "booting" | "unavailable" | "signin" | "launcher" | "workspace";

export type MenuBus = { subscribe: (fn: (action: string) => void) => () => void };

export function App() {
  const [screen, setScreen] = useState<Screen>("booting");
  const [host, setHost] = useState<HostInfo | null>(null);
  const [auth, setAuth] = useState<AuthStatus>({ signedIn: false, user: null });
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [bootError, setBootError] = useState("");
  const menuListeners = useRef(new Set<(action: string) => void>());

  const refresh = useCallback(async () => {
    const api = bridge();
    const [hostInfo, status, ws] = await Promise.all([api.host(), api.auth.status(), api.workspace.info()]);
    setHost(hostInfo);
    setAuth(status);
    setWorkspace(ws);
    if (!status.signedIn) setScreen("signin");
    else if (ws.attached) setScreen("workspace");
    else setScreen("launcher");
  }, []);

  useEffect(() => {
    if (!bridgeAvailable()) {
      setScreen("unavailable");
      return;
    }
    refresh().catch((error) => {
      setBootError(error?.message || String(error));
      setScreen("unavailable");
    });
    const api = bridge();
    const offAuth = api.auth.onChanged(() => { refresh().catch(() => {}); });
    const offMenu = api.onMenuAction((action) => {
      if (action === "open-folder") {
        api.workspace.open().then((info) => {
          if (info.attached) refresh().catch(() => {});
        }).catch(() => {});
        return;
      }
      if (action === "close-workspace") {
        api.workspace.close().then(() => refresh()).catch(() => {});
        return;
      }
      if (action === "sign-out") {
        api.auth.signOut().then(() => refresh()).catch(() => {});
        return;
      }
      menuListeners.current.forEach((fn) => fn(action));
    });
    return () => { offAuth(); offMenu(); };
  }, [refresh]);

  const menuBus: MenuBus = {
    subscribe: (fn) => {
      menuListeners.current.add(fn);
      return () => { menuListeners.current.delete(fn); };
    },
  };

  if (screen === "booting") {
    return <div className="screen-center faint" data-qd-screen="booting">Starting Quantora…</div>;
  }
  if (screen === "unavailable") {
    return (
      <div className="screen-center" data-qd-screen="unavailable">
        <div className="card">
          <div className="brand"><div className="brand-mark">Q</div><div><div className="brand-name">Quantora</div></div></div>
          <p className="error" style={{ marginTop: 20 }}>{bootError || "This page must run inside Quantora Desktop."}</p>
        </div>
      </div>
    );
  }
  if (screen === "signin") return <SignIn onSignedIn={refresh} />;
  if (screen === "launcher" || !workspace?.attached) {
    return <Launcher user={auth.user} host={host} onOpened={refresh} onSignedOut={refresh} />;
  }
  return (
    <Workspace
      key={workspace.root || "workspace"}
      workspace={workspace}
      user={auth.user}
      host={host}
      menu={menuBus}
      onClosed={refresh}
    />
  );
}
