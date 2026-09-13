/**
 * Partner-status copy for Studio: what just happened, and what to do next.
 * This is the Cursor-style "human progress" line — not a chatbot spinner.
 */
import { describeTurnPhase, stalledTurnActions } from './turn-progress.js';

export function previewShellIsWarming(previewRunStatus = '') {
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
  // Observed signals for the progress line. Absent ones simply narrow what it
  // can say; none of them are inferred from elapsed time.
  streamedBytes = null,
  streamedPaths = [],
  previewCompiling = false,
  previewHealing = false,
  activeModelName = '',
  turnBudgetSec = 0,
} = {}) {
  void photosMissing;
  void shopUiMissing;
  const totalSec = Math.max(0, Math.floor(Number(elapsedSec) || 0));
  const clock = `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
  const lifeDomain = studioDomain === 'travel'
    || studioDomain === 'education'
    || studioDomain === 'finance'
    || studioDomain === 'research';
  const intakeCopy = typeof shopIntake?.userCopy === 'string' ? shopIntake.userCopy.trim() : '';
  const intakeOversize = Boolean(shopIntake?.oversize && intakeCopy);
  const shellWarming = previewShellIsWarming(previewRunStatus);

  if (isGenerating) {
    if (lifeDomain) {
      if (studioDomain === 'education') {
        /*
         * Study is deliberately conservative here: elapsed time is not proof
         * that a model is "reasoning" or "checking examples". The UI therefore
         * names only facts we know from the request lifecycle. This makes a
         * long first-token wait feel alive without inventing work that may not
         * be happening upstream.
         */
        const hasStartedStreaming = Number(streamedBytes) > 0;
        if (hasStartedStreaming) {
          return {
            now: `Your tutor answer is arriving… ${clock}`,
            next: 'You can start reading now — the rest will continue to stream into this response.',
            phase: 'streaming',
            stalled: false,
            actions: [],
          };
        }
        const now = totalSec < 6
          ? 'Tutor request sent…'
          : totalSec < 20
            ? 'Waiting for the tutor to start responding…'
            : totalSec < 45
              ? 'Still waiting for the first answer content…'
              : 'This tutor route is slower than usual.';
        const next = totalSec < 45
          ? 'The answer will start appearing here as soon as the first content arrives.'
          : 'You can keep waiting, or stop and retry to use the next eligible tutor route.';
        return {
          now: `${now} ${clock}`,
          next,
          phase: 'waiting-first-content',
          stalled: totalSec >= 45,
          actions: [],
        };
      }
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
    const phase = describeTurnPhase({
      elapsedSec: totalSec,
      bytes: streamedBytes,
      filePaths: streamedPaths,
      previewCompiling,
      previewHealing,
      modelName: activeModelName,
      budgetSec: turnBudgetSec,
    });
    return {
      now: generatingLabel || 'Working on a result you can actually use…',
      next: phase.line,
      phase: phase.phase,
      stalled: phase.stalled,
      actions: phase.stalled ? stalledTurnActions({ hasPreview, isBuild: !lifeDomain }) : [],
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

  if (codingDeskOpen && !shellWarming) {
    return null;
  }

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
    return null;
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
    return null;
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
  if (value === 'failed') return 'Preview failed to run';
  return '';
}

export function assistantClaimsImagesReady(text = '') {
  return /\b(high-resolution|high-definition|overhauled the image|product cards now|visual illustrations|studio visuals|textile visuals|images are (now |all )?ready|catalog to include visual)\b/i.test(String(text || ''));
}

export function assistantClaimsShopUiReady(text = '') {
  return /\b(currency|multi-currency|add to cart|shopping bag|cart drawer|cart totals)\b/i.test(String(text || ''));
}
