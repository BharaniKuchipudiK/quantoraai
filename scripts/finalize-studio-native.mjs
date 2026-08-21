import fs from 'node:fs';

function edit(path, transform) {
  const original = fs.readFileSync(path, 'utf8');
  const next = transform(original);
  if (next === original) throw new Error(`No changes produced for ${path}`);
  fs.writeFileSync(path, next);
}

function replaceOnce(source, label, before, after) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Marker not found for ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Ambiguous marker for ${label}`);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

function replaceAllChecked(source, label, before, after, minimum = 1) {
  const count = source.split(before).length - 1;
  if (count < minimum) throw new Error(`Expected at least ${minimum} occurrences for ${label}; found ${count}`);
  return source.split(before).join(after);
}

edit('src/components/AiStudio.jsx', (input) => {
  let source = input;
  source = replaceOnce(
    source,
    'profile hook import',
    "import { useStudioSession } from '../hooks/useStudioSession.js';\n",
    "import { useStudioSession } from '../hooks/useStudioSession.js';\nimport { useProfileAvatar } from '../hooks/useProfileAvatar.js';\n",
  );
  source = replaceOnce(
    source,
    'native profile state',
    "  const [sidebarOpen, setSidebarOpen] = useState(true);\n",
    "  const [sidebarOpen, setSidebarOpen] = useState(true);\n  const { avatarSrc: profileAvatarSrc } = useProfileAvatar(user);\n  const [profileAvatarFailed, setProfileAvatarFailed] = useState(false);\n\n  useEffect(() => {\n    setProfileAvatarFailed(false);\n  }, [profileAvatarSrc]);\n",
  );

  const sidebarControls = `        {/* Native Studio navigation controls. These replace the former DOM-injected Canvas/Profile rows. */}\n        <div style={{ paddingTop: '12px', marginTop: '12px', borderTop: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: '4px' }}>\n          {domainPolicy.showGenericCanvasNavigation && (\n            <button\n              type="button"\n              data-quantora-sidebar-canvas="true"\n              onClick={() => setActiveTab?.('canvas')}\n              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', color: textColor, fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer', textAlign: 'left' }}\n            >\n              <Workflow size={15} color="#0284c7" />\n              <span>Canvas</span>\n            </button>\n          )}\n          <button\n            type="button"\n            data-quantora-sidebar-profile="true"\n            onClick={() => window.dispatchEvent(new CustomEvent('quantora:open-profile-menu'))}\n            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', background: 'transparent', border: '1px solid transparent', color: textColor, fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer', textAlign: 'left' }}\n          >\n            {profileAvatarSrc && !profileAvatarFailed ? (\n              <img src={profileAvatarSrc} alt="" onError={() => setProfileAvatarFailed(true)} style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />\n            ) : (\n              <span data-quantora-avatar-fallback="true" style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#f97316,#8b5cf6)', color: '#fff', fontWeight: 800, fontSize: '0.78rem', flexShrink: 0 }}>\n                {(user?.name || 'U').charAt(0).toUpperCase()}\n              </span>\n            )}\n            <span data-quantora-profile-name="true">Profile</span>\n          </button>\n        </div>\n\n`;
  source = replaceOnce(
    source,
    'native sidebar controls',
    "        {/* Product feedback — explicit signed-in Studio entry point. */}\n",
    sidebarControls + "        {/* Product feedback — explicit signed-in Studio entry point. */}\n",
  );

  source = replaceOnce(
    source,
    'native arena marker',
    `          <button\n            onClick={() => setArenaMode(!arenaMode)}\n            title="Compare two AI models side-by-side in real time"`,
    `          <button\n            data-quantora-dual-arena="true"\n            aria-pressed={arenaMode}\n            onClick={() => setArenaMode(!arenaMode)}\n            title="Compare two AI models side-by-side in real time"`,
  );
  source = replaceOnce(
    source,
    'native arena label',
    `<Layers size={14} /> {arenaMode ? '⚔️ Arena Mode Active' : '⚔️ Dual Arena Mode'}`,
    `<Layers size={14} /> {arenaMode ? '⚔️ Arena Active' : '⚔️ Dual Arena'}`,
  );

  source = replaceOnce(
    source,
    'composer native cap',
    `                minHeight: '24px',\n                maxHeight: '400px',\n                overflow: 'auto'`,
    `                minHeight: '24px',\n                maxHeight: isAdvisorWorkspace ? '170px' : '220px',\n                overflowY: 'auto',\n                overflowX: 'hidden',\n                boxSizing: 'border-box'`,
  );

  source = replaceOnce(
    source,
    'native code workspace marker',
    `      {isWorkspaceMode && (canAutoOpenCodeWorkspace(studioDomain) || Boolean(detectOfficeIntent({ messages }))) && (\n        <div style={{`,
    `      {isWorkspaceMode && (canAutoOpenCodeWorkspace(studioDomain) || Boolean(detectOfficeIntent({ messages }))) && (\n        <div data-quantora-code-workspace="true" style={{`,
  );

  source = replaceOnce(
    source,
    'selected file highlight layer',
    `                    {workspaceCode}\n                    {ghostText && <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>{ghostText}</span>}`,
    `                    {(workspaceActiveTab !== 'preview' && workspaceActiveTab !== 'code' && vfs[workspaceActiveTab]) ? vfs[workspaceActiveTab].content : workspaceCode}\n                    {ghostText && <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>{ghostText}</span>}`,
  );

  return source;
});

edit('src/components/Header.jsx', (input) => {
  let source = input;
  source = replaceOnce(
    source,
    'profile editor imports',
    "import { QuantoraFullLogoSvg } from './QuantoraLogoSvg';\n",
    "import { QuantoraFullLogoSvg } from './QuantoraLogoSvg';\nimport ProfilePictureEditor from './ProfilePictureEditor.jsx';\nimport { useProfileAvatar } from '../hooks/useProfileAvatar.js';\n",
  );
  source = replaceOnce(
    source,
    'profile editor state',
    "  const [dataActionBusy, setDataActionBusy] = useState(false);\n",
    "  const [dataActionBusy, setDataActionBusy] = useState(false);\n  const [showProfilePictureEditor, setShowProfilePictureEditor] = useState(false);\n  const { avatarSrc, setCustomAvatar, resetAvatar } = useProfileAvatar(user);\n",
  );
  source = replaceOnce(
    source,
    'profile event bridge',
    "  useLayoutEffect(() => {\n",
    "  useEffect(() => {\n    const openProfile = () => {\n      setShowModelDropdown(false);\n      setShowProfileMenu(true);\n    };\n    window.addEventListener('quantora:open-profile-menu', openProfile);\n    return () => window.removeEventListener('quantora:open-profile-menu', openProfile);\n  }, []);\n\n  useLayoutEffect(() => {\n",
  );
  source = replaceAllChecked(source, 'avatar source ownership', 'user?.avatar', 'avatarSrc', 2);

  const pictureEntry = `                  <button\n                    type="button"\n                    data-quantora-profile-picture-entry="true"\n                    onClick={() => { setShowProfilePictureEditor(true); setShowProfileMenu(false); }}\n                    style={{ width: '100%', margin: '0 0 12px 0', padding: '9px 10px', borderRadius: '9px', border: '1px solid rgba(249,115,22,0.42)', background: 'rgba(249,115,22,0.10)', color: '#f97316', fontSize: '0.8rem', fontWeight: 750, cursor: 'pointer' }}\n                  >\n                    Change profile picture\n                  </button>\n\n`;
  source = replaceOnce(
    source,
    'profile picture menu entry',
    "                  {/* Theme Mode Preference Selector */}\n",
    pictureEntry + "                  {/* Theme Mode Preference Selector */}\n",
  );

  const editor = `      <ProfilePictureEditor\n        open={showProfilePictureEditor}\n        onClose={() => setShowProfilePictureEditor(false)}\n        user={user}\n        avatarSrc={avatarSrc}\n        onSelectAvatar={setCustomAvatar}\n        onResetAvatar={resetAvatar}\n        isLight={isLight}\n      />\n\n`;
  source = replaceOnce(
    source,
    'native profile editor render',
    "      {/* Double Confirmation Security Modal */}\n",
    editor + "      {/* Double Confirmation Security Modal */}\n",
  );
  return source;
});

edit('src/components/LivePreviewCanvas.jsx', (input) => {
  let source = input;
  source = replaceOnce(
    source,
    'project runtime imports',
    "import OfficePreview from './OfficePreview.jsx';\n",
    "import OfficePreview from './OfficePreview.jsx';\nimport ProjectRuntimePreview from './ProjectRuntimePreview.jsx';\nimport { isProjectRuntimeVfs } from '../lib/project-runtime-preview.js';\n",
  );

  const oldPreview = `  const previewFrame = (currentCode && embedSrc) || wcUrl ? (\n    <iframe\n      ref={iframeRef}\n      key={\`${'${attempt}-${embedModeRef.current}'}\`}\n      title="Live Preview"\n      src={wcUrl || embedSrc}\n      onError={handleEmbedFrameError}\n      sandbox={buildPreviewSandbox({ trustedRuntimeUrl: wcUrl })}\n      style={{\n        width: '100%',\n        height: '100%',\n        minHeight: headless ? '480px' : viewportStyles[viewport].height,\n        border: 'none',\n        background: '#ffffff',\n      }}\n    />\n  ) : (\n    <div style={{ padding: '24px', fontFamily: 'sans-serif', color: '#64748b' }}>Building…</div>\n  );`;
  const newPreview = `  const projectRuntimeActive = isProjectRuntimeVfs(vfs);\n  const previewFrame = projectRuntimeActive ? (\n    <ProjectRuntimePreview vfs={vfs} />\n  ) : ((currentCode && embedSrc) || wcUrl ? (\n    <iframe\n      ref={iframeRef}\n      key={\`${'${attempt}-${embedModeRef.current}'}\`}\n      title="Live Preview"\n      src={wcUrl || embedSrc}\n      onError={handleEmbedFrameError}\n      sandbox={buildPreviewSandbox({ trustedRuntimeUrl: wcUrl })}\n      style={{\n        width: '100%',\n        height: '100%',\n        minHeight: headless ? '480px' : viewportStyles[viewport].height,\n        border: 'none',\n        background: '#ffffff',\n      }}\n    />\n  ) : (\n    <div style={{ padding: '24px', fontFamily: 'sans-serif', color: '#64748b' }}>Building…</div>\n  ));`;
  source = replaceOnce(source, 'native project preview', oldPreview, newPreview);

  source = replaceOnce(
    source,
    'device switcher marker',
    `  const viewportSwitcher = (\n    <div style={{ display: 'flex', background: isLight ? '#f1f5f9' : 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '2px' }}>`,
    `  const viewportSwitcher = (\n    <div data-quantora-canvas-device-switcher="true" style={{ display: 'flex', background: isLight ? '#f1f5f9' : 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '2px' }}>`,
  );
  source = replaceOnce(
    source,
    'canvas root marker',
    `  return (\n    <div style={{\n      display: 'flex', flexDirection: 'column', height: '100%', width: '100%',`,
    `  return (\n    <div data-quantora-canvas-root="true" data-quantora-canvas-fullscreen={isFullscreen ? 'true' : 'false'} style={{\n      display: 'flex', flexDirection: 'column', height: '100%', width: '100%',`,
  );
  return source;
});

edit('src/styles/studio-toolbar-cleanup.css', (input) => {
  let source = input;
  source = replaceOnce(
    source,
    'arena remains native in advisors',
    `html[data-quantora-domain]:not([data-quantora-domain=""]) .app-shell--studio button[title="Select AI Engine"],\nhtml[data-quantora-domain]:not([data-quantora-domain=""]) .app-shell--studio button[title="Compare two AI models side-by-side in real time"] {\n  display: none !important;\n}`,
    `html[data-quantora-domain]:not([data-quantora-domain=""]) .app-shell--studio button[title="Select AI Engine"] {\n  display: none !important;\n}`,
  );
  return source;
});

edit('scripts/media-profile-browser-gate.mjs', (input) => {
  const start = input.indexOf('  // Regression fixture for the exact Agentic Workspace card failure reported in');
  const end = input.indexOf('  const profile = page.locator(\'[data-quantora-sidebar-profile]\').first();', start);
  if (start < 0 || end < 0) throw new Error('Media/profile legacy workspace fixture markers not found');
  let source = input.slice(0, start) + input.slice(end);
  source = source.replace('Media/profile/workspace-card browser gate passed.', 'Media/profile native browser gate passed.');
  return source;
});

edit('scripts/study-media-browser-gate.mjs', (input) => replaceOnce(
  input,
  'Study generic Canvas boundary',
  `  await visible(\n    page.locator('[data-quantora-sidebar-canvas]').first(),\n    'Study lost Canvas navigation after the Travel Canvas restriction.',\n  );`,
  `  await hidden(\n    page.locator('[data-quantora-sidebar-canvas]').first(),\n    'Generic developer Canvas navigation leaked into Study.',\n  );\n  await visible(page.locator('[data-quantora-workspace-capabilities="education"]').first(), 'Study capability surface is missing.');`,
));

edit('scripts/travel-browser-release-gate.mjs', (input) => replaceAllChecked(
  input,
  'Travel native code workspace selector',
  '[data-quantora-legacy-workspace="true"]',
  '[data-quantora-code-workspace="true"]',
  2,
));

edit('scripts/studio-regression-browser-gate.mjs', (input) => replaceAllChecked(
  input,
  'Studio native code workspace selector',
  '[data-quantora-legacy-workspace="true"]',
  '[data-quantora-code-workspace="true"]',
  3,
));

console.log('Native Studio finalization applied successfully.');
