import { GoogleGenAI } from "@google/genai";
import { stripDataUris } from "./model-payload.js";
import { assembledPreviewHasUsableCss, prepareCodeForPreview, isHonestPreviewFailurePage } from "../../src/lib/preview-utils.js";
import { formatJobCardForVerify } from "../../src/lib/studio-job-card.js";
// Commerce intent lives in ONE place — see src/lib/commerce-intent.js for why.
import { briefWantsOnlineSelling, briefWantsProductCatalog } from "../../src/lib/commerce-intent.js";

/*
 * Build Verifier — the keystone of Quantora's outcome-first intelligence.
 *
 * A generated site "looking done" is not the same as it BEING done. This module
 * judges a built artifact against (a) deterministic structural/quality/feature
 * heuristics and (b) an LLM critic, returning a structured report: a score, a
 * pass/fail, a human-readable checklist, and a concrete list of issues that can
 * be fed straight back into the self-heal/refine loop to improve the build.
 *
 * It is a pure library in _lib (adds no serverless function): the /api/chat
 * handler invokes it via a `task: "verify-build"` branch, mirroring repair.
 */

export interface BuildCheck {
  id: string;
  label: string;
  ok: boolean;
  weight: number; // relative importance in the score
  critical?: boolean; // a false critical check caps the score hard
  detail?: string;
}

export interface BuildReport {
  score: number; // 0–100
  passed: boolean;
  checks: BuildCheck[];
  issues: string[]; // concrete, fixable problems (feed into repair/refine)
  summary: string;
  critiqued: boolean; // whether the LLM critic ran
}

const DEFAULT_CRITIC_MODEL = "deepseek/deepseek-chat";

// Small helpers ---------------------------------------------------------------
function count(re: RegExp, s: string): number {
  const m = s.match(re);
  return m ? m.length : 0;
}
function has(re: RegExp, s: string): boolean {
  return re.test(s);
}

function hasRealStyling(src: string): boolean {
  return assembledPreviewHasUsableCss(src);
}

/*
 * Deterministic, no-network checks. Cheap, stable, and impossible to fake — the
 * spine of the verdict. Feature checks activate only when the brief asks for
 * them, so a simple landing page is not penalised for lacking a cart.
 */
export function heuristicChecks(code: string, brief = ""): BuildCheck[] {
  const src = String(code || "");
  const lower = src.toLowerCase();
  const b = String(brief || "").toLowerCase();
  const imgTags = src.match(/<img\b[^>]*>/gi) || [];
  const imgsMissingAlt = imgTags.filter((t) => !/\balt\s*=/i.test(t)).length;
  const imgsEmptySrc = imgTags.filter((t) => /\bsrc\s*=\s*(["'])\s*\1/i.test(t) || !/\bsrc\s*=/i.test(t)).length;

  const checks: BuildCheck[] = [
    { id: "doctype", label: "Valid HTML document", ok: has(/<!doctype html/i, src) && has(/<html[\s>]/i, src), weight: 2, critical: true },
    { id: "styled", label: "Has real styling (not default browser HTML)", ok: hasRealStyling(src), weight: 3, critical: true },
    { id: "runnable-preview", label: "Preview is the real page", ok: !isHonestPreviewFailurePage(src), weight: 3, critical: true },
    { id: "title", label: "Has a page title", ok: has(/<title>[^<]{2,}<\/title>/i, src), weight: 1 },
    { id: "responsive", label: "Responsive viewport meta", ok: has(/<meta[^>]+name=["']viewport["']/i, src), weight: 2 },
    { id: "lang", label: "Language attribute set", ok: has(/<html[^>]+lang\s*=/i, src), weight: 1 },
    { id: "interactive", label: "Real links / buttons (not dead #)", ok: has(/<button[\s>]/i, src) || count(/<a\b[^>]*href\s*=\s*["'](?!#["'])[^"']+["']/i, src) > 0, weight: 1 },
    { id: "img-alt", label: "Images have alt text", ok: imgsMissingAlt === 0, weight: 1, detail: imgsMissingAlt ? `${imgsMissingAlt} image(s) missing alt text` : undefined },
    { id: "img-src", label: "No broken/empty images", ok: imgsEmptySrc === 0, weight: 2, detail: imgsEmptySrc ? `${imgsEmptySrc} image(s) with empty/missing src` : undefined },
    { id: "no-tokens", label: "No leftover placeholder tokens", ok: !has(/\{\{\s*[A-Z0-9_]+\s*\}\}/i, src), weight: 2, detail: has(/\{\{\s*[A-Z0-9_]+\s*\}\}/i, src) ? "Unreplaced {{TOKEN}} placeholders remain" : undefined },
    { id: "no-lorem", label: "No lorem ipsum filler", ok: !has(/lorem ipsum/i, lower), weight: 1 },
    { id: "no-todo", label: "No TODO/placeholder stubs", ok: !has(/\btodo\b|placeholder text|your text here/i, lower), weight: 1 },
  ];

  if (/\b(website|landing page|shop|boutique|storefront|e-?commerce|cafe|caf[eé]|restaurant|salon|clinic|business)\b/.test(b)) {
    checks.push({
      id: "structure",
      label: "Has header/nav and footer structure",
      ok: has(/<nav[\s>]|<header[\s>]/i, src) && has(/<footer[\s>]/i, src),
      weight: 2,
    });
  }

  // Feature checks — only when the brief asks for the capability.
  if (briefWantsOnlineSelling(b)) {
    const hasCart = has(/add[\s-]?to[\s-]?cart|data-quantora-checkout|quantoraCheckout|\bcart\b/i, src);
    checks.push({ id: "feat-cart", label: "Shopping cart / checkout present", ok: hasCart, weight: 3, detail: hasCart ? undefined : "Brief asks to sell, but no cart/checkout was built" });
    const hasPhoto = imgTags.some((tag) => /\bsrc\s*=\s*["'](data:image\/|https?:\/\/|\/api\/preview-image)/i.test(tag));
    // Critical only for a real catalog brief: capping the score on a page that
    // was never meant to show product shots makes it impossible to pass.
    const catalogBrief = briefWantsProductCatalog(b);
    checks.push({
      id: "feat-photos",
      label: "Product photos are real images",
      ok: hasPhoto,
      weight: 3,
      critical: catalogBrief,
      detail: hasPhoto ? undefined : "Brief asks for a catalog, but product images are missing",
    });
  }
  if (/\b(book|booking|appointment|contact|enquiry|inquiry|sign\s?up|signup|waitlist|subscribe|form)\b/.test(b)) {
    const hasForm = has(/<form[\s>]/i, src);
    checks.push({ id: "feat-form", label: "Booking / contact form present", ok: hasForm, weight: 2, detail: hasForm ? undefined : "Brief asks for a form/booking, but none was built" });
  }
  if (/\b(gallery|portfolio|photos|showcase)\b/.test(b)) {
    const enough = imgTags.length >= 3;
    checks.push({ id: "feat-gallery", label: "Gallery with multiple images", ok: enough, weight: 2, detail: enough ? undefined : "Brief asks for a gallery, but few/no images were built" });
  }

  return checks;
}

function scoreFromChecks(checks: BuildCheck[]): number {
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0) || 1;
  const earned = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
  let score = Math.round((earned / totalWeight) * 100);
  // A failed critical check caps the score hard — a page with no styling is not
  // "80% done" no matter what else passes.
  if (checks.some((c) => c.critical && !c.ok)) score = Math.min(score, 45);
  return score;
}

function stripJsonFence(text: string): string {
  const t = (text || "").trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : t).trim();
}

async function critiqueWithOpenRouter(apiKey: string, model: string, code: string, brief: string) {
  const system = `You are a senior design + QA reviewer for shipped websites. Judge the given self-contained HTML against professional standards and the user's brief. Reply with ONLY compact JSON: {"score": <0-100 integer>, "issues": ["short concrete fixable problem", ...], "summary": "one sentence"}. Issues must be specific and actionable (e.g. "hero text has poor contrast on the image", "mobile layout overflows at 375px", "prices are inconsistent"). No prose outside the JSON.`;
  const user = `USER BRIEF:\n${brief || "(none provided — judge on universal quality only)"}\n\nHTML:\n${code.slice(0, 60_000)}`;
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.APP_URL || "https://quantoraai.app",
      "X-Title": "Quantora AI",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.2, stream: false }),
  });
  if (!resp.ok) throw new Error(`Critic request failed (${resp.status})`);
  const json = await resp.json();
  return stripJsonFence(json?.choices?.[0]?.message?.content || "");
}

async function critiqueWithGemini(apiKey: string, code: string, brief: string) {
  const client = new GoogleGenAI({ apiKey });
  let models: string[] = [];
  try {
    const list = await client.models.list();
    for await (const m of list) if (m?.name) models.push(m.name.replace(/^models\//, ""));
  } catch (err: any) {
    throw new Error(`Gemini key rejected: ${err?.message || err}`);
  }
  const pick = models.filter((m) => m.includes("gemini") && m.includes("flash"))[0] || models[0];
  if (!pick) throw new Error("No Gemini model available.");
  const system = `You are a senior design + QA reviewer for shipped websites. Judge the HTML against professional standards and the user's brief. Reply with ONLY compact JSON: {"score": <0-100 integer>, "issues": ["short concrete fixable problem", ...], "summary": "one sentence"}.`;
  const res = await client.models.generateContent({
    model: pick,
    contents: [{ role: "user", parts: [{ text: `USER BRIEF:\n${brief || "(none)"}\n\nHTML:\n${code.slice(0, 60_000)}` }] }],
    config: { systemInstruction: system, temperature: 0.2 },
  });
  return stripJsonFence((res as any)?.text || "");
}

function parseCritique(raw: string): { score?: number; issues: string[]; summary?: string } {
  try {
    const obj = JSON.parse(raw);
    const score = typeof obj.score === "number" ? Math.max(0, Math.min(100, Math.round(obj.score))) : undefined;
    const issues = Array.isArray(obj.issues) ? obj.issues.map((x: any) => String(x)).filter(Boolean).slice(0, 8) : [];
    const summary = typeof obj.summary === "string" ? obj.summary : undefined;
    return { score, issues, summary };
  } catch {
    return { issues: [] };
  }
}

export async function verifyBuild(opts: {
  code: string;
  vfs?: Record<string, unknown>;
  brief?: string;
  job?: unknown;
  openRouterKey?: string;
  geminiKey?: string;
  model?: string;
}): Promise<BuildReport> {
  const { code, vfs = {}, brief = "", job, openRouterKey, geminiKey, model } = opts;
  if (!code || typeof code !== "string" || !code.trim()) {
    throw new Error("No code provided to verify.");
  }

  const assembled = prepareCodeForPreview(code, vfs);
  const judgedBrief = formatJobCardForVerify(job, brief);
  const checks = heuristicChecks(assembled, judgedBrief);
  const heuristicScore = scoreFromChecks(checks);
  const heuristicIssues = checks.filter((c) => !c.ok).map((c) => c.detail || `Missing: ${c.label}`);

  // LLM critic (optional). Blends a subjective design/brief judgement with the
  // objective heuristics. Never fails the whole verification — degrades to
  // heuristics-only when unavailable.
  let critiqued = false;
  let critScore: number | undefined;
  let critIssues: string[] = [];
  let critSummary: string | undefined;
  try {
    if (openRouterKey || geminiKey) {
      // The critic judges layout/design/brief, not image bytes. Strip embedded
      // base64 data-URIs from its copy so they don't burn tokens or crowd real
      // markup out of the 60k window. Heuristics above still see the real code.
      const critiqueCode = stripDataUris(assembled);
      const raw = openRouterKey
        ? await critiqueWithOpenRouter(openRouterKey, model || DEFAULT_CRITIC_MODEL, critiqueCode, judgedBrief)
        : await critiqueWithGemini(geminiKey as string, critiqueCode, judgedBrief);
      const parsed = parseCritique(raw);
      critScore = parsed.score;
      critIssues = parsed.issues;
      critSummary = parsed.summary;
      critiqued = true;
    }
  } catch (err: any) {
    console.warn("Build critic unavailable; using heuristics only:", err?.message || err);
  }

  // Final score: heuristics anchor it; the critic can pull it up or down but not
  // past a failed critical check.
  let score = heuristicScore;
  if (typeof critScore === "number") score = Math.round(heuristicScore * 0.55 + critScore * 0.45);
  if (checks.some((c) => c.critical && !c.ok)) score = Math.min(score, 45);

  const issues = Array.from(new Set([...heuristicIssues, ...critIssues])).slice(0, 10);
  const passed = score >= 80 && !checks.some((c) => c.critical && !c.ok);
  const summary = critSummary
    || (passed ? "Looks professional and complete." : issues[0] ? `Needs work: ${issues[0]}` : "Some quality checks did not pass.");

  return { score, passed, checks, issues, summary, critiqued };
}
