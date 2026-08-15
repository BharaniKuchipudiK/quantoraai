const fs = require('fs');
let code = fs.readFileSync('src/components/AiStudio.jsx', 'utf8');

// 1. Destructure logPreference
const pclTarget = `const { checkModelHealth } = usePCLMemory();`;
const pclReplacement = `const { checkModelHealth, logPreference } = usePCLMemory();`;
code = code.replace(pclTarget, pclReplacement);

// 2. Add Arena Toolbar Helper inside AiStudio render
// Find a good spot to inject a helper, maybe just before the return statement of the component?
// Actually, it's easier to just inject the JSX directly into the Arena blocks.

// 3. Replace Model A Footer (which currently just has the Live Sandbox button)
const modelAFooterRegex = /\{msg\.modelA\.text\?\.includes\('```'\)[\s\S]*?<\/button>\s*\)\}/g;
const newModelAFooter = `
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button 
                                  onClick={() => {
                                    navigator.clipboard.writeText(msg.modelA.text);
                                    setCopiedMessageId(\`\${msg.id}-A\`);
                                    setTimeout(() => setCopiedMessageId(null), 2000);
                                  }}
                                  style={{ background: 'transparent', border: 'none', color: copiedMessageId === \`\${msg.id}-A\` ? '#10b981' : subtextColor, cursor: 'pointer', padding: 0 }}
                                  title="Copy response"
                                >
                                  {copiedMessageId === \`\${msg.id}-A\` ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                              </div>
                              <button 
                                onClick={() => {
                                  logPreference(msg.modelA.modelName);
                                  alert('Preference logged to Cognitive Memory!');
                                }}
                                style={{ background: 'transparent', border: '1px solid #3b82f6', color: '#3b82f6', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                👍 Select Model A
                              </button>
                            </div>
`;
code = code.replace(modelAFooterRegex, newModelAFooter);


// 4. Replace Model B Footer (which currently just has the Live Sandbox button)
const modelBFooterRegex = /\{msg\.modelB\.text\?\.includes\('```'\)[\s\S]*?<\/button>\s*\)\}/g;
const newModelBFooter = `
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button 
                                  onClick={() => {
                                    navigator.clipboard.writeText(msg.modelB.text);
                                    setCopiedMessageId(\`\${msg.id}-B\`);
                                    setTimeout(() => setCopiedMessageId(null), 2000);
                                  }}
                                  style={{ background: 'transparent', border: 'none', color: copiedMessageId === \`\${msg.id}-B\` ? '#10b981' : subtextColor, cursor: 'pointer', padding: 0 }}
                                  title="Copy response"
                                >
                                  {copiedMessageId === \`\${msg.id}-B\` ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                              </div>
                              <button 
                                onClick={() => {
                                  logPreference(msg.modelB.modelName);
                                  alert('Preference logged to Cognitive Memory!');
                                }}
                                style={{ background: 'transparent', border: '1px solid #3b82f6', color: '#3b82f6', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                👍 Select Model B
                              </button>
                            </div>
`;
code = code.replace(modelBFooterRegex, newModelBFooter);


fs.writeFileSync('src/components/AiStudio.jsx', code);
console.log("Patched AiStudio.jsx for Arena UX consistency");
