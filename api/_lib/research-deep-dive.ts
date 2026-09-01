import { GoogleGenAI } from "@google/genai";
import { admitResearchSourceUrl } from "./research-claim-verifier.js";

/**
 * The Research desk's deep dive: decompose → search → synthesize, folded
 * into /api/chat as task:"research-deep-dive" (no new serverless function).
 *
 * The output is not a new data shape. The dive returns TRANSCRIPT MESSAGES
 * in the exact canonical format the dossier brief already parses — a
 * `**Plan**` block, then a pursuit turn and a grounded answer (with the
 * server-shaped `**Sources**` block) per sub-question. The client appends
 * them to the conversation and the board derives plan, explored marks,
 * findings and the source ledger through the same tested machinery as any
 * hand-typed investigation. One machinery, no drift.
 *
 * Honesty properties:
 * - A sub-question whose grounded lookup failed gets NO answer message: its
 *   plan item stays an open chip the analyst can pursue. A refused lookup
 *   is not an outage, and it is never a fabricated answer.
 * - An answer with no grounding sources carries no Sources block, so the
 *   board counts it as unverified — never dressed up.
 * - The dive fails closed: no valid sub-questions, or every lookup failing,
 *   is an error, not an empty success.
 */

export const RESEARCH_DEEP_DIVE_VERSION = "research-deep-dive-2026-09-02.1";

const MIN_QUESTION_CHARS = 12;
const MAX_QUESTION_CHARS = 500;
const MAX_SUB_QUESTIONS = 3;
const MIN_SUB_QUESTION_CHARS = 12;
const MAX_SUB_QUESTION_CHARS = 200;
const MAX_ANSWER_CHARS = 4_000;
const MAX_SOURCES_PER_ANSWER = 5;
const MODEL_TIMEOUT_NOTE = "deep-dive calls share the function's time budget; keep sub-questions few";

export type DeepDiveGroundedAnswer = {
  answer: string;
  sources: Array<{ uri: string; title: string }>;
};

export type ResearchDeepDiveMessage = { sender: "user" | "ai"; text: string };

export type ResearchDeepDiveResult = {
  ok: boolean;
  version?: string;
  messages?: ResearchDeepDiveMessage[];
  subQuestions?: number;
  grounded?: number;
  error?: string;
};

export function normalizeResearchDeepDiveRequest(body: unknown): { ok: boolean; question?: string; error?: string } {
  const question = typeof (body as any)?.question === "string" ? (body as any).question.trim().replace(/\s+/g, " ") : "";
  if (question.length < MIN_QUESTION_CHARS) return { ok: false, error: "A research question is required." };
  if (question.length > MAX_QUESTION_CHARS) return { ok: false, error: `Questions are capped at ${MAX_QUESTION_CHARS} characters.` };
  return { ok: true, question };
}

function cleanSubQuestions(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const item of list) {
    const text = typeof item === "string" ? item.trim().replace(/\s+/g, " ") : "";
    if (!text.endsWith("?")) continue;
    if (text.length < MIN_SUB_QUESTION_CHARS || text.length > MAX_SUB_QUESTION_CHARS) continue;
    if (out.includes(text)) continue;
    out.push(text);
    if (out.length >= MAX_SUB_QUESTIONS) break;
  }
  return out;
}

/** The canonical Sources block, byte-identical in shape to chat-handler's. */
function sourcesBlock(sources: Array<{ uri: string; title: string }>): string {
  const admitted = sources
    .filter((source) => admitResearchSourceUrl(source?.uri).ok)
    .slice(0, MAX_SOURCES_PER_ANSWER);
  if (admitted.length === 0) return "";
  let block = `\n\n---\n**Sources**\n`;
  admitted.forEach((source, index) => {
    const title = String(source.title || source.uri).replace(/[\[\]]/g, "");
    block += `${index + 1}. [${title}](${source.uri})\n`;
  });
  return block;
}

export function composeDeepDiveMessages(
  question: string,
  subQuestions: string[],
  answers: Array<DeepDiveGroundedAnswer | null>,
): ResearchDeepDiveMessage[] {
  const messages: ResearchDeepDiveMessage[] = [];
  const planLines = subQuestions.map((item) => `- ${item}`).join("\n");
  messages.push({
    sender: "ai",
    text: `Deep dive on: ${question}\n\n**Plan**\n${planLines}\n\nPursuing each sub-question against live sources now.`,
  });
  subQuestions.forEach((subQuestion, index) => {
    const answer = answers[index];
    if (!answer || !answer.answer.trim()) return; // failed lookup → open chip, no invented answer
    messages.push({ sender: "user", text: subQuestion });
    messages.push({
      sender: "ai",
      text: `${answer.answer.trim().slice(0, MAX_ANSWER_CHARS)}${sourcesBlock(answer.sources || [])}`,
    });
  });
  return messages;
}

async function pickGeminiFlash(client: GoogleGenAI): Promise<string> {
  // Never pin a Gemini version id (no-retired-gemini-ids invariant).
  const models: string[] = [];
  const list = await client.models.list();
  for await (const model of list) {
    if (model?.name) models.push(model.name.replace(/^models\//, ""));
  }
  const pick = models.filter((id) => id.includes("gemini") && id.includes("flash"))[0] || models[0];
  if (!pick) throw new Error("No Gemini model available.");
  return pick;
}

async function decomposeWithGemini(question: string, geminiKey: string): Promise<string[]> {
  const client = new GoogleGenAI({ apiKey: geminiKey });
  const model = await pickGeminiFlash(client);
  const result = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: `RESEARCH QUESTION: ${question}` }] }],
    config: {
      systemInstruction: `Decompose the research question into the ${MAX_SUB_QUESTIONS} most decision-relevant sub-questions. Each must be a complete standalone question ending in "?", answerable from current public sources. Reply with ONLY compact JSON: {"subQuestions":["...?","...?"]}.`,
      temperature: 0,
    },
  });
  const raw = String((result as any)?.text || "").replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  try {
    return cleanSubQuestions(JSON.parse(raw)?.subQuestions);
  } catch {
    return [];
  }
}

async function groundedAnswerWithGemini(subQuestion: string, geminiKey: string): Promise<DeepDiveGroundedAnswer> {
  const client = new GoogleGenAI({ apiKey: geminiKey });
  const model = await pickGeminiFlash(client);
  const result = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: subQuestion }] }],
    config: {
      systemInstruction: `You are a research analyst with live web search (${MODEL_TIMEOUT_NOTE}). Answer from what current sources say. State findings as 2-4 short declarative markdown bullets, one finding per bullet — a claim the evidence supports, never a topic heading. If a material claim has no live source, say so in line. Never fabricate a source, number, or date.`,
      temperature: 0.2,
      tools: [{ googleSearch: {} }],
    },
  });
  const sources: Array<{ uri: string; title: string }> = [];
  const seen = new Set<string>();
  const chunks = (result as any)?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (Array.isArray(chunks)) {
    for (const chunk of chunks) {
      const uri = chunk?.web?.uri;
      if (typeof uri === "string" && uri && !seen.has(uri)) {
        seen.add(uri);
        sources.push({ uri, title: chunk?.web?.title || uri });
      }
    }
  }
  return { answer: String((result as any)?.text || ""), sources };
}

export async function runResearchDeepDive(input: {
  question: string;
  geminiKey?: string;
  decompose?: (question: string) => Promise<string[]>;
  groundedAnswer?: (subQuestion: string) => Promise<DeepDiveGroundedAnswer>;
}): Promise<ResearchDeepDiveResult> {
  const decompose = input.decompose
    ?? ((question: string) => {
      if (!input.geminiKey) throw new Error("Deep dive currently requires the Gemini path.");
      return decomposeWithGemini(question, input.geminiKey);
    });
  const groundedAnswer = input.groundedAnswer
    ?? ((subQuestion: string) => {
      if (!input.geminiKey) throw new Error("Deep dive currently requires the Gemini path.");
      return groundedAnswerWithGemini(subQuestion, input.geminiKey);
    });

  let subQuestions: string[];
  try {
    subQuestions = cleanSubQuestions(await decompose(input.question));
  } catch (err: any) {
    return { ok: false, error: err?.message || "The question could not be decomposed." };
  }
  if (subQuestions.length === 0) {
    return { ok: false, error: "The question could not be decomposed into researchable sub-questions." };
  }

  const answers = await Promise.all(subQuestions.map(async (subQuestion) => {
    try {
      return await groundedAnswer(subQuestion);
    } catch {
      return null; // this sub-question stays an open chip on the board
    }
  }));

  const grounded = answers.filter((answer) => answer && answer.answer.trim()).length;
  if (grounded === 0) {
    return { ok: false, error: "No sub-question could be answered against live sources. Try again in a moment." };
  }

  return {
    ok: true,
    version: RESEARCH_DEEP_DIVE_VERSION,
    messages: composeDeepDiveMessages(input.question, subQuestions, answers),
    subQuestions: subQuestions.length,
    grounded,
  };
}
