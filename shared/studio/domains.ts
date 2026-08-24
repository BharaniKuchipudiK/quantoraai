export type StudioDomain = "travel" | "education" | "finance" | "research";

export const STUDIO_DOMAINS: readonly StudioDomain[] = [
  "travel",
  "education",
  "finance",
  "research",
] as const;

export function normalizeStudioDomain(value: unknown): StudioDomain | null {
  if (value === "travel" || value === "education" || value === "finance" || value === "research") {
    return value;
  }
  return null;
}
