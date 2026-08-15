const fs = require('fs');
let code = fs.readFileSync('src/components/AiStudio.jsx', 'utf8');

const targetOnMouseLeave = `                onMouseLeave={(e) => { 
                  e.currentTarget.style.transform = 'none'; 
                  e.currentTarget.style.boxShadow = isLight ? '0 4px 12px rgba(0,0,0,0.03)' : '0 8px 32px rgba(0,0,0,0.2)'; 
                  e.currentTarget.style.borderColor = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)';
                }}
                >`;
const newOnMouseLeave = `                onMouseLeave={(e) => { 
                  e.currentTarget.style.transform = 'none'; 
                  e.currentTarget.style.boxShadow = isLight ? '0 4px 12px rgba(0,0,0,0.03)' : '0 8px 32px rgba(0,0,0,0.2)'; 
                  e.currentTarget.style.borderColor = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)';
                }}
                onClick={() => {
                  if (onSelectModel && availableModels) {
                    const found = availableModels.find(m => m.name === model.name);
                    if (found) onSelectModel(found);
                  }
                }}
                >`;

code = code.replace(targetOnMouseLeave, newOnMouseLeave);
fs.writeFileSync('src/components/AiStudio.jsx', code);
console.log("Patched AiStudio.jsx card onClick handler");
