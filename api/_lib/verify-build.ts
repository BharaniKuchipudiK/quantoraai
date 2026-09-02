import { GoogleGenAI } from "@google/genai";
import { listGeminiModelIds, withNewestGeminiFlash, UserFacingError } from "./gemini-flash.js";
import { fetchWithTimeout } from "./fetch-timeout.js";
import { stripDataUris } from "./model-payload.js";
import { assembledPreviewHasUsableCss, prepareCodeForPreview, isHonestPreviewFailurePage } from "../../src/lib/preview-utils.js";
import { formatJobCardForVerify } from "../../src/lib/studio-job-card.js";
// Commerce intent lives in ONE place — see src/lib/commerce-intent.js for why.
import { briefWantsOnlineSelling, briefWantsProductCatalog } from "../../src/lib/commerce-intent.js";
import { inspectBuildTruth } from "../../src/lib/build-truth.js";
import { isAllowedPreviewImageUrl } from "../../src/lib/preview-images.js";

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
/*
 * Controls a person would click that a machine can prove are wired.
 *
 * Everything else in this file asks whether a STRING is present. "Add to
 * Cart" as text passed feat-cart; a <button> existing passed interactive. A
 * boutique page whose nav, Add to Cart and Checkout were all dead scored
 * 100/100 and passed, because every question asked was about the source
 * rather than about the page. The person who asked for that shop finds out by
 * clicking.
 *
 * build-truth.js already answers the harder question and nothing here was
 * asking it. It is deliberately silent when it cannot be sure — a component
 * framework owning the wiring, or a delegated listener it cannot follow — so
 * the checks below are only added for the categories it actually ran. A check
 * that is green because it never executed is worse than no check.
 */
const SELL_CONTROL = /add[\s-]?to[\s-]?(?:cart|bag|basket)|buy\s?now|checkout|place\s+order/i;

/*
 * A page that loads script it did not inline.
 *
 * build-truth reads script BODIES, so `<script src="https://cdn/commerce.js">`
 * is invisible to it and a storefront that delegates its cart to a commerce SDK
 * reads as a dead Add to Cart. Capping such a build at 45 asserts knowledge we
 * do not have — the wiring may be perfectly real in code we cannot see. The
 * finding is still worth surfacing, so the check stays and only the CAP stands
 * down. Silent when unsure is the rule; silent about everything is not.
 */
const LOADS_EXTERNAL_SCRIPT = /<script\b[^>]*\bsrc\s*=/i;

export function heuristicChecks(code: string, brief = "", opts: { files?: string[] } = {}): BuildCheck[] {
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

  const truth = inspectBuildTruth(src, { files: opts.files || [] });
  const stoodDown = new Set(truth.skipped.map((s: any) => s.check));
  const say = (findings: any[]) => findings.slice(0, 3).map((f) => f.what).join(" ");

  if (!stoodDown.has("controls")) {
    const dead = truth.findings.filter((f: any) => f.kind === "dead-control");
    /*
     * Critical only when the brief asked to SELL and the dead control is the
     * one that sells. A dead footer link on a landing page is a defect worth
     * scoring down; a dead Add to Cart on a shop is the shop not existing.
     * Same shape as feat-photos above, and for the same reason: a gate that
     * caps the score on ambiguous evidence is a gate the next person mutes.
     */
    /*
     * Match the control's SOURCE, not just its derived label. build-truth
     * prefers an accessible name, so `<button aria-label="Add dress">Add to
     * Cart</button>` stores "Add dress" and a label-only test misses the very
     * control that sells. data.at locates the exact occurrence, so the element
     * itself — attributes and visible text alike — is what gets classified.
     */
    const deadSellControl = dead.filter((f: any) => {
      if (SELL_CONTROL.test(String(f.data?.label || ""))) return true;
      const at = Number(f.data?.at);
      return Number.isFinite(at) && SELL_CONTROL.test(src.slice(at, at + 200));
    });
    checks.push({
      id: "controls-wired",
      label: "Buttons and links actually do something",
      ok: dead.length === 0,
      weight: 3,
      critical: briefWantsOnlineSelling(b) && deadSellControl.length > 0 && !LOADS_EXTERNAL_SCRIPT.test(src),
      detail: dead.length ? `${dead.length} control(s) do nothing when clicked. ${say(dead)}` : undefined,
    });
  }

  if (!stoodDown.has("links")) {
    const broken = truth.findings.filter((f: any) => f.kind === "broken-link");
    checks.push({
      id: "links-resolve",
      label: "Links go where they say",
      ok: broken.length === 0,
      weight: 2,
      detail: broken.length ? `${broken.length} link(s) point nowhere. ${say(broken)}` : undefined,
    });
  }

  return checks;
}

/*
 * IMAGE LIVENESS — the "confidently wrong raises no error" class.
 *
 * Every image check above asks about the STRING: src present, src shaped like
 * a URL. On 2026-09-01 a boutique shipped with cart and checkout working and
 * every product frame empty — invented Unsplash IDs and the retired
 * source.unsplash.com — while the model claimed "verified photographs" three
 * turns running. Whether a URL loads is network truth; this probe asks it and
 * hands the dead URLs, by name, to the repair loop.
 *
 * Precision rule (§5): only a definitive upstream verdict is "dead" — HTTP
 * 4xx, or a 2xx that is not an image. Timeouts and 5xx are indeterminate and
 * never fail a build, so this cannot become the next muted gate.
 */
/** src attributes arrive HTML-encoded; the browser decodes before fetching,
 *  so the probe must too — `&amp;sig=y` probed literally 4xx'd a URL that
 *  loads fine in Preview (Codex P2 on PR #442). */
function decodeHtmlAttribute(value: string): string {
  return String(value || "").replace(/&(amp|quot|apos|lt|gt|#0*39);/gi, (whole, name) => (
    { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" }[name.toLowerCase()] ?? "'"
  ));
}

export function collectRemoteImageProbes(code: string, limit = 8): string[] {
  const src = String(code || "");
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /\bsrc\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) && out.length < limit) {
    let url = decodeHtmlAttribute(m[1].trim());
    if (url.startsWith("/api/preview-image")) {
      const idx = url.indexOf("u=");
      if (idx === -1) continue;
      // Same contract as the proxy: `u` owns everything after it, unencoded.
      url = url.slice(idx + 2);
      if (!/^https?:\/\//i.test(url)) {
        try { url = decodeURIComponent(url); } catch { continue; }
      }
    }
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    /*
     * SSRF guard (Codex P1 on PR #442): this markup is model/user-controlled
     * and the probe runs server-side, so an unfiltered GET reaches cloud
     * metadata and internal services. Only the same https allowlist the
     * preview proxy enforces may be probed; everything else is simply not
     * checked (the proxy will refuse to serve it anyway).
     */
    if (!isAllowedPreviewImageUrl(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export async function probeImageLiveness(
  urls: string[],
  opts: { fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ checked: number; dead: Array<{ url: string; why: string }>; indeterminate: number }> {
  const fetchFn = opts.fetchFn || fetch;
  const timeoutMs = opts.timeoutMs ?? 4_000;
  const dead: Array<{ url: string; why: string }> = [];
  let indeterminate = 0;
  await Promise.all(urls.map(async (url) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let upstream: any;
      try {
        upstream = await fetchFn(url, {
          // Never follow server-side: a redirect could hop off the allowlist
          // onto an internal address. A 3xx lands in the indeterminate branch
          // below — no verdict, no request to wherever it pointed.
          redirect: "manual",
          signal: controller.signal,
          headers: { Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
        });
      } finally {
        clearTimeout(timer);
      }
      const type = String(upstream?.headers?.get?.("content-type") || "");
      if (upstream.status >= 400 && upstream.status < 500) {
        dead.push({ url, why: `HTTP ${upstream.status}` });
      } else if (upstream.ok && type && !/^image\//i.test(type)) {
        dead.push({ url, why: `not an image (${type.split(";")[0]})` });
      } else if (!upstream.ok) {
        indeterminate += 1;
      }
    } catch {
      indeterminate += 1;
    }
  }));
  return { checked: urls.length, dead, indeterminate };
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
  const resp = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.APP_URL || "https://quantoraai.app",
      "X-Title": "Quantora AI",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.2, stream: false }),
  }, 45_000);
  if (!resp.ok) throw new Error(`Critic request failed (${resp.status})`);
  const json = await resp.json();
  return stripJsonFence(json?.choices?.[0]?.message?.content || "");
}

async function critiqueWithGemini(apiKey: string, code: string, brief: string) {
  const client = new GoogleGenAI({ apiKey });
  let models: string[] = [];
  try {
    models = await listGeminiModelIds(client);
  } catch (err: any) {
    // Never embed err.message — the Gemini SDK's message is the raw JSON
    // response body (see gemini-flash.ts).
    console.warn("Gemini model listing failed for critic:", err?.message || err);
    throw new Error("The Gemini key was rejected while listing models.");
  }
  const system = `You are a senior design + QA reviewer for shipped websites. Judge the HTML against professional standards and the user's brief. Reply with ONLY compact JSON: {"score": <0-100 integer>, "issues": ["short concrete fixable problem", ...], "summary": "one sentence"}.`;
  // A listed id can be retired for serving (see gemini-flash.ts); advance
  // past retired candidates instead of failing on the first.
  const res = await withNewestGeminiFlash(models, (model) => client.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: `USER BRIEF:\n${brief || "(none)"}\n\nHTML:\n${code.slice(0, 60_000)}` }] }],
    config: { systemInstruction: system, temperature: 0.2 },
  }));
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
  /** Injectable for the liveness gate; defaults to global fetch. */
  fetchImage?: typeof fetch;
}): Promise<BuildReport> {
  const { code, vfs = {}, brief = "", job, openRouterKey, geminiKey, model } = opts;
  if (!code || typeof code !== "string" || !code.trim()) {
    throw new UserFacingError("No code provided to verify.");
  }

  const assembled = prepareCodeForPreview(code, vfs);
  const judgedBrief = formatJobCardForVerify(job, brief);
  const checks = heuristicChecks(assembled, judgedBrief, { files: Object.keys(vfs || {}) });

  // Photos that actually load — network truth the string checks cannot see.
  // Additive and fail-open: a probe crash never blocks verification.
  try {
    const probes = collectRemoteImageProbes(assembled);
    if (probes.length) {
      const live = await probeImageLiveness(probes, { fetchFn: opts.fetchImage });
      checks.push({
        id: "img-live",
        label: "Photos actually load",
        ok: live.dead.length === 0,
        weight: 3,
        critical: live.dead.length > 0 && briefWantsProductCatalog(judgedBrief.toLowerCase()),
        detail: live.dead.length
          ? `${live.dead.length} of ${live.checked} checked photo URL(s) are dead — replace them: ${live.dead.slice(0, 3).map((d) => `${d.url} (${d.why})`).join("; ")}`
          : undefined,
      });
    }
  } catch { /* liveness is additive; verification proceeds without it */ }

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
