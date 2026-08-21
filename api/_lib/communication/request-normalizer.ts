import { normalizeSessionContext, type ListeningSignal, type SessionContext } from "../session-context.js";
import { normalizeProjectId } from "../project-state.js";
import { type StudioDomain } from "../studio-domains.js";
import { inferStudioDomain } from "../studio-domain-inference.js";
import { normalizeStudioMode, type StudioMode } from "../studio-modes.js";

export type CommunicationRequest = {
  message: string;
  sessionId: string | null;
  projectId: string | null;
  studioMode: StudioMode;
  studioModeExplicit: boolean;
  studioDomain: StudioDomain | null;
  taskCategory: string;
  attachedImages: string[];
  choiceSelected: boolean;
  memoryConsented: boolean;
  sessionContext: SessionContext;
  listeningSignals: ListeningSignal[];
  hasPreviewCode: boolean;
  isRefine: boolean;
  explicitModelId: string | null;
  buildMode: boolean;
  guidedBuild: boolean;
  featureSuggest: boolean;
};

export function normalizeCommunicationRequest(body: any): CommunicationRequest {
  const studioMode = normalizeStudioMode(body?.studioMode);
  const studioModeExplicit = body?.studioMode === "ask" || body?.studioMode === "build" || body?.studioMode === "plan";
  const studioDomain = inferStudioDomain({
    explicit: body?.studioDomain,
    message: body?.message,
    history: body?.history,
  });
  const attachedImages = Array.isArray(body?.attachedImages)
    ? body.attachedImages.filter((value: unknown): value is string => typeof value === "string" && value.startsWith("data:image/")).slice(0, 4)
    : [];
  const nestedProjectId = body?.sessionContext && typeof body.sessionContext === "object"
    ? body.sessionContext.projectId
    : null;

  return {
    message: typeof body?.message === "string" ? body.message : "",
    sessionId: typeof body?.sessionId === "string" && body.sessionId.trim() ? body.sessionId : null,
    projectId: normalizeProjectId(body?.projectId ?? nestedProjectId),
    studioMode,
    studioModeExplicit,
    studioDomain,
    taskCategory: typeof body?.taskCategory === "string" && body.taskCategory.trim() ? body.taskCategory : "general",
    attachedImages,
    choiceSelected: body?.choiceSelected === true,
    memoryConsented: body?.memoryConsented === true,
    sessionContext: normalizeSessionContext(body?.sessionContext),
    listeningSignals: Array.isArray(body?.listeningSignals) ? body.listeningSignals.slice(0, 8) : [],
    hasPreviewCode: typeof body?.previewCode === "string" && body.previewCode.trim().length > 0,
    isRefine: body?.refineMode === true,
    explicitModelId: typeof body?.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : null,
    buildMode: body?.buildMode === true,
    guidedBuild: body?.guidedBuild === true,
    featureSuggest: body?.featureSuggest === true,
  };
}
