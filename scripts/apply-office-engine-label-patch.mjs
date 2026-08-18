import fs from 'node:fs';

const path = 'src/components/AiStudio.jsx';
let source = fs.readFileSync(path, 'utf8');

const before = `                              <p style={{ margin: 0, fontSize: '0.85rem', color: subtextColor }}>\n                                Ready for download\n                              </p>`;
const after = `                              <p style={{ margin: 0, fontSize: '0.85rem', color: subtextColor }}>\n                                Ready for download\n                              </p>\n                              {msg.officeAttachment.generation?.provider && (\n                                <p style={{ margin: '5px 0 0 0', fontSize: '0.7rem', color: subtextColor, opacity: 0.82 }}>\n                                  Engine: {msg.officeAttachment.generation?.model || 'unknown'} ({msg.officeAttachment.generation.provider})\n                                  {Number.isFinite(msg.officeAttachment.generation?.attempts) && msg.officeAttachment.generation.attempts > 1\n                                    ? \` · repaired in \${msg.officeAttachment.generation.attempts} attempts\`\n                                    : ''}\n                                </p>\n                              )}`;

const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`Office engine label: expected exactly one match, found ${count}`);
source = source.replace(before, after);
fs.writeFileSync(path, source);
console.log('Applied Office engine label patch.');
