const fs = require('fs');
let code = fs.readFileSync('src/hooks/useChatStream.js', 'utf8');

const targetGatekeeper = `    // Phase 4: Intent Router (Gatekeeper)
    let effectiveArenaMode = arenaMode;
    if (arenaMode) {
      try {
        const intentRes = await fetch('/api/classify-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text })
        });
        if (intentRes.ok) {
          const intentData = await intentRes.json();
          if (intentData.intent === 'deterministic') {
            effectiveArenaMode = false;
            // Inject a system message notifying the user
            updateActiveMessages(prev => [...prev, {
              id: Date.now() + 1,
              sender: 'ai',
              text: '⚡ **PCL Observation**: This is a deterministic request. Bypassing Arena Mode to provide a single, consolidated answer.',
            }]);
            
            // Artificial delay to let the user read the observation before streaming starts
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
      } catch (e) {
        console.error("Gatekeeper intent routing failed", e);
      }
    }`;

const newGatekeeper = `    // Phase 4 & 5: Intent Router & Agentic Swarm
    let effectiveArenaMode = arenaMode;
    let intent = 'subjective'; // Default
    try {
      const intentRes = await fetch('/api/classify-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text })
      });
      if (intentRes.ok) {
        const intentData = await intentRes.json();
        intent = intentData.intent;
      }
    } catch (e) {
      console.error("Gatekeeper intent routing failed", e);
    }

    if (effectiveArenaMode && intent === 'deterministic') {
        effectiveArenaMode = false;
        updateActiveMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'ai',
          text: '⚡ **PCL Observation**: This is a deterministic request. Bypassing Arena Mode to provide a single, consolidated answer.'
        }]);
        await new Promise(resolve => setTimeout(resolve, 1500));
    }`;

code = code.replace(targetGatekeeper, newGatekeeper);

const targetExecute = `    executeSingleModel(targetModel, 1);`;
const newExecute = `    // Phase 5: Swarm Mode
    if (!effectiveArenaMode && intent === 'subjective') {
       // Trigger Architect -> Coder Swarm
       updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: '🧠 *Architect Agent is planning the system design...*' } : m));
       
       try {
         // Fire Architect call to our generic chat endpoint using Flash
         const architectRes = await fetch('/api/chat', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             message: \`You are the Architect Agent. Write a highly detailed technical implementation plan for this request. Do NOT write the final code. Just the step-by-step logic and file architecture. Request: \${text}\`,
             modelId: 'google/gemini-1.5-flash',
             modelName: 'Gemini 1.5 Flash',
             history: []
           })
         });
         
         if (architectRes.ok) {
           // We have to wait for the stream to finish or we can just parse the stream
           let architectPlan = '';
           const reader = architectRes.body.getReader();
           const decoder = new TextDecoder();
           while (true) {
             const { done, value } = await reader.read();
             if (done) break;
             const chunk = decoder.decode(value);
             const lines = chunk.split('\\n');
             for (const line of lines) {
               if (line.startsWith('data: ')) {
                 try {
                   const parsed = JSON.parse(line.slice(6));
                   if (parsed.text) architectPlan += parsed.text;
                 } catch (e) {}
               }
             }
           }
           
           updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: '👨‍💻 *Coder Agent is executing the architecture...*' } : m));
           await new Promise(resolve => setTimeout(resolve, 800)); // UI delay
           
           // Clear text and run Coder
           updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: '' } : m));
           executeSingleModel(targetModel, 1, \`Architect's Approved Implementation Plan:\\n\\n\${architectPlan}\\n\\n---\\n\\nPlease execute this plan and write the final code for the original request.\`);
           return;
         }
       } catch (e) {
         console.error("Swarm architect failed", e);
       }
    }

    // Default Fallback
    executeSingleModel(targetModel, 1);`;

code = code.replace(targetExecute, newExecute);

fs.writeFileSync('src/hooks/useChatStream.js', code);
console.log("Patched useChatStream.js for Phase 5 Swarm logic");
