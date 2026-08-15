const fs = require('fs');
let code = fs.readFileSync('src/hooks/useChatStream.js', 'utf8');

// 1. Import usePCLMemory
if (!code.includes('import { usePCLMemory }')) {
  code = `import { usePCLMemory } from './usePCLMemory';\n` + code;
}

// 2. Add usePCLMemory hook inside useChatStream
code = code.replace(
  /const abortControllerRef = useRef\(null\);/,
  "const abortControllerRef = useRef(null);\n  const { logModelFailure } = usePCLMemory();"
);

// 3. Log model failure on Server Error / Timeout inside executeSingleModel
// Replace PROACTIVE FAILOVER ON SERVER ERROR (503 / 500)
const serverErrorRegex = /\/\/ PROACTIVE FAILOVER ON SERVER ERROR \(503 \/ 500\)\n\s*if \(attempt === 1\) \{/;
code = code.replace(serverErrorRegex, `// PROACTIVE FAILOVER ON SERVER ERROR (503 / 500)
            if (attempt === 1) {
               logModelFailure(modelToUse.id, 'server_error');`);

// Replace PROACTIVE FAILOVER ON TIMEOUT
const timeoutRegex = /\/\/ PROACTIVE FAILOVER ON TIMEOUT\n\s*if \(attempt === 1 && error === 'timeout'\) \{/;
code = code.replace(timeoutRegex, `// PROACTIVE FAILOVER ON TIMEOUT
            if (attempt === 1 && error === 'timeout') {
               logModelFailure(modelToUse.id, 'timeout');`);
               
// Replace PROACTIVE FAILOVER ON CONNECTION ERROR
const connectionErrorRegex = /if \(attempt === 1\) \{\n\s*console\.log\("PCL: Intercepted connection error\. Auto-failing over\.\.\."\);/;
code = code.replace(connectionErrorRegex, `if (attempt === 1) {
           logModelFailure(modelToUse.id, 'connection_error');
           console.log("PCL: Intercepted connection error. Auto-failing over...");`);

fs.writeFileSync('src/hooks/useChatStream.js', code);
console.log("Patched useChatStream.js with PCL Memory");
