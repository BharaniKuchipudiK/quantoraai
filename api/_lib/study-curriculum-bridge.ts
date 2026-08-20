import type { StudyTruthSnapshot } from "./study-truth-layer.js";

export const STUDY_CURRICULUM_BRIDGE_VERSION = "study-curriculum-bridge-2026-08-20.1";

export type StudyCurriculumBridgeStatus = "already_covered" | "ready_bridge" | "blocked_bridge";

export type StudyCurriculumBridgeConcept = {
  conceptId: string;
  label: string;
  status: StudyCurriculumBridgeStatus;
  sourceCurriculumIds: string[];
  targetCurriculumId: string;
  directPrerequisiteIds: string[];
  coveredPrerequisiteIds: string[];
  blockingPrerequisiteIds: string[];
  unlocksTargetConceptIds: string[];
  readiness: number;
  dependencyLeverage: number;
  priorityScore: number;
  reasonCodes: string[];
};

export type StudyCurriculumBridge = {
  version: string;
  sourceCurriculumIds: string[];
  targetCurriculumId: string;
  sourceCoveredConceptIds: string[];
  targetConceptIds: string[];
  bridgeConcepts: StudyCurriculumBridgeConcept[];
  recommendedFirstConceptId: string | null;
};

function cleanId(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9._:-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 160)
    : "";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function bounded(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}

function prerequisiteMap(snapshot: StudyTruthSnapshot): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const concept of snapshot.concepts) map.set(concept.canonicalId, []);
  for (const edge of snapshot.edges) {
    if (edge.relation !== "prerequisite_of") continue;
    const current = map.get(edge.targetConceptId) || [];
    current.push(edge.sourceConceptId);
    map.set(edge.targetConceptId, unique(current));
  }
  return map;
}

function downstreamTargetConcepts(
  start: string,
  snapshot: StudyTruthSnapshot,
  targetSet: Set<string>,
): string[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of snapshot.edges) {
    if (edge.relation !== "prerequisite_of") continue;
    const current = adjacency.get(edge.sourceConceptId) || [];
    current.push(edge.targetConceptId);
    adjacency.set(edge.sourceConceptId, unique(current));
  }
  const visited = new Set<string>();
  const queue = [...(adjacency.get(start) || [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    queue.push(...(adjacency.get(id) || []));
  }
  return [...visited].filter((id) => targetSet.has(id));
}

/**
 * Compares curriculum coverage, not learner mastery. A "ready bridge" means
 * the source curricula cover all direct prerequisites in the graph; PCL must
 * still consult learner evidence before claiming that the student mastered them.
 */
export function buildStudyCurriculumBridge(input: {
  snapshot: StudyTruthSnapshot;
  sourceCurriculumIds: string[];
  targetCurriculumId: string;
}): StudyCurriculumBridge {
  const snapshot = input.snapshot;
  const knownCurricula = new Set(snapshot.curricula.map((item) => item.id));
  const sourceCurriculumIds = unique(input.sourceCurriculumIds.map(cleanId)).filter((id) => knownCurricula.has(id));
  const targetCurriculumId = cleanId(input.targetCurriculumId);
  if (!sourceCurriculumIds.length) throw new Error("curriculum_bridge_requires_source_curriculum");
  if (!knownCurricula.has(targetCurriculumId)) throw new Error("curriculum_bridge_target_not_found");

  const sourceSet = new Set(snapshot.mappings
    .filter((mapping) => sourceCurriculumIds.includes(mapping.curriculumId))
    .map((mapping) => mapping.conceptId));
  const targetSet = new Set(snapshot.mappings
    .filter((mapping) => mapping.curriculumId === targetCurriculumId)
    .map((mapping) => mapping.conceptId));
  const concepts = new Map(snapshot.concepts.map((concept) => [concept.canonicalId, concept] as const));
  const prerequisites = prerequisiteMap(snapshot);
  const maxUnlock = Math.max(1, ...[...targetSet].map((id) => downstreamTargetConcepts(id, snapshot, targetSet).length));

  const bridgeConcepts = [...targetSet].map((conceptId): StudyCurriculumBridgeConcept => {
    const directPrerequisiteIds = prerequisites.get(conceptId) || [];
    const coveredPrerequisiteIds = directPrerequisiteIds.filter((id) => sourceSet.has(id));
    const blockingPrerequisiteIds = directPrerequisiteIds.filter((id) => !sourceSet.has(id));
    const unlocksTargetConceptIds = downstreamTargetConcepts(conceptId, snapshot, targetSet);
    const alreadyCovered = sourceSet.has(conceptId);
    const readiness = alreadyCovered
      ? 1
      : directPrerequisiteIds.length
        ? bounded(coveredPrerequisiteIds.length / directPrerequisiteIds.length)
        : 1;
    const dependencyLeverage = bounded(unlocksTargetConceptIds.length / maxUnlock);
    const priorityScore = alreadyCovered ? 0 : bounded(readiness * 0.7 + dependencyLeverage * 0.3);
    const status: StudyCurriculumBridgeStatus = alreadyCovered
      ? "already_covered"
      : blockingPrerequisiteIds.length
        ? "blocked_bridge"
        : "ready_bridge";
    return {
      conceptId,
      label: concepts.get(conceptId)?.label || conceptId,
      status,
      sourceCurriculumIds,
      targetCurriculumId,
      directPrerequisiteIds,
      coveredPrerequisiteIds,
      blockingPrerequisiteIds,
      unlocksTargetConceptIds,
      readiness,
      dependencyLeverage,
      priorityScore,
      reasonCodes: [
        status === "already_covered" ? "curriculum_overlap" : status === "ready_bridge" ? "curriculum_bridge_ready" : "curriculum_bridge_blocked",
        ...(dependencyLeverage > 0 ? ["unlocks_downstream_target_concepts"] : []),
      ],
    };
  }).sort((a, b) => {
    const statusRank: Record<StudyCurriculumBridgeStatus, number> = { ready_bridge: 0, blocked_bridge: 1, already_covered: 2 };
    return statusRank[a.status] - statusRank[b.status]
      || b.priorityScore - a.priorityScore
      || a.label.localeCompare(b.label);
  });

  return {
    version: STUDY_CURRICULUM_BRIDGE_VERSION,
    sourceCurriculumIds,
    targetCurriculumId,
    sourceCoveredConceptIds: [...sourceSet].sort(),
    targetConceptIds: [...targetSet].sort(),
    bridgeConcepts,
    recommendedFirstConceptId: bridgeConcepts.find((item) => item.status === "ready_bridge")?.conceptId || null,
  };
}
