import type {
  AdvisorAssessmentCandidate,
  AdvisorEvidence,
  AdvisorGap,
  AdvisorIntervention,
} from "./pcl-advisor-intelligence.js";

export const STUDY_MASTERY_INTELLIGENCE_VERSION = "study-mastery-intelligence-2026-08-20.1";

export type StudyConcept = {
  id: string;
  label: string;
  prerequisiteIds?: string[];
  curriculumRefs?: string[];
  examWeight?: number;
};

export type StudyMasteryEvidence = {
  conceptId: string;
  mastery: number;
  confidence: number;
  retention?: number | null;
  selfConfidence?: number | null;
  misconception?: boolean;
  attempts?: number;
  sourceRefs?: string[];
  observedAt?: string | null;
};

export type StudyMasteryPolicy = {
  masteryThreshold: number;
  retentionThreshold: number;
  misconceptionConfidenceThreshold: number;
  defaultRepairMinutes: number;
  defaultDiagnosticMinutes: number;
};

export const DEFAULT_STUDY_MASTERY_POLICY: StudyMasteryPolicy = {
  masteryThreshold: 0.8,
  retentionThreshold: 0.7,
  misconceptionConfidenceThreshold: 0.7,
  defaultRepairMinutes: 20,
  defaultDiagnosticMinutes: 8,
};

export type StudyAdvisorInput = {
  goalLabel: string;
  targetConceptIds: string[];
  concepts: StudyConcept[];
  evidence: StudyMasteryEvidence[];
  horizon?: string | null;
  estimatedMinutesByConcept?: Record<string, number>;
};

function bounded(value: unknown): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Number(Math.max(0, Math.min(1, numeric)).toFixed(3));
}

function clean(value: unknown, max = 300): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function cleanId(value: unknown): string {
  return clean(value, 120).replace(/[^a-zA-Z0-9:_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function uniqueIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(cleanId).filter(Boolean))].slice(0, 30);
}

function severityFor(deficiency: number, misconception: boolean): "low" | "medium" | "high" {
  if (misconception || deficiency >= 0.4) return "high";
  if (deficiency >= 0.2) return "medium";
  return "low";
}

function descendantsOf(conceptId: string, concepts: Map<string, StudyConcept>, targets: Set<string>): string[] {
  const result = new Set<string>();
  const visit = (id: string) => {
    for (const concept of concepts.values()) {
      if (!uniqueIds(concept.prerequisiteIds).includes(id)) continue;
      if (result.has(concept.id)) continue;
      result.add(concept.id);
      visit(concept.id);
    }
  };
  visit(conceptId);
  return [...result].filter((id) => targets.has(id) || [...targets].some((target) => result.has(target)));
}

function reachablePrerequisites(targetIds: string[], concepts: Map<string, StudyConcept>): Set<string> {
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const concept = concepts.get(id);
    for (const prerequisite of uniqueIds(concept?.prerequisiteIds)) visit(prerequisite);
  };
  for (const id of targetIds) visit(id);
  return seen;
}

function weakByPolicy(evidence: StudyMasteryEvidence | undefined, policy: StudyMasteryPolicy): boolean {
  if (!evidence) return false;
  if (evidence.misconception === true && bounded(evidence.confidence) >= bounded(policy.misconceptionConfidenceThreshold)) return true;
  if (bounded(evidence.mastery) < bounded(policy.masteryThreshold)) return true;
  if (evidence.retention != null && bounded(evidence.retention) < bounded(policy.retentionThreshold)) return true;
  return false;
}

export function buildStudyAdvisorCandidate(
  input: StudyAdvisorInput,
  policy: StudyMasteryPolicy = DEFAULT_STUDY_MASTERY_POLICY,
): AdvisorAssessmentCandidate {
  const goalLabel = clean(input.goalLabel, 400) || "Improve learning mastery";
  const conceptMap = new Map<string, StudyConcept>();
  for (const raw of Array.isArray(input.concepts) ? input.concepts : []) {
    const id = cleanId(raw.id);
    const label = clean(raw.label, 300);
    if (!id || !label) continue;
    conceptMap.set(id, {
      id,
      label,
      prerequisiteIds: uniqueIds(raw.prerequisiteIds),
      curriculumRefs: uniqueIds(raw.curriculumRefs),
      examWeight: bounded(raw.examWeight ?? 0.5),
    });
  }

  const targetIds = uniqueIds(input.targetConceptIds).filter((id) => conceptMap.has(id));
  const targetSet = new Set(targetIds);
  const relevantIds = reachablePrerequisites(targetIds, conceptMap);
  const evidenceByConcept = new Map<string, StudyMasteryEvidence>();
  for (const raw of Array.isArray(input.evidence) ? input.evidence : []) {
    const conceptId = cleanId(raw.conceptId);
    if (!conceptId || !relevantIds.has(conceptId)) continue;
    const normalized: StudyMasteryEvidence = {
      conceptId,
      mastery: bounded(raw.mastery),
      confidence: bounded(raw.confidence),
      retention: raw.retention == null ? null : bounded(raw.retention),
      selfConfidence: raw.selfConfidence == null ? null : bounded(raw.selfConfidence),
      misconception: raw.misconception === true,
      attempts: typeof raw.attempts === "number" && Number.isFinite(raw.attempts) ? Math.max(0, Math.min(10_000, Math.round(raw.attempts))) : 0,
      sourceRefs: uniqueIds(raw.sourceRefs),
      observedAt: clean(raw.observedAt, 80) || null,
    };
    const existing = evidenceByConcept.get(conceptId);
    if (!existing || normalized.confidence >= existing.confidence) evidenceByConcept.set(conceptId, normalized);
  }

  const advisorEvidence: AdvisorEvidence[] = [];
  for (const conceptId of relevantIds) {
    const concept = conceptMap.get(conceptId);
    const evidence = evidenceByConcept.get(conceptId);
    if (!concept || !evidence) continue;
    const statement = [
      `${concept.label}: mastery ${evidence.mastery}`,
      evidence.retention != null ? `retention ${evidence.retention}` : null,
      evidence.misconception ? "confident misconception signal present" : null,
      evidence.attempts ? `${evidence.attempts} attempts` : null,
    ].filter(Boolean).join("; ");
    advisorEvidence.push({
      id: `study-evidence:${conceptId}`,
      kind: evidence.misconception ? "misconception_evidence" : "mastery_evidence",
      statement,
      confidence: evidence.confidence,
      sourceRef: evidence.sourceRefs?.[0] || null,
      observedAt: evidence.observedAt || null,
    });
  }

  const gaps: AdvisorGap[] = [];
  const weakIds = new Set<string>();
  for (const conceptId of relevantIds) {
    const concept = conceptMap.get(conceptId);
    if (!concept) continue;
    const evidence = evidenceByConcept.get(conceptId);
    if (!evidence) {
      gaps.push({
        id: `study-gap:evidence:${conceptId}`,
        kind: "evidence_gap",
        label: `Confirm current mastery of ${concept.label}`,
        severity: targetSet.has(conceptId) ? "high" : "medium",
        confidence: 1,
        dependencyIds: uniqueIds(concept.prerequisiteIds),
        blocks: targetSet.has(conceptId) ? [concept.label] : descendantsOf(conceptId, conceptMap, targetSet).map((id) => conceptMap.get(id)?.label || id),
        evidenceRefs: [],
        rootCause: false,
        addressable: true,
      });
      continue;
    }
    if (!weakByPolicy(evidence, policy)) continue;
    weakIds.add(conceptId);
  }

  for (const conceptId of weakIds) {
    const concept = conceptMap.get(conceptId)!;
    const evidence = evidenceByConcept.get(conceptId)!;
    const weakPrerequisites = uniqueIds(concept.prerequisiteIds).filter((id) => weakIds.has(id));
    const misconception = evidence.misconception === true && evidence.confidence >= policy.misconceptionConfidenceThreshold;
    const masteryDeficiency = Math.max(0, bounded(policy.masteryThreshold) - evidence.mastery) / Math.max(0.01, bounded(policy.masteryThreshold));
    const retentionDeficiency = evidence.retention == null
      ? 0
      : Math.max(0, bounded(policy.retentionThreshold) - evidence.retention) / Math.max(0.01, bounded(policy.retentionThreshold));
    const deficiency = Math.max(masteryDeficiency, retentionDeficiency);
    const gapKind = misconception ? "misconception" : retentionDeficiency > masteryDeficiency ? "retention_risk" : "mastery_gap";
    gaps.push({
      id: `study-gap:${gapKind}:${conceptId}`,
      kind: gapKind,
      label: misconception
        ? `Repair the misconception in ${concept.label}`
        : gapKind === "retention_risk"
          ? `Refresh ${concept.label} before it decays further`
          : `Strengthen ${concept.label}`,
      severity: severityFor(deficiency, misconception),
      confidence: evidence.confidence,
      dependencyIds: uniqueIds(concept.prerequisiteIds),
      blocks: descendantsOf(conceptId, conceptMap, targetSet).map((id) => conceptMap.get(id)?.label || id),
      evidenceRefs: [`study-evidence:${conceptId}`],
      rootCause: weakPrerequisites.length === 0,
      addressable: true,
    });
  }

  const rootWeakGaps = gaps.filter((gap) => gap.rootCause && gap.kind !== "evidence_gap");
  const unknownGaps = gaps.filter((gap) => gap.kind === "evidence_gap");
  const candidates = rootWeakGaps.length ? rootWeakGaps : unknownGaps;
  const maxUnlock = Math.max(1, ...candidates.map((gap) => gap.blocks.length));
  const interventions: AdvisorIntervention[] = candidates.map((gap) => {
    const conceptId = gap.id.split(":").at(-1) || "";
    const concept = conceptMap.get(conceptId);
    const evidence = evidenceByConcept.get(conceptId);
    const isDiagnostic = gap.kind === "evidence_gap";
    const isMisconception = gap.kind === "misconception";
    const isRetention = gap.kind === "retention_risk";
    const minutes = input.estimatedMinutesByConcept?.[conceptId];
    const examWeight = bounded(concept?.examWeight ?? 0.5);
    const leverage = bounded((gap.blocks.length + (targetSet.has(conceptId) ? 1 : 0)) / (maxUnlock + 1));
    const deficiency = evidence ? bounded(1 - evidence.mastery) : 0.5;
    const expectedBenefit = isDiagnostic
      ? 0.45
      : bounded(Math.max(deficiency, isMisconception ? 0.8 : 0) * 0.65 + leverage * 0.35);
    const label = isDiagnostic
      ? `Run a short diagnostic on ${concept?.label || conceptId}`
      : isMisconception
        ? `Rebuild ${concept?.label || conceptId} from the misconception, then test transfer`
        : isRetention
          ? `Retrieve and apply ${concept?.label || conceptId} before moving on`
          : `Repair ${concept?.label || conceptId} from the foundation, then climb back up`;
    return {
      id: `study-intervention:${isDiagnostic ? "diagnose" : "repair"}:${conceptId}`,
      label,
      gapIds: [gap.id],
      expectedBenefit,
      urgency: bounded(Math.max(examWeight, isMisconception ? 0.9 : 0, isRetention ? 0.7 : 0)),
      dependencyLeverage: leverage,
      confidence: isDiagnostic ? 1 : bounded(evidence?.confidence ?? 0),
      estimatedMinutes: typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0
        ? Math.round(minutes)
        : isDiagnostic
          ? policy.defaultDiagnosticMinutes
          : policy.defaultRepairMinutes,
      risk: "low",
      reversibility: "easy",
      verificationCriteria: isDiagnostic
        ? [`Obtain independent evidence for ${concept?.label || conceptId} before assigning a mastery level.`]
        : [
            `Answer a fresh ${concept?.label || conceptId} retrieval/application item without hints.`,
            `Demonstrate the concept in a different representation or transfer problem.`,
          ],
      reasonCodes: [
        isDiagnostic ? "mastery_evidence_missing" : "root_prerequisite_gap",
        ...(isMisconception ? ["confident_misconception_priority"] : []),
        ...(gap.blocks.length ? ["dependency_leverage"] : []),
      ],
    };
  });

  const known = [...relevantIds].filter((id) => evidenceByConcept.has(id)).length;
  const strong = [...relevantIds].filter((id) => {
    const evidence = evidenceByConcept.get(id);
    return evidence ? !weakByPolicy(evidence, policy) : false;
  }).length;
  const currentStateSummary = relevantIds.size
    ? `${known}/${relevantIds.size} relevant concepts have evidence; ${strong} currently meet the configured mastery/retention policy. ${gaps.filter((item) => item.rootCause).length} root gap(s) are currently identified.`
    : "No curriculum concept graph is available for the requested target yet.";

  return {
    domain: "education",
    target: {
      id: "study-target",
      label: goalLabel,
      successCriteria: targetIds.map((id) => `Demonstrate durable, transferable mastery of ${conceptMap.get(id)?.label || id}`),
      horizon: clean(input.horizon, 120) || null,
    },
    currentStateSummary,
    evidence: advisorEvidence,
    gaps,
    interventions,
    reasonCodes: [STUDY_MASTERY_INTELLIGENCE_VERSION, "bottom_up_prerequisite_diagnosis", "evidence_before_mastery_claim"],
  };
}
