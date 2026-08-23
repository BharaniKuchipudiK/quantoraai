/**
 * Partner-status copy for Studio: what just happened, and what to do next.
 * This is the Cursor-style "human progress" line — not a chatbot spinner.
 */

export function resolveStudioPartnerStatus({
  isGenerating = false,
  generatingLabel = '',
  elapsedSec = 0,
  lastAiIsError = false,
  hasPreview = false,
  continueLabel = '',
  lastAiText = '',
  hasUserTurn = false,
  officeKind = null,
  studioDomain = null,
  codingDeskOpen = false,
  photosMissing = false,
  shopUiMissing = false,
} = {}) {
  const clock = `0:${String(Math.max(0, Number(elapsedSec) || 0)).padStart(2, '0')}`;
  const lifeDomain = studioDomain === 'travel'
    || studioDomain === 'education'
    || studioDomain === 'finance'
    || studioDomain === 'research';

  if (isGenerating) {
    if (lifeDomain) {
      return {
        now: `${generatingLabel || 'Working on your next step…'} ${clock}`,
        next: '',
      };
    }
    return {
      now: generatingLabel || 'Working on a result you can actually use…',
      next: hasPreview
        ? `Preview stays open while this updates. ${clock}`
        : `Hang tight — it appears in Preview when it can run. ${clock}`,
    };
  }

  if (lastAiIsError) {
    return {
      now: 'That turn did not finish.',
      next: 'Retry, or tell me what to try instead.',
    };
  }

  if (hasPreview) {
    if (officeKind) {
      const file = officeKind === 'excel' ? 'workbook' : officeKind === 'word' ? 'document' : 'presentation';
      return {
        now: `The ${file} is in Preview — this is an Office file, not a website.`,
        next: continueLabel
          ? `Next: ${continueLabel}. Or tell me which part to change.`
          : 'Next: download the file, or tell me which slide or section to change.',
      };
    }
    if (photosMissing) {
      return {
        now: codingDeskOpen
          ? 'Preview is running. Product photos are still missing.'
          : 'The app is ready, but product photos are still missing.',
        next: continueLabel && !/publish this site/i.test(continueLabel)
          ? `Next: ${continueLabel}.`
          : 'Ask me to put real photos on the catalog — not empty frames.',
      };
    }
    if (shopUiMissing) {
      return {
        now: codingDeskOpen
          ? 'Preview is running. Currency and Add to Cart are still missing from the page.'
          : 'The app is ready, but currency and Add to Cart are still missing.',
        next: continueLabel && !/publish this site/i.test(continueLabel)
          ? `Next: ${continueLabel}.`
          : 'Ask again — those controls have to appear in Preview, not only in chat.',
      };
    }
    if (codingDeskOpen) return null;
    return {
      now: 'The app is ready. Open Coding desk for files and Preview.',
      next: continueLabel ? `Next: ${continueLabel}.` : '',
    };
  }

  if (lifeDomain && lastAiText && hasUserTurn) {
    const nextByDomain = {
      travel: continueLabel || 'Use the trip board, or tell me the next detail (dates, from city, or what to search).',
      education: continueLabel || 'Use the tutor board, or tell me what to check next.',
      finance: continueLabel || 'Tell me the decision or the numbers you want to work through.',
      research: continueLabel || 'Tell me what to compare or verify next.',
    };
    return {
      now: studioDomain === 'travel'
        ? 'Answered in our trip conversation — this is not a website to preview.'
        : studioDomain === 'education'
          ? 'Answered as your tutor — this is not a website to preview.'
          : 'Answered in this conversation — this is not a website to preview.',
      next: nextByDomain[studioDomain],
    };
  }

  if (lastAiText && hasUserTurn) {
    return {
      now: 'Answered in chat. There is no runnable preview yet.',
      next: continueLabel || 'Ask me to build a working page if that is the outcome you want.',
    };
  }

  return null;
}

export function studioPreviewRunLabel(status) {
  const value = typeof status === 'string'
    ? status
    : (status && typeof status === 'object' && status.kind === 'quality'
      ? (status.passed ? 'clean' : 'degraded')
      : '');
  if (value === 'running') return 'Preview is starting…';
  if (value === 'healing') return 'Preview is fixing a crash…';
  if (value === 'clean') return 'Preview is running';
  if (value === 'degraded') return 'Preview is running — styling may be incomplete';
  if (value === 'failed') return 'Preview failed — the page did not run';
  return '';
}

export function assistantClaimsImagesReady(text = '') {
  return /\b(high-resolution|high-definition|overhauled the image|product cards now|visual illustrations|studio visuals|textile visuals|images are (now |all )?ready|catalog to include visual)\b/i.test(String(text || ''));
}

export function assistantClaimsShopUiReady(text = '') {
  return /\b(currency|multi-currency|add to cart|shopping bag|cart drawer|cart totals)\b/i.test(String(text || ''));
}
