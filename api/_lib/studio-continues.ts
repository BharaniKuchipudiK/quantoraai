// Shim — the implementation lives in shared/studio-continues.js (one module
// for both sides of the wire; see ARCHITECTURE.md §3). The TypeScript types
// stay here so server modules keep their imports.
export type ContinueItem = {
  id: string;
  label: string;
  value: string;
};

export type ContinueSet = {
  prompt?: string;
  items: ContinueItem[];
};

export * from "../../shared/studio-continues.js";
