const fs = require('fs');
let code = fs.readFileSync('src/components/LivePreviewCanvas.jsx', 'utf8');

const stateTarget = `  const [isDeploying, setIsDeploying] = useState(false);`;
const newState = `  const [isDeploying, setIsDeploying] = useState(false);
  const [isDeployingGcp, setIsDeployingGcp] = useState(false);
  const [gcpUrl, setGcpUrl] = useState(null);`;
code = code.replace(stateTarget, newState);

const iconTarget = `import { Smartphone, Tablet, Monitor, Download, X, Rocket, ShieldCheck, Wrench, Loader, AlertTriangle, Maximize2, Minimize2, Copy, Check, Link2 } from 'lucide-react';`;
const newIcon = `import { Smartphone, Tablet, Monitor, Download, X, Rocket, ShieldCheck, Wrench, Loader, AlertTriangle, Maximize2, Minimize2, Copy, Check, Link2, Cloud } from 'lucide-react';`;
code = code.replace(iconTarget, newIcon);

const publishHandlerTarget = `  const handlePublishClick = useCallback(async () => {`;
const gcpHandler = `
  const handleGcpDeployClick = useCallback(async () => {
    setIsDeployingGcp(true);
    try {
      const res = await fetch('/api/deploy-gcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vfs, projectName: 'quantora-wc' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Poll for status
      const poll = async () => {
        const statusRes = await fetch(\`/api/deploy-status?buildId=\${data.buildId}\`);
        const statusData = await statusRes.json();
        if (statusData.status === 'SUCCESS' && statusData.url) {
          setGcpUrl(statusData.url);
          setIsDeployingGcp(false);
          alert(\`Deployed successfully to GCP: \${statusData.url}\`);
        } else if (statusData.status === 'FAILURE' || statusData.status === 'INTERNAL_ERROR' || statusData.status === 'TIMEOUT') {
          setIsDeployingGcp(false);
          alert('GCP Deployment failed. Check Cloud Build logs.');
        } else {
          setTimeout(poll, 5000);
        }
      };
      poll();

    } catch (err) {
      alert(err.message || 'GCP Deployment failed');
      setIsDeployingGcp(false);
    }
  }, [vfs]);

  const handlePublishClick = useCallback(async () => {`;
code = code.replace(publishHandlerTarget, gcpHandler);

const buttonTarget = `      <Rocket className={isDeploying ? 'animate-bounce' : ''} size={14} /> {isDeploying ? 'Deploying…' : 'Publish'}
    </button>
  );`;
const gcpButton = `      <Rocket className={isDeploying ? 'animate-bounce' : ''} size={14} /> {isDeploying ? 'Deploying…' : 'Publish'}
    </button>
  );

  const deployGcpButton = (
    <button onClick={handleGcpDeployClick} disabled={isDeployingGcp} title="Deploy Full-Stack to GCP Cloud Run" style={{
      background: isDeployingGcp ? '#94a3b8' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      border: 'none', cursor: isDeployingGcp ? 'not-allowed' : 'pointer', color: '#ffffff',
      display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '16px', fontSize: '0.75rem', fontWeight: 'bold'
    }}>
      <Cloud className={isDeployingGcp ? 'animate-pulse' : ''} size={14} /> {isDeployingGcp ? 'Deploying to GCP…' : gcpUrl ? 'Live on GCP' : 'Deploy to GCP'}
    </button>
  );`;
code = code.replace(buttonTarget, gcpButton);

// Find where publishButton is rendered and put deployGcpButton next to it.
const headerTarget = `              {shareButton}
              {publishButton}
            </div>`;
const newHeader = `              {shareButton}
              {publishButton}
              {vfs && Object.keys(vfs).length > 0 && deployGcpButton}
            </div>`;
code = code.replace(headerTarget, newHeader);

fs.writeFileSync('src/components/LivePreviewCanvas.jsx', code);
console.log("Patched LivePreviewCanvas.jsx for GCP Deployments");
