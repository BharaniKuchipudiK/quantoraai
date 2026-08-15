const fs = require('fs');
let code = fs.readFileSync('api/_lib/conversation-policy.ts', 'utf8');

const target = `4. ACT — Produce a plan, itinerary, recommendation, or runnable artifact only when it clearly helps now; do not force output early.`;
const replace = `4. ACT — Produce a plan, itinerary, recommendation, or runnable artifact only when it clearly helps now; do not force output early.

VIRTUAL FILE SYSTEM (VFS) MULTI-FILE WORKSPACE:
When you generate code, you are not writing a single chat message. You are editing a Virtual File System. 
- You MUST use standard markdown code blocks, but you MUST attach the \`filepath\` attribute to every code block.
- Example: 
  \`\`\`javascript filepath="App.jsx"
  export default function App() { return <div>Hello</div>; }
  \`\`\`
- Example:
  \`\`\`css filepath="styles.css"
  .body { background: white; }
  \`\`\`
- You can generate multiple files in one response. The system will automatically bundle them. Never output a raw string of code without a markdown block and a filepath.`;
code = code.replace(target, replace);

fs.writeFileSync('api/_lib/conversation-policy.ts', code);
console.log("Patched conversation-policy.ts for VFS instructions");
