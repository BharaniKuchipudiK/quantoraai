const fs = require('fs');
let code = fs.readFileSync('src/components/AiStudio.jsx', 'utf8');

// I need to insert the `a` component into all three `ReactMarkdown` blocks
const targetComponent = `                            code({node, inline, className, children, ...props}) {`;
const newComponent = `                            a({node, children, ...props}) {
                              return <a style={{ color: '#3b82f6', textDecoration: 'underline', textUnderlineOffset: '2px' }} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
                            },
                            code({node, inline, className, children, ...props}) {`;

code = code.replaceAll(targetComponent, newComponent);

fs.writeFileSync('src/components/AiStudio.jsx', code);
console.log("Patched AiStudio.jsx markdown link styling");
