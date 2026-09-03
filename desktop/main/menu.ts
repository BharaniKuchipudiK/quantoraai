import { Menu, app, shell, type MenuItemConstructorOptions } from "electron";
import { DESKTOP_IPC } from "../../shared/desktop-bridge-contract.js";
import { getMainWindow } from "./window.js";

/*
 * The native menu bar. Items that change what the renderer shows send a
 * named action over the bridge; the renderer decides how to honour it.
 */

function send(action: string): void {
  const win = getMainWindow();
  if (win) win.webContents.send(DESKTOP_IPC.menuAction, action);
}

export function installMenu(): void {
  const isMac = process.platform === "darwin";

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: "about" as const },
        { type: "separator" as const },
        { label: "Sign Out", click: () => send("sign-out") },
        { type: "separator" as const },
        { role: "services" as const },
        { type: "separator" as const },
        { role: "hide" as const },
        { role: "hideOthers" as const },
        { role: "unhide" as const },
        { type: "separator" as const },
        { role: "quit" as const },
      ],
    }] : []),
    {
      label: "File",
      submenu: [
        { label: "Open Folder…", accelerator: "CmdOrCtrl+O", click: () => send("open-folder") },
        { label: "New Chat", accelerator: "CmdOrCtrl+N", click: () => send("new-chat") },
        { type: "separator" },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: () => send("save-file") },
        { type: "separator" },
        { label: "Close Workspace", accelerator: "CmdOrCtrl+Shift+W", click: () => send("close-workspace") },
        ...(isMac ? [] : [{ type: "separator" as const }, { label: "Sign Out", click: () => send("sign-out") }, { role: "quit" as const }]),
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" }, { role: "redo" }, { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Toggle Terminal", accelerator: "CmdOrCtrl+`", click: () => send("toggle-terminal") },
        { label: "Toggle Chat", accelerator: "CmdOrCtrl+J", click: () => send("toggle-chat") },
        { type: "separator" },
        ...(app.isPackaged ? [] : [{ role: "reload" as const }, { role: "toggleDevTools" as const }, { type: "separator" as const }]),
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, ...(isMac ? [{ type: "separator" as const }, { role: "front" as const }] : [{ role: "close" as const }])] },
    {
      label: "Help",
      submenu: [
        { label: "Quantora on the web", click: () => { void shell.openExternal("https://quantoraai.app"); } },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
