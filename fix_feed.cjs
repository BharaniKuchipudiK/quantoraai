const fs = require('fs');
const file = '/Users/bharanik/.gemini/antigravity/scratch/quantrora/src/components/AiStudio.jsx';
let content = fs.readFileSync(file, 'utf8');

const lines = content.split('\n');

// Find the start of renderedChatFeed
const startIdx = lines.findIndex(l => l.includes('const renderedChatFeed = React.useMemo(() => {'));
if (startIdx === -1) throw new Error("Could not find start");

// Find the end of renderedChatFeed (the line with '}, [messages, isLight, ...');
const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes('}, [messages, isLight, textColor, subtextColor, openCanvasWithCode, showCodeMap, keyInputValue, arenaMode, secondModel]);'));
if (endIdx === -1) throw new Error("Could not find end");

// Extract the block
const block = lines.slice(startIdx, endIdx + 1);

// Remove the block from its current location
lines.splice(startIdx, (endIdx - startIdx) + 1);

// Find the insertion point in AiStudio
const insertIdx = lines.findIndex(l => l.includes('const chatEndRef = useRef(null);'));
if (insertIdx === -1) throw new Error("Could not find insert point");

// Insert the block
lines.splice(insertIdx + 1, 0, ...block);

fs.writeFileSync(file, lines.join('\n'));
console.log("Success");
