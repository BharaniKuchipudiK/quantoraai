import { GoogleGenAI } from "@google/genai";
import { fetchWithTimeout } from "./fetch-timeout.js";
import {
  admitResearchSourceUrl,
  verifyResearchClaimEvidence,
  type ResearchClaimStance,
  type ResearchClaimVerificationResult,
} from "./research-claim-verifier.js";
import {
  fetchResearchSourceText,
  type ResearchSourceFetchResult,
} from "./research-source-fetch.js";

/**
 * The Research desk's verification pass, folded into /api/chat as
 * task:"research-verify" (no new serverless function).
 *
 * Layering mirrors the Build Verifier: a model is only a PROPOSER here — it
 * nominates, for each claim, the best evidence passage in the fetched
 * sources and judges its stance. The deterministic verifier then insists the
 * passage exists verbatim in the source text, and only that check can grant
 * a standing. A model that paraphrases, invents, or cites a page that was
 * never fetched produces exactly nothing.
 */

export const RESEARCH_VERIFY_VERSION = "research-verify-2026-09-01.1";

const MAX_CLAIMS = 8;
const MAX_SOURCES = 6;
const MIN_CLAIM_CHARS = 12;
const MAX_CLAIM_CHARS = 500;
/** Per-source slice shown to the proposer; verification uses the full text. */
const PROMPT_SOURCE_CHARS = 24_000;
const MODEL_TIMEOUT_MS = 45_000;
const DEFAULT_PROPOSER_MODEL = "deepseek/deepseek-chat";

export type ResearchVerifyClaim = { id: string; text: string };

export type ResearchEvidenceProposal = {
  claimId: string;
  sourceIndex: number;
  excerpt: string;
  stance: ResearchClaimStance;
};

export type ResearchVerifyResponse = {
  version: string;
  results: Array<{
    claimId: string;
    standing: ResearchClaimVerificationResult["standing"];
    reasonCode: string;
    excerpt: string | null;
    sourceUrl: string | null;
  }>;
  sources: Array<{ url: string; fetched: boolean; reason?: string }>;
};

export type ResearchVerifyRequestNormalization = {
  ok: boolean;
  claims?: ResearchVerifyClaim[];
  sources?: string[];
  error?: string;
};

export function normalizeResearchVerifyRequest(body: unknown): ResearchVerifyRequestNormalization {
  const rawClaims = (body as any)?.claims;
  const rawSources = (body as any)?.sources;
  if (!Array.isArray(rawClaims) || rawClaims.length === 0) {
    return { ok: false, error: "At least one claim is required." };
  }
  if (rawClaims.length > MAX_CLAIMS) {
    return { ok: false, error: `At most ${MAX_CLAIMS} claims per verification pass.` };
  }
  if (!Array.isArray(rawSources) || rawSources.length === 0) {
    return { ok: false, error: "At least one source URL is required." };
  }
  if (rawSources.length > MAX_SOURCES) {
    return { ok: false, error: `At most ${MAX_SOURCES} sources per verification pass.` };
  }

  const claims: ResearchVerifyClaim[] = [];
  const seenIds = new Set<string>();
  for (const raw of rawClaims) {
    const id = typeof raw?.id === "string" ? raw.id.trim().slice(0, 200) : "";
    const text = typeof raw?.text === "string" ? raw.text.trim() : "";
    if (!id || seenIds.has(id)) return { ok: false, error: "Each claim needs a unique id." };
    if (text.length < MIN_CLAIM_CHARS || text.length > MAX_CLAIM_CHARS) {
      return { ok: false, error: `Each claim must be ${MIN_CLAIM_CHARS}-${MAX_CLAIM_CHARS} characters.` };
    }
    seenIds.add(id);
    claims.push({ id, text });
  }

  const sources: string[] = [];
  for (const raw of rawSources) {
    const admission = admitResearchSourceUrl(raw);
    if (!admission.ok || !admission.url) {
      return { ok: false, error: `Source URL rejected (${admission.reason || "source_url_invalid"}).` };
    }
    if (!sources.includes(admission.url)) sources.push(admission.url);
  }

  return { ok: true, claims, sources };
}

function parseProposals(raw: string): ResearchEvidenceProposal[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim());
  } catch {
    return [];
  }
  const list = Array.isArray(parsed) ? parsed : (parsed as any)?.evidence;
  if (!Array.isArray(list)) return [];
  const proposals: ResearchEvidenceProposal[] = [];
  for (const item of list) {
    const claimId = typeof item?.claimId === "string" ? item.claimId.trim() : "";
    const sourceIndex = Number(item?.sourceIndex);
    const excerpt = typeof item?.excerpt === "string" ? item.excerpt : "";
    const stance = item?.stance;
    if (!claimId || !Number.isInteger(sourceIndex) || !excerpt) continue;
    if (stance !== "supports" && stance !== "contradicts") continue;
    proposals.push({ claimId, sourceIndex, excerpt, stance });
  }
  return proposals;
}

function proposerPrompt(
  claims: ResearchVerifyClaim[],
  sources: Array<{ index: number; url: string; text: string }>,
): { system: string; user: string } {
  const system = `You are an evidence auditor. For each claim, find the single best passage in the numbered sources that either supports or contradicts it.
Rules:
- "excerpt" MUST be copied character-for-character from the source text — a complete statement of 1-3 sentences, at least 40 characters. Never paraphrase, never stitch fragments, never add words.
- "stance" is "supports" only when the passage genuinely backs the claim, "contradicts" when it genuinely conflicts with it.
- If no source contains such a passage for a claim, omit that claim entirely. Never invent evidence.
Reply with ONLY compact JSON: {"evidence":[{"claimId":"...","sourceIndex":<number>,"excerpt":"...","stance":"supports"|"contradicts"}]}`;
  const claimBlock = claims.map((claim) => `- [${claim.id}] ${claim.text}`).join("\n");
  const sourceBlock = sources
    .map((source) => `SOURCE ${source.index} (${source.url}):\n${source.text.slice(0, PROMPT_SOURCE_CHARS)}`)
    .join("\n\n");
  return { system, user: `CLAIMS:\n${claimBlock}\n\n${sourceBlock}` };
}

export async function proposeResearchEvidence(input: {
  claims: ResearchVerifyClaim[];
  sources: Array<{ index: number; url: string; text: string }>;
  openRouterKey?: string;
  geminiKey?: string;
}): Promise<ResearchEvidenceProposal[]> {
  const { system, user } = proposerPrompt(input.claims, input.sources);

  if (input.openRouterKey) {
    const resp = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.openRouterKey}`,
        "HTTP-Referer": process.env.APP_URL || "https://quantoraai.app",
        "X-Title": "Quantora AI",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_PROPOSER_MODEL,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0,
        stream: false,
      }),
    }, MODEL_TIMEOUT_MS);
    if (!resp.ok) throw new Error(`Evidence proposer failed (${resp.status})`);
    const json = await resp.json();
    return parseProposals(json?.choices?.[0]?.message?.content || "");
  }

  if (input.geminiKey) {
    // Never pin a Gemini version id (see no-retired-gemini-ids invariant):
    // discover what the key can actually serve and prefer a flash tier.
    const client = new GoogleGenAI({ apiKey: input.geminiKey });
    const models: string[] = [];
    const list = await client.models.list();
    for await (const model of list) {
      if (model?.name) models.push(model.name.replace(/^models\//, ""));
    }
    const pick = models.filter((id) => id.includes("gemini") && id.includes("flash"))[0] || models[0];
    if (!pick) throw new Error("No Gemini model available for evidence proposal.");
    const result = await client.models.generateContent({
      model: pick,
      contents: [{ role: "user", parts: [{ text: user }] }],
      config: { systemInstruction: system, temperature: 0 },
    });
    return parseProposals((result as any)?.text || "");
  }

  throw new Error("No model key available for evidence proposal.");
}

export async function runResearchVerification(input: {
  claims: ResearchVerifyClaim[];
  sources: string[];
  fetchText?: (url: string) => Promise<ResearchSourceFetchResult>;
  proposeEvidence?: (input: {
    claims: ResearchVerifyClaim[];
    sources: Array<{ index: number; url: string; text: string }>;
  }) => Promise<ResearchEvidenceProposal[]>;
  openRouterKey?: string;
  geminiKey?: string;
}): Promise<ResearchVerifyResponse> {
  const fetchText = input.fetchText ?? ((url: string) => fetchResearchSourceText(url));
  const fetched = await Promise.all(input.sources.map((url) => fetchText(url)));

  const sourcesReport = fetched.map((result, index) => (result.ok
    ? { url: input.sources[index], fetched: true as const }
    : { url: input.sources[index], fetched: false as const, reason: result.reason }));

  const reachable = fetched
    .map((result, index) => ({ result, index }))
    .filter((entry) => entry.result.ok && typeof entry.result.text === "string" && entry.result.text)
    .map((entry) => ({ index: entry.index, url: input.sources[entry.index], text: entry.result.text as string }));

  const unverifiedAll = (reasonCode: string): ResearchVerifyResponse => ({
    version: RESEARCH_VERIFY_VERSION,
    results: input.claims.map((claim) => ({
      claimId: claim.id,
      standing: "unverified" as const,
      reasonCode,
      excerpt: null,
      sourceUrl: null,
    })),
    sources: sourcesReport,
  });

  if (reachable.length === 0) return unverifiedAll("no_reachable_sources");

  let proposals: ResearchEvidenceProposal[];
  try {
    proposals = input.proposeEvidence
      ? await input.proposeEvidence({ claims: input.claims, sources: reachable })
      : await proposeResearchEvidence({
        claims: input.claims,
        sources: reachable,
        openRouterKey: input.openRouterKey,
        geminiKey: input.geminiKey,
      });
  } catch {
    return unverifiedAll("evidence_proposal_failed");
  }

  const textByIndex = new Map(reachable.map((source) => [source.index, source]));
  const results = input.claims.map((claim) => {
    const own = proposals.filter((proposal) => proposal.claimId === claim.id);
    let best: ResearchClaimVerificationResult | null = null;
    let lastReason = "no_evidence_proposed";
    for (const proposal of own) {
      const source = textByIndex.get(proposal.sourceIndex);
      if (!source) { lastReason = "evidence_source_not_fetched"; continue; }
      const verdict = verifyResearchClaimEvidence({
        claimId: claim.id,
        claimText: claim.text,
        sourceUrl: source.url,
        sourceText: source.text,
        proposedExcerpt: proposal.excerpt,
        stance: proposal.stance,
      });
      if (verdict.standing === "supported") { best = verdict; break; }
      if (verdict.standing === "contested" && !best) { best = verdict; continue; }
      lastReason = verdict.reasonCode;
    }
    if (best) {
      return {
        claimId: claim.id,
        standing: best.standing,
        reasonCode: best.reasonCode,
        excerpt: best.excerpt,
        sourceUrl: best.sourceUrl,
      };
    }
    return { claimId: claim.id, standing: "unverified" as const, reasonCode: lastReason, excerpt: null, sourceUrl: null };
  });

  return { version: RESEARCH_VERIFY_VERSION, results, sources: sourcesReport };
}
