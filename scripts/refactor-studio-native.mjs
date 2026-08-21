import fs from 'node:fs';

const path = 'src/components/AiStudio.jsx';
let source = fs.readFileSync(path, 'utf8');
const original = source;

function replaceOnce(label, before, after) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Refactor marker not found: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Refactor marker is ambiguous: ${label}`);
  source = source.slice(0, index) + after + source.slice(index + before.length);
}

function replaceAllChecked(label, before, after, minimum = 1) {
  const count = source.split(before).length - 1;
  if (count < minimum) throw new Error(`Expected at least ${minimum} occurrences for ${label}; found ${count}`);
  source = source.split(before).join(after);
}

function insertBefore(label, marker, addition) {
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`Insert marker not found: ${label}`);
  source = source.slice(0, index) + addition + source.slice(index);
}

// 1) Native capabilities and verified media become first-class React dependencies.
replaceOnce(
  'lucide GitBranch import',
  'ThumbsUp, ThumbsDown, List, MoreHorizontal, Volume2, Flag }',
  'ThumbsUp, ThumbsDown, List, MoreHorizontal, Volume2, Flag, GitBranch }',
);
insertBefore(
  'native capability imports',
  "import { detectOfficeIntent, isPresentationIntent as detectSlideDeck } from '../lib/office-intent.js';",
  "import VerifiedMediaLink from './VerifiedMediaLink.jsx';\nimport { studioDomainPolicy, canAutoOpenCodeWorkspace, canExplicitlyPreviewCode } from '../lib/studio-domain-policy.js';\n",
);

// 2) Session domain/fork state is owned by React, not post-render DOM shims.
replaceOnce(
  'useStudioSession native controls',
  `    projectContext,\n    projectArtifacts\n  } = useStudioSession({ user, selectedModel });`,
  `    projectContext,\n    projectArtifacts,\n    studioDomain,\n    setStudioDomain,\n    handleCreateAdvisorChat,\n    forkChatFromMessage\n  } = useStudioSession({ user, selectedModel });`,
);
replaceOnce(
  'domain policy derivation',
  `  const activeSession = chatSessions.find(s => s.id === activeSessionId) || chatSessions[0];\n`,
  `  const activeSession = chatSessions.find(s => s.id === activeSessionId) || chatSessions[0];\n  const domainPolicy = studioDomainPolicy(studioDomain);\n  const isAdvisorWorkspace = Boolean(domainPolicy.domain);\n`,
);

// 3) Generic developer Canvas is fail-closed whenever an advisor session becomes active.
replaceOnce(
  'workspace domain reset effect',
  `  const [lastProcessedMessageId, setLastProcessedMessageId] = useState(null);\n  const [thinkingTime, setThinkingTime] = useState(0);`,
  `  const [lastProcessedMessageId, setLastProcessedMessageId] = useState(null);\n  const [thinkingTime, setThinkingTime] = useState(0);\n\n  useEffect(() => {\n    if (canAutoOpenCodeWorkspace(studioDomain)) return;\n    setIsWorkspaceMode(false);\n    setCanvasOpen(false);\n  }, [studioDomain]);`,
);
replaceOnce(
  'openCanvasWithCode advisor guard',
  `  const openCanvasWithCode = (rawText) => {\n`,
  `  const openCanvasWithCode = (rawText) => {\n    if (!canExplicitlyPreviewCode(studioDomain) && !detectOfficeIntent({ messages })) return;\n`,
);
replaceOnce(
  'preview code block advisor guard',
  `  const handlePreviewCodeBlock = useCallback((codeString, lang) => {\n`,
  `  const handlePreviewCodeBlock = useCallback((codeString, lang) => {\n    if (!canExplicitlyPreviewCode(studioDomain)) return;\n`,
);
replaceOnce(
  'preview callback dependency',
  `  }, []);\n\n  const markdownComponents = React.useMemo(() => ({`,
  `  }, [studioDomain]);\n\n  const markdownComponents = React.useMemo(() => ({`,
);
replaceAllChecked(
  'native verified links',
  `a({node, children, ...props}) {\n                              return <a style={{ color: '#3b82f6', textDecoration: 'underline', textUnderlineOffset: '2px' }} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>\n                            },`,
  `a({node, children, href, ...props}) {\n                              return <VerifiedMediaLink href={href} style={{ color: '#3b82f6', textDecoration: 'underline', textUnderlineOffset: '2px' }} {...props}>{children}</VerifiedMediaLink>\n                            },`,
  1,
);
replaceAllChecked(
  'native verified links compact variant',
  `a({node, children, ...props}) {\n      return <a style={{ color: '#3b82f6', textDecoration: 'underline', textUnderlineOffset: '2px' }} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>\n    },`,
  `a({node, children, href, ...props}) {\n      return <VerifiedMediaLink href={href} style={{ color: '#3b82f6', textDecoration: 'underline', textUnderlineOffset: '2px' }} {...props}>{children}</VerifiedMediaLink>\n    },`,
  1,
);
replaceAllChecked(
  'code Preview policy',
  `{isRunnable && (`,
  `{isRunnable && canExplicitlyPreviewCode(studioDomain) && (`,
  1,
);
replaceOnce(
  'markdown dependency',
  `  }), [handlePreviewCodeBlock]);`,
  `  }), [handlePreviewCodeBlock, studioDomain]);`,
);

// 4) Advisor mode never exposes model-routing plumbing.
replaceOnce(
  'advisor PCL intercept',
  `    if (selectedModel && !arenaMode) {`,
  `    if (selectedModel && !arenaMode && !isAdvisorWorkspace) {`,
);
replaceOnce(
  'header model metadata visibility',
  `              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap', opacity: messages.length <= 1 ? 0 : 1, transition: 'opacity 0.3s ease' }}>`,
  `              <div style={{ display: isAdvisorWorkspace ? 'none' : 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap', opacity: messages.length <= 1 ? 0 : 1, transition: 'opacity 0.3s ease' }}>`,
);
replaceOnce(
  'header title',
  `{activeSession && messages.length > 1 ? activeSession.title : 'New Workspace'}`,
  `{isAdvisorWorkspace ? domainPolicy.title : (activeSession && messages.length > 1 ? activeSession.title : 'New Workspace')}`,
);
replaceOnce(
  'router suggestion visibility',
  `{suggestedModel && !showMentionMenu && (`,
  `{suggestedModel && !showMentionMenu && !isAdvisorWorkspace && (`,
);
replaceOnce(
  'engine control visibility',
  `                  display: 'flex',\n                    alignItems: 'center',\n                    gap: '6px',\n                    background: showInBarModelDropdown`,
  `                  display: isAdvisorWorkspace ? 'none' : 'flex',\n                    alignItems: 'center',\n                    gap: '6px',\n                    background: showInBarModelDropdown`,
);
replaceOnce(
  'tools menu visibility',
  `                    display: 'flex',\n                    alignItems: 'center',\n                    justifyContent: 'center',\n                    transition: 'all 0.2s ease'\n                  }}\n                  onMouseEnter={e => {\n                    if (!showToolsMenu)`,
  `                    display: isAdvisorWorkspace ? 'none' : 'flex',\n                    alignItems: 'center',\n                    justifyContent: 'center',\n                    transition: 'all 0.2s ease'\n                  }}\n                  onMouseEnter={e => {\n                    if (!showToolsMenu)`,
);
replaceOnce(
  'raw Dream Canvas visibility',
  `                title="Push raw prompt to Dream Canvas"\n                style={{\n                  background: inputText.trim()`,
  `                title="Push raw prompt to Dream Canvas"\n                style={{\n                  display: domainPolicy.showGenericCanvasNavigation ? 'flex' : 'none',\n                  background: inputText.trim()`,
);

// 5) Advisor selection creates a native domain session and renders a clean capability surface.
replaceOnce(
  'advisor cards',
  `          {[\n            { title: 'Travel Guide AI', icon: <Globe size={15} color="#3b82f6" />, prompt: 'Act as a world-class travel planner. I want to plan a trip.' },\n            { title: 'Finance Advisor', icon: <PieChart size={15} color="#10b981" />, prompt: 'Act as a strict, data-driven financial analyst. Help me evaluate my portfolio.' },\n            { title: 'Study Tutor', icon: <Lightbulb size={15} color="#f59e0b" />, prompt: 'Act as an encouraging academic tutor using the Socratic method. Teach me something new.' },\n            { title: 'Research Analyst', icon: <Layers size={15} color="#8b5cf6" />, prompt: 'Act as a deep-dive research assistant. Let\\'s explore a complex topic.' }\n          ].map((card, idx) => (`,
  `          {[\n            { domain: 'travel', title: 'Travel Advisor', icon: <Globe size={15} color="#3b82f6" /> },\n            { domain: 'finance', title: 'Finance Advisor', icon: <PieChart size={15} color="#10b981" /> },\n            { domain: 'education', title: 'Study Tutor', icon: <Lightbulb size={15} color="#f59e0b" /> },\n            { domain: 'research', title: 'Research Analyst', icon: <Layers size={15} color="#8b5cf6" /> }\n          ].map((card, idx) => (`,
);
replaceOnce(
  'advisor card click',
  `              onClick={() => {\n                handleSendMessage(card.prompt);\n                if (window.innerWidth < 768) setSidebarOpen(false);\n              }}`,
  `              data-quantora-advisor={card.domain}\n              data-quantora-active-specialist={studioDomain === card.domain ? card.domain : undefined}\n              onClick={() => {\n                handleCreateAdvisorChat(card.domain);\n                if (window.innerWidth < 768) setSidebarOpen(false);\n              }}`,
);
replaceOnce(
  'advisor active background',
  `                color: textColor,\n                border: '1px solid transparent',`,
  `                color: studioDomain === card.domain ? '#f97316' : textColor,\n                background: studioDomain === card.domain ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.12)') : 'transparent',\n                border: studioDomain === card.domain ? '1px solid rgba(249, 115, 22, 0.28)' : '1px solid transparent',`,
);

// Remove Reset Chat completely. Dual Arena remains the native React control.
{
  const start = source.indexOf(`          <button\n            onClick={() => updateActiveMessages([])}`);
  if (start < 0) throw new Error('Reset Chat marker not found');
  const close = source.indexOf(`          </button>`, start);
  if (close < 0) throw new Error('Reset Chat closing marker not found');
  source = source.slice(0, start) + source.slice(close + `          </button>`.length + 1);
}

// Advisor hero: specialty capabilities only. Neutral Studio may still expose model discovery.
replaceOnce(
  'hero question',
  `              What would you like to build today?`,
  `              {isAdvisorWorkspace ? domainPolicy.hero : 'What would you like to build today?'}`,
);
insertBefore(
  'advisor capability hero',
  `            {/* AI Models Highlight Cards */}`,
  `            {isAdvisorWorkspace && (\n              <div data-quantora-workspace-capabilities={studioDomain} style={{ margin: '0 auto 24px auto', maxWidth: '660px' }}>\n                <p style={{ margin: '0 0 18px 0', color: subtextColor, fontSize: '0.95rem', lineHeight: 1.6 }}>{domainPolicy.supporting}</p>\n                <div style={{ display: 'flex', justifyContent: 'center', gap: '9px', flexWrap: 'wrap' }}>\n                  {domainPolicy.capabilities.map((capability) => (\n                    <span key={capability} style={{ padding: '7px 12px', borderRadius: '999px', border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,0.22)', background: isLight ? '#ffffff' : 'rgba(15,23,42,0.48)', color: textColor, fontSize: '0.8rem', fontWeight: 700 }}>{capability}</span>\n                  ))}\n                </div>\n              </div>\n            )}\n\n`,
);
{
  const start = source.indexOf(`            {/* AI Models Highlight Cards */}`);
  const endMarker = `            \n            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>`;
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('Model-card block markers not found');
  const block = source.slice(start, end);
  source = source.slice(0, start) + `            {!isAdvisorWorkspace && (\n              <>\n${block}\n              </>\n            )}\n` + source.slice(end);
}
replaceOnce(
  'welcome checkbox advisor visibility',
  `            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>`,
  `            <div style={{ marginTop: '16px', display: isAdvisorWorkspace ? 'none' : 'flex', justifyContent: 'center' }}>`,
);

// 6) Message actions: native Fork Chat lives in the assistant footer; generic Preview is policy-gated.
replaceAllChecked(
  'message preview policy',
  `{actions.preview && runnableCode && (`,
  `{actions.preview && runnableCode && canExplicitlyPreviewCode(studioDomain) && (`,
  1,
);
insertBefore(
  'native footer Fork Chat',
  `                          {/* Overflow — real menu (was a dead button); shown only when it has items */}`,
  `                          <button\n                            type="button"\n                            data-quantora-message-fork="true"\n                            onClick={() => forkChatFromMessage(msg.id)}\n                            title="Fork Chat"\n                            style={{ ...iconBtn, color: subtextColor, gap: '5px', fontSize: '0.72rem', fontWeight: 700 }}\n                          ><GitBranch size={14} /><span>Fork Chat</span></button>\n\n`,
);
replaceAllChecked(
  'developer source controls policy',
  `{msg.codeSnippet && !msg.officeAttachment && (`,
  `{msg.codeSnippet && !msg.officeAttachment && canExplicitlyPreviewCode(studioDomain) && (`,
  1,
);
replaceAllChecked(
  'developer source panel policy',
  `{showCodeMap[msg.id] && msg.codeSnippet && !msg.officeAttachment && (`,
  `{showCodeMap[msg.id] && msg.codeSnippet && !msg.officeAttachment && canExplicitlyPreviewCode(studioDomain) && (`,
  1,
);
replaceOnce(
  'chat feed dependencies',
  `  }, [messages, isLight, textColor, subtextColor, openCanvasWithCode, showCodeMap, keyInputValue, arenaMode, secondModel, onOpenAuth, isGenerating]);`,
  `  }, [messages, isLight, textColor, subtextColor, openCanvasWithCode, showCodeMap, keyInputValue, arenaMode, secondModel, onOpenAuth, isGenerating, studioDomain, forkChatFromMessage]);`,
);

// 7) No ordinary advisor answer may auto-open generic code/preview workspace.
replaceOnce(
  'auto-open advisor guard',
  `        // RESTORED: Frontend deck parser re-enabled. Office artifacts render natively in the LivePreviewCanvas.\n        const parsedVfs = parseVFSFromMarkdown(lastMsg.text, vfs);`,
  `        // Generic Code/Preview is a neutral Studio capability. Advisor workspaces\n        // may open only explicit verified artifacts (for example an Office file);\n        // ordinary chat/code text must never steal half the screen.\n        if (!canAutoOpenCodeWorkspace(studioDomain) && !lastMsg.officeAttachment) {\n          setIsWorkspaceMode(false);\n          setCanvasOpen(false);\n          return;\n        }\n\n        // Frontend deck parser remains available for neutral Studio and explicit Office artifacts.\n        const parsedVfs = parseVFSFromMarkdown(lastMsg.text, vfs);`,
);
replaceOnce(
  'auto-open effect dependency',
  `  }, [isGenerating, messages, lastProcessedMessageId]);`,
  `  }, [isGenerating, messages, lastProcessedMessageId, studioDomain]);`,
);

// 8) Stale generic panels are impossible to render in an advisor session; explicit Office artifacts remain supported.
replaceOnce(
  'canvas modal policy',
  `      {canvasOpen && (`,
  `      {canvasOpen && (canExplicitlyPreviewCode(studioDomain) || Boolean(detectOfficeIntent({ messages }))) && (`,
);
replaceOnce(
  'workspace panel policy',
  `      {isWorkspaceMode && (`,
  `      {isWorkspaceMode && (canAutoOpenCodeWorkspace(studioDomain) || Boolean(detectOfficeIntent({ messages }))) && (`,
);

// 9) Advisor composer language is domain-specific rather than generic developer wording.
replaceOnce(
  'composer placeholder',
  `              placeholder="Ask Quantora to code an app, analyze data, or generate ideas..."`,
  `              placeholder={domainPolicy.placeholder}`,
);

if (source === original) throw new Error('Native Studio refactor produced no changes.');
fs.writeFileSync(path, source);
console.log('Native Studio refactor applied successfully.');
