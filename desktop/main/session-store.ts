import { app, safeStorage } from "electron";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/*
 * Where the bearer session lives on disk.
 *
 * safeStorage wraps the OS keychain (Keychain on macOS, DPAPI on Windows,
 * libsecret/kwallet on Linux). When no backend is available — a bare CI box,
 * some minimal Linux desktops — Electron falls back to a plaintext codec and
 * says so via getSelectedStorageBackend(); we record which mode wrote the
 * file so a later read never decrypts garbage, and warn once.
 */

type Envelope = { mode: "safe" | "plain"; data: string };

function filePath(): string {
  return path.join(app.getPath("userData"), "session.bin");
}

let warned = false;

export function readSessionToken(): string | null {
  let raw: string;
  try {
    raw = readFileSync(filePath(), "utf8");
  } catch {
    return null;
  }
  try {
    const envelope = JSON.parse(raw) as Envelope;
    if (envelope.mode === "safe") {
      if (!safeStorage.isEncryptionAvailable()) return null;
      return safeStorage.decryptString(Buffer.from(envelope.data, "base64")) || null;
    }
    if (envelope.mode === "plain") return Buffer.from(envelope.data, "base64").toString("utf8") || null;
  } catch {
    /* fall through: a corrupt file reads as signed out */
  }
  return null;
}

export function writeSessionToken(token: string): void {
  mkdirSync(app.getPath("userData"), { recursive: true });
  let envelope: Envelope;
  if (safeStorage.isEncryptionAvailable()) {
    envelope = { mode: "safe", data: safeStorage.encryptString(token).toString("base64") };
  } else {
    if (!warned) {
      warned = true;
      console.warn("[quantora-desktop] OS keychain unavailable; session stored without encryption.");
    }
    envelope = { mode: "plain", data: Buffer.from(token, "utf8").toString("base64") };
  }
  writeFileSync(filePath(), JSON.stringify(envelope), { mode: 0o600 });
}

export function clearSessionToken(): void {
  rmSync(filePath(), { force: true });
}
