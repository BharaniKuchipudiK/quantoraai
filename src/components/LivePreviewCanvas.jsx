import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Smartphone, Tablet, Monitor, Download, X, Rocket, ShieldCheck, Wrench, Loader, AlertTriangle } from 'lucide-react';

/*
 * Live preview + verification loop.
 *
 * The generated artifact is a self-contained HTML document. We render it in a
 * sandboxed iframe with a small injected harness that reports runtime errors
 * back to us. When the document throws, we send it and the error to
 * /api/repair, swap in the corrected document, and re-run — up to a few
 * attempts — so the user is shown something that actually runs instead of a
 * broken page. This is the difference between "impressive demo that breaks"
 * and "a system that quietly guarantees the thing works."
 */

const MAX_HEAL_ATTEMPTS = 3;

// Injected into the previewed document so runtime failures surface to us.
const ERROR_HARNESS = `<script>(function(){
  function report(p){ try{ parent.postMessage(Object.assign({__quantora:true}, p), '*'); }catch(e){} }
  window.addEventListener('error', function(e){
    var where = e.filename ? (' @ ' + e.filename + ':' + (e.lineno||0)) : '';
    report({ kind:'error', message: (e.message || 'Script error') + where });
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    var r = e && e.reason; var m = (r && (r.message || r.toString && r.toString())) || 'unknown';
    report({ kind:'error', message: 'Unhandled promise rejection: ' + m });
  });
  window.addEventListener('load', function(){ setTimeout(function(){ report({ kind:'loaded' }); }, 350); });
})();</script>`;

function injectHarness(html) {
  const safe = html || '';
  if (/<head[^>]*>/i.test(safe)) return safe.replace(/<head[^>]*>/i, (m) => m + ERROR_HARNESS);
  if (/<html[^>]*>/i.test(safe)) return safe.replace(/<html[^>]*>/i, (m) => m + '<head>' + ERROR_HARNESS + '</head>');
  return ERROR_HARNESS + safe;
}

export default function LivePreviewCanvas({ code, isLight, onClose }) {
  const [viewport, setViewport] = useState('desktop');
  const [currentCode, setCurrentCode] = useState(code || '');
  const [status, setStatus] = useState('running'); // running | healing | clean | failed
  const [attempt, setAttempt] = useState(0);
  const [lastError, setLastError] = useState(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null);

  // Refs so the message handler always sees current values (no stale closures).
  const currentCodeRef = useRef(currentCode);
  const attemptRef = useRef(0);
  const healingRef = useRef(false);
  const errorSeenRef = useRef(false);
  useEffect(() => { currentCodeRef.current = currentCode; }, [currentCode]);
  useEffect(() => { attemptRef.current = attempt; }, [attempt]);

  const viewportStyles = {
    mobile: { width: '375px', height: '667px' },
    tablet: { width: '768px', height: '1024px' },
    desktop: { width: '100%', height: '100%' }
  };

  // A brand-new artifact resets the whole verification run.
  useEffect(() => {
    setCurrentCode(code || '');
    setStatus(code ? 'running' : 'clean');
    setAttempt(0);
    setLastError(null);
    healingRef.current = false;
    errorSeenRef.current = false;
  }, [code]);

  // Each time the rendered code changes, a fresh verification pass begins.
  useEffect(() => {
    if (!currentCode) return;
    errorSeenRef.current = false;
    healingRef.current = false;
    setStatus('running');
  }, [currentCode]);

  const srcDoc = useMemo(() => (currentCode ? injectHarness(currentCode) : ''), [currentCode]);

  const requestRepair = useCallback(async (brokenCode, message) => {
    const openRouterApiKey = (() => { try { return localStorage.getItem('openRouterApiKey'); } catch { return null; } })();
    const geminiApiKey = (() => { try { return localStorage.getItem('geminiApiKey'); } catch { return null; } })();
    const res = await fetch('/api/repair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: brokenCode, error: message, framework: 'html', openRouterKey: openRouterApiKey, userKey: geminiApiKey })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Repair failed (${res.status})`);
    return data; // { code, unchanged }
  }, []);

  const handleRuntimeError = useCallback(async (message) => {
    if (healingRef.current) return;            // a heal is already in flight
    if (errorSeenRef.current) return;          // only heal once per render
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
        // The model couldn't improve it — stop rather than loop on the same code.
        setStatus('failed');
        healingRef.current = false;
        return;
      }
      setAttempt((a) => a + 1);
      setCurrentCode(data.code); // triggers a fresh verification pass
    } catch (err) {
      setLastError(err.message || 'Auto-repair failed.');
      setStatus('failed');
      healingRef.current = false;
    }
  }, [requestRepair]);

  // Listen for reports from the sandboxed iframe.
  useEffect(() => {
    const onMessage = (e) => {
      const d = e.data;
      if (!d || d.__quantora !== true) return;
      if (d.kind === 'error') {
        handleRuntimeError(String(d.message || 'Runtime error'));
      } else if (d.kind === 'loaded') {
        if (!errorSeenRef.current && !healingRef.current) setStatus('clean');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleRuntimeError]);

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
      setDeployResult({ url: deployData.url, domains: domainData.domains || [] });
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
    // Re-run the current code by nudging the srcDoc (append a harmless comment).
    setCurrentCode((c) => (c.endsWith('\n<!--r-->') ? c.slice(0, -9) : c + '\n<!--r-->'));
    setStatus('running');
  };

  // ---- Status strip presentation ----
  const statusUI = {
    running: { icon: <Loader size={14} className="animate-spin" />, label: 'Verifying — running the preview…', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
    healing: { icon: <Wrench size={14} />, label: `Runtime error found — auto-fixing (attempt ${Math.min(attempt + 1, MAX_HEAL_ATTEMPTS)}/${MAX_HEAL_ATTEMPTS})…`, color: '#f59e0b', bg: 'rgba(245,158,11,0.14)' },
    clean: { icon: <ShieldCheck size={14} />, label: attempt > 0 ? `Verified — auto-fixed and running clean` : 'Verified — runs clean', color: '#10b981', bg: 'rgba(16,185,129,0.14)' },
    failed: { icon: <AlertTriangle size={14} />, label: `Couldn't auto-fix after ${MAX_HEAL_ATTEMPTS} attempts`, color: '#ef4444', bg: 'rgba(239,68,68,0.14)' }
  }[status] || null;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', width: '100%',
      background: isLight ? '#f8fafc' : '#0f172a',
      borderLeft: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)'
    }}>
      {/* Toolbar */}
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

      {/* Verification status strip */}
      {statusUI && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px',
          background: statusUI.bg, color: statusUI.color, fontSize: '0.78rem', fontWeight: 600,
          borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.08)'
        }}>
          {statusUI.icon}
          <span>{statusUI.label}</span>
          {status === 'failed' && (
            <button onClick={retryVerification} style={{
              marginLeft: 'auto', background: 'transparent', border: `1px solid ${statusUI.color}`,
              color: statusUI.color, borderRadius: '8px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer'
            }}>Retry</button>
          )}
          {status === 'failed' && lastError && (
            <span title={lastError} style={{ marginLeft: status === 'failed' ? '10px' : 'auto', maxWidth: '46%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, opacity: 0.85 }}>{lastError}</span>
          )}
        </div>
      )}

      {/* Canvas Area */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: viewport === 'desktop' ? '0' : '20px' }}>
        <div style={{
          ...viewportStyles[viewport], background: '#ffffff',
          borderRadius: viewport === 'desktop' ? '0' : '12px', overflow: 'hidden',
          boxShadow: viewport === 'desktop' ? 'none' : '0 10px 40px rgba(0,0,0,0.2)',
          transition: 'all 0.3s ease', position: 'relative'
        }}>
          {currentCode ? (
            <iframe
              key={attempt}
              title="Live Preview"
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-forms allow-popups allow-modals"
              style={{ width: '100%', height: '100%', minHeight: viewportStyles[viewport].height, border: 'none', background: '#ffffff' }}
            />
          ) : (
            <div style={{ padding: '24px', fontFamily: 'sans-serif', color: '#64748b' }}>Building…</div>
          )}
        </div>
      </div>

      {/* Deployment Success Modal */}
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
            <button onClick={() => setDeployResult(null)} style={{ width: '100%', padding: '12px', background: 'transparent', border: isLight ? '1px solid #cbd5e1' : '1px solid #334155', color: isLight ? '#475569' : '#94a3b8', borderRadius: '12px', marginTop: '24px', cursor: 'pointer', fontWeight: 'bold' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
