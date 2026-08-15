const fs = require('fs');
const file = 'src/components/AiStudio.jsx';
let content = fs.readFileSync(file, 'utf-8');

// 1. Add lastProcessedMessageId state
content = content.replace(
  "const [canvasCode, setCanvasCode] = useState('');",
  "const [canvasCode, setCanvasCode] = useState('');\n  const [lastProcessedMessageId, setLastProcessedMessageId] = useState(null);"
);

// 2. Modify the workspace tabs
const oldTabs = `{['App.jsx', 'styles.css', 'package.json'].map(tab => (`;
const newTabs = `{['preview', 'code'].map(tab => (`;
content = content.replace(oldTabs, newTabs);

const oldTabRender = `                  {tab.includes('.jsx') ? <Code2 size={14} /> : <FileText size={14} />}
                  {tab}
                </button>`;
const newTabRender = `                  {tab === 'code' ? <Code2 size={14} /> : <Play size={14} />}
                  {tab === 'preview' ? 'Preview' : 'Code'}
                </button>`;
content = content.replace(oldTabRender, newTabRender);

// 3. Remove "Preview App" button from the header since Preview is now a tab
const oldPreviewBtn = `<button style={{ background: 'transparent', border: '1px solid rgba(249, 115, 22, 0.3)', color: '#f97316', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Play size={12} /> Preview App
              </button>`;
content = content.replace(oldPreviewBtn, '');

// 4. Update the Canvas Editor Area to render either Preview or Code
const oldEditorArea = `{/* Canvas Editor Area (Pillar 4: Predictive Assist) */}
          <div style={{ flex: 1, overflow: 'auto', background: '#0d1127', padding: '24px', position: 'relative' }}>
             {/* Line Numbers */}
             <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '48px', background: '#0a0d1e', borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '24px', color: 'rgba(255,255,255,0.2)', fontSize: '0.85rem', fontFamily: 'monospace', userSelect: 'none', zIndex: 10 }}>
                {Array.from({ length: Math.max(20, (workspaceCode.match(/\\n/g) || []).length + 2) }).map((_, i) => (
                  <div key={i} style={{ lineHeight: '1.6' }}>{i + 1}</div>
                ))}
             </div>
             
             {/* Textarea for actual input */}
             <textarea
                value={workspaceCode}
                onChange={handleCodeChange}
                onKeyDown={handleCodeKeyDown}
                spellCheck="false"
                style={{
                  position: 'absolute',
                  top: '24px',
                  left: '60px',
                  width: 'calc(100% - 84px)',
                  height: 'calc(100% - 48px)',
                  background: 'transparent',
                  color: 'transparent',
                  caretColor: '#e2e8f0',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  fontFamily: '"Fira Code", monospace',
                  fontSize: '0.9rem',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  zIndex: 2,
                  margin: 0,
                  padding: 0
                }}
             />
             
             {/* Syntax Highlighted & Ghost Text Layer */}
             <pre style={{
                position: 'absolute',
                top: '24px',
                left: '60px',
                width: 'calc(100% - 84px)',
                pointerEvents: 'none',
                margin: 0,
                padding: 0,
                fontFamily: '"Fira Code", monospace',
                fontSize: '0.9rem',
                lineHeight: '1.6',
                color: '#e2e8f0',
                outline: 'none',
                whiteSpace: 'pre-wrap',
                zIndex: 1
             }}>
                {workspaceCode}
                {ghostText && <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>{ghostText}</span>}
                {!workspaceCode && <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>{'// Quantora FX Interactive Canvas\\n// Start typing or tell Quantora to build something...'}</span>}
             </pre>
          </div>`;
          
const newEditorArea = `{/* Workspace Content Area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: workspaceActiveTab === 'preview' ? (isLight ? '#f8fafc' : '#0f172a') : '#0d1127', position: 'relative', overflow: 'hidden' }}>
             {workspaceActiveTab === 'preview' ? (
                <LivePreviewCanvas 
                  code={workspaceCode} 
                  isLight={isLight} 
                  onClose={() => setIsWorkspaceMode(false)}
                  showHeader={false}
                />
             ) : (
               <>
                 {/* Line Numbers */}
                 <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '48px', background: '#0a0d1e', borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '24px', color: 'rgba(255,255,255,0.2)', fontSize: '0.85rem', fontFamily: 'monospace', userSelect: 'none', zIndex: 10 }}>
                    {Array.from({ length: Math.max(20, (workspaceCode.match(/\\n/g) || []).length + 2) }).map((_, i) => (
                      <div key={i} style={{ lineHeight: '1.6' }}>{i + 1}</div>
                    ))}
                 </div>
                 
                 {/* Textarea for actual input */}
                 <textarea
                    value={workspaceCode}
                    onChange={handleCodeChange}
                    onKeyDown={handleCodeKeyDown}
                    spellCheck="false"
                    style={{
                      position: 'absolute',
                      top: '24px',
                      left: '60px',
                      width: 'calc(100% - 84px)',
                      height: 'calc(100% - 48px)',
                      background: 'transparent',
                      color: 'transparent',
                      caretColor: '#e2e8f0',
                      border: 'none',
                      outline: 'none',
                      resize: 'none',
                      fontFamily: '"Fira Code", monospace',
                      fontSize: '0.9rem',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-wrap',
                      zIndex: 2,
                      margin: 0,
                      padding: 0
                    }}
                 />
                 
                 {/* Syntax Highlighted & Ghost Text Layer */}
                 <pre style={{
                    position: 'absolute',
                    top: '24px',
                    left: '60px',
                    width: 'calc(100% - 84px)',
                    pointerEvents: 'none',
                    margin: 0,
                    padding: 0,
                    fontFamily: '"Fira Code", monospace',
                    fontSize: '0.9rem',
                    lineHeight: '1.6',
                    color: '#e2e8f0',
                    outline: 'none',
                    whiteSpace: 'pre-wrap',
                    zIndex: 1
                 }}>
                    {workspaceCode}
                    {ghostText && <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>{ghostText}</span>}
                    {!workspaceCode && <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>{'// Quantora FX Interactive Canvas\\n// Start typing or tell Quantora to build something...'}</span>}
                 </pre>
               </>
             )}
          </div>`;
content = content.replace(oldEditorArea, newEditorArea);

fs.writeFileSync(file, content, 'utf-8');
console.log('Patched AiStudio.jsx workspace layout');
