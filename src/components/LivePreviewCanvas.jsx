import React, { useState, useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Smartphone, Tablet, Monitor, Download, X, Rocket, ShieldCheck, Wrench, Loader, AlertTriangle, Maximize2, Minimize2, Copy, Check, Link2, Cloud, Clock } from 'lucide-react';
import {
  createPreviewEmbedObjectUrl,
  getPreviewEmbedPathUrl,
  canUseBlobPreviewEmbed,
  isPreviewEmbedFrameSrc,
  injectPreviewHarness,
  prepareCodeForPreview,
  decidePreviewTrustStatus,
  isIgnorableRuntimeError,
  isCriticalResourceError,
  revokePreviewEmbedObjectUrl,
  buildPreviewSandbox,
  previewVerdict,
} from '../lib/preview-utils.js';
import { describeRefinementStop, planRefinementRound } from '../../shared/refinement-loop.js';
import { shouldShowPreviewShellTombstone } from '../lib/preview-shell-warming.js';
import { collectLiveDeskFacts } from '../lib/desk-probe-script.js';
import { absolutizePreviewProxyUrls, rewritePreviewImageUrls } from '../lib/preview-images.js';
import { looksLikeShopDesk } from '../lib/studio-desk-context.js';
import { deskFingerprint } from '../lib/build-job.js';
import { injectShopCommerceUi } from '../lib/shop-preview-ui.js';
import { byokRequestHeaders } from '../lib/client-secrets.js';
import { bootWebContainer, syncVFSToWebContainer } from '../lib/webcontainer.js';
import { exportOffice } from '../lib/office-export.js';
import { OFFICE_KIND } from '../lib/office-intent.js';
import { readActivePclSessionId } from '../lib/pcl-session-runtime.js';
import OfficePreview from './OfficePreview.jsx';
import ProjectRuntimePreview from './ProjectRuntimePreview.jsx';
import { createInlineReactRuntimeVfs, isProjectRuntimeVfs } from '../lib/project-runtime-preview.js';
import { recordClientBoundary } from '../lib/transaction-trace.js';
import {
  PREVIEW_SHELL_FAIL_MS,
  PREVIEW_SHELL_RETRY_MS,
  PREVIEW_SHELL_AUTO_REMOUNT_MS,
  PREVIEW_SHELL_AUTO_REMOUNT_MAX,
  PREVIEW_SHELL_IDLE_REMOUNT_MAX,
  shouldAutoRemountFailedPreviewShell,
  shouldFailPreviewShell,
  shouldHoldPreviewShellFailClock,
} from '../lib/preview-shell-warming.js';

// Office kind → download-button label / extension.
const OFFICE_LABEL = {
  [OFFICE_KIND.POWERPOINT]: 'PPTX',
  [OFFICE_KIND.EXCEL]: 'XLSX',
  [OFFICE_KIND.WORD]: 'DOCX',
  [OFFICE_KIND.PDF]: 'PDF',
};

/*
 * Live preview + verification loop.
 *
 * Generated HTML renders in /preview/embed.html — a dedicated shell whose CSP
 * allows common CDNs (Tailwind, unpkg, Stripe). The main app keeps a strict CSP;
 * srcDoc inherited that CSP and blocked styling CDNs, which caused unstyled previews
 * falsely marked "Verified — runs clean".
 */

const MAX_HEAL_ATTEMPTS = 3;
const PREVIEW_WARMING_RETRY_MS = PREVIEW_SHELL_RETRY_MS;
const PREVIEW_WARMING_FAIL_MS = PREVIEW_SHELL_FAIL_MS;

const LivePreviewCanvas = forwardRef(function LivePreviewCanvas({
  code,
  vfs = {},
  assemblyKey = '',
  isLight,
  onClose,
  isFullscreen,
  onToggleFullscreen,
  onVerificationStatusChange,
  headless = false,
  verifyOnly = false,
  hideHeader = false,
  user = null,
  onRequireAuth,
  suggestedProjectName = 'quantora-app',
  isPresentationIntent = false,
  officeKind = null,
  allowPublish,
  onPublishComplete,
  onShareComplete,
  modelId,
  correlationId = null,
  goldenTransaction = null,
  verifyBrief = '',
  jobCard = null,
  onHealedPreview,
  onLiveDeskProbe,
  /** True while chat/stream is still building — do not declare shell dead yet. */
  turnBusy = false,
  /**
   * Reports the state behind Download / Improve / viewport so a host can render
   * them in its own chrome. Used by the Coding Desk, which puts them in the desk
   * header rather than in a second strip of its own.
   */
  onChromeChange = null,
}, ref) {
  const [viewport, setViewport] = useState('desktop');
  const [currentCode, setCurrentCode] = useState(code || '');
  const [status, setStatus] = useState('running'); // running | healing | clean | degraded | failed
  // WebContainer preview URL. Declared here so the (in-progress) WebContainer
  // wiring has a defined binding — its absence crashed the app with
  // "wcUrl is not defined". Falsy → the standard embed preview is used.
  const [wcUrl, setWcUrl] = useState(null);
  // Build verifier: a visible quality score for the finished artifact.
  const [qualityReport, setQualityReport] = useState(null);
  const [verifyingQuality, setVerifyingQuality] = useState(false);
  const [improving, setImproving] = useState(false);
  const verifiedCodeRef = useRef(null);
  const [attempt, setAttempt] = useState(0);
  const [lastError, setLastError] = useState(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isDeployingGcp, setIsDeployingGcp] = useState(false);
  const [gcpUrl, setGcpUrl] = useState(null);
  const [deployResult, setDeployResult] = useState(null);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [projectNameInput, setProjectNameInput] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareResult, setShareResult] = useState(null);
  const [domainInput, setDomainInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectResult, setConnectResult] = useState(null);
  const [embedReady, setEmbedReady] = useState(false);
  const [embedSrc, setEmbedSrc] = useState('');
  const [readyElapsedSec, setReadyElapsedSec] = useState(0);
  const [warmingFailed, setWarmingFailed] = useState(false);
  /** Shell remounts only — must not burn MAX_HEAL_ATTEMPTS. */
  const [remountNonce, setRemountNonce] = useState(0);
  /** Idle remount count after turnBusy ends (before first sticky fail). */
  const warmingIdleRemountsRef = useRef(0);
  /** Quiet auto-remounts after sticky fail while Files still have code. */
  const warmingAutoRemountsRef = useRef(0);
  const warmingStartedAtRef = useRef(null);
  const lastWarmingCodeRef = useRef('');
  const embedModeRef = useRef('blob');
  /**
   * A page can leave the embed WITHOUT iframe.src changing: `location.href='/'`
   * navigates the frame while the src ATTRIBUTE stays on /preview/embed.html.
   * The harness therefore pings; silence past a grace window is the only signal
   * the parent has that the frame is gone.
   */
  const lastPreviewAliveAtRef = useRef(0);
  const previewHtmlPushedAtRef = useRef(0);
  /**
   * Background tabs throttle setInterval hard (seconds to a minute), so a hidden
   * tab starves the heartbeat and would look identical to an escaped frame.
   * Judge the heartbeat only while visible, and restart the clock on the way
   * back so the first tick after wake never convicts on throttled silence.
   */
  const becameVisibleAtRef = useRef(0);

  const iframeRef = useRef(null);
  const currentCodeRef = useRef(currentCode);
  const vfsRef = useRef(vfs);
  useEffect(() => { currentCodeRef.current = currentCode; }, [currentCode]);
  useEffect(() => { vfsRef.current = vfs; }, [vfs]);
  const jobCardRef = useRef(jobCard);
  useEffect(() => { jobCardRef.current = jobCard; }, [jobCard]);
  const onHealedPreviewRef = useRef(onHealedPreview);
  onHealedPreviewRef.current = onHealedPreview;
  const onLiveDeskProbeRef = useRef(onLiveDeskProbe);
  onLiveDeskProbeRef.current = onLiveDeskProbe;
  const liveDeskFactsRef = useRef(null);
  const lastAssemblyKeyRef = useRef(assemblyKey || '');
  const publishLiveDeskProbe = useCallback((partial) => {
    if (partial === null) {
      liveDeskFactsRef.current = null;
      onLiveDeskProbeRef.current?.(null);
      return;
    }
    liveDeskFactsRef.current = { ...(liveDeskFactsRef.current || {}), ...partial };
    onLiveDeskProbeRef.current?.({ ...liveDeskFactsRef.current });
  }, []);
  // Verification results for the CURRENT build, oldest first. This is the
  // loop's memory: it decides whether another round is worth the user's
  // money, and it is what makes round three differ from round one.
  const refinementHistoryRef = useRef([]);
  const attemptRef = useRef(0);
  const healingRef = useRef(false);
  const errorSeenRef = useRef(false);
  const stylingFailedRef = useRef(false);
  const embedReadyRef = useRef(false);

  useEffect(() => { embedReadyRef.current = embedReady; }, [embedReady]);
  useEffect(() => { attemptRef.current = attempt; }, [attempt]);

  const onVerificationStatusChangeRef = useRef(onVerificationStatusChange);
  onVerificationStatusChangeRef.current = onVerificationStatusChange;

  useEffect(() => {
    // Project-runtime / WebContainer shells are ready without embed-ready.
    const shellReady = Boolean(wcUrl)
      || embedReady
      || isProjectRuntimeVfs(vfs)
      || Boolean(createInlineReactRuntimeVfs(currentCode, vfs));
    const reported = !shellReady && status === 'running' ? 'warming' : status;
    onVerificationStatusChangeRef.current?.(reported);
  }, [status, embedReady, wcUrl, vfs, currentCode, headless, verifyOnly]);

  useEffect(() => {
    setEmbedReady(false);
    embedReadyRef.current = false;
    // Path-first under COEP require-corp: sandboxed blob: iframes cannot send
    // CORP headers, so Chrome never loads them and embed-ready never fires.
    // /preview/embed.html is served with Cross-Origin-Resource-Policy: cross-origin.
    // Always cache-bust on remount — same path URL otherwise leaves a dead iframe
    // after we clear embedReady (theatrical "retrying" with no actual remount).
    embedModeRef.current = 'path';
    const bust = `${remountNonce}-${attempt}`;
    setEmbedSrc((previous) => {
      revokePreviewEmbedObjectUrl(previous);
      return getPreviewEmbedPathUrl(bust);
    });
    return () => revokePreviewEmbedObjectUrl(undefined);
  }, [attempt, remountNonce]);

  useEffect(() => {
    if (!embedSrc || embedReady) return undefined;
    // Never fall back to blob under COEP — it cannot load and only burns the clock.
    if (!canUseBlobPreviewEmbed()) return undefined;
    const timer = setTimeout(() => {
      if (embedReadyRef.current) return;
      if (embedModeRef.current === 'path') {
        try {
          embedModeRef.current = 'blob';
          setEmbedSrc(createPreviewEmbedObjectUrl());
        } catch { /* keep path */ }
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [embedSrc, embedReady, attempt, remountNonce]);

  const handleEmbedFrameError = useCallback(() => {
    if (!canUseBlobPreviewEmbed()) {
      // Under COEP, only path remounts work.
      setRemountNonce((value) => value + 1);
      return;
    }
    if (embedModeRef.current === 'path') {
      try {
        embedModeRef.current = 'blob';
        setEmbedSrc(createPreviewEmbedObjectUrl());
      } catch { /* keep path */ }
      return;
    }
    try {
      embedModeRef.current = 'path';
      setEmbedSrc((previous) => {
        revokePreviewEmbedObjectUrl(previous);
        return getPreviewEmbedPathUrl(`err-${Date.now()}`);
      });
    } catch {
      embedModeRef.current = 'blob';
      setEmbedSrc(createPreviewEmbedObjectUrl());
    }
  }, []);

  const remountPreviewShell = useCallback(() => {
    embedReadyRef.current = false;
    setEmbedReady(false);
    setStatus('running');
    setWarmingFailed(false);
    setLastError(null);
    previewHtmlPushedAtRef.current = 0;
    lastPreviewAliveAtRef.current = 0;
    setRemountNonce((value) => value + 1);
  }, []);

  /** Shell ready only if the iframe is still on /preview/embed.html (or blob). */
  const handleEmbedFrameLoad = useCallback(() => {
    const src = iframeRef.current?.src || embedSrc || '';
    if (!isPreviewEmbedFrameSrc(src)) {
      // Navigated onto the SPA → X-Frame-Options: DENY → "quantoraai.app refused to connect".
      remountPreviewShell();
      return;
    }
    if (!embedReadyRef.current) {
      embedReadyRef.current = true;
      setEmbedReady(true);
    }
    setWarmingFailed(false);
    setStatus((prev) => (prev === 'failed' ? 'running' : prev));
    const html = currentCodeRef.current;
    if (html) pushHtmlToEmbedRef.current?.(html);
  }, [embedSrc, remountPreviewShell]);

  const pushHtmlToEmbed = useCallback((html) => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow || !html) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const files = vfsRef.current;
    /*
     * Absolutise LAST. rewritePreviewImageUrls turns the model's remote urls into
     * proxy urls; this then makes every proxy url - those, plus the relative ones
     * the model wrote because our own brief told it to - reachable from the
     * opaque-origin sandbox, which has no base to resolve a path against.
     */
    let preparedHtml = absolutizePreviewProxyUrls(
      rewritePreviewImageUrls(prepareCodeForPreview(html, files), origin),
      origin,
    );
    if (looksLikeShopDesk({ html: preparedHtml, vfs: files, job: jobCardRef.current }) || /add[\s-]?to[\s-]?(?:bag|cart)/i.test(preparedHtml)) {
      preparedHtml = injectShopCommerceUi(preparedHtml).html;
    }
    frame.contentWindow.postMessage({ __quantoraPreviewHtml: injectPreviewHarness(preparedHtml) }, '*');
    previewHtmlPushedAtRef.current = Date.now();
    lastPreviewAliveAtRef.current = Date.now();
  }, []);
  const pushHtmlToEmbedRef = useRef(pushHtmlToEmbed);
  pushHtmlToEmbedRef.current = pushHtmlToEmbed;

  // If generated HTML escapes onto the SPA, XFO DENY shows "refused to connect"
  // and onLoad may never fire — watch the src AND the harness heartbeat.
  useEffect(() => {
    if (headless || wcUrl || !embedReady) return undefined;
    const GRACE_MS = 1600;
    const SILENCE_MS = 2000;
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        becameVisibleAtRef.current = Date.now();
        // Throttled ticks during the hidden stretch are not evidence of death.
        lastPreviewAliveAtRef.current = Date.now();
      }
    };
    const tick = () => {
      const frame = iframeRef.current;
      const src = frame?.src || '';
      if (src && !isPreviewEmbedFrameSrc(src)) {
        remountPreviewShell();
        return;
      }
      // Only the heartbeat can see an in-frame navigation, and only a visible
      // tab keeps honest time. Convicting a hidden tab would remount the
      // preview under a user who merely switched away, discarding whatever
      // they had typed into it.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const pushedAt = previewHtmlPushedAtRef.current;
      if (!pushedAt || !currentCodeRef.current) return;
      if (Date.now() - pushedAt < GRACE_MS) return;
      if (Date.now() - becameVisibleAtRef.current < SILENCE_MS) return;
      const lastAlive = lastPreviewAliveAtRef.current;
      if (lastAlive && Date.now() - lastAlive > SILENCE_MS) remountPreviewShell();
    };
    if (typeof document !== 'undefined') {
      becameVisibleAtRef.current = Date.now();
      document.addEventListener('visibilitychange', onVisibility);
    }
    const id = setInterval(tick, 400);
    tick();
    return () => {
      clearInterval(id);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [embedReady, headless, wcUrl, remountPreviewShell]);

  useEffect(() => {
    setCurrentCode(code || '');
    if (!code) {
      setStatus('clean');
      setAttempt(0);
      setLastError(null);
      setWarmingFailed(false);
      warmingIdleRemountsRef.current = 0;
      warmingAutoRemountsRef.current = 0;
      warmingStartedAtRef.current = null;
      healingRef.current = false;
      errorSeenRef.current = false;
      stylingFailedRef.current = false;
      refinementHistoryRef.current = [];
      verifiedCodeRef.current = null;
      // The score belongs to the build that produced it. Leaving it behind
      // showed a stale "· 65/100" against a completely different product.
      setQualityReport(null);
      return;
    }
    // Assembly churn (shop inject / streaming / SVG wiring) must NOT reset the
    // hang-tight deadline or remount the shell — that left Preview stuck on
    // “getting ready” forever while Review already showed files.
    setStatus('running');
    setAttempt(0);
    setLastError(null);
    healingRef.current = false;
    errorSeenRef.current = false;
    stylingFailedRef.current = false;
    refinementHistoryRef.current = [];
    verifiedCodeRef.current = null;
    // Drop the previous build's score until this one is actually verified.
    setQualityReport(null);
  }, [code, assemblyKey]);

  useEffect(() => {
    if (!currentCode || !embedReady) return;
    const assembly = String(assemblyKey || '');
    const sameAssembly = lastAssemblyKeyRef.current === assembly
      && verifiedCodeRef.current === currentCodeRef.current;
    lastAssemblyKeyRef.current = assembly;
    errorSeenRef.current = false;
    stylingFailedRef.current = false;
    healingRef.current = false;
    if (!sameAssembly) setStatus('running');
    pushHtmlToEmbed(currentCode);
  }, [currentCode, embedReady, pushHtmlToEmbed, assemblyKey]);

  const requestRepair = useCallback(async (brokenCode, message, attempts) => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: byokRequestHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        task: 'repair',
        code: prepareCodeForPreview(brokenCode, vfsRef.current),
        error: message,
        framework: 'html',
        job: jobCardRef.current,
        attempts: Array.isArray(attempts) ? attempts : undefined,
        modelId,
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Repair failed (${res.status})`);
    return data;
  }, []);

  // Score the finished artifact against quality bars, once per distinct build.
  const runQualityCheck = useCallback(async (codeToCheck) => {
    if (!codeToCheck || !codeToCheck.trim()) return;
    const assembled = prepareCodeForPreview(codeToCheck, vfsRef.current);
    setVerifyingQuality(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: byokRequestHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          task: 'verify-build',
          code: assembled,
          vfs: vfsRef.current,
          brief: verifyBrief,
          job: jobCardRef.current,
          modelId,
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.score === 'number') {
        setQualityReport(data);
        /*
         * The verdict travels with a fingerprint of the desk it judged.
         *
         * Without one, a pass earned by the calculator still reads as proof
         * after the desk has become a bakery, and the build job would paint a
         * green "done" over an artifact nothing has checked. build-job.js
         * treats a verdict that cannot name its desk as no verdict at all.
         */
        onVerificationStatusChange?.({
          kind: 'quality',
          score: data.score,
          passed: data.passed,
          desk: deskFingerprint(vfsRef.current),
          issues: Array.isArray(data.issues) ? data.issues.slice(0, 6) : [],
        });
        const styledFailed = Array.isArray(data.checks) && data.checks.some((check) => check.id === 'styled' && check.ok === false);
        const trust = decidePreviewTrustStatus({
          assembledHtml: assembled,
          styledCheckOk: !styledFailed,
          errorSeen: errorSeenRef.current,
        });
        /*
         * The refinement loop.
         *
         * This used to be a one-shot latch: a build that merely came out
         * mediocre was improved exactly once and then left alone, so "it
         * broke" was handled and "it works but is not good" was not. Every
         * verification is now recorded and shared/refinement-loop.js decides
         * whether another round is justified — it stops on a pass, a plateau,
         * an unchanged repair, or the budget, never merely because it tried.
         *
         * Re-verification is automatic: accepting a repair sets currentCode,
         * which re-runs this check with the history one entry longer.
         */
        refinementHistoryRef.current = [
          ...refinementHistoryRef.current,
          { score: data.score, passed: data.passed, issues: Array.isArray(data.issues) ? data.issues : [] },
        ];
        const plan = planRefinementRound(refinementHistoryRef.current);
        if (!verifyOnly && plan.proceed) {
          // A failing shop desk is repaired by the MODEL, honestly — never by
          // injecting fabricated stock photos over the user's real page.
          // The verifier's concrete issues are sufficient recovery input even
          // when the job-card state lands one render after Preview mounts. The
          // old jobCard guard stranded exactly that race: broken product images
          // were diagnosed, but no recovery action ever became reachable.
          const instruction = `Improve this page for the JOB. Fix ONLY these issues, preserving the product:\n- ${data.issues.join('\n- ')}`;
          setStatus('healing');
          try {
            const repaired = await requestRepair(codeToCheck, instruction, refinementHistoryRef.current);
            const original = currentCodeRef.current || '';
            const fixed = repaired?.code || '';
            const hadStyle = /<style[\s>]/i.test(original) || /\bstyle\s*=\s*["'][^"']{8,}/i.test(original);
            const keepsStyle = /<style[\s>]/i.test(fixed) || /\bstyle\s*=\s*["'][^"']{8,}/i.test(fixed);
            if (fixed && !repaired.unchanged && fixed.trim() !== original.trim() && (!hadStyle || keepsStyle) && fixed.length >= original.length * 0.55) {
              verifiedCodeRef.current = null;
              setQualityReport(null);
              healingRef.current = false;
              onHealedPreviewRef.current?.(fixed);
              setCurrentCode(fixed);
              return;
            }
            // The repair came back unchanged or unusable. Record that so the
            // next decision stops instead of asking again with identical input.
            const stalled = planRefinementRound(refinementHistoryRef.current, { lastRepairChangedNothing: true });
            const note = describeRefinementStop(stalled.reason, refinementHistoryRef.current);
            if (note) setLastError(note);
          } catch { /* keep the running page */ }
        } else if (!verifyOnly && plan.reason && plan.reason !== 'passed' && plan.reason !== 'no_verification_yet') {
          // The loop stopped for a reason the user deserves in words.
          const note = describeRefinementStop(plan.reason, refinementHistoryRef.current);
          if (note) setLastError(note);
        }
        if (trust === 'degraded') {
          stylingFailedRef.current = true;
          setStatus('degraded');
          setLastError(data.summary || 'Preview loaded but styling may be incomplete');
          return;
        }
        if (trust === 'failed') {
          setStatus('failed');
          setLastError(data.summary || 'Preview is not a runnable page.');
          return;
        }
        setStatus('clean');
        return;
      }
      const fallbackTrust = decidePreviewTrustStatus({
        assembledHtml: assembled,
        errorSeen: errorSeenRef.current,
      });
      if (fallbackTrust === 'clean') setStatus('clean');
      else if (fallbackTrust === 'degraded') {
        stylingFailedRef.current = true;
        setStatus('degraded');
      }
    } catch {
      const assembled = prepareCodeForPreview(codeToCheck, vfsRef.current);
      const fallbackTrust = decidePreviewTrustStatus({
        assembledHtml: assembled,
        errorSeen: errorSeenRef.current,
      });
      if (fallbackTrust === 'clean') setStatus('clean');
      else if (fallbackTrust === 'degraded') {
        stylingFailedRef.current = true;
        setStatus('degraded');
      }
    } finally { setVerifyingQuality(false); }
  }, [onVerificationStatusChange, verifyBrief, modelId, requestRepair]);

  // One-click improve: feed the verifier's concrete issues back into the
  // self-heal loop, keeping the design (guarded like the runtime repair path).
  const handleImprove = useCallback(async () => {
    const report = qualityReport;
    if (improving || !report?.issues?.length) return;
    setImproving(true);
    try {
      const instruction = `Improve this page for the JOB. Fix ONLY these specific issues, preserving the existing design, layout and content:\n- ${report.issues.join('\n- ')}`;
      const data = await requestRepair(currentCodeRef.current, instruction);
      const original = currentCodeRef.current || '';
      const fixed = data?.code || '';
      const hadStyle = /<style[\s>]/i.test(original) || /\bstyle\s*=\s*["'][^"']{8,}/i.test(original);
      const keepsStyle = /<style[\s>]/i.test(fixed) || /\bstyle\s*=\s*["'][^"']{8,}/i.test(fixed);
      if (fixed && !data.unchanged && fixed.trim() !== original.trim() && (!hadStyle || keepsStyle) && fixed.length >= original.length * 0.55) {
        verifiedCodeRef.current = null; // re-verify the improved build
        setQualityReport(null);
        onHealedPreviewRef.current?.(fixed);
        setCurrentCode(fixed);
      }
    } catch { /* leave the current build in place on failure */ }
    finally { setImproving(false); }
  }, [qualityReport, improving, requestRepair]);

  const handleRuntimeError = useCallback(async (message) => {
    if (healingRef.current || errorSeenRef.current) return;

    if (verifyOnly) {
      if (isCriticalResourceError(message)) {
        stylingFailedRef.current = true;
        setLastError(message);
        setStatus('degraded');
        return;
      }
      if (isIgnorableRuntimeError(message)) return;
      errorSeenRef.current = true;
      onVerificationStatusChangeRef.current?.({ kind: 'runtime', status: 'failure', message });
      setLastError(message);
      setStatus('failed');
      return;
    }

    if (isCriticalResourceError(message)) {
      stylingFailedRef.current = true;
      setLastError(message);
      setStatus('degraded');
      return;
    }

    if (isIgnorableRuntimeError(message)) return;

    errorSeenRef.current = true;
    // Publish the failed generation before auto-repair starts. React may batch
    // the visible `failed -> healing` states, but QIR must durably observe the
    // failure so a browser/worker interruption can resume the same Run.
    onVerificationStatusChangeRef.current?.({ kind: 'runtime', status: 'failure', message });
    setLastError(message);

    if (attemptRef.current >= MAX_HEAL_ATTEMPTS) {
      setStatus('degraded');
      return;
    }

    healingRef.current = true;
    setStatus('healing');
    try {
      const data = await requestRepair(currentCodeRef.current, message);
      if (data.unchanged || !data.code || data.code.trim() === currentCodeRef.current.trim()) {
        setStatus('degraded');
        healingRef.current = false;
        return;
      }
      const original = currentCodeRef.current || '';
      const fixed = data.code || '';
      const hadStyle = /<style[\s>]/i.test(original) || /\bstyle\s*=\s*["'][^"']{8,}/i.test(original);
      const keepsStyle = /<style[\s>]/i.test(fixed) || /\bstyle\s*=\s*["'][^"']{8,}/i.test(fixed);
      const shrankTooMuch = fixed.length < original.length * 0.55;
      if ((hadStyle && !keepsStyle) || shrankTooMuch) {
        setLastError(null);
        setStatus(stylingFailedRef.current ? 'degraded' : 'clean');
        healingRef.current = false;
        return;
      }
      setAttempt((a) => a + 1);
      healingRef.current = false;
      onHealedPreviewRef.current?.(data.code);
      setCurrentCode(data.code);
    } catch (err) {
      setLastError(err.message || 'Auto-repair failed.');
      setStatus('degraded');
      healingRef.current = false;
    }
  }, [requestRepair, verifyOnly]);

  useEffect(() => {
    const onMessage = (e) => {
      const d = e.data;
      if (!d || d.__quantora !== true) return;

      if (d.kind === 'preview-alive') {
        lastPreviewAliveAtRef.current = Date.now();
        return;
      }
      if (d.kind === 'embed-ready') {
        embedReadyRef.current = true;
        setEmbedReady(true);
        lastPreviewAliveAtRef.current = Date.now();
        if (currentCodeRef.current) pushHtmlToEmbedRef.current?.(currentCodeRef.current);
        return;
      }
      if (d.kind === 'preview-close-request') {
        onClose?.();
        return;
      }
      if (d.kind === 'resource-error') {
        handleRuntimeError(String(d.message || 'Resource load error'));
        return;
      }
      if (d.kind === 'error') {
        handleRuntimeError(String(d.message || 'Runtime error'));
        return;
      }
      if (d.kind === 'shop-probe') {
        publishLiveDeskProbe(collectLiveDeskFacts(d));
        return;
      }
      if (d.kind === 'desk-probe') {
        publishLiveDeskProbe(collectLiveDeskFacts(d));
        return;
      }
      if (d.kind === 'loaded') {
        if (healingRef.current) return;
        if (d.usesTailwind && d.stylingOk === false) {
          stylingFailedRef.current = true;
          setStatus('degraded');
          setLastError('Tailwind CSS did not apply — styling may look broken.');
          return;
        }
        const prepared = prepareCodeForPreview(currentCodeRef.current, vfsRef.current);
        const trust = decidePreviewTrustStatus({
          assembledHtml: prepared,
          errorSeen: errorSeenRef.current,
        });
        if (trust === 'degraded') {
          stylingFailedRef.current = true;
          setStatus('degraded');
          setLastError('Preview loaded without usable CSS.');
          return;
        }
        if (trust === 'failed') {
          setStatus('failed');
          setLastError('Preview is not a runnable page.');
          return;
        }
        if (!errorSeenRef.current && (headless || verifyOnly)) {
          setStatus('clean');
          return;
        }
        if (!errorSeenRef.current && !headless && !verifyOnly) {
          // Preview is proven by the iframe load — do not stay on “Verifying”
          // while verify-build chats with the model.
          setStatus(stylingFailedRef.current ? 'degraded' : 'clean');
          if (verifiedCodeRef.current !== currentCodeRef.current) {
            verifiedCodeRef.current = currentCodeRef.current;
            void runQualityCheck(prepared);
          }
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleRuntimeError, onClose, runQualityCheck, headless, verifyOnly, publishLiveDeskProbe]);

  const handleConnectDomain = async () => {
    const domain = domainInput.trim();
    if (!domain || connecting) return;
    setConnecting(true);
    setConnectResult(null);
    try {
      const res = await fetch('/api/domains', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Quantora-Human-Confirmed': 'connect-domain-button',
        },
        credentials: 'include',
        body: JSON.stringify({
          task: 'connect',
          domain,
          projectName: deployResult?.projectName,
          sessionId: readActivePclSessionId() || undefined,
        })
      });
      const data = await res.json();
      if (!res.ok) setConnectResult({ error: data.error || 'Could not connect the domain.' });
      else setConnectResult({ domain: data.domain, records: data.records || [], verified: data.verified });
    } catch (err) {
      setConnectResult({ error: err.message || 'Network error connecting the domain.' });
    } finally {
      setConnecting(false);
    }
  };

  const viewportStyles = {
    mobile: { width: '375px', height: '667px' },
    tablet: { width: '768px', height: '1024px' },
    desktop: { width: '100%', height: '100%' }
  };

  // Export the current artifact to a real Office/PDF file via bundled, lazy-
  // loaded libraries (pptxgenjs / SheetJS / html-docx-js / print-to-PDF). No
  // runtime CDN, and the format follows the detected office kind.
  const [exportingOffice, setExportingOffice] = useState(false);
  const handleOfficeDownload = async () => {
    if (exportingOffice) return;
    setExportingOffice(true);
    try {
      await exportOffice(resolvedOfficeKind || OFFICE_KIND.POWERPOINT, {
        html: currentCode,
        filename: suggestedProjectName,
      });
    } catch (err) {
      console.error(err);
      alert(`Export failed: ${err?.message || 'please try again.'}`);
    } finally {
      setExportingOffice(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([currentCode], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'artifact.html'; a.click();
    URL.revokeObjectURL(url);
  };

  const handlePublishClick = () => {
    if (isDeploying) return;
    if (officeKind || isPresentationIntent) return;
    if (!user) {
      onRequireAuth?.();
      return;
    }
    const suggested = String(suggestedProjectName || 'quantora-app')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'quantora-app';
    setProjectNameInput(suggested);
    setShowPublishDialog(true);
  };

  const handlePublish = async () => {
    if (isDeploying) return;
    setShowPublishDialog(false);
    setIsDeploying(true);
    setDeployResult(null);
    setLinkCopied(false);
    try {
      const deployRes = await fetch('/api/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Quantora-Human-Confirmed': 'publish-dialog',
        },
        credentials: 'include',
        body: JSON.stringify({
          code: currentCode,
          projectName: projectNameInput || 'quantora-app',
          sessionId: readActivePclSessionId() || undefined,
        }),
      });
      const deployData = await deployRes.json();
      if (!deployRes.ok) throw new Error(deployData.error || 'Deploy failed');

      const domainRes = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ context: currentCode.substring(0, 1000) }),
      });
      const domainData = await domainRes.json();
      const result = { url: deployData.url, domains: domainData.domains || [], projectName: deployData.projectName };
      setDeployResult(result);
      onPublishComplete?.(result);
    } catch (err) {
      const message = err.message || 'Deployment failed';
      if (message.toLowerCase().includes('sign in')) {
        onRequireAuth?.();
      }
      alert(`Deployment failed: ${message}\n\nPublishing requires sign-in and a Vercel token in the API Gateway.`);
    } finally {
      setIsDeploying(false);
    }
  };

  const handleCopyDeployUrl = async () => {
    if (!deployResult?.url) return;
    try {
      await navigator.clipboard.writeText(deployResult.url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  const handleSharePreview = async () => {
    if (isSharing || isDeploying) return;
    if (!user) {
      onRequireAuth?.();
      return;
    }
    if (!currentCode?.trim()) return;

    setIsSharing(true);
    setShareCopied(false);
    try {
      const previewName = `preview-${Date.now().toString(36).slice(-8)}`;
      const deployRes = await fetch('/api/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Quantora-Human-Confirmed': 'share-preview-button',
        },
        credentials: 'include',
        body: JSON.stringify({
          code: currentCode,
          projectName: previewName,
          sessionId: readActivePclSessionId() || undefined,
        }),
      });
      const deployData = await deployRes.json();
      if (!deployRes.ok) throw new Error(deployData.error || 'Share failed');

      setShareResult({ url: deployData.url, projectName: deployData.projectName });
      try {
        await navigator.clipboard.writeText(deployData.url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
      } catch {
        /* clipboard blocked */
      }
      onShareComplete?.({ url: deployData.url, projectName: deployData.projectName });
    } catch (err) {
      const message = err.message || 'Could not create share link';
      if (message.toLowerCase().includes('sign in')) {
        onRequireAuth?.();
      }
      alert(`Share preview failed: ${message}\n\nSign in is required to create a shareable link.`);
    } finally {
      setIsSharing(false);
    }
  };


  const retryVerification = () => {
    setLastError(null);
    setWarmingFailed(false);
    warmingIdleRemountsRef.current = 0;
    warmingAutoRemountsRef.current = 0;
    warmingStartedAtRef.current = null;
    errorSeenRef.current = false;
    healingRef.current = false;
    stylingFailedRef.current = false;
    setStatus('running');
    setRemountNonce((value) => value + 1);
  };

  const projectRuntimeVfs = useMemo(
    () => (isProjectRuntimeVfs(vfs) ? vfs : createInlineReactRuntimeVfs(currentCode, vfs)),
    [currentCode, vfs],
  );
  const projectRuntimeActive = Boolean(projectRuntimeVfs);
  const handleProjectRuntimeStatus = useCallback((next, message = '') => {
    if (next === 'ready') {
      setLastError(null);
      setStatus('clean');
      return;
    }
    if (next === 'failed') {
      setLastError(message || 'Preview could not run.');
      setStatus('failed');
      return;
    }
    setLastError(null);
    setStatus('running');
  }, []);
  /*
   * Name the files, not only the verdict (CLAUDE.md §8). The first reader of
   * this line on 2026-09-05 could not tell an intake reply from a plain HTML
   * page from a React project missing its entry — three different owners.
   */
  const goldenRuntimeContractError = goldenTransaction && Object.keys(vfs || {}).length > 0 && !projectRuntimeActive
    ? `Generated files did not satisfy the React/VFS project runtime contract (no package.json with a src/main or src/App entry; the desk holds: ${Object.keys(vfs).slice(0, 12).join(', ')}).`
    : null;
  const previewShellReady = projectRuntimeActive || Boolean(wcUrl) || embedReady;

  // Never say “Verifying — running” while the shell overlay still says getting ready.
  const statusUI = {
    warming: { icon: <Loader size={14} className="animate-spin" />, label: 'Preview is starting…', color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
    running: { icon: <Loader size={14} className="animate-spin" />, label: 'Verifying — running the preview…', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
    healing: { icon: <Wrench size={14} />, label: `Runtime error found — auto-fixing (attempt ${Math.min(attempt + 1, MAX_HEAL_ATTEMPTS)}/${MAX_HEAL_ATTEMPTS})…`, color: '#f59e0b', bg: 'rgba(245,158,11,0.14)' },
    clean: {
      'needs-work': { icon: <AlertTriangle size={14} />, label: 'Runs, but quality checks did not pass', color: '#f59e0b', bg: 'rgba(245,158,11,0.14)' },
      'ran-clean': { icon: <ShieldCheck size={14} />, label: 'Runs without errors — checking quality…', color: '#10b981', bg: 'rgba(16,185,129,0.14)' },
      'verified-autofixed': { icon: <ShieldCheck size={14} />, label: 'Verified — auto-fixed and running clean', color: '#10b981', bg: 'rgba(16,185,129,0.14)' },
      verified: { icon: <ShieldCheck size={14} />, label: 'Verified — runs clean', color: '#10b981', bg: 'rgba(16,185,129,0.14)' },
    }[previewVerdict({ qualityReport, attempt })],
    degraded: { icon: <AlertTriangle size={14} />, label: 'Preview loaded but styling may be incomplete', color: '#f59e0b', bg: 'rgba(245,158,11,0.14)' },
    failed: { icon: <AlertTriangle size={14} />, label: 'Preview hit an error. The page is still on the desk.', color: '#ef4444', bg: 'rgba(239,68,68,0.14)' }
  }[!previewShellReady && (status === 'running' || status === 'healing') ? 'warming' : status] || null;

  const deskHasHtml = Boolean(
    (typeof currentCode === 'string' && currentCode.trim())
    || Object.keys(vfs || {}).some((path) => /\.html?$/i.test(path) && String(vfs[path]?.content || '').trim()),
  );

  useEffect(() => {
    if (headless || previewShellReady) {
      setReadyElapsedSec(0);
      setWarmingFailed(false);
      warmingStartedAtRef.current = null;
      warmingIdleRemountsRef.current = 0;
      warmingAutoRemountsRef.current = 0;
      return undefined;
    }
    // Files landed after a premature fail: clear the tombstone and keep remounting.
    // Without this, overlay stays "shell did not start" forever while index.html
    // sits in Review (exact boutique screenshot).
    // Files already on the desk: never keep the sticky fail overlay.
    if (deskHasHtml && warmingFailed) {
      setWarmingFailed(false);
      setStatus('running');
      warmingStartedAtRef.current = null;
      warmingIdleRemountsRef.current = 0;
      setRemountNonce((value) => value + 1);
      return undefined;
    }
    // Boutique / long coding turns keep the main thread busy for 30–90s. Failing
    // the shell at 12s mid-stream is the "Preview shell did not start" screenshot.
    // Hold the fail clock until the turn is idle, then remount (up to 2) and wait again.
    if (shouldHoldPreviewShellFailClock({ turnBusy, embedReady: embedReadyRef.current })) {
      warmingStartedAtRef.current = null;
      warmingIdleRemountsRef.current = 0;
      warmingAutoRemountsRef.current = 0;
      setWarmingFailed(false);
      setStatus((prev) => (prev === 'failed' ? 'running' : prev));
      const busyTick = setInterval(() => {
        setReadyElapsedSec((sec) => sec + 1);
      }, 1000);
      return () => clearInterval(busyTick);
    }

    if (warmingFailed) {
      return undefined;
    }
    if (!warmingStartedAtRef.current) {
      warmingStartedAtRef.current = Date.now();
      // Fresh idle window after a busy turn — remount so embed-ready can fire.
      setRemountNonce((value) => value + 1);
    }
    const startedAt = warmingStartedAtRef.current;
    const tick = () => {
      setReadyElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    };
    tick();
    const timer = setInterval(tick, 250);
    const hasRunnablePreview = deskHasHtml
      || Boolean(String(currentCodeRef.current || '').trim());
    const scheduleIdleRemount = (delayMs) => setTimeout(() => {
      if (embedReadyRef.current) return;
      if (warmingIdleRemountsRef.current >= PREVIEW_SHELL_IDLE_REMOUNT_MAX) return;
      warmingIdleRemountsRef.current += 1;
      setRemountNonce((value) => value + 1);
    }, delayMs);
    const retryTimer = scheduleIdleRemount(
      Math.max(0, PREVIEW_WARMING_RETRY_MS - (Date.now() - startedAt)),
    );
    // Second idle remount when Files already have preview HTML (extend beyond one).
    const secondRemountTimer = hasRunnablePreview
      ? scheduleIdleRemount(Math.max(
        0,
        PREVIEW_WARMING_RETRY_MS + PREVIEW_SHELL_AUTO_REMOUNT_MS - (Date.now() - startedAt),
      ))
      : null;
    const failTimer = setTimeout(() => {
      if (embedReadyRef.current) return;
      // Ask the shared policy, rather than re-deriving it here. The inline copy
      // of these conditions was never exercised by the tests or the browser gate
      // that assert shouldFailPreviewShell — they proved a function production
      // did not call, so drift in either would have gone unnoticed.
      if (!shouldFailPreviewShell({
        turnBusy,
        embedReady: embedReadyRef.current,
        idleElapsedMs: Date.now() - startedAt,
        hasDeskHtml: deskHasHtml,
      })) {
        // HTML already on the desk: keep remounting — never sticky "shell did not start".
        warmingStartedAtRef.current = null;
        setWarmingFailed(false);
        setStatus('running');
        setRemountNonce((value) => value + 1);
        return;
      }
      setWarmingFailed(true);
      setStatus('failed');
      setLastError('Preview shell did not start in time. Tap Retry Preview, or open the HTML from Files.');
    }, Math.max(0, PREVIEW_WARMING_FAIL_MS - (Date.now() - startedAt)));
    return () => {
      clearInterval(timer);
      clearTimeout(retryTimer);
      if (secondRemountTimer) clearTimeout(secondRemountTimer);
      clearTimeout(failTimer);
    };
    // Intentionally omit assemblyKey / currentCode — shop inject churn must not
    // reset the fail clock (that caused eternal "retrying the shell" theater).
  }, [headless, previewShellReady, turnBusy, warmingFailed, deskHasHtml]);

  // Sticky fail with Files present: quiet auto-remount (~3s) up to 2×, or clear when code changes.
  useEffect(() => {
    if (headless || previewShellReady || !warmingFailed) return undefined;
    const code = String(currentCode || '').trim();
    const hasRunnable = deskHasHtml || Boolean(code);
    if (!hasRunnable) return undefined;

    if (lastWarmingCodeRef.current && lastWarmingCodeRef.current !== code && code) {
      lastWarmingCodeRef.current = code;
      warmingAutoRemountsRef.current = 0;
      setWarmingFailed(false);
      warmingStartedAtRef.current = null;
      setLastError(null);
      setStatus('running');
      setRemountNonce((value) => value + 1);
      return undefined;
    }
    if (code) lastWarmingCodeRef.current = code;

    if (!shouldAutoRemountFailedPreviewShell({
      warmingFailed: true,
      hasRunnablePreview: true,
      autoRemountAttempts: warmingAutoRemountsRef.current,
      maxAttempts: PREVIEW_SHELL_AUTO_REMOUNT_MAX,
    })) {
      return undefined;
    }

    const autoTimer = setTimeout(() => {
      if (embedReadyRef.current) return;
      warmingAutoRemountsRef.current += 1;
      setWarmingFailed(false);
      warmingIdleRemountsRef.current = 0;
      warmingStartedAtRef.current = null;
      setLastError(null);
      setStatus('running');
      setRemountNonce((value) => value + 1);
    }, PREVIEW_SHELL_AUTO_REMOUNT_MS);
    return () => clearTimeout(autoTimer);
  }, [headless, previewShellReady, warmingFailed, currentCode, deskHasHtml]);

  const showShellTombstone = shouldShowPreviewShellTombstone({
    warmingFailed,
    hasDeskHtml: deskHasHtml,
    embedReady: previewShellReady,
  });

  const previewWarmingOverlay = !headless && !previewShellReady ? (
    <div
      role="status"
      aria-live="polite"
      data-quantora-preview-warming="true"
      data-quantora-preview-warming-failed={showShellTombstone ? 'true' : 'false'}
      data-quantora-preview-turn-busy={turnBusy ? 'true' : 'false'}
      data-quantora-preview-desk-html={deskHasHtml ? 'true' : 'false'}
      data-quantora-preview-has-html={deskHasHtml ? 'true' : 'false'}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 6,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        background: isLight ? '#f8fafc' : '#0f172a',
        color: isLight ? '#334155' : '#cbd5e1',
        padding: '24px',
        textAlign: 'center',
      }}
    >
      {showShellTombstone ? (
        <>
          <AlertTriangle size={28} color="#ef4444" />
          <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Preview shell did not start</div>
          <div style={{ fontSize: '0.8rem', opacity: 0.85, maxWidth: '320px' }}>
            This is a desk problem, not your brief. We stopped waiting after {Math.floor(PREVIEW_WARMING_FAIL_MS / 1000)}s.
          </div>
          <button
            type="button"
            onClick={retryVerification}
            style={{
              marginTop: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(239,68,68,0.45)',
              background: 'rgba(239,68,68,0.12)',
              color: '#ef4444',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Retry Preview
          </button>
        </>
      ) : (
        <>
          <Clock size={28} color="#f97316" />
          <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
            {turnBusy
              ? 'Building — Preview waits for this turn…'
              : deskHasHtml
                ? 'Connecting Preview to your files…'
                : 'Preview is starting…'}
          </div>
          <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
            {Math.floor(readyElapsedSec / 60)}:{String(readyElapsedSec % 60).padStart(2, '0')}
            {turnBusy ? ' · shell fail clock paused' : deskHasHtml ? ' · retrying shell' : ''}
          </div>
        </>
      )}
    </div>
  ) : null;

  useEffect(() => {
    if (!goldenRuntimeContractError) return;
    void recordClientBoundary(correlationId, 'browser.preview-response', 'failed', {
      transaction: goldenTransaction,
      detailCode: 'project-runtime-contract-missing',
      fileCount: Object.keys(vfs || {}).length,
    });
  }, [correlationId, goldenRuntimeContractError, goldenTransaction, vfs]);

  const previewFrame = projectRuntimeActive ? (
    <ProjectRuntimePreview
      vfs={projectRuntimeVfs}
      correlationId={correlationId}
      goldenTransaction={goldenTransaction}
      onDeskProbe={publishLiveDeskProbe}
      onStatusChange={handleProjectRuntimeStatus}
    />
  ) : ((currentCode && embedSrc) || wcUrl ? (
    <div style={{ width: '100%', height: '100%', minHeight: headless ? '480px' : viewportStyles[viewport].height, position: 'relative' }}>
      {previewWarmingOverlay}
      <iframe
        ref={iframeRef}
        key={`${attempt}-${remountNonce}-${embedSrc}`}
        title="Live Preview"
        src={wcUrl || embedSrc}
        onLoad={handleEmbedFrameLoad}
        onError={handleEmbedFrameError}
        sandbox={buildPreviewSandbox({ trustedRuntimeUrl: wcUrl })}
        style={{
          width: '100%',
          height: '100%',
          minHeight: headless ? '480px' : viewportStyles[viewport].height,
          border: 'none',
          background: previewShellReady ? '#ffffff' : (isLight ? '#f8fafc' : '#0f172a'),
          visibility: previewShellReady ? 'visible' : 'hidden',
          pointerEvents: previewShellReady ? 'auto' : 'none',
        }}
      />
    </div>
  ) : (
    <div style={{ padding: '24px', fontFamily: 'sans-serif', color: '#64748b', position: 'relative', minHeight: '240px' }}>
      {previewWarmingOverlay || 'Preview is starting…'}
    </div>
  ));

  const hasPresentationName = Object.keys(vfs || {}).some(name => /presentation|deck|slides|ppt/i.test(name)) || /presentation|deck|slides|ppt/i.test(suggestedProjectName || '');
  // Prefer the explicit kind passed from the studio; fall back to the legacy
  // presentation heuristics so existing decks still get a PPTX button.
  const resolvedOfficeKind = officeKind
    || (isPresentationIntent || /pptxgen|docx@/i.test(currentCode || '') || hasPresentationName ? OFFICE_KIND.POWERPOINT : null);
  const isOfficeDoc = Boolean(resolvedOfficeKind);
  const officeLabel = OFFICE_LABEL[resolvedOfficeKind] || 'FILE';

  /*
   * The desk used to carry a second strip under its header holding the
   * verification status, Improve, the viewport switcher, Download, Share and
   * Publish. Status duplicated the desk header's own run label, and Share and
   * Publish duplicated its Publish menu — so the strip spent a row of vertical
   * space to repeat things and to hold three controls that had nowhere else to
   * live. It reports them here instead, and the desk renders them in its header.
   */
  useEffect(() => {
    if (!onChromeChange) return;
    onChromeChange({
      viewport,
      isOfficeDoc,
      officeLabel,
      downloading: exportingOffice,
      canImprove: Number(qualityReport?.issues?.length) > 0 && status !== 'healing',
      improving,
    });
  }, [onChromeChange, viewport, isOfficeDoc, officeLabel, exportingOffice, qualityReport, status, improving]);
  const showPublish = !isOfficeDoc && allowPublish !== false;

  useImperativeHandle(ref, () => ({
    openPublish: handlePublishClick,
    openShare: handleSharePreview,
    download: () => (isOfficeDoc ? handleOfficeDownload() : handleDownload()),
    improve: handleImprove,
    setViewport,
  }), [handlePublishClick, handleSharePreview, isOfficeDoc, handleOfficeDownload, handleDownload, handleImprove]);

  if (headless) {
    return (
      <div aria-hidden="true" style={{ width: '100%', height: '480px', overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
        {previewFrame}
      </div>
    );
  }

  const viewportSwitcher = (
    <div data-quantora-canvas-device-switcher="true" style={{ display: 'flex', background: isLight ? '#f1f5f9' : 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '2px' }}>
      {[['mobile', <Smartphone size={16} key="m" />], ['tablet', <Tablet size={16} key="t" />], ['desktop', <Monitor size={16} key="d" />]].map(([v, icon]) => (
        <button key={v} onClick={() => setViewport(v)} style={{
          padding: '6px', borderRadius: '6px', cursor: 'pointer', border: 'none',
          background: viewport === v ? (isLight ? '#ffffff' : '#334155') : 'transparent',
          color: viewport === v ? '#3b82f6' : (isLight ? '#64748b' : '#94a3b8'),
          boxShadow: viewport === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
        }}>{icon}</button>
      ))}
    </div>
  );

  const shareButton = (
    <button
      onClick={handleSharePreview}
      disabled={isSharing || isDeploying}
      title="Copy a shareable preview link (no custom name needed)"
      style={{
        background: isSharing ? 'rgba(148, 163, 184, 0.2)' : 'rgba(2, 132, 199, 0.12)',
        border: '1px solid rgba(2, 132, 199, 0.35)',
        cursor: isSharing || isDeploying ? 'not-allowed' : 'pointer',
        color: '#0284c7',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        borderRadius: '16px',
        fontSize: '0.75rem',
        fontWeight: 'bold',
      }}
    >
      {shareCopied ? <Check size={14} /> : <Link2 size={14} />}
      {isSharing ? 'Sharing…' : shareCopied ? 'Link copied' : 'Share link'}
    </button>
  );

  const publishButton = (
    <button onClick={handlePublishClick} disabled={isDeploying} title="Publish to Vercel" style={{
      background: isDeploying ? '#94a3b8' : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
      border: 'none', cursor: isDeploying ? 'not-allowed' : 'pointer', color: '#ffffff',
      display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '16px', fontSize: '0.75rem', fontWeight: 'bold'
    }}>
      <Rocket className={isDeploying ? 'animate-bounce' : ''} size={14} /> {isDeploying ? 'Deploying…' : 'Publish to Vercel'}
    </button>
  );

  // Deploy the current multi-file project to GCP Cloud Run. The button below
  // references this handler, so it must exist (a previous cleanup removed the
  // only definition and left the reference dangling — no-undef crash on main).
  // Contract: POST /api/deploy-gcp expects { vfs, projectName } and returns
  // { buildId, projectName, status } — it triggers an async Cloud Build, so
  // there is no live URL to await here; we report that the build kicked off.
  const handleGcpDeployClick = async () => {
    if (isDeployingGcp) return;
    if (!user) { onRequireAuth?.(); return; }
    if (!vfs || Object.keys(vfs).length === 0) {
      alert('GCP Cloud Run deploys a multi-file project. This artifact has no project files (vfs) to deploy.');
      return;
    }
    setIsDeployingGcp(true);
    try {
      const res = await fetch('/api/deploy-gcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Quantora-Human-Confirmed': 'gcp-deploy-button',
        },
        credentials: 'include',
        body: JSON.stringify({
          vfs,
          projectName: suggestedProjectName || 'quantora-app',
          sessionId: readActivePclSessionId() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'GCP deployment failed');
      alert(`GCP build triggered (${data.projectName || 'project'}). Cloud Build is now building and deploying to Cloud Run — this can take a few minutes.`);
    } catch (err) {
      const message = err.message || 'GCP deployment failed';
      if (message.toLowerCase().includes('sign in')) onRequireAuth?.();
      alert(`GCP deployment failed: ${message}`);
    } finally {
      setIsDeployingGcp(false);
    }
  };

  const deployGcpButton = (
    <button onClick={handleGcpDeployClick} disabled={isDeployingGcp} title="Deploy Full-Stack to GCP Cloud Run" style={{
      background: isDeployingGcp ? '#94a3b8' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      border: 'none', cursor: isDeployingGcp ? 'not-allowed' : 'pointer', color: '#ffffff',
      display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '16px', fontSize: '0.75rem', fontWeight: 'bold'
    }}>
      <Cloud className={isDeployingGcp ? 'animate-pulse' : ''} size={14} /> {isDeployingGcp ? 'Deploying to GCP…' : gcpUrl ? 'Live on GCP' : 'Deploy to GCP'}
    </button>
  );

  const showHeader = !hideHeader;
  return (
    <div
      data-quantora-canvas-root="true"
      data-quantora-canvas-fullscreen={isFullscreen ? 'true' : 'false'}
      data-quantora-preview-contract-error={goldenRuntimeContractError || undefined}
      style={{
      display: 'flex', flexDirection: 'column', height: '100%', width: '100%',
      position: 'relative',
      background: isLight ? '#f8fafc' : '#0f172a',
      borderLeft: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)'
      }}
    >
      {showHeader && (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        flexShrink: 0,
        borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)',
        background: isLight ? '#ffffff' : '#1e293b'
      }}>
        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: isLight ? '#334155' : '#cbd5e1', flexShrink: 0 }}>Live Preview</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {viewportSwitcher}
          {isOfficeDoc && (
            <button onClick={handleOfficeDownload} disabled={exportingOffice} title={`Download as .${officeLabel.toLowerCase()}`} style={{ background: 'transparent', border: 'none', cursor: exportingOffice ? 'wait' : 'pointer', color: isLight ? '#10b981' : '#34d399', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold', opacity: exportingOffice ? 0.6 : 1 }}>
              <Download size={16} /> {exportingOffice ? '…' : officeLabel}
            </button>
          )}
          {!isOfficeDoc && (
            <button onClick={handleDownload} title="Export to HTML" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: isLight ? '#64748b' : '#94a3b8', display: 'flex', alignItems: 'center' }}>
              <Download size={18} />
            </button>
          )}
          {onToggleFullscreen && (
            <button onClick={onToggleFullscreen} title={isFullscreen ? 'Exit full screen' : 'Full screen'} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: isLight ? '#64748b' : '#94a3b8', display: 'flex', alignItems: 'center' }}>
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          )}
          {!isOfficeDoc && shareButton}
          {showPublish && publishButton}
          <button onClick={onClose} title="Close preview (Esc)" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: isLight ? '#64748b' : '#94a3b8', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>
      </div>
      )}

      {/*
        No second strip when the desk owns the header. Everything that used to
        sit here is either already in the desk header (status, Share, Publish)
        or is now rendered there from the state reported by onChromeChange
        (Download, Improve, viewport). See the note beside that effect.
      */}

      {isOfficeDoc ? (
        // Office artifacts get a format-faithful preview (spreadsheet grid /
        // slide stage / paper page) instead of the responsive website viewport.
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <OfficePreview kind={resolvedOfficeKind} html={currentCode} isLight={isLight}>
            {previewFrame}
          </OfficePreview>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: viewport === 'desktop' ? '0' : '20px' }}>
          <div style={{
            ...viewportStyles[viewport], background: '#ffffff',
            borderRadius: viewport === 'desktop' ? '0' : '12px', overflow: 'hidden',
            boxShadow: viewport === 'desktop' ? 'none' : '0 10px 40px rgba(0,0,0,0.2)',
            transition: 'all 0.3s ease', position: 'relative'
          }}>
            {previewFrame}
          </div>
        </div>
      )}

      {deployResult && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: isLight ? '#ffffff' : '#0f172a', padding: '30px', borderRadius: '24px', width: '90%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', border: isLight ? 'none' : '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <div style={{ background: '#10b981', padding: '16px', borderRadius: '50%' }}><Rocket size={32} color="#ffffff" /></div>
            </div>
            <h2 style={{ textAlign: 'center', color: isLight ? '#0f172a' : '#ffffff', marginTop: 0 }}>Successfully Deployed!</h2>
            <p style={{ textAlign: 'center', color: isLight ? '#64748b' : '#94a3b8' }}>Your application is now live on Vercel's global edge network.</p>
            <div style={{ background: isLight ? '#f1f5f9' : '#1e293b', padding: '12px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', gap: '8px' }}>
              <a href={deployResult.url} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{deployResult.url}</a>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button type="button" onClick={handleCopyDeployUrl} title="Copy link" style={{ background: isLight ? '#ffffff' : '#0f172a', border: isLight ? '1px solid #cbd5e1' : '1px solid #334155', color: isLight ? '#475569' : '#cbd5e1', padding: '6px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {linkCopied ? <Check size={14} /> : <Copy size={14} />} {linkCopied ? 'Copied' : 'Copy'}
                </button>
                <a href={deployResult.url} target="_blank" rel="noreferrer" style={{ background: '#3b82f6', color: '#fff', padding: '6px 12px', borderRadius: '8px', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 'bold' }}>Visit</a>
              </div>
            </div>
            {deployResult.domains.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <h3 style={{ fontSize: '0.9rem', color: isLight ? '#334155' : '#cbd5e1', marginBottom: '12px' }}>✨ AI Domain Suggestions</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {deployResult.domains.map((domain, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isLight ? '#ffffff' : '#0f172a', border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)', padding: '10px 16px', borderRadius: '12px' }}>
                      <span style={{ color: isLight ? '#0f172a' : '#ffffff', fontWeight: '500' }}>{domain}</span>
                      <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 'bold', background: 'rgba(16,185,129,0.1)', padding: '4px 8px', borderRadius: '8px' }}>Available</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ fontSize: '0.9rem', color: isLight ? '#334155' : '#cbd5e1', marginBottom: '10px' }}>🌐 Connect your own domain</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={domainInput} onChange={(e) => setDomainInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleConnectDomain(); }} placeholder="my-boutique.com" style={{ flex: 1, padding: '10px 12px', borderRadius: '10px', border: isLight ? '1px solid #cbd5e1' : '1px solid #334155', background: isLight ? '#fff' : '#0f172a', color: isLight ? '#0f172a' : '#fff', fontSize: '0.85rem', outline: 'none' }} />
                <button onClick={handleConnectDomain} disabled={connecting || !domainInput.trim()} style={{ background: connecting ? '#94a3b8' : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', border: 'none', color: '#fff', padding: '0 16px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 'bold', cursor: connecting ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                  {connecting ? 'Connecting…' : 'Connect'}
                </button>
              </div>
              {connectResult?.error && <p style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '10px' }}>{connectResult.error}</p>}
              {connectResult?.records && (
                <div style={{ marginTop: '12px', background: isLight ? '#f8fafc' : '#0f172a', border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '12px 14px' }}>
                  <p style={{ fontSize: '0.78rem', color: isLight ? '#475569' : '#94a3b8', margin: '0 0 10px' }}>Add {connectResult.records.length > 1 ? 'these records' : 'this record'} at your domain registrar.</p>
                  {connectResult.records.map((r, i) => (
                    <div key={i} style={{ display: 'flex', gap: '10px', fontFamily: 'monospace', fontSize: '0.74rem', color: isLight ? '#0f172a' : '#e2e8f0', padding: '6px 0', borderTop: i ? (isLight ? '1px solid #eef2f6' : '1px solid rgba(255,255,255,0.06)') : 'none' }}>
                      <span style={{ minWidth: '54px', color: '#f97316', fontWeight: 700 }}>{r.type}</span>
                      <span style={{ minWidth: '60px' }}>{r.name}</span>
                      <span style={{ wordBreak: 'break-all' }}>{r.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => { setDeployResult(null); setConnectResult(null); setDomainInput(''); setLinkCopied(false); }} style={{ width: '100%', padding: '12px', background: 'transparent', border: isLight ? '1px solid #cbd5e1' : '1px solid #334155', color: isLight ? '#475569' : '#94a3b8', borderRadius: '12px', marginTop: '24px', cursor: 'pointer', fontWeight: 'bold' }}>Close</button>
          </div>
        </div>
      )}

      {showPublishDialog && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div style={{ background: isLight ? '#ffffff' : '#0f172a', padding: '28px', borderRadius: '20px', width: '90%', maxWidth: '420px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', border: isLight ? 'none' : '1px solid rgba(255,255,255,0.1)' }}>
            <h2 style={{ margin: '0 0 8px', fontSize: '1.15rem', color: isLight ? '#0f172a' : '#ffffff' }}>Publish to Vercel</h2>
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: isLight ? '#64748b' : '#94a3b8' }}>This makes the current build publicly accessible. Confirm the project name, then publish.</p>
            <input
              value={projectNameInput}
              onChange={(e) => setProjectNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePublish(); }}
              placeholder="my-bakery-site"
              autoFocus
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', border: isLight ? '1px solid #cbd5e1' : '1px solid #334155', background: isLight ? '#fff' : '#0f172a', color: isLight ? '#0f172a' : '#fff', fontSize: '0.9rem', outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button type="button" onClick={() => setShowPublishDialog(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: isLight ? '1px solid #cbd5e1' : '1px solid #334155', color: isLight ? '#475569' : '#94a3b8', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button type="button" onClick={handlePublish} disabled={isDeploying} style={{ flex: 1, padding: '10px', background: isDeploying ? '#94a3b8' : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', border: 'none', color: '#fff', borderRadius: '10px', cursor: isDeploying ? 'not-allowed' : 'pointer', fontWeight: 700 }}>{isDeploying ? 'Deploying…' : 'Confirm & Publish'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default LivePreviewCanvas;
