import { app } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";

/*
 * Build-time and packaging constants. The API origin is deliberately NOT a
 * user-editable setting: a settings field that points the bearer token at an
 * arbitrary host is a phishing surface (design §5). Developers override it
 * with an environment variable when running against a local server.
 */

export const DEFAULT_API_ORIGIN = "https://quantoraai.app";

export function apiOrigin(): string {
  return String(process.env.QUANTORA_API_ORIGIN || DEFAULT_API_ORIGIN).replace(/\/+$/, "");
}

/**
 * Smoke mode is for the Playwright gate only: sign-in returns the grant URL
 * instead of opening the system browser, so the gate can complete the flow
 * against a local server it controls. Nothing else changes.
 */
export function isSmokeMode(): boolean {
  return process.env.QUANTORA_DESKTOP_SMOKE === "1";
}

export function desktopVersion(): string {
  return String(process.env.QUANTORA_DESKTOP_VERSION || app.getVersion() || "0.0.0");
}

/*
 * In development the bundle lives at desktop/dist/main.cjs, so the repository
 * root is two levels up from __dirname — regardless of whether Electron was
 * launched with the package directory or the file itself as its argument.
 */
function repoRoot(): string {
  return path.join(__dirname, "..", "..");
}

/** The bundled web app (`vite build` output). */
export function webDistDir(): string {
  const override = process.env.QUANTORA_WEB_DIST;
  if (override) return path.resolve(override);
  if (app.isPackaged) return path.join(process.resourcesPath, "web");
  return path.join(repoRoot(), "dist");
}

/** vercel.json — the single source of the header policy the renderer is served with. */
export function vercelConfigPath(): string {
  const override = process.env.QUANTORA_VERCEL_CONFIG;
  if (override) return path.resolve(override);
  if (app.isPackaged) return path.join(process.resourcesPath, "vercel.json");
  return path.join(repoRoot(), "vercel.json");
}

export function preloadPath(): string {
  return path.join(__dirname, "preload.cjs");
}

export function webDistReady(): boolean {
  return existsSync(path.join(webDistDir(), "index.html"));
}
