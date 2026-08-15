const fs = require('fs');
let code = fs.readFileSync('api/_lib/conversation-policy.ts', 'utf8');

const target = `- You can generate multiple files in one response. The system will automatically bundle them. Never output a raw string of code without a markdown block and a filepath.`;
const replacement = `- You can generate multiple files in one response. The system will automatically bundle them. Never output a raw string of code without a markdown block and a filepath.

AST DIFF PATCHING (FOR EDITS):
If the user asks you to modify an EXISTING file, DO NOT rewrite the entire file from scratch. Instead, output a diff patch block using search/replace syntax. 
You must wrap your patch inside standard markdown code blocks with the filepath.
Use \`<<<<\` to start the search block, \`====\` to separate it, and \`>>>>\` to end the replace block. 

Example of modifying App.jsx:
\`\`\`javascript filepath="App.jsx"
<<<<
  function App() {
    return <button>Click me</button>;
  }
====
  function App() {
    return <button className="bg-red-500">Do not click me</button>;
  }
>>>>
\`\`\`
- Always include enough context in the \`<<<<\` block to uniquely identify the code to replace.
- If you are creating a BRAND NEW file, output the full file contents normally. Only use diff patching for EDITS.`;
code = code.replace(target, replacement);

fs.writeFileSync('api/_lib/conversation-policy.ts', code);
console.log("Patched conversation-policy.ts for Diff instructions");
