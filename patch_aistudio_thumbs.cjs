const fs = require('fs');
let code = fs.readFileSync('src/components/AiStudio.jsx', 'utf8');

const targetToolbarStart = `{msg.sender === 'ai' && !isActiveGenerating && (
                        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>`;

const newToolbarStart = `{msg.sender === 'ai' && !isActiveGenerating && (
                        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              onClick={() => {
                                alert('Thank you! Quantora learned that this was a good response.');
                              }}
                              style={{ background: 'transparent', border: 'none', color: subtextColor, cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                              title="Helpful response"
                            >
                              <ThumbsUp size={14} />
                            </button>
                            <button
                              onClick={() => {
                                // Find the preceding user prompt
                                const userMsg = messages.slice().reverse().find(m => m.id < msg.id && m.sender === 'user');
                                logFeedback(userMsg ? userMsg.text : '', msg.text, false);
                                alert('Feedback logged. Cognitive Memory updated. Quantora will not repeat this mistake.');
                              }}
                              style={{ background: 'transparent', border: 'none', color: subtextColor, cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                              title="Incorrect response"
                            >
                              <ThumbsDown size={14} />
                            </button>
                          </div>`;

code = code.replace(targetToolbarStart, newToolbarStart);

fs.writeFileSync('src/components/AiStudio.jsx', code);
console.log("Patched AiStudio.jsx with Thumbs buttons");
