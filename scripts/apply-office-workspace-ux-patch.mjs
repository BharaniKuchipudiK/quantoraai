import fs from 'node:fs';

const path = 'src/components/AiStudio.jsx';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
  'message action state',
  'const actions = resolveMessageActions({ text: cleanText, hasPreview: !!runnableCode });',
  'const actions = resolveMessageActions({ text: cleanText, hasPreview: !!runnableCode, isOfficeArtifact: Boolean(msg.officeAttachment) });',
);

replaceOnce(
  'Office source-code controls',
  '                  {/* Source Code Toggle Button */}\n                  {msg.codeSnippet && (',
  '                  {/* Source Code Toggle Button — developer-only, never shown for Office artifacts */}\n                  {msg.codeSnippet && !msg.officeAttachment && (',
);

replaceOnce(
  'Office source-code panel',
  '                  {showCodeMap[msg.id] && msg.codeSnippet && (',
  '                  {showCodeMap[msg.id] && msg.codeSnippet && !msg.officeAttachment && (',
);

const previewBefore = `             {workspaceActiveTab === 'preview' ? (\n                  <LivePreviewCanvas \n                    code={workspaceCode} \n                    isLight={isLight} \n                    onClose={() => setIsWorkspaceMode(false)}\n                    showHeader={false}\n                    vfs={vfs}\n                    suggestedProjectName={messages.length > 0 ? messages[0].text.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'quantora-app'}\n                    isPresentationIntent={detectSlideDeck(messages)}\n                    officeKind={detectOfficeIntent({ messages })}\n                    modelId={selectedModel?.id}\n                  />\n             ) : (`;

const previewAfter = `             {workspaceActiveTab === 'preview' ? (\n                  <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>\n                    <LivePreviewCanvas \n                      code={workspaceCode} \n                      isLight={isLight} \n                      onClose={() => setIsWorkspaceMode(false)}\n                      showHeader={false}\n                      vfs={vfs}\n                      suggestedProjectName={messages.length > 0 ? messages[0].text.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'quantora-app'}\n                      isPresentationIntent={detectSlideDeck(messages)}\n                      officeKind={detectOfficeIntent({ messages })}\n                      modelId={selectedModel?.id}\n                    />\n                    {isGenerating && workspaceCode && messages.some((message) => message?.officeAttachment?.verification?.passed === true) && detectOfficeIntent({ messages }) && (\n                      <div\n                        role=\"status\"\n                        aria-live=\"polite\"\n                        style={{\n                          position: 'absolute', top: '14px', right: '16px', zIndex: 30,\n                          display: 'flex', alignItems: 'center', gap: '10px',\n                          padding: '10px 14px', borderRadius: '12px',\n                          background: isLight ? 'rgba(255,255,255,0.96)' : 'rgba(15,23,42,0.94)',\n                          border: isLight ? '1px solid #dbeafe' : '1px solid rgba(96,165,250,0.35)',\n                          boxShadow: '0 8px 24px rgba(15,23,42,0.18)',\n                          color: isLight ? '#1e3a8a' : '#bfdbfe',\n                          maxWidth: '360px',\n                        }}\n                      >\n                        <RefreshCw size={15} className=\"animate-spin\" />\n                        <div>\n                          <div style={{ fontSize: '0.78rem', fontWeight: 800 }}>Updating presentation…</div>\n                          <div style={{ fontSize: '0.68rem', marginTop: '2px', opacity: 0.78 }}>Last verified version stays visible until the revision passes verification.</div>\n                        </div>\n                      </div>\n                    )}\n                  </div>\n             ) : (`;

replaceOnce('verified workspace refinement state', previewBefore, previewAfter);

fs.writeFileSync(path, source);
console.log('Applied asserted Office workspace UX patch.');
