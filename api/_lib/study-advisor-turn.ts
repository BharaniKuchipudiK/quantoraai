import { buildStudyCurriculumPilot2026 } from "./study-curriculum-pilot-2026.js";
import {
  curriculumRefsFor,
  prerequisiteIdsFor,
  type StudyTruthSnapshot,
} from "./study-truth-layer.js";
import { buildStudyAdvisorCandidate } from "./study-mastery-intelligence.js";
import {
  formatPclAdvisorContract,
  normalizeAdvisorAssessment,
} from "./pcl-advisor-intelligence.js";

/**
 * In-session Study advisor. Uses the existing curriculum pilot + ranking
 * contract. Does not invent mastery scores or talk to a second orchestrator.
 */
export function studyAdvisorContractForTurn({
  message = "",
  goal = "",
}: {
  message?: string;
  goal?: string;
} = {}): string {
  const snapshot = buildStudyCurriculumPilot2026();
  const targetIds = matchPilotConceptIds(`${goal}\n${message}`, snapshot);
  if (!targetIds.length) return "";

  const candidate = buildStudyAdvisorCandidate({
    goalLabel: String(goal || message || "Improve understanding").slice(0, 400),
    targetConceptIds: targetIds,
    concepts: snapshot.concepts.map((concept) => ({
      id: concept.canonicalId,
      label: concept.label,
      prerequisiteIds: prerequisiteIdsFor(snapshot, concept.canonicalId),
      curriculumRefs: curriculumRefsFor(snapshot, concept.canonicalId),
    })),
    evidence: [],
  });
  const assessment = normalizeAdvisorAssessment(candidate);
  return assessment ? formatPclAdvisorContract(assessment) : "";
}

function matchPilotConceptIds(text: string, snapshot: StudyTruthSnapshot): string[] {
  const hay = String(text || "").toLowerCase();
  if (!hay.trim()) return [];
  const scored = snapshot.concepts.flatMap((concept) => {
    const label = String(concept.label || "").toLowerCase();
    const tail = (concept.canonicalId.split(".").pop() || "").replace(/-/g, " ");
    let score = 0;
    if (label.length >= 8 && hay.includes(label)) score = Math.max(score, label.length + 20);
    if (tail.length >= 8 && hay.includes(tail)) score = Math.max(score, tail.length + 30);
    if (!score) return [];
    return [{ id: concept.canonicalId, score }];
  });
  scored.sort((left, right) => right.score - left.score);
  return [...new Set(scored.map((item) => item.id))].slice(0, 3);
}
