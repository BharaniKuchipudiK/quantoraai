const fs = require('fs');
let code = fs.readFileSync('src/components/AiStudio.jsx', 'utf8');

// 1. Update the tabs array
const tabsTarget = `{['preview', 'code'].map(tab => (`;
const tabsReplacement = `{(Object.keys(vfs).length > 0 ? ['preview', ...Object.keys(vfs)] : ['preview', 'code']).map(tab => (`;
code = code.replace(tabsTarget, tabsReplacement);

// 2. Update the tab labeling
const tabIconTarget = `{tab === 'code' ? <Code2 size={14} /> : <Play size={14} />}
                  {tab === 'preview' ? 'Preview' : 'Code'}`;
const tabIconReplacement = `{tab === 'preview' ? <Play size={14} /> : <Code2 size={14} />}
                  {tab === 'preview' ? 'Preview' : tab === 'code' ? 'Code' : tab}`;
code = code.replace(tabIconTarget, tabIconReplacement);

// 3. Update the handleCodeChange to update VFS
const handleCodeTarget = `const handleCodeChange = (e) => {
    const val = e.target.value;
    const pos = e.target.selectionStart;
    setWorkspaceCode(val);`;
const handleCodeReplacement = `const handleCodeChange = (e) => {
    const val = e.target.value;
    const pos = e.target.selectionStart;
    setWorkspaceCode(val);
    
    // Update VFS if we are editing a specific file
    if (workspaceActiveTab !== 'preview' && workspaceActiveTab !== 'code' && vfs[workspaceActiveTab]) {
      setVfs(prev => ({
        ...prev,
        [workspaceActiveTab]: { ...prev[workspaceActiveTab], content: val }
      }));
    }`;
code = code.replace(handleCodeTarget, handleCodeReplacement);

// 4. Update textarea value to pull from VFS if applicable
// First, find the textarea rendering logic
const textareaTarget = `<textarea
                    value={workspaceCode}
                    onChange={handleCodeChange}`;
const textareaReplacement = `
                 <textarea
                    value={(workspaceActiveTab !== 'preview' && workspaceActiveTab !== 'code' && vfs[workspaceActiveTab]) ? vfs[workspaceActiveTab].content : workspaceCode}
                    onChange={handleCodeChange}`;
code = code.replace(textareaTarget, textareaReplacement);

// 5. Update Line Numbers to count based on the correct code
const lineNumbersTarget = `{Array.from({ length: Math.max(20, (workspaceCode.match(/\\n/g) || []).length + 2) }).map((_, i) => (`;
const lineNumbersReplacement = `{(function(){
                      const currentText = (workspaceActiveTab !== 'preview' && workspaceActiveTab !== 'code' && vfs[workspaceActiveTab]) ? vfs[workspaceActiveTab].content : workspaceCode;
                      return Array.from({ length: Math.max(20, (currentText.match(/\\n/g) || []).length + 2) }).map((_, i) => (
                        <div key={i} style={{ lineHeight: '1.6' }}>{i + 1}</div>
                      ));
                    })()}`;
code = code.replace(lineNumbersTarget, lineNumbersReplacement);

fs.writeFileSync('src/components/AiStudio.jsx', code);
console.log("Patched AiStudio.jsx for Visible Workspace");
