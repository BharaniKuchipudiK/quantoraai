import { Menu, Tray, app, nativeImage } from "electron";
import { createMainWindow, focusMainWindow, setCloseToBackground } from "./window.js";
import { pollWatches } from "./watch-loop.js";

/*
 * Background presence (design §7). Closing the window hides it; the tray
 * keeps the host alive so the watch loop can run and notify. "Quit" in the
 * tray menu really quits. A tray that cannot be created (some headless or
 * minimal Linux sessions) is reported as such, and closing the window then
 * quits the app exactly as before — no invisible process.
 */

// 16×16 orange square; the real icon set lands with packaging (D4).
const TRAY_ICON_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR42mP4WSxGEmIY1TCqYfhqAAAYwIIQgMwUmgAAAABJRU5ErkJggg==";

let tray: Tray | null = null;

export function installTray(): boolean {
  if (tray) return true;
  try {
    const image = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_PNG}`);
    tray = new Tray(image);
    tray.setToolTip("Quantora");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Open Quantora", click: () => { createMainWindow(); focusMainWindow(); } },
      { label: "Check watched questions now", click: () => { void pollWatches(); } },
      { type: "separator" },
      { label: "Quit Quantora", click: () => { app.quit(); } },
    ]));
    tray.on("click", () => { createMainWindow(); focusMainWindow(); });
    setCloseToBackground(true);
    return true;
  } catch (error) {
    console.warn("[quantora-desktop] tray unavailable:", (error as Error)?.message || error);
    tray = null;
    setCloseToBackground(false);
    return false;
  }
}

export function trayActive(): boolean {
  return tray !== null;
}
