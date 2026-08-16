import React, { memo } from 'react';
import {
  Sparkles, Code2, Cpu, Lightbulb, Paperclip, ThumbsUp, ThumbsDown, Workflow,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import StudioInlineSuggestions from './StudioInlineSuggestions';
import StudioMessageActions from './StudioMessageActions';
import CopyableCodeBlock from './studio-chat/CopyableCodeBlock';
import LivePreviewActionButton from './studio-chat/LivePreviewActionButton';
import { LiveIosCalculator, LiveBeatMaker, LiveQuantumSimulator } from './studio-chat/StudioLiveDemos';
import { getChatDisplayText } from '../lib/build-communication.js';
import { hasPreviewableContent, getLivePreviewButtonMeta } from '../lib/studio-preview-helpers.js';
import { getAssistantDisplayText } from '../lib/assistant-response-normalizer.js';
import { parseDeckSpec } from '../lib/deck-parser.js';
import { generatePPTXFromJson } from '../lib/deck-render.js';

function ResponseInsightStrip({ msg, isLight, subtextColor }) {
  const chips = [
    msg.modelUsed && `Model ${msg.modelUsed}`,
    msg.provider && `Provider ${msg.provider}`,
    Number.isFinite(msg.latencyMs) && msg.latencyMs > 0 ? `${msg.latencyMs}ms` : null,
    msg.routingNote ? 'Auto-routed' : null,
  ].filter(Boolean);

  if (!chips.length) return null;

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      marginBottom: '10px',
    }}>
      {chips.map((chip) => (
        <span
          key={chip}
          style={{
            fontSize: '0.68rem',
            lineHeight: 1,
            padding: '6px 9px',
            borderRadius: '999px',
            background: isLight ? '#eef6ff' : 'rgba(59,130,246,0.12)',
            color: isLight ? '#1d4ed8' : '#93c5fd',
            border: isLight ? '1px solid rgba(59,130,246,0.12)' : '1px solid rgba(147,197,253,0.14)',
            fontWeight: 600,
          }}
        >
          {chip}
        </span>
      ))}
    </div>
  );
}

function StudioChatFeed({
  messages,
  user,
  isLight,
  textColor,
  subtextColor,
  isGenerating,
  streamingMessageId,
  expandedMessageDetails,
  setExpandedMessageDetails,
  showCodeMap,
  setShowCodeMap,
  resolveInlineSuggestions,
  handleInlineChoiceSelect,
  handleInlineContinueSelect,
  dismissInlineSuggestions,
  handleBuildFromPlan,
  openCanvasWithCode,
  saveToJourney,
  onPushToCanvas,
  onOpenAuth,
  handleArenaPreference,
  submitModelFeedback,
}) {
    return messages.filter(msg => msg.type !== 'greeting').map(msg => {
      const isUser = msg.sender === 'user';
      return (
              <div
                key={msg.id}
                className={`chat-message-row${isUser ? ' chat-message-row--user' : ' chat-message-row--ai'}`}
                style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}
              >
                {/* Avatar */}
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: msg.sender === 'user' ? '#3b82f6' : (isLight ? '#ffffff' : 'transparent'),
                  border: msg.sender === 'ai' && isLight ? '1px solid var(--border-color)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                  color: msg.sender === 'user' ? '#ffffff' : 'var(--text-primary)',
                  flexShrink: 0
                }}>
                  {msg.sender === 'user' ? (user?.name ? user.name[0] : 'B') : <Sparkles size={18} />}
                </div>

                {/* Content Bubble */}
                <div
                  className={isUser ? 'chat-message-body chat-message-body--user' : 'chat-message-body chat-message-body--ai'}
                  style={{ flex: isUser ? '0 0 auto' : 1, minWidth: isUser ? undefined : 0 }}
                >
                  {msg.isDual ? (
                    <div style={{ width: '100%' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', width: '100%' }}>
                      {/* Model A Card */}
                      <div style={{
                        background: isLight ? '#ffffff' : '#0d1127',
                        border: msg.arenaWinner === 'a'
                          ? '2px solid #f97316'
                          : (isLight ? '1px solid #cbd5e1' : '1px solid rgba(249, 115, 22, 0.35)'),
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: msg.arenaWinner === 'a'
                          ? '0 0 0 1px rgba(249,115,22,0.35), 0 8px 24px rgba(249,115,22,0.15)'
                          : (isLight ? '0 4px 12px rgba(0,0,0,0.05)' : '0 8px 24px rgba(0,0,0,0.3)'),
                        opacity: msg.arenaWinner === 'b' ? 0.72 : 1,
                      }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingBottom: '8px', borderBottom: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.08)' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f97316', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Cpu size={14} /> {msg.modelA.modelName}
                            </span>
                            <span style={{ fontSize: '0.7rem', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>
                              ⚡ {msg.modelA.latencyMs}ms
                            </span>
                          </div>
                          <div className="markdown-prose" style={{ width: '100%', overflowX: 'hidden', fontSize: '0.9rem', lineHeight: 1.6, color: textColor }}>
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              components={{
                                code({node, inline, className, children, ...props}) {
                                  const match = /language-(\w+)/.exec(className || '')
                                  if (!inline && match && (match[1] === 'html' || match[1] === 'javascript' || match[1] === 'js') && msg.modelA.codeSnippet) {
                                    return (
                                      <p style={{ fontSize: '0.82rem', color: subtextColor, fontStyle: 'italic', margin: '8px 0' }}>
                                        Site code updated → see Live Preview panel
                                      </p>
                                    );
                                  }
                                  return !inline && match ? (
                                    <CopyableCodeBlock code={String(children).replace(/\n$/, '')} language={match[1]} />
                                  ) : (
                                    <code style={{ background: 'rgba(128,128,128,0.2)', padding: '2px 5px', borderRadius: '4px', fontFamily: 'monospace' }} {...props}>{children}</code>
                                  )
                                }
                              }}
                            >
                              {(() => {
                                const assistantText = getAssistantDisplayText(msg.modelA.text);
                                return hasPreviewableContent(assistantText)
                                  ? getChatDisplayText(assistantText)
                                  : assistantText;
                              })()}
                            </ReactMarkdown>
                          </div>
                        </div>
                        <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.7rem', color: subtextColor }}>Engine: {msg.modelA.provider}</span>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            {msg.modelA.text && !isGenerating && (
                              <button
                                type="button"
                                onClick={() => handleArenaPreference(msg, 'a')}
                                disabled={Boolean(msg.arenaWinner)}
                                style={{
                                  background: msg.arenaWinner === 'a' ? 'rgba(249,115,22,0.2)' : 'rgba(249,115,22,0.1)',
                                  border: '1px solid rgba(249,115,22,0.45)',
                                  color: '#f97316',
                                  padding: '4px 10px',
                                  borderRadius: '8px',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  cursor: msg.arenaWinner ? 'default' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <ThumbsUp size={12} /> {msg.arenaWinner === 'a' ? 'Preferred' : 'Prefer this'}
                              </button>
                            )}
                            {hasPreviewableContent(msg.modelA.text) && (
                              <LivePreviewActionButton
                                msg={{ ...msg, text: msg.modelA.text, id: `${msg.id}-a`, previewStatus: msg.modelAPreviewStatus }}
                                meta={getLivePreviewButtonMeta(
                                  { ...msg, text: msg.modelA.text, id: `${msg.id}-a`, previewStatus: msg.modelAPreviewStatus },
                                  { isGenerating, streamingMessageId }
                                )}
                                onOpen={openCanvasWithCode}
                                compact
                              />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Model B Card */}
                      <div style={{
                        background: isLight ? '#ffffff' : '#0d1127',
                        border: msg.arenaWinner === 'b'
                          ? '2px solid #3b82f6'
                          : (isLight ? '1px solid #cbd5e1' : '1px solid rgba(59, 130, 246, 0.35)'),
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: msg.arenaWinner === 'b'
                          ? '0 0 0 1px rgba(59,130,246,0.35), 0 8px 24px rgba(59,130,246,0.15)'
                          : (isLight ? '0 4px 12px rgba(0,0,0,0.05)' : '0 8px 24px rgba(0,0,0,0.3)'),
                        opacity: msg.arenaWinner === 'a' ? 0.72 : 1,
                      }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingBottom: '8px', borderBottom: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.08)' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Cpu size={14} /> {msg.modelB.modelName}
                            </span>
                            <span style={{ fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>
                              ⚡ {msg.modelB.latencyMs}ms
                            </span>
                          </div>
                          <div className="markdown-prose" style={{ width: '100%', overflowX: 'hidden', fontSize: '0.9rem', lineHeight: 1.6, color: textColor }}>
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              components={{
                                code({node, inline, className, children, ...props}) {
                                  const match = /language-(\w+)/.exec(className || '')
                                  if (!inline && match && (match[1] === 'html' || match[1] === 'javascript' || match[1] === 'js') && msg.modelB.codeSnippet) {
                                    return (
                                      <p style={{ fontSize: '0.82rem', color: subtextColor, fontStyle: 'italic', margin: '8px 0' }}>
                                        Site code updated → see Live Preview panel
                                      </p>
                                    );
                                  }
                                  return !inline && match ? (
                                    <CopyableCodeBlock code={String(children).replace(/\n$/, '')} language={match[1]} />
                                  ) : (
                                    <code style={{ background: 'rgba(128,128,128,0.2)', padding: '2px 5px', borderRadius: '4px', fontFamily: 'monospace' }} {...props}>{children}</code>
                                  )
                                }
                              }}
                            >
                              {(() => {
                                const assistantText = getAssistantDisplayText(msg.modelB.text);
                                return hasPreviewableContent(assistantText)
                                  ? getChatDisplayText(assistantText)
                                  : assistantText;
                              })()}
                            </ReactMarkdown>
                          </div>
                        </div>
                        <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.7rem', color: subtextColor }}>Engine: {msg.modelB.provider}</span>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            {msg.modelB.text && !isGenerating && (
                              <button
                                type="button"
                                onClick={() => handleArenaPreference(msg, 'b')}
                                disabled={Boolean(msg.arenaWinner)}
                                style={{
                                  background: msg.arenaWinner === 'b' ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.1)',
                                  border: '1px solid rgba(59,130,246,0.45)',
                                  color: '#3b82f6',
                                  padding: '4px 10px',
                                  borderRadius: '8px',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  cursor: msg.arenaWinner ? 'default' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <ThumbsUp size={12} /> {msg.arenaWinner === 'b' ? 'Preferred' : 'Prefer this'}
                              </button>
                            )}
                            {hasPreviewableContent(msg.modelB.text) && (
                              <LivePreviewActionButton
                                msg={{ ...msg, text: msg.modelB.text, id: `${msg.id}-b`, previewStatus: msg.modelBPreviewStatus }}
                                meta={getLivePreviewButtonMeta(
                                  { ...msg, text: msg.modelB.text, id: `${msg.id}-b`, previewStatus: msg.modelBPreviewStatus },
                                  { isGenerating, streamingMessageId }
                                )}
                                onOpen={openCanvasWithCode}
                                compact
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    {msg.arenaWinner && (
                      <p style={{ margin: '10px 0 0', fontSize: '0.74rem', color: subtextColor, textAlign: 'center' }}>
                        Saved — Auto-select will prefer {(msg.arenaWinner === 'a' ? msg.modelA : msg.modelB).modelName} for similar {msg.taskCategory || 'general'} questions.
                      </p>
                    )}
                    </div>
                  ) : (
                    <div className={`prose chat-message-bubble${isUser ? ' chat-message-bubble--user' : ' chat-message-bubble--ai'}`} style={{
                      background: isUser ? (isLight ? '#f0f4f9' : '#1e1f20') : 'transparent',
                      border: 'none',
                      padding: isUser ? '12px 18px' : '4px 0',
                      borderRadius: '20px',
                      color: textColor,
                      fontSize: '1rem',
                      lineHeight: 1.65,
                      boxShadow: 'none',
                    }}>
                      {/* Render Attachments if present on user message */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                          {msg.attachments.map((att, i) => (
                            <span key={i} style={{ fontSize: '0.75rem', background: isLight ? '#fff' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(249, 115, 22, 0.3)', padding: '4px 10px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#f97316', fontWeight: '600' }}>
                              <Paperclip size={12} /> {att.name} ({att.size})
                            </span>
                          ))}
                        </div>
                      )}

                      {!isUser && <ResponseInsightStrip msg={msg} isLight={isLight} subtextColor={subtextColor} />}

                      {(msg.routingNote || msg.thoughtProcess) && (
                        <div style={{ marginBottom: '9px' }}>
                          {!expandedMessageDetails[msg.id] ? (
                            <button
                              type="button"
                              onClick={() => setExpandedMessageDetails((prev) => ({ ...prev, [msg.id]: true }))}
                              style={{ background: 'transparent', border: 'none', color: subtextColor, fontSize: '0.74rem', cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: '2px' }}
                            >
                              Details
                            </button>
                          ) : (
                            <>
                              {msg.routingNote && (
                                <div style={{ marginBottom: '9px', padding: '7px 10px', borderRadius: '9px', background: isLight ? '#fff7ed' : 'rgba(249,115,22,0.1)', color: isLight ? '#9a3412' : '#fdba74', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Sparkles size={13} /> {msg.routingNote}
                                </div>
                              )}
                              {msg.thoughtProcess && (
                                <div style={{ fontSize: '0.78rem', color: subtextColor, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', paddingBottom: '8px', borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)' }}>
                                  <Lightbulb size={14} color="#f97316" />
                                  <span>Thought for a moment ({msg.thoughtProcess})</span>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => setExpandedMessageDetails((prev) => ({ ...prev, [msg.id]: false }))}
                                style={{ background: 'transparent', border: 'none', color: subtextColor, fontSize: '0.74rem', cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: '2px' }}
                              >
                                Hide details
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      <div className="markdown-prose" style={{ width: isUser ? 'auto' : '100%', overflowX: 'hidden' }}>
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({node, inline, className, children, ...props}) {
                              const match = /language-(\w+)/.exec(className || '')
                              if (!inline && match && (match[1] === 'html' || match[1] === 'javascript' || match[1] === 'js') && msg.codeSnippet) {
                                return (
                                  <p style={{ fontSize: '0.82rem', color: subtextColor, fontStyle: 'italic', margin: '8px 0' }}>
                                    Site code updated → see Live Preview panel
                                  </p>
                                );
                              }
                              return !inline && match ? (
                                <CopyableCodeBlock code={String(children).replace(/\n$/, '')} language={match[1]} />
                              ) : (
                                <code style={{ background: 'rgba(128,128,128,0.2)', padding: '2px 5px', borderRadius: '4px', fontFamily: 'monospace' }} {...props}>{children}</code>
                              )
                            }
                          }}
                        >
                          {!isUser
                            ? (() => {
                                const assistantText = getAssistantDisplayText(msg.text);
                                return (msg.codeSnippet || hasPreviewableContent(assistantText))
                                  ? getChatDisplayText(assistantText, { artifactHtml: msg.codeSnippet || '' })
                                  : assistantText;
                              })()
                            : msg.text}
                        </ReactMarkdown>
                      </div>

                      {msg.sender === 'ai' && !msg.isDual && (() => {
                        const suggestions = resolveInlineSuggestions(msg);
                        if (!suggestions) return null;
                        return (
                          <StudioInlineSuggestions
                            suggestions={suggestions}
                            isLight={isLight}
                            disabled={isGenerating}
                            onSelectChoice={(choice) => handleInlineChoiceSelect(msg, choice)}
                            onSelectContinue={(item) => handleInlineContinueSelect(msg, item)}
                            onDismiss={() => dismissInlineSuggestions(msg, suggestions)}
                          />
                        );
                      })()}

                      {/* Plan / code actions */}
                      <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {msg.sender === 'ai' && msg.planSpec && (
                          <button
                            onClick={() => handleBuildFromPlan(msg.planSpec)}
                            style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          >
                            <Code2 size={13} /> Build this →
                          </button>
                        )}
                        {msg.sender === 'ai' && hasPreviewableContent(msg.text) && (
                          <LivePreviewActionButton
                            msg={msg}
                            meta={getLivePreviewButtonMeta(msg, { isGenerating, streamingMessageId })}
                            onOpen={openCanvasWithCode}
                          />
                        )}
                        {msg.sender === 'ai' && (() => {
                           if (!hasPreviewableContent(msg.text)) return null;
                           const spec = parseDeckSpec(msg.text);
                           if (!spec) return null;

                           return (
                             <button
                               onClick={async () => {
                                 try {
                                   await generatePPTXFromJson(spec);
                                 } catch(e) {
                                   alert("Failed to download PPTX: " + e.message);
                                 }
                               }}
                               style={{ background: '#2563eb', border: '1px solid #1d4ed8', color: '#fff', padding: '6px 14px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                             >
                               <Paperclip size={13} /> Direct Download PPTX
                             </button>
                           );
                        })()}
                        {msg.sender === 'ai' && onPushToCanvas && (
                          <button
                            type="button"
                            onClick={() => saveToJourney(msg)}
                            style={{ background: isLight ? '#f0f9ff' : 'rgba(2, 132, 199, 0.15)', border: '1px solid rgba(2, 132, 199, 0.35)', color: '#0284c7', padding: '6px 14px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          >
                            <Workflow size={13} /> Save to Journey
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/*
                   * Quiet feedback row. We deliberately drop the old
                   * "Engine / Response Time / Live AI Verified / No Mock"
                   * diagnostic strip — no serious assistant (Claude, Cursor,
                   * ChatGPT) surfaces engine names or latency to the user. All
                   * that remains is an unobtrusive thumbs up/down, which still
                   * feeds the model-quality flywheel.
                   */}
                  {msg.sender === 'ai' && !msg.isKeyPrompt && (
                    <div style={{
                      marginTop: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <StudioMessageActions 
                        text={getAssistantDisplayText(msg.text)} 
                        onRegenerate={() => { console.log('Regenerate clicked') }} 
                        onSummarize={() => { console.log('Summarize clicked') }} 
                      />
                      <div style={{
                        display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.75rem',
                      color: subtextColor,
                      opacity: 0.35,
                      transition: 'opacity 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = 0.35}
                    >
                      <button type="button" onClick={() => submitModelFeedback(msg, 'helpful')} aria-label="Mark this response helpful" title="Helpful" style={{ border: 'none', background: 'transparent', color: msg.qualityFeedback === 'helpful' ? '#059669' : subtextColor, cursor: msg.qualityFeedback ? 'default' : 'pointer', padding: '2px', display: 'inline-flex' }}><ThumbsUp size={14} /></button>
                      <button type="button" onClick={() => submitModelFeedback(msg, 'not_helpful')} aria-label="Mark this response not helpful" title="Not helpful" style={{ border: 'none', background: 'transparent', color: msg.qualityFeedback === 'not_helpful' ? '#dc2626' : subtextColor, cursor: msg.qualityFeedback ? 'default' : 'pointer', padding: '2px', display: 'inline-flex' }}><ThumbsDown size={14} /></button>
                      </div>
                    </div>
                  )}

                  {/* Inline API Key Input Prompt */}
                  {msg.isAuthPrompt && (
                    <div style={{
                      marginTop: '14px',
                      padding: '16px',
                      background: isLight ? '#f8fafc' : 'rgba(15, 23, 42, 0.85)',
                      borderRadius: '12px',
                      border: '1px solid #0ea5e9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      flexWrap: 'wrap'
                    }}>
                      <div style={{ fontSize: '0.85rem', color: subtextColor, flex: 1, minWidth: '200px' }}>
                        Signing in lets you use Quantora's built-in AI without supplying your own key.
                      </div>
                      <button
                        onClick={() => onOpenAuth && onOpenAuth()}
                        style={{
                          background: '#0ea5e9',
                          color: '#ffffff',
                          border: 'none',
                          padding: '10px 20px',
                          borderRadius: '8px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Sign in
                      </button>
                    </div>
                  )}



                  {/* Render Interactive Live Component Sandboxes Directly in Chat */}
                  {msg.componentType === 'calculator' && <LiveIosCalculator />}
                  {msg.componentType === 'beat' && <LiveBeatMaker />}
                  {msg.componentType === 'quantum' && <LiveQuantumSimulator />}

                  {/* Source Code Toggle Button */}
                  {msg.codeSnippet && (
                    <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <button
                        onClick={() => setShowCodeMap({ ...showCodeMap, [msg.id]: !showCodeMap[msg.id] })}
                        style={{ background: 'transparent', border: 'none', color: '#0284c7', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Code2 size={14} /> {showCodeMap[msg.id] ? 'Hide Source Code' : 'Inspect Source Code'}
                      </button>

                      <button
                        onClick={() => saveToJourney(msg)}
                        style={{ background: isLight ? '#f0f9ff' : 'rgba(2, 132, 199, 0.15)', border: '1px solid rgba(2, 132, 199, 0.35)', color: '#0284c7', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Workflow size={12} /> Save to Journey
                      </button>
                    </div>
                  )}

                  {/* Optional Source Code Panel */}
                  {showCodeMap[msg.id] && msg.codeSnippet && (
                    <div style={{ marginTop: '10px', padding: '12px 16px', background: isLight ? '#0f172a' : '#070913', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <pre style={{ margin: 0, fontSize: '0.82rem', color: '#38bdf8', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                        {msg.codeSnippet}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
    });

}

export default memo(StudioChatFeed);
