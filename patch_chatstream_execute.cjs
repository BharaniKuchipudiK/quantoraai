const fs = require('fs');
let code = fs.readFileSync('src/hooks/useChatStream.js', 'utf8');

const targetExecuteDef = `const executeSingleModel = async (modelToUse, attempt = 1) => {`;
const newExecuteDef = `const executeSingleModel = async (modelToUse, attempt = 1, promptOverride = null) => {`;
code = code.replace(targetExecuteDef, newExecuteDef);

const targetBodyText = `            message: text,
            modelId: modelToUse.id,`;
const newBodyText = `            message: promptOverride ? text + '\\n\\n' + promptOverride : text,
            modelId: modelToUse.id,`;
code = code.replace(targetBodyText, newBodyText);

fs.writeFileSync('src/hooks/useChatStream.js', code);
console.log("Patched executeSingleModel to accept promptOverride");
