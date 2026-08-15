const fs = require('fs');
let code = fs.readFileSync('src/hooks/useChatStream.js', 'utf8');

const targetDestructure = `const { logModelFailure } = usePCLMemory();`;
const newDestructure = `const { logModelFailure, getLearnedBehaviors } = usePCLMemory();`;
code = code.replace(targetDestructure, newDestructure);

const targetExecuteCall = `executeSingleModel(targetModel, 1);`;
const newExecuteCall = `const learned = getLearnedBehaviors();
    executeSingleModel(targetModel, 1, learned);`;
// We only want to replace the FIRST occurrence, which is the default fallback execute call at the end of the handleSendMessage function.
// Actually, it's safer to just inject it at the top of handleSendMessage so we can pass it into ANY execute call.

// Let's do a targeted replace using a regex that finds the `const executeSingleModel = async (modelToUse, attempt = 1, promptOverride = null) => {`
// Inside there, we can append the learned behaviors to the prompt.

const executeDefRegex = /const executeSingleModel = async \(modelToUse, attempt = 1, promptOverride = null\) => \{/;
const newExecuteDef = `const executeSingleModel = async (modelToUse, attempt = 1, promptOverride = null) => {
      const learned = getLearnedBehaviors();
      let finalPromptOverride = promptOverride || '';
      if (learned) {
        finalPromptOverride = finalPromptOverride ? (finalPromptOverride + '\\n\\n' + learned) : learned;
      }`;
code = code.replace(executeDefRegex, newExecuteDef);

// Also need to update where promptOverride is injected into the payload
const targetPayload = `message: promptOverride ? text + '\\n\\n' + promptOverride : text,`;
const newPayload = `message: finalPromptOverride ? text + '\\n\\n' + finalPromptOverride : text,`;
code = code.replace(targetPayload, newPayload);

fs.writeFileSync('src/hooks/useChatStream.js', code);
console.log("Patched useChatStream for Cognitive Memory Injection");
