const fs = require('fs');
let code = fs.readFileSync('src/components/AiStudio.jsx', 'utf8');

const targetUI = `{renderedChatFeed}`;
const replaceUI = `{renderedChatFeed}
            {pclIntercept && (
              <div className="animate-slide-up" style={{ 
                margin: '20px 0', 
                padding: '20px', 
                background: isLight ? '#fff' : '#0f172a', 
                border: '1px solid rgba(249, 115, 22, 0.4)', 
                borderRadius: '16px',
                boxShadow: isLight ? '0 10px 25px rgba(0,0,0,0.05)' : '0 10px 25px rgba(0,0,0,0.3)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', color: '#f97316', fontWeight: 'bold' }}>
                  <Sparkles size={20} /> PCL Observation
                </div>
                <div style={{ color: 'var(--text-primary)', marginBottom: '20px', lineHeight: '1.5' }}>
                  I remember that <strong>{pclIntercept.targetModel.name}</strong> experienced severe network latency a few minutes ago. 
                  To prevent you from waiting, would you like me to route this request to our fastest model (<strong>Gemini 3 Flash</strong>) instead?
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    onClick={() => handlePclDecision(true)}
                    style={{ background: '#f97316', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', flex: 1 }}
                  >
                    Route to Gemini Flash
                  </button>
                  <button 
                    onClick={() => handlePclDecision(false)}
                    style={{ background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: 'none', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', flex: 1 }}
                  >
                    Force Proceed with {pclIntercept.targetModel.name}
                  </button>
                </div>
              </div>
            )}`;
code = code.replace(targetUI, replaceUI);
fs.writeFileSync('src/components/AiStudio.jsx', code);
console.log("Patched AiStudio.jsx PCL Intercept UI");
