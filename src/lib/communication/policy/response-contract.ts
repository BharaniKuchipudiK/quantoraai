export type ResponseAction =
  | 'answer'
  | 'clarify'
  | 'plan'
  | 'challenge'
  | 'verify'
  | 'recover'
  | 'anticipate'
  | 'close'
  | 'refuse';

export type ResponseTone = 'practical' | 'warm' | 'analytical';
export type ResponseDepth = 'light' | 'standard' | 'deep';
export type ResponseSafetyLevel = 'normal' | 'guarded' | 'high';

export type ResponseContract = {
  action: ResponseAction;
  tone: ResponseTone;
  depth: ResponseDepth;
  safetyLevel: ResponseSafetyLevel;
  includeMemory: boolean;
  allowBuildArtifact: boolean;
  requireEvidenceFraming: boolean;
};
