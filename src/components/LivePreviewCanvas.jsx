import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Smartphone, Tablet, Monitor, Download, X, Rocket, ShieldCheck, Wrench, Loader, AlertTriangle, Maximize2, Minimize2 } from 'lucide-react';
import {
  PREVIEW_EMBED_PATH,
  createPreviewEmbedObjectUrl,
  getPreviewEmbedPathUrl,
  injectPreviewHarness,
  isIgnorableRuntimeError,
  isCriticalResourceError,
  revokePreviewEmbedObjectUrl,
} from '../lib/preview-utils.js';

/*
 * Live preview + verification loop.
 *
 * Generated HTML renders in /preview/embed.html — a dedicated shell whose CSP
 * allows common CDNs (Tailwind, unpkg, Stripe). The main app keeps a strict CSP;
 * srcDoc inherited that CSP and blocked styling CDNs, which caused unstyled previews
 * falsely marked "Verified — runs clean".
 */

const MAX_HEAL_ATTEMPTS = 3;

export default function LivePreviewCanvas({
  code,
  isLight,
  onClose,
  isFullscreen,
  onToggleFullscreen,
  onVerificationStatusChange,
  headless = false,
  verifyOnly = false,
}) {
  const [viewport, setViewport] = useState('desktop');
  const [currentCode, setCurrentCode] = useState(code || '');
  const [status, setStatus] = useState('running'); // running | healing | clean | degraded | failed
  const [attempt, setAttempt] = useState(0);
  const [lastError, setLastError] = useState(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null);
  const [domainInput, setDomainInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectResult, setConnectResult] = useState(null);
  const [embedReady, setEmbedReady] = useState(false);
  const [embedSrc, setEmbedSrc] = useState('');
  const embedModeRef = useRef('blob');

  const iframeRef = useRef(null);
  const currentCodeRef = useRef(currentCode);
  const attemptRef = useRef(0);
  const healingRef = useRef(false);
  const errorSeenRef = useRef(false);
  const stylingFailedRef = useRef(false);
  const embedReadyRef = useRef(false);

  useEffect(() => { embedReadyRef.current = embedReady; }, [embedReady]);

  useEffect(() => { currentCodeRef.current = currentCode; }, [currentCode]);
  useEffect(() => { attemptRef.current = attempt; }, [attempt]);

  const onVerificationStatusChangeRef = useRef(onVerificationStatusChange);
  onVerificationStatusChangeRef.current = onVerificationStatusChange;

  useEffect(() => {
    onVerificationStatusChangeRef.current?.(status);
    // #region agent log
    fetch('http://127.0.0.1:7616/ingest/64591dc2-e663-41d5-a4f2-257bd0895da5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d0f2b5'},body:JSON.stringify({sessionId:'d0f2b5',runId:'preview-fix-v3',location:'LivePreviewCanvas:status',message:'verification status changed',data:{status,headless,verifyOnly},timestamp:Date.now(),hypothesisId:'verify-flow'})}).catch(()=>{});
    fetch('/api/debug-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'d0f2b5',runId:'preview-fix-v3',location:'LivePreviewCanvas:status',message:'verification status changed',data:{status,headless,verifyOnly},timestamp:Date.now(),hypothesisId:'verify-flow'})}).catch(()=>{});
    // #endregion
  }, [status, headless, verifyOnly]);

  useEffect(() => {
    setEmbedReady(false);
    embedReadyRef.current = false;
    // Prefer same-origin path (X-Frame-Options: SAMEORIGIN on /preview/*). Blob fallback if path fails.
    embedModeRef.current = 'path';
    setEmbedSrc(getPreviewEmbedPathUrl());
  }, [attempt]);

  useEffect(() => {
    if (!embedSrc || embedReady) return undefined;
    const timer = setTimeout(() => {
      if (embedReadyRef.current) return;
      if (embedModeRef.current === 'path') {
        try {
          embedModeRef.current = 'blob';
          setEmbedSrc(createPreviewEmbedObjectUrl());
        } catch { /* keep path */ }
        return;
      }
      // #region agent log
      fetch('http://127.0.0.1:7616/ingest/64591dc2-e663-41d5-a4f2-257bd0895da5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d0f2b5'},body:JSON.stringify({sessionId:'d0f2b5',runId:'embed-csp-fix',location:'LivePreviewCanvas:embed-timeout',message:'embed-ready timeout',data:{mode:embedModeRef.current},timestamp:Date.now(),hypothesisId:'embed-csp'})}).catch(()=>{});
      // #endregion
    }, 4000);
    return () => clearTimeout(timer);
  }, [embedSrc, embedReady, attempt]);

  const handleEmbedFrameError = useCallback(() => {
    if (embedModeRef.current === 'blob') return;
    try {
      embedModeRef.current = 'blob';
      setEmbedSrc(createPreviewEmbedObjectUrl());
    } catch {
      embedModeRef.current = 'path';
      setEmbedSrc(getPreviewEmbedPathUrl());
    }
    // #region agent log
    fetch('http://127.0.0.1:7616/ingest/64591dc2-e663-41d5-a4f2-257bd0895da5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d0f2b5'},body:JSON.stringify({sessionId:'d0f2b5',runId:'embed-csp-fix',location:'LivePreviewCanvas:iframe-error',message:'path embed failed, trying blob',data:{},timestamp:Date.now(),hypothesisId:'embed-csp'})}).catch(()=>{});
    // #endregion
  }, []);

  const handleEmbedFrameLoad = useCallback(() => {
    // #region agent log
    fetch('http://127.0.0.1:7616/ingest/64591dc2-e663-41d5-a4f2-257bd0895da5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d0f2b5'},body:JSON.stringify({sessionId:'d0f2b5',runId:'embed-blob-fix',location:'LivePreviewCanvas:iframe-load',message:'embed iframe loaded',data:{mode:embedModeRef.current,src:embedSrc?.slice(0,32)},timestamp:Date.now(),hypothesisId:'embed-refused'})}).catch(()=>{});
    // #endregion
  }, [embedSrc]);

  const pushHtmlToEmbed = useCallback((html) => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow || !html) return;
    frame.contentWindow.postMessage({ __quantoraPreviewHtml: injectPreviewHarness(html) }, '*');
    // #region agent log
    fetch('http://127.0.0.1:7616/ingest/64591dc2-e663-41d5-a4f2-257bd0895da5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d0f2b5'},body:JSON.stringify({sessionId:'d0f2b5',runId:'preview-fix',location:'LivePreviewCanvas:pushHtmlToEmbed',message:'html pushed to embed shell',data:{htmlLength:html.length,usesTailwind:/cdn\\.tailwindcss\\.com/i.test(html),embedPath:PREVIEW_EMBED_PATH},timestamp:Date.now(),hypothesisId:'CSP-embed'})}).catch(()=>{});
    fetch('/api/debug-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'d0f2b5',runId:'preview-fix',location:'LivePreviewCanvas:pushHtmlToEmbed',message:'html pushed to embed shell',data:{htmlLength:html.length,usesTailwind:/cdn\\.tailwindcss\\.com/i.test(html)},timestamp:Date.now(),hypothesisId:'CSP-embed'})}).catch(()=>{});
    // #endregion
  }, []);

  useEffect(() => {
    setCurrentCode(code || '');
    setStatus(code ? 'running' : 'clean');
    setAttempt(0);
    setLastError(null);
    setEmbedReady(false);
    healingRef.current = false;
    errorSeenRef.current = false;
    stylingFailedRef.current = false;
  }, [code]);

  useEffect(() => {
    if (!currentCode || !embedReady) return;
    errorSeenRef.current = false;
    stylingFailedRef.current = false;
    healingRef.current = false;
    setStatus('running');
    pushHtmlToEmbed(currentCode);
  }, [currentCode, embedReady, pushHtmlToEmbed]);

  const requestRepair = useCallback(async (brokenCode, message) => {
    const openRouterApiKey = (() => { try { return localStorage.getItem('openRouterApiKey'); } catch { return null; } })();
    const geminiApiKey = (() => { try { return localStorage.getItem('geminiApiKey'); } catch { return null; } })();
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'repair', code: brokenCode, error: message, framework: 'html', openRouterKey: openRouterApiKey, userKey: geminiApiKey })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Repair failed (${res.status})`);
    return data;
  }, []);

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
      setLastError(message);
      setStatus('failed');
      return;
    }

    if (isCriticalResourceError(message)) {
      stylingFailedRef.current = true;
      setLastError(message);
      setStatus('degraded');
      // #region agent log
      fetch('http://127.0.0.1:7616/ingest/64591dc2-e663-41d5-a4f2-257bd0895da5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d0f2b5'},body:JSON.stringify({sessionId:'d0f2b5',runId:'preview-fix',location:'LivePreviewCanvas:resource-error',message:'critical CDN resource failure',data:{message},timestamp:Date.now(),hypothesisId:'CSP-resource'})}).catch(()=>{});
      // #endregion
      return;
    }

    if (isIgnorableRuntimeError(message)) return;

    errorSeenRef.current = true;
    setLastError(message);

    if (attemptRef.current >= MAX_HEAL_ATTEMPTS) {
      setStatus('failed');
      return;
    }

    healingRef.current = true;
    setStatus('healing');
    try {
      const data = await requestRepair(currentCodeRef.current, message);
      if (data.unchanged || !data.code || data.code.trim() === currentCodeRef.current.trim()) {
        setStatus('failed');
        healingRef.current = false;
        return;
      }
      const original = currentCodeRef.current || '';
      const fixed = data.code || '';
      const hadStyle = /<style[\s>]/i.test(original) || /\bstyle\s*=/i.test(original) || /class\s*=/i.test(original);
      const keepsStyle = /<style[\s>]/i.test(fixed) || /\bstyle\s*=/i.test(fixed) || /class\s*=/i.test(fixed);
      const shrankTooMuch = fixed.length < original.length * 0.55;
      if ((hadStyle && !keepsStyle) || shrankTooMuch) {
        setLastError(null);
        setStatus(stylingFailedRef.current ? 'degraded' : 'clean');
        healingRef.current = false;
        return;
      }
      setAttempt((a) => a + 1);
      setCurrentCode(data.code);
    } catch (err) {
      setLastError(err.message || 'Auto-repair failed.');
      setStatus('failed');
      healingRef.current = false;
    }
  }, [requestRepair, verifyOnly]);

  useEffect(() => {
    const onMessage = (e) => {
      const d = e.data;
      if (!d || d.__quantora !== true) return;

      if (d.kind === 'embed-ready') {
        embedReadyRef.current = true;
        setEmbedReady(true);
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
      if (d.kind === 'loaded') {
        if (healingRef.current) return;
        // #region agent log
        fetch('http://127.0.0.1:7616/ingest/64591dc2-e663-41d5-a4f2-257bd0895da5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d0f2b5'},body:JSON.stringify({sessionId:'d0f2b5',runId:'preview-fix-v2',location:'LivePreviewCanvas:loaded',message:'preview loaded probe',data:{usesTailwind:d.usesTailwind,stylingOk:d.stylingOk,embedReady,statusBefore:status},timestamp:Date.now(),hypothesisId:'CSP-probe-fix'})}).catch(()=>{});
        fetch('/api/debug-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'d0f2b5',runId:'preview-fix-v2',location:'LivePreviewCanvas:loaded',message:'preview loaded probe',data:{usesTailwind:d.usesTailwind,stylingOk:d.stylingOk},timestamp:Date.now(),hypothesisId:'CSP-probe-fix'})}).catch(()=>{});
        // #endregion
        if (d.usesTailwind && d.stylingOk === false) {
          stylingFailedRef.current = true;
          setStatus('degraded');
          setLastError('Tailwind CSS did not apply — styling may look broken.');
          // #region agent log
          fetch('http://127.0.0.1:7616/ingest/64591dc2-e663-41d5-a4f2-257bd0895da5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d0f2b5'},body:JSON.stringify({sessionId:'d0f2b5',runId:'preview-fix',location:'LivePreviewCanvas:styling-probe',message:'tailwind probe failed',data:{usesTailwind:d.usesTailwind,stylingOk:d.stylingOk},timestamp:Date.now(),hypothesisId:'CSP-probe'})}).catch(()=>{});
          // #endregion
          return;
        }
        if (!errorSeenRef.current) setStatus('clean');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleRuntimeError]);

  const handleConnectDomain = async () => {
    const domain = domainInput.trim();
    if (!domain || connecting) return;
    setConnecting(true);
    setConnectResult(null);
    try {
      const res = await fetch('/api/domains', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'connect', domain, projectName: deployResult?.projectName })
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

  const handleDownload = () => {
    const blob = new Blob([currentCode], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'artifact.html'; a.click();
    URL.revokeObjectURL(url);
  };

  const handlePublish = async () => {
    if (isDeploying) return;
    setIsDeploying(true);
    setDeployResult(null);
    try {
      const deployRes = await fetch('/api/deploy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: currentCode })
      });
      const deployData = await deployRes.json();
      if (!deployRes.ok) throw new Error(deployData.error || 'Deploy failed');

      const domainRes = await fetch('/api/domains', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: currentCode.substring(0, 1000) })
      });
      const domainData = await domainRes.json();
      setDeployResult({ url: deployData.url, domains: domainData.domains || [], projectName: deployData.projectName });
    } catch (err) {
      alert('Deployment failed: ' + err.message + '\n\nPlease ensure your VERCEL_ACCESS_TOKEN is added to the Supabase Vault.');
    } finally {
      setIsDeploying(false);
    }
  };

  const retryVerification = () => {
    setAttempt(0);
    setLastError(null);
    errorSeenRef.current = false;
    healingRef.current = false;
    stylingFailedRef.current = false;
    setStatus('running');
    pushHtmlToEmbed(currentCodeRef.current + '\n<!-- retry -->');
  };

  const statusUI = {
    running: { icon: <Loader size={14} className="animate-spin" />, label: 'Verifying — running the preview…', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
    healing: { icon: <Wrench size={14} />, label: `Runtime error found — auto-fixing (attempt ${Math.min(attempt + 1, MAX_HEAL_ATTEMPTS)}/${MAX_HEAL_ATTEMPTS})…`, color: '#f59e0b', bg: 'rgba(245,158,11,0.14)' },
    clean: { icon: <ShieldCheck size={14} />, label: attempt > 0 ? 'Verified — auto-fixed and running clean' : 'Verified — runs clean', color: '#10b981', bg: 'rgba(16,185,129,0.14)' },
    degraded: { icon: <AlertTriangle size={14} />, label: 'Preview loaded but styling may be incomplete', color: '#f59e0b', bg: 'rgba(245,158,11,0.14)' },
    failed: { icon: <AlertTriangle size={14} />, label: `Couldn't auto-fix after ${MAX_HEAL_ATTEMPTS} attempts`, color: '#ef4444', bg: 'rgba(239,68,68,0.14)' }
  }[status] || null;

  const previewFrame = currentCode && embedSrc ? (
    <iframe
      ref={iframeRef}
      key={`${attempt}-${embedModeRef.current}`}
      title="Live Preview"
      src={embedSrc}
      onLoad={handleEmbedFrameLoad}
      onError={handleEmbedFrameError}
      sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
      style={{
        width: '100%',
        height: '100%',
        minHeight: headless ? '480px' : viewportStyles[viewport].height,
        border: 'none',
        background: '#ffffff',
      }}
    />
  ) : (
    <div style={{ padding: '24px', fontFamily: 'sans-serif', color: '#64748b' }}>Building…</div>
  );

  if (headless) {
    return (
      <div aria-hidden="true" style={{ width: '100%', height: '480px', overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
        {previewFrame}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', width: '100%',
      background: isLight ? '#f8fafc' : '#0f172a',
      borderLeft: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)'
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)',
        background: isLight ? '#ffffff' : '#1e293b'
      }}>
        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: isLight ? '#334155' : '#cbd5e1' }}>Live Preview</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', background: isLight ? '#f1f5f9' : 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '2px' }}>
            {[['mobile', <Smartphone size={16} key="m" />], ['tablet', <Tablet size={16} key="t" />], ['desktop', <Monitor size={16} key="d" />]].map(([v, icon]) => (
              <button key={v} onClick={() => setViewport(v)} style={{
                padding: '6px', borderRadius: '6px', cursor: 'pointer', border: 'none',
                background: viewport === v ? (isLight ? '#ffffff' : '#334155') : 'transparent',
                color: viewport === v ? '#3b82f6' : (isLight ? '#64748b' : '#94a3b8'),
                boxShadow: viewport === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}>{icon}</button>
            ))}
          </div>
          <button onClick={handleDownload} title="Export to HTML" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: isLight ? '#64748b' : '#94a3b8', display: 'flex', alignItems: 'center' }}>
            <Download size={18} />
          </button>
          {onToggleFullscreen && (
            <button onClick={onToggleFullscreen} title={isFullscreen ? 'Exit full screen' : 'Full screen'} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: isLight ? '#64748b' : '#94a3b8', display: 'flex', alignItems: 'center' }}>
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          )}
          <button onClick={handlePublish} disabled={isDeploying} title="Publish to Vercel" style={{
            background: isDeploying ? '#94a3b8' : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
            border: 'none', cursor: isDeploying ? 'not-allowed' : 'pointer', color: '#ffffff',
            display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '16px', fontSize: '0.75rem', fontWeight: 'bold'
          }}>
            <Rocket className={isDeploying ? 'animate-bounce' : ''} size={14} /> {isDeploying ? 'Deploying...' : 'Publish'}
          </button>
          <button onClick={onClose} title="Close Canvas" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: isLight ? '#64748b' : '#94a3b8', display: 'flex', alignItems: 'center' }}>
            <X size={18} />
          </button>
        </div>
      </div>

      {statusUI && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px',
          background: statusUI.bg, color: statusUI.color, fontSize: '0.78rem', fontWeight: 600,
          borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.08)'
        }}>
          {statusUI.icon}
          <span>{statusUI.label}</span>
          {(status === 'failed' || status === 'degraded') && (
            <button onClick={retryVerification} style={{
              marginLeft: 'auto', background: 'transparent', border: `1px solid ${statusUI.color}`,
              color: statusUI.color, borderRadius: '8px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer'
            }}>Retry</button>
          )}
          {(status === 'failed' || status === 'degraded') && lastError && (
            <span title={lastError} style={{ marginLeft: status === 'failed' ? '10px' : '8px', maxWidth: '46%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, opacity: 0.85 }}>{lastError}</span>
          )}
        </div>
      )}

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

      {deployResult && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: isLight ? '#ffffff' : '#0f172a', padding: '30px', borderRadius: '24px', width: '90%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', border: isLight ? 'none' : '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <div style={{ background: '#10b981', padding: '16px', borderRadius: '50%' }}><Rocket size={32} color="#ffffff" /></div>
            </div>
            <h2 style={{ textAlign: 'center', color: isLight ? '#0f172a' : '#ffffff', marginTop: 0 }}>Successfully Deployed!</h2>
            <p style={{ textAlign: 'center', color: isLight ? '#64748b' : '#94a3b8' }}>Your application is now live on Vercel's global edge network.</p>
            <div style={{ background: isLight ? '#f1f5f9' : '#1e293b', padding: '12px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
              <a href={deployResult.url} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deployResult.url}</a>
              <a href={deployResult.url} target="_blank" rel="noreferrer" style={{ background: '#3b82f6', color: '#fff', padding: '6px 12px', borderRadius: '8px', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 'bold' }}>Visit</a>
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
            <button onClick={() => { setDeployResult(null); setConnectResult(null); setDomainInput(''); }} style={{ width: '100%', padding: '12px', background: 'transparent', border: isLight ? '1px solid #cbd5e1' : '1px solid #334155', color: isLight ? '#475569' : '#94a3b8', borderRadius: '12px', marginTop: '24px', cursor: 'pointer', fontWeight: 'bold' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
