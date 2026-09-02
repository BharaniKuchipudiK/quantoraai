import { app, dialog, session } from "electron";
import path from "node:path";
import { DESKTOP_DEEP_LINK_SCHEME } from "../../shared/desktop-contract.js";
import { apiOrigin, isSmokeMode, vercelConfigPath, webDistDir, webDistReady } from "./config.js";
import { completeSignIn } from "./auth-broker.js";
import { deepLinkFromArgv } from "./auth-flow.js";
import { notifyAuthChanged, registerIpc } from "./ipc.js";
import { installQuantoraProtocol, registerQuantoraScheme } from "./protocol.js";
import { createMainWindow, focusMainWindow, loadPostAuth } from "./window.js";

/*
 * Quantora Desktop — main process entry (design §3, §4, §9).
 *
 * Lifecycle: register the scheme → claim single-instance → claim the
 * quantora:// protocol with the OS → on ready, install the protocol handler,
 * the IPC surface and the window. Deep links arrive via `open-url` (macOS)
 * or a second instance's argv (Windows/Linux); both funnel into one handler.
 */

registerQuantoraScheme();

// The smoke gate points the keychain file at a throwaway directory so a CI
// run never reads or writes a developer's real session. Smoke mode only.
if (isSmokeMode() && process.env.QUANTORA_USER_DATA_DIR) {
  app.setPath("userData", path.resolve(process.env.QUANTORA_USER_DATA_DIR));
}

const isPrimary = app.requestSingleInstanceLock();
if (!isPrimary) {
  app.quit();
} else {
  // In development the executable is `electron`; the OS needs the script path
  // to route a deep link back to this app rather than a bare Electron shell.
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(DESKTOP_DEEP_LINK_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(DESKTOP_DEEP_LINK_SCHEME);
  }

  app.on("second-instance", (_event, argv) => {
    focusMainWindow();
    const link = deepLinkFromArgv(argv);
    if (link) void handleDeepLink(link);
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    void handleDeepLink(url);
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    createMainWindow();
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[quantora-desktop] unhandled rejection:", reason);
  });

  void app.whenReady().then(() => {
    if (!webDistReady()) {
      const message = `The web bundle was not found at ${webDistDir()}.\nRun \`npm run build\` in the repository root first.`;
      if (isSmokeMode()) {
        console.error(`[quantora-desktop] ${message}`);
        app.exit(2);
        return;
      }
      dialog.showErrorBox("Quantora Desktop", message);
      app.quit();
      return;
    }
    try {
      if (isSmokeMode() && process.env.QUANTORA_DESKTOP_BLOCK_EXTERNAL === "1") {
        // The gate must not depend on the network: fonts, analytics and any
        // other third-party fetch are cancelled so a hung upstream can never
        // stall the renderer. Only the app origin and the API mirror pass.
        const allowed = [`${DESKTOP_DEEP_LINK_SCHEME}://`, apiOrigin(), "devtools://", "chrome-extension://", "data:", "blob:"];
        session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
          callback({ cancel: !allowed.some((prefix) => details.url.startsWith(prefix)) });
        });
        // And no proxy: the mirror is on loopback and a CI proxy must not sit in between.
        void session.defaultSession.setProxy({ mode: "direct" });
      }
      installQuantoraProtocol({ apiOrigin: apiOrigin(), distDir: webDistDir(), vercelConfigFile: vercelConfigPath() });
      registerIpc();
      createMainWindow();
    } catch (error) {
      console.error("[quantora-desktop] startup failed:", error);
      app.exit(3);
      return;
    }

    const initialLink = deepLinkFromArgv(process.argv);
    if (initialLink) void handleDeepLink(initialLink);
  });
}

async function handleDeepLink(url: string): Promise<void> {
  const outcome = await completeSignIn(url);
  focusMainWindow();
  if (outcome.ok === true) {
    notifyAuthChanged({ signedIn: true });
    loadPostAuth();
    return;
  }
  if (outcome.error === "Not a sign-in link.") return;
  // A modal box would hang a headless gate; the message is the same either way.
  if (isSmokeMode()) {
    console.error(`[quantora-desktop] sign-in did not complete: ${outcome.error}`);
    return;
  }
  dialog.showErrorBox("Sign-in did not complete", outcome.error);
}
