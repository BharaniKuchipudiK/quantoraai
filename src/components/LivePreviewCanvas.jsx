import React, { useState } from 'react';
import { Smartphone, Tablet, Monitor, Download, X, Rocket } from 'lucide-react';
import { SandpackProvider, SandpackPreview } from "@codesandbox/sandpack-react";

export default function LivePreviewCanvas({ code, isLight, onClose }) {
  const [viewport, setViewport] = useState('desktop');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null); // { url, domains }

  const viewportStyles = {
    mobile: { width: '375px', height: '667px' },
    tablet: { width: '768px', height: '1024px' },
    desktop: { width: '100%', height: '100%' }
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'artifact.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePublish = async () => {
    if (isDeploying) return;
    setIsDeploying(true);
    setDeployResult(null);
    try {
      // 1. Trigger Vercel Deploy
      const deployRes = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const deployData = await deployRes.json();
      
      if (!deployRes.ok) throw new Error(deployData.error || "Deploy failed");

      // 2. Fetch Domain Suggestions
      const domainRes = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: code.substring(0, 1000) })
      });
      const domainData = await domainRes.json();
      
      setDeployResult({
        url: deployData.url,
        domains: domainData.domains || []
      });
    } catch (err) {
      alert("Deployment failed: " + err.message + "\n\nPlease ensure your VERCEL_ACCESS_TOKEN is added to the Supabase Vault.");
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      background: isLight ? '#f8fafc' : '#0f172a',
      borderLeft: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)'
    }}>
      {/* Canvas Header / Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)',
        background: isLight ? '#ffffff' : '#1e293b'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: '600', color: isLight ? '#334155' : '#cbd5e1' }}>
            Live Preview
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Viewport Toggles */}
          <div style={{ 
            display: 'flex', 
            background: isLight ? '#f1f5f9' : 'rgba(0,0,0,0.2)', 
            borderRadius: '8px', 
            padding: '2px' 
          }}>
            <button onClick={() => setViewport('mobile')} style={{
              padding: '6px', borderRadius: '6px', cursor: 'pointer', border: 'none',
              background: viewport === 'mobile' ? (isLight ? '#ffffff' : '#334155') : 'transparent',
              color: viewport === 'mobile' ? '#3b82f6' : (isLight ? '#64748b' : '#94a3b8'),
              boxShadow: viewport === 'mobile' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}><Smartphone size={16} /></button>
            <button onClick={() => setViewport('tablet')} style={{
              padding: '6px', borderRadius: '6px', cursor: 'pointer', border: 'none',
              background: viewport === 'tablet' ? (isLight ? '#ffffff' : '#334155') : 'transparent',
              color: viewport === 'tablet' ? '#3b82f6' : (isLight ? '#64748b' : '#94a3b8'),
              boxShadow: viewport === 'tablet' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}><Tablet size={16} /></button>
            <button onClick={() => setViewport('desktop')} style={{
              padding: '6px', borderRadius: '6px', cursor: 'pointer', border: 'none',
              background: viewport === 'desktop' ? (isLight ? '#ffffff' : '#334155') : 'transparent',
              color: viewport === 'desktop' ? '#3b82f6' : (isLight ? '#64748b' : '#94a3b8'),
              boxShadow: viewport === 'desktop' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}><Monitor size={16} /></button>
          </div>

          <button onClick={handleDownload} title="Export to HTML" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: isLight ? '#64748b' : '#94a3b8', display: 'flex', alignItems: 'center'
          }}>
            <Download size={18} />
          </button>

          <button onClick={handlePublish} disabled={isDeploying} title="Publish to Vercel" style={{
            background: isDeploying ? '#94a3b8' : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', 
            border: 'none', cursor: isDeploying ? 'not-allowed' : 'pointer',
            color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 12px', borderRadius: '16px', fontSize: '0.75rem', fontWeight: 'bold'
          }}>
            {isDeploying ? <Rocket className="animate-bounce" size={14} /> : <Rocket size={14} />} 
            {isDeploying ? 'Deploying...' : 'Publish'}
          </button>

          <button onClick={onClose} title="Close Canvas" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: isLight ? '#64748b' : '#94a3b8', display: 'flex', alignItems: 'center'
          }}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'auto',
        padding: viewport === 'desktop' ? '0' : '20px'
      }}>
        <div style={{
          ...viewportStyles[viewport],
          background: '#ffffff',
          borderRadius: viewport === 'desktop' ? '0' : '12px',
          overflow: 'hidden',
          boxShadow: viewport === 'desktop' ? 'none' : '0 10px 40px rgba(0,0,0,0.2)',
          transition: 'all 0.3s ease',
          position: 'relative'
        }}>
          <SandpackProvider 
            template="react" 
            theme={isLight ? "light" : "dark"}
            files={{
              "/App.js": code || "export default function App() { return <div>Building...</div> }",
              "/styles.css": "body { font-family: sans-serif; padding: 20px; }",
            }}
            options={{
              classes: {
                "sp-wrapper": "custom-wrapper",
                "sp-layout": "custom-layout",
              }
            }}
          >
            <SandpackPreview 
              showNavigator={true} 
              showRefreshButton={true}
              style={{ height: '100%', minHeight: viewportStyles[viewport].height }}
            />
          </SandpackProvider>
        </div>
      </div>

      {/* Deployment Success Modal */}
      {deployResult && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: isLight ? '#ffffff' : '#0f172a',
            padding: '30px', borderRadius: '24px', width: '90%', maxWidth: '500px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            border: isLight ? 'none' : '1px solid rgba(255,255,255,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <div style={{ background: '#10b981', padding: '16px', borderRadius: '50%' }}>
                <Rocket size={32} color="#ffffff" />
              </div>
            </div>
            <h2 style={{ textAlign: 'center', color: isLight ? '#0f172a' : '#ffffff', marginTop: 0 }}>Successfully Deployed!</h2>
            <p style={{ textAlign: 'center', color: isLight ? '#64748b' : '#94a3b8' }}>
              Your application is now live on Vercel's global edge network.
            </p>
            
            <div style={{ background: isLight ? '#f1f5f9' : '#1e293b', padding: '12px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
              <a href={deployResult.url} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {deployResult.url}
              </a>
              <a href={deployResult.url} target="_blank" rel="noreferrer" style={{ background: '#3b82f6', color: '#fff', padding: '6px 12px', borderRadius: '8px', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 'bold' }}>
                Visit
              </a>
            </div>

            <div style={{ marginTop: '24px' }}>
              <h3 style={{ fontSize: '0.9rem', color: isLight ? '#334155' : '#cbd5e1', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                ✨ AI Domain Suggestions
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {deployResult.domains.map((domain, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isLight ? '#ffffff' : '#0f172a', border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)', padding: '10px 16px', borderRadius: '12px' }}>
                    <span style={{ color: isLight ? '#0f172a' : '#ffffff', fontWeight: '500' }}>{domain}</span>
                    <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 'bold', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: '8px' }}>Available</span>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={() => setDeployResult(null)} style={{
              width: '100%', padding: '12px', background: 'transparent', border: isLight ? '1px solid #cbd5e1' : '1px solid #334155',
              color: isLight ? '#475569' : '#94a3b8', borderRadius: '12px', marginTop: '24px', cursor: 'pointer', fontWeight: 'bold'
            }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
