// Shim — the implementation lives in shared/session-context.js (one module
// for both sides of the wire; see ARCHITECTURE.md §3). The TypeScript types
// stay here so server modules keep their imports.
export type SessionContext = {
  projectId?: string;
  goal?: string;
  facts?: string[];
  understanding?: string;
};

export type ListeningSignal = { type?: string; label?: string; at?: string };

export * from "../../shared/session-context.js";
