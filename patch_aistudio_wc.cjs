const fs = require('fs');
let code = fs.readFileSync('src/components/LivePreviewCanvas.jsx', 'utf8');

const importTarget = `} from '../lib/client-secrets.js';`;
const newImport = `} from '../lib/client-secrets.js';
import { bootWebContainer, syncVFSToWebContainer } from '../lib/webcontainer.js';`;
code = code.replace(importTarget, newImport);

const stateTarget = `  const [status, setStatus] = useState('clean'); // clean, running, degraded, error`;
const newState = `  const [status, setStatus] = useState('clean'); // clean, running, degraded, error
  const [wcUrl, setWcUrl] = useState(null);
  const [wcStatus, setWcStatus] = useState('idle');
  const webcontainerRef = useRef(null);`;
code = code.replace(stateTarget, newState);

const effectTarget = `  useEffect(() => {
    setCurrentCode(code || '');
    setStatus(code ? 'running' : 'clean');
    setAttempt(0);
    setLastError(null);
    setAiRepairedCode(null);
    healingRef.current = false;
    errorSeenRef.current = false;
    stylingFailedRef.current = false;
    pushHtmlToEmbed(code);
  }, [code, pushHtmlToEmbed]);`;
const newEffect = `  useEffect(() => {
    setCurrentCode(code || '');
    setStatus(code ? 'running' : 'clean');
    setAttempt(0);
    setLastError(null);
    setAiRepairedCode(null);
    healingRef.current = false;
    errorSeenRef.current = false;
    stylingFailedRef.current = false;

    // Check if we need WebContainers (Shadow OS)
    if (vfs['package.json']) {
      setWcStatus('booting');
      syncVFSToWebContainer(vfs).then(async (instance) => {
        webcontainerRef.current = instance;
        setWcStatus('installing');
        
        // Listen for server ready
        instance.on('server-ready', (port, url) => {
          setWcUrl(url);
          setWcStatus('ready');
        });

        // Run npm install
        const installProcess = await instance.spawn('npm', ['install']);
        await installProcess.exit;

        // Run dev server
        setWcStatus('starting');
        await instance.spawn('npm', ['run', 'dev']);
      }).catch(err => {
        console.error("WebContainer failed:", err);
        setWcStatus('error');
      });
    } else {
      pushHtmlToEmbed(code);
    }
  }, [code, pushHtmlToEmbed, vfs]);`;
code = code.replace(effectTarget, newEffect);

const renderTarget = `  const previewFrame = currentCode && embedSrc ? (
    <iframe
      ref={iframeRef}
      key={\`\${attempt}-\${embedModeRef.current}\`}
      title="Live Preview"
      src={embedSrc}`;
const newRender = `  const previewFrame = (currentCode && embedSrc) || wcUrl ? (
    <iframe
      ref={iframeRef}
      key={\`\${attempt}-\${embedModeRef.current}\`}
      title="Live Preview"
      src={wcUrl || embedSrc}`;
code = code.replace(renderTarget, newRender);

const loadingTarget = `      {!isMinimized && (
        <div style={{ flex: 1, position: 'relative', background: '#ffffff', minHeight: 0 }}>
          {status === 'error' && (`;
const newLoading = `      {!isMinimized && (
        <div style={{ flex: 1, position: 'relative', background: '#ffffff', minHeight: 0 }}>
          {wcStatus !== 'idle' && wcStatus !== 'ready' && wcStatus !== 'error' && (
             <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.9)', zIndex: 10 }}>
                <Loader className="animate-spin text-blue-500 mb-2" size={32} />
                <div style={{ fontWeight: '600', color: '#1e293b' }}>
                  {wcStatus === 'booting' && 'Booting WebContainer OS...'}
                  {wcStatus === 'installing' && 'Installing NPM Packages...'}
                  {wcStatus === 'starting' && 'Starting Dev Server...'}
                </div>
             </div>
          )}
          {status === 'error' && (`;
code = code.replace(loadingTarget, newLoading);

fs.writeFileSync('src/components/LivePreviewCanvas.jsx', code);
console.log("Patched LivePreviewCanvas.jsx for WebContainers");
