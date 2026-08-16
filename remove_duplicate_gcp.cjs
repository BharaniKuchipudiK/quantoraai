const fs = require('fs');
let code = fs.readFileSync('src/components/LivePreviewCanvas.jsx', 'utf8');

const targetToRemove = `  const handleGcpDeployClick = async () => {
    if (isDeployingGcp) return;
    if (!user) {
      onRequireAuth?.();
      return;
    }
    setIsDeployingGcp(true);
    
    // We only have currentCode in LivePreviewCanvas (the old HTML mode).
    // Build a mock VFS to pass to the new deploy-gcp endpoint.
    const vfs = { 'index.html': { content: currentCode || '' } };
    
    try {
      const deployRes = await fetch('/api/deploy-gcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ vfs, projectName: suggestedProjectName || 'quantora-app' }),
      });
      const deployData = await deployRes.json();
      if (!deployRes.ok) throw new Error(deployData.error || 'Deploy failed');
      
      const deployId = deployData.deployId;
      
      const pollDeploy = async () => {
        try {
          const statusRes = await fetch(\`/api/deploy-status?deployId=\${deployId}\`);
          const statusData = await statusRes.json();
          if (statusData.status === 'success') {
            setIsDeployingGcp(false);
            setGcpUrl(statusData.url);
          } else if (statusData.status === 'error') {
            throw new Error(statusData.error || 'GCP Deploy failed during build');
          } else {
            setTimeout(pollDeploy, 3000);
          }
        } catch (e) {
          console.error("GCP Deploy polling error:", e);
          setIsDeployingGcp(false);
        }
      };
      
      pollDeploy();
    } catch (e) {
      console.error("GCP Deploy error:", e);
      setIsDeployingGcp(false);
    }
  };

`;

code = code.replace(targetToRemove, '');
fs.writeFileSync('src/components/LivePreviewCanvas.jsx', code);
console.log("Removed duplicate handleGcpDeployClick");
