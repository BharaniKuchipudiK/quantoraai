import { BrowserWindow, shell } from "electron";
import { DESKTOP_APP_ORIGIN } from "../../shared/desktop-contract.js";
import { isAllowedExternalUrl } from "../../shared/desktop-bridge-contract.js";
import { preloadPath } from "./config.js";

/*
 * The one renderer. Hardened per design §9: no Node in the page, context
 * isolation on, the Chromium sandbox on, and navigation pinned to the app
 * origin — anything else goes to the system browser or nowhere.
 */

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

export function createMainWindow(): BrowserWindow {
  const existing = getMainWindow();
  if (existing) return existing;

  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: "Quantora",
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
    },
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(`${DESKTOP_APP_ORIGIN}/`) || url === DESKTOP_APP_ORIGIN) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  mainWindow = win;
  void win.loadURL(`${DESKTOP_APP_ORIGIN}/`);
  return win;
}

export function focusMainWindow(): void {
  const win = getMainWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** After sign-in: reload into the app's own post-auth path so it resumes as on the web. */
export function loadPostAuth(): void {
  const win = getMainWindow() || createMainWindow();
  void win.loadURL(`${DESKTOP_APP_ORIGIN}/?auth=success`);
}
