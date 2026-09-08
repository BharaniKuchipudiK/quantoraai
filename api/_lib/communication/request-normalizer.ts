import { normalizeSessionContext, type ListeningSignal, type SessionContext } from "../session-context.js";
import { normalizeProjectId } from "../project-state.js";
import { type StudioDomain } from "../studio-domains.js";
import { inferStudioDomain } from "../studio-domain-inference.js";
import { normalizeStudioMode, type StudioMode } from "../studio-modes.js";
import { detectBuildIntent } from "../../../shared/build-intent.js";
import { normalizeStudyRequestContext, type StudyRequestContext } from "../study-adaptive-learning.js";

export type AttachedDocument = {
  name: string;
  mimeType: string;
  dataUrl?: string;
  storageRef?: string;
  carried: boolean;
};

export type CommunicationRequest = {
  message: string;
  sessionId: string | null;
  projectId: string | null;
  studioMode: StudioMode;
  studioModeExplicit: boolean;
  studioDomain: StudioDomain | null;
  taskCategory: string;
  attachedImages: string[];
  attachedDocuments: AttachedDocument[];
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
  studyContext: StudyRequestContext | null;
};

function hasLiveCodingDeskPacket(deskContext: unknown): boolean {
  if (!deskContext || typeof deskContext !== "object") return false;
  const files = (deskContext as { files?: unknown }).files;
  return Array.isArray(files) && files.some((path) => typeof path === "string" && path.trim());
}

function validInlineDocument(item: any): boolean {
  return typeof item?.dataUrl === "string"
    && /^data:[^;,]*(?:;[^,]*)?;base64,/.test(item.dataUrl)
    && !item.dataUrl.startsWith("data:image/")
    && item.dataUrl.length <= 4_500_000;
}

function validStoredDocument(item: any): boolean {
  return typeof item?.storageRef === "string"
    && /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(item.storageRef)
    && item.storageRef.length <= 2048;
}

export function normalizeCommunicationRequest(body: any): CommunicationRequest {
  const studioMode = normalizeStudioMode(body?.studioMode);
  const studioModeExplicit = body?.studioMode === "ask" || body?.studioMode === "build" || body?.studioMode === "plan";
  const message = typeof body?.message === "string" ? body.message : "";
  const inferredBuildMode = detectBuildIntent(message);
  const hasPreviewCode = typeof body?.previewCode === "string" && body.previewCode.trim().length > 0;
  const buildMode = body?.buildMode === true || inferredBuildMode || body?.refineMode === true;
  const studioDomain = inferStudioDomain({
    explicit: body?.studioDomain,
    // A chat created inside a workspace stays there; the client says so.
    pinned: body?.studioDomainPinned === true,
    message,
    history: body?.history,
    codingWorkspace: buildMode
      || body?.refineMode === true
      || hasPreviewCode
      || body?.taskCategory === "coding"
      // Chat-only refine turns still attach deskContext.files — treat that as a live coding desk.
      || hasLiveCodingDeskPacket(body?.deskContext),
  });
  const attachedImages = Array.isArray(body?.attachedImages)
    ? body.attachedImages.filter((value: unknown): value is string => typeof value === "string" && value.startsWith("data:image/")).slice(0, 4)
    : [];
  /*
   * Small documents still ride inline as base64 data URLs. Documents above the
   * inline envelope travel by opaque, HMAC-signed private-storage reference;
   * the server resolves that reference before using the same deterministic
   * document readers. Raw storage paths and arbitrary URLs are never accepted.
   * A valid stored ref wins exclusively over any co-supplied inline data, so a
   * crafted request cannot make the server read Storage while still dragging a
   * multi-megabyte dead payload through Vercel.
   */
  const attachedDocuments: AttachedDocument[] = Array.isArray(body?.attachedDocuments)
    ? body.attachedDocuments
      .filter((item: any) => item && typeof item === "object" && (validInlineDocument(item) || validStoredDocument(item)))
      .slice(0, 4)
      .map((item: any) => {
        const stored = validStoredDocument(item);
        return {
          name: String(item.name || "attachment").slice(0, 200),
          mimeType: typeof item.mimeType === "string" ? item.mimeType.slice(0, 100) : "",
          ...(stored ? { storageRef: item.storageRef as string } : { dataUrl: item.dataUrl as string }),
          carried: item.carried === true,
        };
      })
    : [];
  const nestedProjectId = body?.sessionContext && typeof body.sessionContext === "object"
    ? body.sessionContext.projectId
    : null;

  return {
    message,
    sessionId: typeof body?.sessionId === "string" && body.sessionId.trim() ? body.sessionId : null,
    projectId: normalizeProjectId(body?.projectId ?? nestedProjectId),
    studioMode,
    studioModeExplicit,
    studioDomain,
    taskCategory: typeof body?.taskCategory === "string" && body.taskCategory.trim()
      ? body.taskCategory
      : inferredBuildMode ? "coding" : "general",
    attachedImages,
    attachedDocuments,
    choiceSelected: body?.choiceSelected === true,
    memoryConsented: body?.memoryConsented === true,
    sessionContext: normalizeSessionContext(body?.sessionContext),
    listeningSignals: Array.isArray(body?.listeningSignals) ? body.listeningSignals.slice(0, 8) : [],
    hasPreviewCode,
    isRefine: body?.refineMode === true,
    explicitModelId: typeof body?.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : null,
    buildMode,
    guidedBuild: body?.guidedBuild === true,
    featureSuggest: body?.featureSuggest === true,
    studyContext: normalizeStudyRequestContext(body?.studyContext, studioDomain),
  };
}
