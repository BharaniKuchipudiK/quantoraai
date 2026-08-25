/**
 * Map outcome / desk failures → lesson kinds the planner understands.
 */

export function lessonKindFromOutcome({
  outcomeKind = '',
  shopIntakeAsk = null,
  isShopPhotoTurn = false,
} = {}) {
  void shopIntakeAsk;
  void isShopPhotoTurn;
  if (outcomeKind === 'timeout') return 'timeout_shop';
  if (outcomeKind === 'provider-dead' || outcomeKind === 'stream-ended') return 'provider_dead';
  if (outcomeKind === 'no-preview') return 'empty_photos';
  if (outcomeKind === 'svg_only') return 'svg_only_desk';
  if (outcomeKind === 'oversize_burn') return 'oversize_burn';
  return String(outcomeKind || 'unknown');
}
