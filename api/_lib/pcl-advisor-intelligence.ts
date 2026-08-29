import type { PclReversibility, PclRisk } from "./pcl-cognitive-kernel.js";

export const PCL_ADVISOR_INTELLIGENCE_VERSION = "pcl-advisor-intelligence-2026-08-20.1";

export type AdvisorSeverity = "low" | "medium" | "high";

export type AdvisorTarget = {
  id: string;
  label: string;
  successCriteria: string[];
  horizon?: string | null;
};

export type AdvisorEvidence = {
  id: string;
  kind: string;
  statement: string;
  confidence: number;
  sourceRef?: string | null;
  observedAt?: string | null;
};

export type AdvisorGap = {
  id: string;
  kind: string;
  label: string;
  severity: AdvisorSeverity;
  confidence: number;
  dependencyIds: string[];
  blocks: string[];
  evidenceRefs: string[];
  rootCause: boolean;
  addressable: boolean;
};

export type AdvisorIntervention = {
  id: string;
  label: string;
  gapIds: string[];
  expectedBenefit: number;
  urgency: number;
  dependencyLeverage: number;
  confidence: number;
  estimatedMinutes?: number | null;
  risk: PclRisk;
  reversibility: PclReversibility;
  verificationCriteria: string[];
  reasonCodes: string[];
};

export type AdvisorAssessmentCandidate = {
  domain: string;
  target: AdvisorTarget;
  currentStateSummary: string;
  evidence: AdvisorEvidence[];
  gaps: AdvisorGap[];
  interventions: AdvisorIntervention[];
  reasonCodes?: string[];
};

export type PclAdvisorAssessment = AdvisorAssessmentCandidate & {
  version: string;
  recommendedInterventionId: string | null;
  rankedInterventionIds: string[];
  recommendationScore: number | null;
  providerNeutral: true;
};

export type AdvisorRankingPolicy = {
  expectedBenefitWeight: number;
  urgencyWeight: number;
  dependencyLeverageWeight: number;
  confidenceWeight: number;
  timeEfficiencyWeight: number;
  referenceMinutes: number;
};

export const DEFAULT_ADVISOR_RANKING_POLICY: AdvisorRankingPolicy = {
  expectedBenefitWeight: 0.34,
  urgencyWeight: 0.18,
  dependencyLeverageWeight: 0.24,
  confidenceWeight: 0.14,
  timeEfficiencyWeight: 0.10,
  referenceMinutes: 90,
};

export type AdvisorRequest = {
  domain: string;
  goal: string;
  context?: unknown;
};

export type AdvisorDomainAdapter = {
  id: string;
  domain: string;
  priority?: number;
  isAvailable?: () => boolean | Promise<boolean>;
  assess: (request: AdvisorRequest) => AdvisorAssessmentCandidate | Promise<AdvisorAssessmentCandidate>;
};

export type AdvisorRegistryResult = {
  status: "success" | "unavailable" | "failed";
  assessment?: PclAdvisorAssessment;
  adapterId?: string | null;
  error?: string | null;
};

function bounded(value: unknown): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Number(Math.max(0, Math.min(1, numeric)).toFixed(3));
}

function boundedMinutes(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(Math.min(24 * 60, Math.max(1, value)));
}

function cleanText(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function cleanId(value: unknown): string {
  return cleanText(value, 120).replace(/[^a-zA-Z0-9:_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function uniqueStrings(values: unknown, max = 20): string[] {
  if (!Array.isArray(values)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = cleanText(value, 500);
    if (!text) continue;
    const key = text.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= max) break;
  }
  return result;
}

function normalizeTarget(value: AdvisorTarget): AdvisorTarget | null {
  const id = cleanId(value?.id);
  const label = cleanText(value?.label, 300);
  if (!id || !label) return null;
  return {
    id,
    label,
    successCriteria: uniqueStrings(value.successCriteria, 12),
    horizon: cleanText(value.horizon, 120) || null,
  };
}

function normalizeEvidence(value: AdvisorEvidence): AdvisorEvidence | null {
  const id = cleanId(value?.id);
  const kind = cleanText(value?.kind, 80);
  const statement = cleanText(value?.statement, 600);
  if (!id || !kind || !statement) return null;
  return {
    id,
    kind,
    statement,
    confidence: bounded(value.confidence),
    sourceRef: cleanText(value.sourceRef, 300) || null,
    observedAt: cleanText(value.observedAt, 80) || null,
  };
}

function normalizeGap(value: AdvisorGap): AdvisorGap | null {
  const id = cleanId(value?.id);
  const kind = cleanText(value?.kind, 80);
  const label = cleanText(value?.label, 400);
  if (!id || !kind || !label) return null;
  const severity: AdvisorSeverity = value.severity === "high" || value.severity === "medium" ? value.severity : "low";
  return {
    id,
    kind,
    label,
    severity,
    confidence: bounded(value.confidence),
    dependencyIds: uniqueStrings(value.dependencyIds, 20).map(cleanId).filter(Boolean),
    blocks: uniqueStrings(value.blocks, 20),
    evidenceRefs: uniqueStrings(value.evidenceRefs, 20).map(cleanId).filter(Boolean),
    rootCause: value.rootCause === true,
    addressable: value.addressable !== false,
  };
}

function normalizeIntervention(value: AdvisorIntervention): AdvisorIntervention | null {
  const id = cleanId(value?.id);
  const label = cleanText(value?.label, 500);
  if (!id || !label) return null;
  const risk: PclRisk = value.risk === "high" || value.risk === "medium" ? value.risk : "low";
  const reversibility: PclReversibility = value.reversibility === "hard" || value.reversibility === "partial" ? value.reversibility : "easy";
  return {
    id,
    label,
    gapIds: uniqueStrings(value.gapIds, 20).map(cleanId).filter(Boolean),
    expectedBenefit: bounded(value.expectedBenefit),
    urgency: bounded(value.urgency),
    dependencyLeverage: bounded(value.dependencyLeverage),
    confidence: bounded(value.confidence),
    estimatedMinutes: boundedMinutes(value.estimatedMinutes),
    risk,
    reversibility,
    verificationCriteria: uniqueStrings(value.verificationCriteria, 12),
    reasonCodes: uniqueStrings(value.reasonCodes, 12).map(cleanId).filter(Boolean),
  };
}

function policyWeights(policy: AdvisorRankingPolicy): AdvisorRankingPolicy {
  const values = {
    expectedBenefitWeight: Math.max(0, policy.expectedBenefitWeight || 0),
    urgencyWeight: Math.max(0, policy.urgencyWeight || 0),
    dependencyLeverageWeight: Math.max(0, policy.dependencyLeverageWeight || 0),
    confidenceWeight: Math.max(0, policy.confidenceWeight || 0),
    timeEfficiencyWeight: Math.max(0, policy.timeEfficiencyWeight || 0),
  };
  const total = Object.values(values).reduce((sum, item) => sum + item, 0) || 1;
  return {
    expectedBenefitWeight: values.expectedBenefitWeight / total,
    urgencyWeight: values.urgencyWeight / total,
    dependencyLeverageWeight: values.dependencyLeverageWeight / total,
    confidenceWeight: values.confidenceWeight / total,
    timeEfficiencyWeight: values.timeEfficiencyWeight / total,
    referenceMinutes: Math.max(5, Math.min(480, Number(policy.referenceMinutes) || DEFAULT_ADVISOR_RANKING_POLICY.referenceMinutes)),
  };
}

export function scoreAdvisorIntervention(
  intervention: AdvisorIntervention,
  policy: AdvisorRankingPolicy = DEFAULT_ADVISOR_RANKING_POLICY,
): number {
  const normalized = policyWeights(policy);
  const minutes = boundedMinutes(intervention.estimatedMinutes);
  const timeEfficiency = minutes === null ? 0.5 : 1 - Math.min(1, minutes / normalized.referenceMinutes);
  const score =
    bounded(intervention.expectedBenefit) * normalized.expectedBenefitWeight
    + bounded(intervention.urgency) * normalized.urgencyWeight
    + bounded(intervention.dependencyLeverage) * normalized.dependencyLeverageWeight
    + bounded(intervention.confidence) * normalized.confidenceWeight
    + bounded(timeEfficiency) * normalized.timeEfficiencyWeight;
  return Number(score.toFixed(4));
}

export function normalizeAdvisorAssessment(
  candidate: AdvisorAssessmentCandidate,
  policy: AdvisorRankingPolicy = DEFAULT_ADVISOR_RANKING_POLICY,
): PclAdvisorAssessment | null {
  const domain = cleanId(candidate?.domain).toLowerCase();
  const target = normalizeTarget(candidate?.target);
  const currentStateSummary = cleanText(candidate?.currentStateSummary, 900);
  if (!domain || !target || !currentStateSummary) return null;

  const evidence = (Array.isArray(candidate.evidence) ? candidate.evidence : [])
    .map(normalizeEvidence)
    .filter((item): item is AdvisorEvidence => Boolean(item))
    .slice(0, 80);
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const gaps = (Array.isArray(candidate.gaps) ? candidate.gaps : [])
    .map(normalizeGap)
    .filter((item): item is AdvisorGap => Boolean(item))
    .map((item) => ({ ...item, evidenceRefs: item.evidenceRefs.filter((ref) => evidenceIds.has(ref)) }))
    .slice(0, 50);
  const gapIds = new Set(gaps.map((item) => item.id));
  const interventions = (Array.isArray(candidate.interventions) ? candidate.interventions : [])
    .map(normalizeIntervention)
    .filter((item): item is AdvisorIntervention => Boolean(item))
    .map((item) => ({ ...item, gapIds: item.gapIds.filter((ref) => gapIds.has(ref)) }))
    .filter((item) => item.gapIds.length > 0)
    .slice(0, 30);

  const ranked = [...interventions]
    .map((item) => ({ id: item.id, score: scoreAdvisorIntervention(item, policy) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return {
    version: PCL_ADVISOR_INTELLIGENCE_VERSION,
    providerNeutral: true,
    domain,
    target,
    currentStateSummary,
    evidence,
    gaps,
    interventions,
    recommendedInterventionId: ranked[0]?.id || null,
    rankedInterventionIds: ranked.map((item) => item.id),
    recommendationScore: ranked[0]?.score ?? null,
    reasonCodes: uniqueStrings(candidate.reasonCodes || [], 20).map(cleanId).filter(Boolean),
  };
}

export class AdvisorDomainRegistry {
  private adapters: AdvisorDomainAdapter[] = [];

  register(adapter: AdvisorDomainAdapter): void {
    const domain = cleanId(adapter.domain).toLowerCase();
    const id = cleanId(adapter.id);
    if (!domain || !id) throw new Error("Advisor adapter requires a valid id and domain.");
    this.adapters = [
      ...this.adapters.filter((item) => cleanId(item.id) !== id),
      { ...adapter, id, domain },
    ];
  }

  list(domain?: string): AdvisorDomainAdapter[] {
    const normalized = cleanId(domain).toLowerCase();
    const items = normalized ? this.adapters.filter((item) => item.domain === normalized) : this.adapters;
    return [...items].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  async assess(
    request: AdvisorRequest,
    policy: AdvisorRankingPolicy = DEFAULT_ADVISOR_RANKING_POLICY,
  ): Promise<AdvisorRegistryResult> {
    const domain = cleanId(request.domain).toLowerCase();
    if (!domain) return { status: "unavailable", error: "invalid_domain" };
    const candidates = this.list(domain);
    if (!candidates.length) return { status: "unavailable", error: "no_advisor_adapter" };

    let lastError: string | null = null;
    for (const adapter of candidates) {
      try {
        const available = adapter.isAvailable ? await adapter.isAvailable() : true;
        if (!available) continue;
        const candidate = await adapter.assess({ ...request, domain });
        const assessment = normalizeAdvisorAssessment(candidate, policy);
        if (!assessment) {
          lastError = "invalid_advisor_assessment";
          continue;
        }
        return { status: "success", assessment, adapterId: adapter.id };
      } catch (error: any) {
        lastError = cleanText(error?.message, 300) || "advisor_adapter_failed";
      }
    }
    return { status: "failed", error: lastError || "advisor_adapters_unavailable" };
  }
}

export function publicAdvisorSummary(assessment: PclAdvisorAssessment) {
  const recommended = assessment.interventions.find((item) => item.id === assessment.recommendedInterventionId) || null;
  return {
    version: assessment.version,
    domain: assessment.domain,
    target: assessment.target.label,
    gapCount: assessment.gaps.length,
    rootGapCount: assessment.gaps.filter((item) => item.rootCause).length,
    recommendedInterventionId: assessment.recommendedInterventionId,
    recommendedLabel: recommended?.label || null,
    recommendationScore: assessment.recommendationScore,
  };
}

