// Shim — the implementation lives in shared/studio-choices.js (one module
// for both sides of the wire; see ARCHITECTURE.md §3). The TypeScript types
// stay here so server modules keep their imports.
export type StudioChoice = {
  id: string;
  label: string;
  value: string;
  description?: string;
};

export type StudioChoiceSet = {
  title?: string;
  prompt?: string;
  choices: StudioChoice[];
};

export * from "../../shared/studio-choices.js";
