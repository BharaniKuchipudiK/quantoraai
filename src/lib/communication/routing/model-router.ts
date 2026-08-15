export type RoutingReason =
  | 'speed'
  | 'vision'
  | 'quality'
  | 'build'
  | 'safety'
  | 'availability';

export type RoutingDecision = {
  primaryModelId: string;
  fallbackModelIds: string[];
  reason: RoutingReason;
  provider: 'gemini' | 'openrouter';
  hasVisionSupport: boolean;
  selectionSource: 'explicit' | 'vision_default' | 'ranked_free' | 'fallback_default';
};
