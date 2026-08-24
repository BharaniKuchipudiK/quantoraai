/**
 * Partner-status copy for Studio: what just happened, and what to do next.
 * This is the Cursor-style "human progress" line — not a chatbot spinner.
 */

function previewShellIsWarming(previewRunStatus = '') {
  const value = typeof previewRunStatus === 'string'
    ? previewRunStatus
    : (previewRunStatus && typeof previewRunStatus === 'object' && previewRunStatus.kind === 'quality'
      ? ''
      : '');
  return value === 'warming' || value === 'running' || value === 'healing';
}

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
  hasDeskFiles = false,
  photosMissing = false,
  shopUiMissing = false,
  shopIntake = null,
  shopTurnFailureCopy = '',
  previewRunStatus = '',
} = {}) {
  const clock = `0:${String(Math.max(0, Number(elapsedSec) || 0)).padStart(2, '0')}`;
  const lifeDomain = studioDomain === 'travel'
    || studioDomain === 'education'
    || studioDomain === 'finance'
    || studioDomain === 'research';
  const intakeCopy = typeof shopIntake?.userCopy === 'string' ? shopIntake.userCopy.trim() : '';
  const intakeOversize = Boolean(shopIntake?.oversize && intakeCopy);
  const shellWarming = previewShellIsWarming(previewRunStatus);

  if (isGenerating) {
    if (lifeDomain) {
      return {
        now: `${generatingLabel || 'Working on your next step…'} ${clock}`,
        next: '',
      };
    }
    if (intakeOversize) {
      return {
        now: intakeCopy,
        next: `Building about ${shopIntake.proposedCatalogSize || 10} working catalog photos — not the full unique-image ask. ${clock}`,
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
    if (shopTurnFailureCopy) {
      return {
        now: shopTurnFailureCopy,
        next: continueLabel || `Tap Start with ${shopIntake?.proposedCatalogSize || 10}, or Add real product photos.`,
      };
    }
    return {
      now: 'That turn did not finish.',
      next: 'Retry, or tell me what to try instead.',
    };
  }

  // Files on the desk are not "done" while the Preview shell is still warming.
  if ((hasPreview || (codingDeskOpen && hasDeskFiles)) && shellWarming && !officeKind) {
    return {
      now: 'Preview is starting…',
      next: intakeOversize
        ? `About ${shopIntake.proposedCatalogSize || 10} catalog photos — wait for the live page, or Retry if it stalls. ${clock}`
        : `Files are on the desk — wait for the live page, or Retry if it stalls. ${clock}`,
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
    if (intakeOversize && !photosMissing) {
      return {
        now: intakeCopy,
        next: continueLabel
          ? `Next: ${continueLabel}.`
          : `Catalog target is about ${shopIntake.proposedCatalogSize || 10} photos this turn — upload more or expand when you are ready.`,
      };
    }
    if (photosMissing) {
      return {
        now: codingDeskOpen
          ? 'Preview is running. Product photos are still missing — empty picture boxes are not done.'
          : 'The app is ready, but product photos are still missing.',
        next: continueLabel && !/publish this site/i.test(continueLabel)
          ? `Next: ${continueLabel}.`
          : 'Tap Add real product photos — the desk injects catalog images; do not wait on chat-only claims.',
      };
    }
    if (shopUiMissing) {
      return {
        now: codingDeskOpen
          ? 'Preview is running. Currency and Add to Cart are still missing from the page.'
          : 'The app is ready, but currency and Add to Cart are still missing.',
        next: continueLabel && !/publish this site/i.test(continueLabel)
          ? `Next: ${continueLabel}.`
          : 'Tap Add to Cart on Preview — those controls must appear on the desk, not only in chat.',
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
    if (codingDeskOpen && !hasPreview) {
      return {
        now: hasDeskFiles
          ? 'Files are on the desk, but Preview is not running yet.'
          : 'Coding desk still has no files — chat alone is not enough.',
        next: continueLabel || (hasDeskFiles
          ? 'Open Preview, or ask me to fix the page so it runs.'
          : 'Ask me to build again — I should write files into this desk, not only plan in chat.'),
      };
    }
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
  if (value === 'warming') return 'Preview is starting…';
  if (value === 'running') return 'Preview is starting…';
  if (value === 'healing') return 'Preview is fixing a crash…';
  if (value === 'clean') return 'Preview is running';
  if (value === 'degraded') return 'Preview is running — styling may be incomplete';
  if (value === 'failed') return 'Preview is running with errors';
  return '';
}

export function assistantClaimsImagesReady(text = '') {
  return /\b(high-resolution|high-definition|overhauled the image|product cards now|visual illustrations|studio visuals|textile visuals|images are (now |all )?ready|catalog to include visual)\b/i.test(String(text || ''));
}

export function assistantClaimsShopUiReady(text = '') {
  return /\b(currency|multi-currency|add to cart|shopping bag|cart drawer|cart totals)\b/i.test(String(text || ''));
}
