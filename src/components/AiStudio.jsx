import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Send, Play, Code2, Copy, Workflow, RefreshCw, Cpu, Layers, MessageSquare, Terminal, Smartphone, Plus, Globe, ChevronDown, Paperclip, X, FileText, Image as ImageIcon, Activity, FolderPlus, Wand2, Trash2, PanelLeft, PanelLeftClose, Info, Settings, Mic, MicOff, Github, Layout, Loader, Plane, BookOpen, DollarSign, Search, Check, Compass, SlidersHorizontal, Atom } from 'lucide-react';
import LivePreviewCanvas from './LivePreviewCanvas';
import StudioChatFeed from './StudioChatFeed';
import ModelDashboard from './ModelDashboard';
import { chooseBestFreeModel, classifyTask, rankFreeModels } from '../lib/model-routing.js';
import { loadArenaPreferences, recordArenaWin } from '../lib/arena-preferences.js';
import {
  extractContextFromAssistantText,
  captureUserAnswerAsContext,
  hasSessionMemory,
  mergeSessionContext,
} from '../lib/session-context.js';
import {
  extractChoicesFromAssistantText,
  stripPartialAssistantMarkers,
} from '../lib/studio-choices.js';
import { extractContinuesFromAssistantText } from '../lib/studio-continues.js';
import { createQuantoraListener, QUANTORA_EVENTS } from '../lib/listening-layer.js';
import { enrichContinueSet } from '../lib/domain-anticipation.js';
import { detectOutcomeGaps, injectGapContinues } from '../lib/outcome-gap-detection.js';
import StudioWandStatus from './StudioWandStatus';
import StudioToolsMenu from './StudioToolsMenu';
import StudioPromptOverlays from './StudioPromptOverlays';
import { usePromptPolish } from '../hooks/usePromptPolish.js';
import { useStudioSession } from '../hooks/useStudioSession.js';
import { useInlineSuggestions } from '../hooks/useInlineSuggestions.js';
import StudioChromeBar from './StudioChromeBar';
import StudioWorkingNotes from './StudioWorkingNotes';
import StudioJourneyStrip from './StudioJourneyStrip';
import StudioIdleReturnBanner, { isSessionIdle } from './StudioIdleReturnBanner';
import StudioWandHint from './StudioWandHint';
import {
  learnFromChipSelection,
} from '../lib/communication-intelligence.js';
import { STARTER_TEMPLATES } from '../lib/starter-templates.js';
import {
  contextToOutcomeState,
  forgetOutcomeState,
  loadOutcomeState,
  outcomeStateToConversationContext,
  persistOutcomeState,
} from '../lib/outcome-state.js';
import {
  getChatDisplayText,
  isExplicitArtifactProceed,
  isFeatureSuggestionRequest,
  stripArtifactFromChatDisplay,
} from '../lib/build-communication.js';
import StudioBuildSplit from './StudioBuildSplit';
import {
  STUDIO_DOMAINS,
  STUDIO_OUTPUT_MODES,
  getDomainById,
  getOutputModeLabel,
  getPromptPlaceholder,
} from '../lib/studio-domains.js';

import {
  extractHtmlFromResponse,
  hasPreviewableContent,
  preparePreviewHtml,
} from '../lib/studio-preview-helpers.js';

/*
 * Conservative build-intent detector. Returns true only for clear "make me a
 * runnable thing" requests, so /api/chat's BUILD MODE (single self-contained
 * HTML document) engages for exactly those — and normal chat, including
 * questions *about* building, is left untouched. Questions are excluded up
 * front to avoid turning "how do I build an app?" into a generated artifact.
 */
function detectBuildIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  if (/^(how|what|why|when|where|which|who|should|can you explain|explain|is |are |does |do |tell me|help me understand)/.test(t)) return false;
  const verb = /\b(build|create|make|generate|design|develop|code|prototype|clone|scaffold)\b/;
  const noun = /\b(app|application|web ?site|website|landing page|web ?page|page|ui|interface|component|dashboard|game|tool|calculator|form|portfolio|site|widget|animation|simulator|editor|tracker|generator|clone)\b/;
  return verb.test(t) && noun.test(t);
}

/** Plan mode is for software architecture — route life/travel planning to Ask. */
function isSoftwarePlanningRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  const softwareSignals = /\b(app|website|web app|pwa|api|feature|architecture|tech stack|database|frontend|backend|saas|platform|codebase|microservice|fullstack|full-stack|software|system design)\b/;
  const lifePlanning = /\b(trip|travel|vacation|holiday|itinerary|flight|hotel|visit|tour|getaway|wedding|meal plan|workout plan|career path)\b|\bplan a (trip|vacation|holiday|visit)\b/;
  if (lifePlanning.test(t) && !softwareSignals.test(t)) return false;
  return softwareSignals.test(t);
}

const SHOW_WORKSPACE = false;

// Downscale an uploaded image to a bounded dimension and return a JPEG data URI.
// Keeps embedded photos small enough to inline directly into the generated,
// self-contained HTML (so the site — and its published copy — carry the real
// images, not placeholders) without bloating the document.
function downscaleImageToDataUrl(file, maxDim = 1000, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round((height * maxDim) / width); width = maxDim; }
          else { width = Math.round((width * maxDim) / height); height = maxDim; }
        }
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (err) { reject(err); }
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AiStudio({ onOpenAuth, selectedModel, setSelectedModel, availableModels, modelDashboard, onPushToCanvas, user, isLight, dreamNodes, setDreamNodes, setActiveTab, prefillPrompt, isAdmin, onModelsRefresh }) {
  const sendMessageRef = useRef(async () => {});
  const onSendMessage = useCallback((text, opts) => sendMessageRef.current(text, opts), []);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showModelDashboard, setShowModelDashboard] = useState(false);
  const [idleReturnDismissed, setIdleReturnDismissed] = useState(false);
  const userFirstName = user?.name?.split(/\s+/)[0] || '';
  const isSignedIn = Boolean(user);

  const {
    chatSessions,
    setChatSessions,
    activeSessionId,
    setActiveSessionId,
    activeSession,
    messages,
    studioMode,
    studioDomain,
    boundRepo,
    conversationContext,
    listeningSignals,
    updateActiveSession,
    updateActiveMessages,
    setChoiceDockState,
    setStudioMode,
    setStudioDomain,
    recordListeningSignal,
    handleCreateNewChat,
    handleDeleteChat,
  } = useStudioSession({ user, selectedModel });

  const showIdleReturn = !idleReturnDismissed
    && messages.length > 1
    && isSessionIdle(activeSession.lastActiveAt);

  useEffect(() => {
    setIdleReturnDismissed(false);
  }, [activeSessionId]);

  useEffect(() => {
    if (!showModelDashboard) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setShowModelDashboard(false);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showModelDashboard]);

  const memoryConsented = activeSession.memoryConsented === true;
  const outcomeVersion = Number.isInteger(activeSession.outcomeVersion) ? activeSession.outcomeVersion : 0;
  const outcomeState = activeSession.outcomeState || null;

  const repoContextCache = useRef({});
  const outcomeSyncTimerRef = useRef(null);
  const emitQuantoraRef = useRef(() => {});
  const [previewCode, setPreviewCode] = useState('');
  const [guidedSession, setGuidedSession] = useState(false);
  const [refineActive, setRefineActive] = useState(true);
  const [sessionImages, setSessionImages] = useState([]);
  const [buildSplitDismissed, setBuildSplitDismissed] = useState(false);
  const showBuildSplit = Boolean(previewCode?.trim()) && !buildSplitDismissed;
  useEffect(() => {
    if (previewCode && previewCode.trim()) {
      setGuidedSession(false);
      setRefineActive(true);
      setSessionImages([]);
      setBuildSplitDismissed(false);
    }
  }, [previewCode]);

  const enrichContinues = useCallback((continueSet, { userPrompt, aiResponse } = {}) => {
    const gaps = userPrompt && aiResponse ? detectOutcomeGaps(userPrompt, aiResponse) : [];
    const withGaps = gaps.length ? injectGapContinues(continueSet, gaps) : continueSet;
    return enrichContinueSet(withGaps, {
      domain: studioDomain,
      mode: studioMode,
      conversationContext,
      hasPreview: Boolean(previewCode?.trim()),
      guidedIntake: guidedSession,
    });
  }, [studioDomain, studioMode, conversationContext, previewCode, guidedSession]);

  const getPriorUserPrompt = useCallback((messageId) => {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx <= 0) return '';
    return [...messages.slice(0, idx)].reverse().find((m) => m.sender === 'user')?.text || '';
  }, [messages]);

  const activeDomainMeta = getDomainById(studioDomain);

  const [dismissedModelSpotlights, setDismissedModelSpotlights] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('quantora_dismissed_model_spotlights') || '[]');
    } catch {
      return [];
    }
  });

  const spotlightModel = React.useMemo(() => {
    const list = modelDashboard?.models || [];
    return list.find(
      (m) => (m.isNew || m.isUpdated) && m.status === 'available' && !dismissedModelSpotlights.includes(m.id),
    ) || null;
  }, [modelDashboard, dismissedModelSpotlights]);

  const dismissModelSpotlight = (modelId) => {
    setDismissedModelSpotlights((prev) => {
      const next = [...prev, modelId];
      try {
        localStorage.setItem('quantora_dismissed_model_spotlights', JSON.stringify(next));
      } catch { /* best effort */ }
      return next;
    });
  };

  useEffect(() => {
    if (!isSignedIn || !memoryConsented) return undefined;
    let cancelled = false;

    loadOutcomeState(activeSessionId).then((record) => {
      if (cancelled) return;
      const restored = outcomeStateToConversationContext(record.state);
      updateActiveSession({
        outcomeVersion: record.version,
        outcomeState: record.state,
        conversationContext: mergeSessionContext(conversationContext, restored),
      });
    }).catch((error) => {
      if (!cancelled) console.warn('Outcome Memory could not be loaded:', error.message);
    });

    return () => { cancelled = true; };
    // Load once when the owner, session, or consent boundary changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, isSignedIn, memoryConsented]);

  const syncOutcomeContext = useCallback(async (context, {
    sourceTurn = null,
    confirmed = false,
    consentOverride = null,
  } = {}) => {
    const consented = consentOverride === null ? memoryConsented : consentOverride;
    if (!isSignedIn || !consented) return null;

    const save = async (version, currentState) => persistOutcomeState({
      sessionId: activeSessionId,
      expectedVersion: version,
      sourceTurn,
      state: contextToOutcomeState(context, {
        existingState: currentState || {}, sourceTurn, confirmed, consented: true,
      }),
    });

    try {
      let record;
      try {
        record = await save(outcomeVersion, outcomeState);
      } catch (error) {
        if (!error.conflict) throw error;
        const latest = await loadOutcomeState(activeSessionId);
        record = await save(latest.version, latest.state);
      }
      updateActiveSession({
        memoryConsented: true,
        outcomeVersion: record.version,
        outcomeState: record.state,
      });
      return record;
    } catch (error) {
      console.warn('Outcome Memory could not be saved:', error.message);
      return null;
    }
  }, [activeSessionId, isSignedIn, memoryConsented, outcomeState, outcomeVersion, updateActiveSession]);

  const handleMemoryConsentChange = useCallback(async (enabled) => {
    if (enabled) {
      updateActiveSession({ memoryConsented: true });
      await syncOutcomeContext(conversationContext, {
        sourceTurn: 'user-memory-consent', confirmed: false, consentOverride: true,
      });
      return;
    }

    if (isSignedIn) {
      try { await forgetOutcomeState(activeSessionId); }
      catch (error) { console.warn('Outcome Memory could not be deleted:', error.message); return; }
    }
    updateActiveSession({ memoryConsented: false, outcomeVersion: 0, outcomeState: null });
  }, [activeSessionId, conversationContext, isSignedIn, syncOutcomeContext, updateActiveSession]);

  const deleteChatWithMemory = useCallback((e, sessionId) => {
    const sessionToDelete = chatSessions.find((session) => session.id === sessionId);
    if (isSignedIn && sessionToDelete?.memoryConsented) {
      void forgetOutcomeState(sessionId).catch((error) => {
        console.warn('Outcome Memory could not be deleted with the chat:', error.message);
      });
    }
    handleDeleteChat(e, sessionId);
  }, [chatSessions, isSignedIn, handleDeleteChat]);

  const fetchRepoPreview = async (repoUrl, task = 'Understand this codebase and its architecture') => {
    const response = await fetch('/api/github/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetStage: 'repository-preview',
        repoUrl: repoUrl.trim(),
        task: task.trim()
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to load repository');
    }
    return { url: repoUrl.trim(), name: data.name, content: data.content, relevantFiles: data.relevantFiles || [] };
  };

  const bindRepoToSession = async (repoUrl, task) => {
    if (!repoUrl?.trim()) {
      setGithubError('Please enter a valid GitHub URL');
      return;
    }
    setIsFetchingGithub(true);
    setGithubError('');
    try {
      const bound = await fetchRepoPreview(repoUrl, task || githubChangeRequest.trim() || 'Understand this codebase');
      repoContextCache.current[activeSessionId] = bound.content;
      updateActiveSession({ boundRepo: { url: bound.url, name: bound.name, relevantFiles: bound.relevantFiles } });
      if (task?.trim() || githubChangeRequest.trim()) {
        setInputText(prev => prev.trim() ? prev : (task?.trim() || githubChangeRequest.trim()));
      }
      setIsGithubModalOpen(false);
      setGithubRepoUrl('');
      setGithubChangeRequest('');
    } catch (err) {
      setGithubError(err.message);
    } finally {
      setIsFetchingGithub(false);
    }
  };

  const clearBoundRepo = () => {
    delete repoContextCache.current[activeSessionId];
    updateActiveSession({ boundRepo: null });
  };

  const parsePlanSpec = (text) => {
    if (!text || typeof text !== 'string') return null;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced?.[1] || text).trim();
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && parsed.title) return parsed;
    } catch {
      const objectMatch = candidate.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          const parsed = JSON.parse(objectMatch[0]);
          if (parsed && typeof parsed === 'object' && parsed.title) return parsed;
        } catch {
          return null;
        }
      }
    }
    return null;
  };

  const handleBuildFromPlan = (planSpec) => {
    const specText = typeof planSpec === 'string' ? planSpec : JSON.stringify(planSpec, null, 2);
    setStudioMode('build');
    handleSendMessage(
      `Build this application based on the architecture plan below. Follow the tech stack and features closely.\n\n${specText}`,
      { studioMode: 'build' }
    );
  };

  useEffect(() => {
    const repo = activeSession.boundRepo;
    if (!repo?.url || repoContextCache.current[activeSessionId]) return;
    fetchRepoPreview(repo.url)
      .then((bound) => {
        repoContextCache.current[activeSessionId] = bound.content;
      })
      .catch((err) => console.error('Failed to refresh repo context:', err));
  }, [activeSessionId, activeSession.boundRepo?.url]);

  /*
   * Tell the ambient background to step back once there is work on screen.
   *
   * A warm gradient is the right welcome on an empty canvas and the wrong
   * thing behind a long, code-heavy conversation — colour under dense text is
   * exactly the readability problem the old particle field had, just prettier.
   * The greeting message is not content, so it does not count.
   */
  const hasConversation = messages.length > 1;
  React.useEffect(() => {
    const root = document.documentElement;
    if (hasConversation) root.setAttribute('data-workspace', 'active');
    else root.removeAttribute('data-workspace');
    return () => root.removeAttribute('data-workspace');
  }, [hasConversation]);

  // --- Pillar 4: Predictive Code Assist Logic ---
  const handleCodeChange = (e) => {
    const val = e.target.value;
    const pos = e.target.selectionStart;
    setWorkspaceCode(val);
    setCursorPos(pos);
    setGhostText('');
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(async () => {
      try {
        const prefix = val.substring(0, pos);
        const suffix = val.substring(pos);
        const res = await fetch('/api/autocomplete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix, suffix })
        });
        const data = await res.json();
        if (data.completion) {
          setGhostText(data.completion);
        }
      } catch (err) {
        console.error("Autocomplete fetch failed:", err);
      }
    }, 500);
  };

  const handleCodeKeyDown = (e) => {
    if (e.key === 'Tab' && ghostText) {
      e.preventDefault();
      const val = workspaceCode;
      const newCode = val.substring(0, cursorPos) + ghostText + val.substring(cursorPos);
      setWorkspaceCode(newCode);
      setCursorPos(cursorPos + ghostText.length);
      setGhostText('');
    } else if (e.key === 'Escape' && ghostText) {
      setGhostText('');
    }
  };

  // --- Pillar 3: Voice Mode Logic ---
  const toggleVoiceMode = async () => {
    if (isVoiceMode) {
      setIsVoiceMode(false);
      if (mediaRecorderRef.current) {
         mediaRecorderRef.current.stop();
      }
      if (audioWsRef.current) {
         audioWsRef.current.close();
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsVoiceMode(true);
      
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/api/live`;
      const ws = new WebSocket(wsUrl);
      audioWsRef.current = ws;
      
      ws.onopen = () => {
         const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
         mediaRecorderRef.current = mediaRecorder;
         
         mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
               ws.send(event.data);
            }
         };
         
         mediaRecorder.start(250); // Send chunk every 250ms
      };

      ws.onmessage = (event) => {
         console.log("Voice AI Response:", event.data);
      };

      ws.onerror = (e) => {
         console.error("Voice WebSocket Error:", e);
         setIsVoiceMode(false);
      };

      ws.onclose = () => {
         setIsVoiceMode(false);
      };

    } catch (e) {
      console.error("Failed to start voice mode:", e);
      alert("Microphone access denied or unavailable.");
    }
  };

  const [localInputText, setLocalInputText] = useState('');
  const prefillAppliedRef = useRef(null);
  const inputText = localInputText;
  const setInputText = setLocalInputText;

  const [isGenerating, setIsGenerating] = useState(false);

  const [activeGeneratingModel, setActiveGeneratingModel] = useState(null);
  const [expandedMessageDetails, setExpandedMessageDetails] = useState({});
  const [showCodeMap, setShowCodeMap] = useState({});
  const [cognitiveLevel, setCognitiveLevel] = useState('Balanced');
  const [suggestedModel, setSuggestedModel] = useState(null);
  const [autoSelectEnabled, setAutoSelectEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('quantora_auto_select_free_model');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('quantora_auto_select_free_model', String(autoSelectEnabled));
    } catch { /* preference persistence is best effort */ }
  }, [autoSelectEnabled]);

  const [showMentionMenu, setShowMentionMenu] = useState(false);

  const handleInputTextChange = (e) => {
    const text = e.target.value;
    setInputText(text);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 280)}px`;
    
    // Trigger context menu on '@' typed at end or after space
    const mentionMatch = text.match(/(^|\s)@(\w*)$/);
    if (mentionMatch) {
      setShowMentionMenu(true);
    } else {
      setShowMentionMenu(false);
    }
  };

  const handleSelectMention = (mentionType, mentionName) => {
    const newAttachments = [...attachments, {
      name: mentionName,
      size: 'Context',
      type: 'context',
      contextType: mentionType
    }];
    setAttachments(newAttachments);
    
    const newText = inputText.replace(/(^|\s)@(\w*)$/, '$1');
    setInputText(newText);
    setShowMentionMenu(false);
  };

  const [attachments, setAttachments] = useState([]);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [showInBarModelDropdown, setShowInBarModelDropdown] = useState(false);
  const [showStudioToolsMenu, setShowStudioToolsMenu] = useState(false);
  const studioToolsMenuRef = useRef(null);
  useEffect(() => {
    if (!showStudioToolsMenu) return undefined;
    const onDocClick = (event) => {
      if (studioToolsMenuRef.current && !studioToolsMenuRef.current.contains(event.target)) {
        setShowStudioToolsMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showStudioToolsMenu]);

  const [arenaMode, setArenaMode] = useState(false);
  const [arenaPrefs, setArenaPrefs] = useState(() => loadArenaPreferences());
  const [arenaHintDismissed, setArenaHintDismissed] = useState(() => {
    try { return localStorage.getItem('quantora_arena_hint_dismissed') === '1'; } catch { return false; }
  });
  const [secondModel, setSecondModel] = useState({ id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B' });
  const [isWorkspaceMode, setIsWorkspaceMode] = useState(false);

  useEffect(() => {
    if (isWorkspaceMode) setSidebarOpen(false);
  }, [isWorkspaceMode]);

  const [workspaceCode, setWorkspaceCode] = useState('');
  const [workspaceActiveTab, setWorkspaceActiveTab] = useState('App.jsx');
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasFullscreen, setCanvasFullscreen] = useState(false);
  const closePreviewModal = useCallback(() => {
    setCanvasOpen(false);
    setCanvasFullscreen(false);
  }, []);

  const togglePreviewFullscreen = useCallback(() => {
    setCanvasFullscreen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!canvasOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closePreviewModal();
    };
    const onPreviewMessage = (event) => {
      const data = event.data;
      if (data?.__quantora === true && data.kind === 'preview-close-request') {
        closePreviewModal();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('message', onPreviewMessage);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('message', onPreviewMessage);
    };
  }, [canvasOpen, closePreviewModal]);

  const [canvasCode, setCanvasCode] = useState('');
  const [streamingMessageId, setStreamingMessageId] = useState(null);
  const [backgroundVerify, setBackgroundVerify] = useState(null);
  const backgroundVerifyRef = useRef(null);
  useEffect(() => { backgroundVerifyRef.current = backgroundVerify; }, [backgroundVerify]);

  // Pillar 4: Predictive Code Assist State
  const [ghostText, setGhostText] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const typingTimeoutRef = useRef(null);

  // Pillar 3: Continuous Voice State
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioWsRef = useRef(null);

  const [isGithubModalOpen, setIsGithubModalOpen] = useState(false);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [githubRepoUrl, setGithubRepoUrl] = useState('');
  const [githubChangeRequest, setGithubChangeRequest] = useState('');
  const [isFetchingGithub, setIsFetchingGithub] = useState(false);
  const [githubError, setGithubError] = useState('');

  const handleImportGithub = async () => {
    await bindRepoToSession(githubRepoUrl, githubChangeRequest.trim());
  };

  const openCanvasWithCode = (rawText) => {
    const cleanCode = extractHtmlFromResponse(rawText) || (rawText.includes('<!DOCTYPE html>') || rawText.includes('<html')
      ? rawText.replace(/```(?:html|javascript|js|css)?\s*\n?([\s\S]*?)```/gi, '$1').trim()
      : `<!DOCTYPE html>\n<html>\n<head>\n<style>\nbody { font-family: sans-serif; padding: 24px; background: #0f172a; color: #fff; line-height: 1.6; }\n</style>\n</head>\n<body>\n<h2>Code Execution Preview</h2>\n<pre style="background: #1e293b; padding: 16px; border-radius: 12px; overflow: auto;">${rawText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>\n</body>\n</html>`);
    setPreviewCode(cleanCode);
    setCanvasFullscreen(false);
    setCanvasOpen(true);
    setBackgroundVerify(null);
    emitQuantoraRef.current(QUANTORA_EVENTS.PREVIEW_OPENED);
  };

  const queuePreviewVerification = (messageId, html) => {
    if (!html?.trim()) return;
    setPreviewCode(html);
    setBackgroundVerify({ messageId, code: html });
    updateActiveMessages((prev) => prev.map((m) => (
      m.id === messageId ? { ...m, previewStatus: 'verifying' } : m
    )));
  };

  const handleBackgroundVerificationStatus = React.useCallback((status) => {
    const job = backgroundVerifyRef.current;
    if (!job) return;
    updateActiveMessages((prev) => prev.map((m) => (
      m.id === job.messageId ? { ...m, previewStatus: status } : m
    )));
    if (status === 'clean' || status === 'degraded' || status === 'failed') {
      setBackgroundVerify(null);
    }
  }, []);

  useEffect(() => {
    if (!backgroundVerify) return undefined;
    const job = backgroundVerify;
    const timer = setTimeout(() => {
      updateActiveMessages((prev) => prev.map((m) => (
        m.id === job.messageId && ['verifying', 'running', 'healing'].includes(m.previewStatus)
          ? { ...m, previewStatus: 'degraded' }
          : m
      )));
      setBackgroundVerify(null);
    }, 30000);
    return () => clearTimeout(timer);
  }, [backgroundVerify]);


  const fileInputRef = useRef(null);
  const inBarModelRef = useRef(null);
  const textareaRef = useRef(null);
  const messageViewportRef = useRef(null);
  const shouldFollowLatestRef = useRef(true);
  const scrollFrameRef = useRef(null);

  const focusPrompt = useCallback(() => {
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const resizePromptTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
  }, []);

  useEffect(() => {
    if (!prefillPrompt?.text || prefillAppliedRef.current === prefillPrompt.id) return;
    prefillAppliedRef.current = prefillPrompt.id;
    setLocalInputText(prefillPrompt.text);
    requestAnimationFrame(() => {
      resizePromptTextarea();
      textareaRef.current?.focus();
    });
  }, [prefillPrompt, resizePromptTextarea]);

  const scrollToLatest = (behavior = 'auto') => {
    if (!shouldFollowLatestRef.current || !messageViewportRef.current) return;
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      const viewport = messageViewportRef.current;
      if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    });
  };

  const handleMessageScroll = () => {
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    const distanceFromLatest = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    shouldFollowLatestRef.current = distanceFromLatest < 96;
  };

  // Follow new and streaming content only while the reader remains near the
  // latest message. Sending a prompt deliberately re-enables this behaviour.
  useEffect(() => {
    scrollToLatest();
  }, [messages, isGenerating]);

  useEffect(() => {
    shouldFollowLatestRef.current = true;
    scrollToLatest();
  }, [activeSessionId]);

  useEffect(() => () => {
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  // Click outside listener for in-bar model dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (inBarModelRef.current && !inBarModelRef.current.contains(event.target)) {
        setShowInBarModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const textColor = isLight ? '#0f172a' : '#ffffff';
  const subtextColor = isLight ? '#475569' : '#94a3b8';
  const bubbleUserBg = isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.12)';
  const bubbleUserBorder = isLight ? '#ffedd5' : 'rgba(249, 115, 22, 0.3)';
  const bubbleAiBg = isLight ? '#ffffff' : 'rgba(255, 255, 255, 0.04)';
  const bubbleAiBorder = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)';

  // Shared ingestion for both the paperclip picker and pasted/dropped images.
  const ingestFiles = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    const processed = await Promise.all(list.map(async (file) => {
      const att = {
        name: file.name || (file.type.includes('image') ? `pasted-image.${(file.type.split('/')[1] || 'png')}` : 'file'),
        size: (file.size / 1024).toFixed(1) + ' KB',
        type: file.type.includes('image') ? 'image' : 'file'
      };
      // Capture the actual image (downscaled) so the build can embed it as a
      // real product/gallery photo instead of a placeholder.
      if (att.type === 'image') {
        try { att.dataUrl = await downscaleImageToDataUrl(file); } catch (err) { /* keep as metadata only */ }
      }
      return att;
    }));
    setAttachments(prev => [...prev, ...processed]);
    // Persist the actual photos across the intake (attachments reset each send).
    const newImages = processed.filter(a => a.dataUrl).map(a => a.dataUrl);
    if (newImages.length) setSessionImages(prev => [...prev, ...newImages].slice(-8));
  };

  const handleFileUpload = async (e) => {
    await ingestFiles(e.target.files);
  };

  // Paste an image straight into the prompt (Cmd/Ctrl+V) — the way Claude and
  // ChatGPT accept screenshots. We only intercept when the clipboard carries an
  // actual image file; plain-text pastes fall through to the textarea untouched.
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles = [];
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length) {
      e.preventDefault(); // don't paste the binary blob as text
      await ingestFiles(imageFiles);
    }
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  const toggleVoiceInput = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser. Please use Google Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true; // Show words as they are spoken
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      // Optional: alert or toast here if we had a toast system
    };
    
    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      if (finalTranscript) {
        setInputText(prev => {
          // Clean up any trailing space before appending
          const base = prev.replace(/\s+$/, '');
          return base ? base + ' ' + finalTranscript : finalTranscript;
        });
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      if (event.error === 'not-allowed') {
        alert("Microphone access blocked! Please click the camera/mic icon in your browser URL bar to allow microphone access.");
      } else {
        alert("Microphone error: " + event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to start speech recognition:", e);
      alert("Could not start microphone. Please ensure no other tab is using it.");
      setIsListening(false);
    }
  };

  const {
    isPolishing: isEnhancingPrompt,
    undo: wandPolishUndo,
    error: wandPolishError,
    polish: runPromptPolish,
    clearPolish: clearWandPolish,
    setError: setWandPolishError,
  } = usePromptPolish({ availableModels, chooseBestFreeModel });
  const [wandHintOpen, setWandHintOpen] = useState(false);
  const wandAnchorRef = useRef(null);

  const sessionJourneyNode = React.useMemo(
    () => dreamNodes.find((n) => n.sessionId === activeSessionId),
    [dreamNodes, activeSessionId],
  );

  const runEnhance = async (sourcePrompt, depth) => {
    const result = await runPromptPolish(sourcePrompt, depth);
    if (!result) return;
    setInputText(result.prompt);
    requestAnimationFrame(resizePromptTextarea);
    if (result.model) {
      setSelectedModel(result.model);
      setAutoSelectEnabled(false);
    }
  };

  const revertWandPolish = () => {
    if (!wandPolishUndo?.original) return;
    setInputText(wandPolishUndo.original);
    requestAnimationFrame(resizePromptTextarea);
    clearWandPolish();
  };

  useEffect(() => {
    if (inputText.trim()) setWandHintOpen(false);
  }, [inputText]);

  const handleMagicWandEnhance = async () => {
    if (!inputText.trim()) {
      setWandHintOpen(true);
      focusPrompt();
      return;
    }
    setWandHintOpen(false);
    runEnhance(inputText, 'auto');
  };

  const handleWandTemplatePick = (template) => {
    setWandHintOpen(false);
    clearWandPolish();
    setInputText(template.prompt);
    if (template.mode) setStudioMode(template.mode);
    if (template.domain !== undefined) setStudioDomain(template.domain);
    requestAnimationFrame(() => {
      resizePromptTextarea();
      focusPrompt();
    });
  };

  const [showHeroCardModal, setShowHeroCardModal] = useState(false);
  const [intentSelectedIndex, setIntentSelectedIndex] = useState(0);

  const [keyInputValue, setKeyInputValue] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');

  // Preview the same deterministic free-model choice that will be used when
  // the message is sent. Debounced and length-gated so the banner doesn't
  // flicker on every keystroke or fire on a two-word fragment like "Can you".
  useEffect(() => {
    if (!autoSelectEnabled) { setSuggestedModel(null); return; }
    const trimmed = inputText.trim();
    if (trimmed.length < 15) { setSuggestedModel(null); return; }
    const timer = setTimeout(() => {
      setSuggestedModel(chooseBestFreeModel(availableModels, trimmed));
    }, 600);
    return () => clearTimeout(timer);
  }, [inputText, availableModels, autoSelectEnabled]);

  const saveKeyAndRetry = (keyType) => {
    if (!keyInputValue.trim()) return;
    if (keyType === 'gemini') {
      localStorage.setItem('geminiApiKey', keyInputValue.trim());
    } else {
      localStorage.setItem('openRouterApiKey', keyInputValue.trim());
    }
    setKeyInputValue('');
    updateActiveMessages(prev => prev.filter(m => !m.isKeyPrompt));
    if (lastPrompt) {
      handleSendMessage(lastPrompt);
    }
  };

  const handleSendMessage = async (textToSend, options = {}) => {
    let text = textToSend || inputText;
    const pendingImages = attachments.filter((a) => a.type === 'image');
    if (!text.trim() && !attachments.length) return;
    if (pendingImages.length && !pendingImages.some((a) => a.dataUrl)) {
      updateActiveMessages((prev) => [...prev, {
        id: Date.now(),
        sender: 'ai',
        text: '⚠️ **Image not ready** — the photo could not be processed. Try pasting again or use the paperclip to attach a JPG/PNG.',
        type: 'system',
      }]);
      return;
    }
    if (isGenerating) return;
    const effectiveStudioMode = options.studioMode || studioMode;
    const visibleText = text.trim()
      || (pendingImages.length ? 'Describe what you see in the attached image(s).' : "Review the attached repository context.");
    const apiStudioMode = effectiveStudioMode === 'plan' && !isSoftwarePlanningRequest(visibleText)
      ? 'ask'
      : effectiveStudioMode;

    const repoContent = repoContextCache.current[activeSessionId];
    if (repoContent && boundRepo?.name) {
      text = `${text}\n\n${repoContent}`;
    }

    // Inject Context Chips
    const contextChips = attachments.filter(a => a.type === 'context');
    if (contextChips.length > 0) {
      let contextString = "";
      for (const chip of contextChips) {
        if (chip.contextType === 'canvas') {
          contextString += `\n\n[CONTEXT: CURRENT CANVAS CODE]\n\`\`\`\n${previewCode}\n\`\`\``;
        } else if (chip.contextType === 'history') {
           const prevSession = chatSessions.find(s => s.id !== activeSessionId);
           if (prevSession) {
             const stringifiedHistory = prevSession.messages.map(m => `${m.sender.toUpperCase()}: ${m.text}`).join('\n');
             contextString += `\n\n[CONTEXT: PREVIOUS SESSION (${prevSession.title})]\n${stringifiedHistory.substring(0, 5000)}...`;
           }
        } else if (chip.contextType === 'repository' && chip.content) {
          contextString += `\n\n${chip.content}`;
        }
      }
      text = text + contextString;
    }

    setLastPrompt(text.trim());

    const taskCategory = pendingImages.length ? 'vision' : classifyTask(visibleText);
    const autoChoice = autoSelectEnabled ? chooseBestFreeModel(availableModels, visibleText, arenaPrefs) : null;
    const targetModel = autoChoice?.model || selectedModel || { id: 'gemini-flash-latest', name: 'Gemini Flash', pricingKind: 'free-tier', available: true };
    setActiveGeneratingModel({ id: targetModel.id, name: targetModel.name });
    const rankedFreeFallbacks = rankFreeModels(availableModels, visibleText, arenaPrefs)
      .filter((model) => model.id !== targetModel.id);

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: visibleText,
      attachments: [...attachments]
    };

    shouldFollowLatestRef.current = true;
    updateActiveSession({ lastActiveAt: Date.now() });
    clearWandPolish();
    updateActiveMessages(prev => prev.map((m) => {
      if (m.sender !== 'ai') return m;
      const patch = {};
      if (m.continueSet && !m.continueUsed) patch.continueUsed = true;
      if (m.choiceSet && !m.choiceUsed && !options.choiceSelected) patch.choiceUsed = true;
      return Object.keys(patch).length ? { ...m, ...patch } : m;
    }).concat(userMsg));
    scrollToLatest('smooth');
    if (!textToSend) setInputText('');
    setAttachments([]);
    setIsGenerating(true);

    let sessionContextForRequest = conversationContext;
    let confirmedContextChanged = false;
    if (options.choiceSelected) {
      sessionContextForRequest = learnFromChipSelection(conversationContext, {
        label: visibleText,
        value: visibleText,
        domain: studioDomain,
      });
      updateActiveSession({ conversationContext: sessionContextForRequest });
      confirmedContextChanged = true;
    } else {
      const answerFact = captureUserAnswerAsContext(visibleText, [...messages, userMsg]);
      if (answerFact) {
        sessionContextForRequest = mergeSessionContext(conversationContext, { facts: [answerFact] });
        updateActiveSession({ conversationContext: sessionContextForRequest });
        confirmedContextChanged = true;
      }
    }
    if (confirmedContextChanged) {
      void syncOutcomeContext(sessionContextForRequest, {
        sourceTurn: `user-${userMsg.id}`,
        confirmed: true,
      });
    }

    try {
      const modRes = await fetch('/api/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text.trim() })
      });
      const modData = await modRes.json();
      
      if (modData.flagged) {
        updateActiveMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'ai',
          text: modData.action === 'support'
            ? `**You don't have to handle this alone.**\n\n${modData.reason}`
            : `**I can’t help with that request.**\n\n${modData.reason}`,
          isError: true
        }]);
        setIsGenerating(false);
        setActiveGeneratingModel(null);
        return;
      }
    } catch (e) {
      console.error("Moderation API failed, failing open...", e);
    }

    const geminiApiKey = localStorage.getItem('geminiApiKey');
    const openRouterApiKey = localStorage.getItem('openRouterApiKey');

    const cleanMessages = messages.filter(m => m.id !== 1 && !m.isKeyPrompt && !m.text?.includes('⚠️ **API Key Required'));

    const arenaImageUrls = userMsg.attachments
      ?.filter((a) => a.type === 'image' && a.dataUrl)
      .map((a) => a.dataUrl)
      .slice(0, 4) || [];

    // 1. Dual Model Arena Execution Mode
    if (arenaMode) {
      const modelA = targetModel;
      const modelB = secondModel || { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B' };
      const arenaTaskCategory = arenaImageUrls.length ? 'vision' : taskCategory;

      const dualMsgId = Date.now() + 1;
      const dualMsg = {
        id: dualMsgId, sender: 'ai', type: 'arena_battle', isDual: true, prompt: text,
        taskCategory: arenaTaskCategory,
        modelA: { modelId: modelA.id, modelName: modelA.name, text: '', provider: modelA.name, latencyMs: 0, requestId: null },
        modelB: { modelId: modelB.id, modelName: modelB.name, text: '', provider: modelB.name, latencyMs: 0, requestId: null }
      };
      updateActiveMessages(prev => [...prev, dualMsg]);

      const streamSingleModel = async (mod, isModelA) => {
        try {
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: visibleText,
              modelId: mod.id,
              modelName: mod.name,
              history: cleanMessages,
              userKey: geminiApiKey,
              openRouterKey: openRouterApiKey,
              taskCategory: arenaTaskCategory,
              attachedImages: arenaImageUrls,
              studioMode: arenaImageUrls.length ? 'ask' : studioMode,
            })
          });
          
          if (!res.ok) throw new Error('API Error');
          
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let currentText = "";
          let finalProvider = mod.name;
          let finalLatency = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (dataStr === '[DONE]') break;
                try {
                  const parsed = JSON.parse(dataStr);
                  if (parsed.text) {
                    currentText += parsed.text;
                    updateActiveMessages(prev => prev.map(m => {
                      if (m.id === dualMsgId) {
                        const updatedModelInfo = {
                          modelId: mod.id,
                          modelName: mod.name,
                          text: currentText,
                          provider: finalProvider,
                          latencyMs: finalLatency,
                          requestId: parsed.requestId || null,
                        };
                        return { ...m, modelA: isModelA ? updatedModelInfo : m.modelA, modelB: !isModelA ? updatedModelInfo : m.modelB };
                      }
                      return m;
                    }));
                  }
                  if (parsed.provider) {
                    finalProvider = parsed.provider;
                    finalLatency = parsed.latencyMs || 0;
                    updateActiveMessages(prev => prev.map(m => {
                      if (m.id === dualMsgId) {
                        const updatedModelInfo = {
                          modelId: mod.id,
                          modelName: mod.name,
                          text: currentText,
                          provider: finalProvider,
                          latencyMs: finalLatency,
                          requestId: parsed.requestId || m[isModelA ? 'modelA' : 'modelB']?.requestId || null,
                        };
                        return { ...m, modelA: isModelA ? updatedModelInfo : m.modelA, modelB: !isModelA ? updatedModelInfo : m.modelB };
                      }
                      return m;
                    }));
                  }
                } catch (e) {}
              }
            }
          }
          
        } catch (e) {
          updateActiveMessages(prev => prev.map(m => m.id === dualMsgId ? { ...m, [isModelA ? 'modelA' : 'modelB']: { ...m[isModelA ? 'modelA' : 'modelB'], text: `Connection error: ${e.message}` } } : m));
        }
      };

      try {
        await Promise.all([streamSingleModel(modelA, true), streamSingleModel(modelB, false)]);
      } catch (err) {
        console.error('Arena Execution Error:', err);
      } finally {
        setIsGenerating(false);
        setActiveGeneratingModel(null);
      }
      return;
    }

    // 2. Standard Single Model Execution Mode
    const aiMsgId = Date.now() + 1;
    setStreamingMessageId(aiMsgId);
    const initialAiMsg = {
      id: aiMsgId,
      sender: 'ai',
      modelUsed: targetModel.name,
      text: '',
      componentType: 'formatted_text',
      thoughtProcess: `Connecting to ${targetModel.name}...`,
      routingNote: autoChoice?.model
        ? `Quantora chose ${targetModel.name} because ${autoChoice.reason}.`
        : null,
      taskCategory,
      latencyMs: 0,
      provider: targetModel.name,
      liveConnected: true
    };
    updateActiveMessages(prev => [...prev, initialAiMsg]);

    try {
      const sessionImages = userMsg.attachments
        ? userMsg.attachments.filter((a) => a.type === 'image' && a.dataUrl).map((a) => a.dataUrl)
        : [];

      const imageDataUrls = sessionImages.slice(0, 4);
      const isVisionQuestion = imageDataUrls.length > 0 && !detectBuildIntent(visibleText);

      /*
       * Vision: send pasted/attached images whenever the user included them.
       * Previously blocked in Build mode — so screenshots attached but the model
       * could not see them. Prefer Gemini when images are present (reliable vision).
       */
      const attachedImages = imageDataUrls;
      let visionModel = targetModel;
      if (imageDataUrls.length > 0) {
        const geminiVision = availableModels?.find(
          (m) => typeof m.id === 'string' && m.id.startsWith('gemini') && m.available !== false,
        );
        if (geminiVision) visionModel = geminiVision;
      }

      const candidateModels = imageDataUrls.length > 0
        ? [visionModel].filter((m) => m?.id?.startsWith('gemini'))
        : [
            visionModel,
            ...rankedFreeFallbacks.filter((m) => m.id !== visionModel.id),
          ].slice(0, 3);
      /*
       * Conversational iteration: if a site already exists and this isn't a
       * fresh "build me a new X", treat the message as an edit — hand the model
       * the current document and ask for the COMPLETE updated one back. The user
       * sees only their words in chat; the code rides in the API payload, and
       * the returned HTML flows into the preview via the auto-open.
       */
      const isRefine = refineActive && Boolean(previewCode && previewCode.trim()) && !detectBuildIntent(text);
      const featureSuggestOnly = isRefine && isFeatureSuggestionRequest(visibleText) && !isExplicitArtifactProceed(visibleText);
      const apiMessage = isRefine && !featureSuggestOnly
        ? `${text}\n\n[You are editing the existing site below. Explain what you are changing in warm, plain language first — name the feature and ask what the user thinks. Then return the COMPLETE updated self-contained HTML in a single \`\`\`html block.]\n\`\`\`html\n${previewCode}\n\`\`\``
        : text;
      const autoBuildMode = !featureSuggestOnly && (isRefine || isWorkspaceMode || detectBuildIntent(text));
      let buildMode = isVisionQuestion
        ? false
        : apiStudioMode === 'build'
          ? true
          : apiStudioMode === 'ask' || apiStudioMode === 'plan'
            ? false
            : autoBuildMode;
      /*
       * Guided build: a fresh "make me a website/app" request (no site yet)
       * starts a designer-style intake — Quantora asks for the essentials and
       * confirms before building. Persists across the follow-up answers (which
       * don't read as build intent on their own) until a site is produced.
       */
      const startingGuided = !isVisionQuestion && detectBuildIntent(text) && !previewCode && !isWorkspaceMode;
      const guidedBuild = !isVisionQuestion && (startingGuided || guidedSession) && !previewCode && apiStudioMode !== 'plan';
      const userProceedsWithBuild = /\b(just build|go ahead|build it now|build now|skip questions|use defaults|build first draft|no more questions)\b/i.test(visibleText);
      const guidedProceed = options.choiceSelected && /\b(build a first draft|build first draft|use reasonable defaults|just build|go ahead)\b/i.test(visibleText);
      const allowPreviewFromGuided = !guidedBuild || userProceedsWithBuild || guidedProceed;
      if (guidedBuild && !guidedSession) setGuidedSession(true);

      /*
       * Photo uploads: inline the user's real images into the build via stable
       * placeholder tokens, then swap the actual (downscaled) data URIs back in
       * after generation — so the model never has to echo huge base64 strings,
       * yet the rendered/published site carries the real photos.
       */
      const imageMap = new Map();
      let outboundMessage = apiMessage;
      if (sessionImages.length && (buildMode || guidedBuild)) {
        const tokens = sessionImages.map((dataUrl, i) => {
          const token = `{{QUANTORA_IMAGE_${i + 1}}}`;
          imageMap.set(token, dataUrl);
          return token;
        });
        outboundMessage += `\n\n[The user uploaded ${tokens.length} photo(s) to use in the site. When you build, use them as the real product/gallery images by putting these EXACT placeholder strings inside <img src="..."> attributes (one per image, reused where it makes sense): ${tokens.join(', ')}. Do not substitute stock image URLs for these.]`;
      }

      if (imageDataUrls.length > 0 && candidateModels.length === 0) {
        updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
          ...m,
          text: '⚠️ **Vision requires Gemini** — attach images are supported, but no Gemini model is available. Sign in or check that Gemini Flash is approved in the model list.',
          thoughtProcess: 'Vision routing failed',
        } : m));
        setIsGenerating(false);
        setActiveGeneratingModel(null);
        setStreamingMessageId(null);
        return;
      }

      let res = null;
      let errData = {};
      let respondingModel = imageDataUrls.length > 0 ? visionModel : targetModel;
      let fallbackFrom = null;

      for (let index = 0; index < candidateModels.length; index += 1) {
        const candidate = candidateModels[index];
        respondingModel = candidate;
        const hasAnotherCandidate = index < candidateModels.length - 1;
        try {
          res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: outboundMessage,
              modelId: candidate.id,
              modelName: candidate.name,
              history: cleanMessages,
              userKey: geminiApiKey,
              openRouterKey: openRouterApiKey,
              cognitiveLevel,
              buildMode,
              guidedBuild,
              refineMode: isRefine,
              featureSuggest: featureSuggestOnly,
              taskCategory,
              fallbackFrom,
              studioMode: isVisionQuestion ? 'ask' : apiStudioMode,
              sessionContext: sessionContextForRequest,
              listeningSignals,
              studioDomain,
              attachedImages,
              choiceSelected: options.choiceSelected === true,
            })
          });
        } catch (networkError) {
          if (!hasAnotherCandidate) throw networkError;
          fallbackFrom ||= targetModel.id;
          continue;
        }

        if (res.ok) {
          respondingModel = candidate;
          setActiveGeneratingModel({ id: candidate.id, name: candidate.name });
          if (candidate.id !== targetModel.id) {
            fallbackFrom ||= targetModel.id;
            updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m,
              modelUsed: candidate.name,
              provider: candidate.name,
              routingNote: `${targetModel.name} was unavailable, so Quantora continued with ${candidate.name}.`,
              thoughtProcess: `Fallback connected to ${candidate.name}...`,
              fallbackFrom: targetModel.id,
            } : m));
          }
          break;
        }

        errData = await res.json().catch(() => ({}));
        const retryable = res.status >= 500
          || [400, 404, 408, 409, 422].includes(res.status)
          || Boolean(errData.requiresKey);
        if (!hasAnotherCandidate || !retryable || errData.requiresAuth || res.status === 429) break;

        fallbackFrom ||= targetModel.id;
        const nextModel = candidateModels[index + 1];
        updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
          ...m,
          thoughtProcess: `${candidate.name} is unavailable; trying ${nextModel.name}...`,
        } : m));
      }

      if (!res) throw new Error('Quantora could not reach an available AI provider.');

      if (res.ok) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let currentText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6);
              if (dataStr === '[DONE]') break;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.text) {
                  currentText += parsed.text;
                  const visibleText = stripPartialAssistantMarkers(currentText);
                  updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                    ...m,
                    text: visibleText,
                    thoughtProcess: 'Generating live...'
                  } : m));
                }
                if (parsed.provider) {
                  updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                    ...m,
                    provider: parsed.provider,
                    modelUsed: respondingModel.name,
                    modelId: parsed.modelId || respondingModel.id,
                    requestId: parsed.requestId || m.requestId,
                    latencyMs: parsed.latencyMs || 0,
                    thoughtProcess: `Processed live via ${parsed.provider} (${parsed.latencyMs || 0}ms)`
                  } : m));
                }
              } catch (e) {}
            }
          }
        }

        const { displayText: afterChoices, choiceSet } = extractChoicesFromAssistantText(currentText);
        const { displayText: afterContinues, continueSet } = extractContinuesFromAssistantText(afterChoices);
        const { displayText, contextUpdate } = extractContextFromAssistantText(afterContinues);
        const finalHtml = preparePreviewHtml(displayText, imageMap);
        const chatDisplay = getChatDisplayText(displayText, { artifactHtml: finalHtml });
        if (displayText !== currentText || chatDisplay !== displayText) {
          updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            text: chatDisplay,
            ...(finalHtml ? { codeSnippet: finalHtml } : {}),
            ...(choiceSet ? { choiceSet } : {}),
            ...(continueSet ? { continueSet } : {}),
          } : m));
        } else {
          if (choiceSet || continueSet || finalHtml) {
            updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m,
              ...(chatDisplay ? { text: chatDisplay } : {}),
              ...(finalHtml ? { codeSnippet: finalHtml } : {}),
              ...(choiceSet ? { choiceSet } : {}),
              ...(continueSet ? { continueSet } : {}),
            } : m));
          }
        }
        if (contextUpdate && (contextUpdate.goal || contextUpdate.understanding || contextUpdate.facts?.length)) {
          setChatSessions(prevSessions => {
            const updated = prevSessions.map(session => {
              if (session.id !== activeSessionId) return session;
              return {
                ...session,
                conversationContext: mergeSessionContext(session.conversationContext, contextUpdate),
              };
            });
            try {
              localStorage.setItem('quantora_chat_sessions', JSON.stringify(updated));
            } catch (e) {
              console.error(e);
            }
            return updated;
          });
          emitQuantoraRef.current(QUANTORA_EVENTS.CONTEXT_UPDATED, contextUpdate);
        }

        if (apiStudioMode === 'plan') {
          const planSpec = parsePlanSpec(currentText);
          if (planSpec) {
            updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, planSpec, type: 'plan_spec' } : m));
            emitQuantoraRef.current(QUANTORA_EVENTS.PLAN_RECEIVED);
          }
        }

        const outcomeGaps = detectOutcomeGaps(textToSend || visibleText, displayText);
        if (outcomeGaps[0]) {
          emitQuantoraRef.current(QUANTORA_EVENTS.OUTCOME_GAP_DETECTED, { label: outcomeGaps[0].label });
        }

        // Store preview HTML and verify in the background — chat shows words only.
        if (finalHtml && allowPreviewFromGuided) {
          queuePreviewVerification(aiMsgId, finalHtml);
        }

      } else {
        /*
         * "You need to sign in" and "you need an API key" are different
         * problems with different fixes. Collapsing both into the key prompt
         * told signed-out users to paste a key they did not need, which read
         * as the key handling being broken.
         */
        if (res.status === 401 && errData.requiresAuth) {
          updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            text: `🔒 **Please sign in to continue.**\n\n${errData.error || "Sign in to use Quantora's built-in AI."}`,
            isAuthPrompt: true,
            thoughtProcess: 'Sign-in required'
          } : m));
        } else if (res.status === 429) {
          updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            text: `⏳ **Slow down a moment.** ${errData.error || 'Too many requests.'}`,
            thoughtProcess: 'Rate limited'
          } : m));
        } else {
          const errText = errData.error || `The backend server encountered an error with ${respondingModel.name}.`;

          updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            text: `⚠️ **Server Error**: ${errText}\n\nQuantora is unable to process this request at the moment. Please try again later or select a different model.`,
            thoughtProcess: `Error processing request via ${respondingModel.name}`
          } : m));
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
        ...m,
        text: `⚠️ **Connection Error**: Unable to reach Quantora's AI gateway for ${targetModel.name}. Please check your connection and try again.`,
        thoughtProcess: `Network connection error for ${targetModel.name}`
      } : m));
    } finally {
      setIsGenerating(false);
      setActiveGeneratingModel(null);
      setStreamingMessageId(null);
      focusPrompt();
    }
  };

  useEffect(() => {
    sendMessageRef.current = handleSendMessage;
  });

  const submitModelFeedback = async (message, outcome) => {
    if (!message?.requestId || !message?.modelId || message.qualityFeedback) return;
    if (message.id) {
      updateActiveMessages(prev => prev.map(item => item.id === message.id ? { ...item, qualityFeedback: outcome } : item));
    }
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'feedback',
          requestId: message.requestId,
          modelId: message.modelId,
          taskCategory: message.taskCategory || 'general',
          outcome,
        }),
      });
    } catch (error) {
      console.warn('Anonymous model feedback could not be recorded:', error);
    }
  };

  const handleArenaPreference = useCallback(async (msg, side) => {
    if (msg.arenaWinner) return;
    const winner = side === 'a' ? msg.modelA : msg.modelB;
    const loser = side === 'a' ? msg.modelB : msg.modelA;
    if (!winner?.modelId) return;

    const task = msg.taskCategory || classifyTask(msg.prompt || '');
    const nextPrefs = recordArenaWin(task, winner.modelId, loser?.modelId);
    setArenaPrefs(nextPrefs);

    updateActiveMessages((prev) => prev.map((m) => (
      m.id === msg.id ? { ...m, arenaWinner: side } : m
    )));

    if (winner.requestId) {
      submitModelFeedback(
        { requestId: winner.requestId, modelId: winner.modelId, taskCategory: task },
        'helpful',
      );
    }
    if (loser?.requestId) {
      submitModelFeedback(
        { requestId: loser.requestId, modelId: loser.modelId, taskCategory: task },
        'not_helpful',
      );
    }

    const winnerModel = availableModels?.find((m) => m.id === winner.modelId);
    if (winnerModel) {
      setSelectedModel(winnerModel);
      setAutoSelectEnabled(false);
    }
  }, [availableModels, setSelectedModel]);

  const getSessionJourneyContext = useCallback(() => {
    const userMsg = [...messages].reverse().find((m) => m.sender === 'user');
    const userText = userMsg?.text || '';
    const fallbackTitle = userText.split('\n')[0]?.slice(0, 80) || 'Studio build';
    return {
      sessionId: activeSessionId,
      title: activeSession.title && !['New Chat', 'Welcome to Quantora'].includes(activeSession.title)
        ? activeSession.title
        : fallbackTitle,
      brief: userText.slice(0, 300) || activeSession.title || fallbackTitle,
      studioPrompt: userText || activeSession.title || fallbackTitle,
      domain: studioDomain,
      mode: studioMode,
    };
  }, [messages, activeSessionId, activeSession.title, studioDomain, studioMode]);

  useEffect(() => {
    const listener = createQuantoraListener({
      setDreamNodes,
      user,
      getJourneyContext: getSessionJourneyContext,
      onSessionSignals: recordListeningSignal,
    });
    emitQuantoraRef.current = (type, payload = {}) => listener.emit(type, payload);
  }, [setDreamNodes, user, getSessionJourneyContext, recordListeningSignal]);

  const emitQuantora = useCallback((type, payload = {}) => {
    emitQuantoraRef.current(type, payload);
  }, []);

  const {
    resolveInlineSuggestions,
    dismissInlineSuggestions,
    handleInlineChoiceSelect,
    handleInlineContinueSelect,
  } = useInlineSuggestions({
    messages,
    isGenerating,
    activeSessionId,
    enrichContinues,
    getPriorUserPrompt,
    setChoiceDockState,
    updateActiveMessages,
    updateActiveSession,
    conversationContext,
    studioDomain,
    emitQuantora,
    onSendMessage,
    escapeBlocked: showModelDashboard || canvasOpen,
  });

  const handleWorkingNotesUpdate = useCallback((patch) => {
    const nextContext = mergeSessionContext(conversationContext, patch);
    updateActiveSession({ conversationContext: nextContext });
    if (outcomeSyncTimerRef.current) clearTimeout(outcomeSyncTimerRef.current);
    outcomeSyncTimerRef.current = setTimeout(() => {
      void syncOutcomeContext(nextContext, {
        sourceTurn: `user-notes-${Date.now()}`,
        confirmed: true,
      });
      outcomeSyncTimerRef.current = null;
    }, 800);
  }, [conversationContext, syncOutcomeContext, updateActiveSession]);

  useEffect(() => () => {
    if (outcomeSyncTimerRef.current) clearTimeout(outcomeSyncTimerRef.current);
  }, []);

  const saveToJourney = useCallback((msg) => {
    if (!onPushToCanvas) return;
    const msgIndex = messages.findIndex((m) => m.id === msg.id);
    const priorUser = msgIndex > 0
      ? [...messages.slice(0, msgIndex)].reverse().find((m) => m.sender === 'user')
      : null;
    const userText = priorUser?.text || '';
    const title = userText.split('\n')[0]?.slice(0, 80)
      || msg.text?.split('\n')[0]?.slice(0, 80)
      || 'Saved outcome';
    onPushToCanvas({
      title,
      brief: userText.slice(0, 300) || msg.text?.slice(0, 300) || title,
      studioPrompt: userText || title,
      sessionId: activeSessionId,
      domain: studioDomain,
      mode: studioMode,
      hasPreview: Boolean(msg.codeSnippet || hasPreviewableContent(msg.text)),
    });
    emitQuantora(QUANTORA_EVENTS.JOURNEY_SAVED, { title });
  }, [onPushToCanvas, messages, activeSessionId, studioDomain, studioMode, emitQuantora]);


  return (
    <div className="ai-studio-shell" style={{
      display: 'flex',
      gap: '20px',
      maxWidth: showBuildSplit || isWorkspaceMode ? '100%' : '1800px',
      padding: showBuildSplit || isWorkspaceMode ? '20px' : '0',
      margin: '0 auto',
      flex: 1,
      minHeight: 0,
      width: '100%',
      alignItems: 'stretch',
      position: 'relative',
      transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      {/* Left Navigation Sidebar - Chat History */}
      <div className={`ai-studio-sidebar ${sidebarOpen ? 'is-open' : ''}`} style={{
        width: sidebarOpen ? (isWorkspaceMode ? '220px' : '260px') : '0px',
        opacity: sidebarOpen ? 1 : 0,
        pointerEvents: sidebarOpen ? 'auto' : 'none',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex',
        flexDirection: 'column',
        background: isLight ? '#f0f4f9' : 'var(--bg-secondary)',
        border: 'none',
        borderRadius: isWorkspaceMode ? '16px' : '0 24px 24px 0',
        padding: sidebarOpen ? '20px 16px' : '0px',
        overflow: 'hidden',
        flexShrink: 0
      }}>
        {/* Sidebar Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <button
            onClick={handleCreateNewChat}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
              color: '#ffffff',
              border: 'none',
              padding: '10px 14px',
              borderRadius: '12px',
              fontWeight: '700',
              fontSize: '0.88rem',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(249, 115, 22, 0.25)',
              transition: 'all 0.2s ease'
            }}
          >
            <Plus size={16} />
            <span>New Chat</span>
          </button>

          <button
            onClick={() => setSidebarOpen(false)}
            title="Collapse sidebar"
            style={{
              background: 'transparent',
              border: 'none',
              color: subtextColor,
              padding: '8px',
              cursor: 'pointer',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: '6px'
            }}
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        {/* Starter Templates Section */}
        <div style={{ fontSize: '0.72rem', fontWeight: '700', color: subtextColor, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', paddingLeft: '4px' }}>
          Starter Templates
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '2px', marginBottom: '24px' }}>
          {[
            { title: 'Analyze my repository', icon: <Github size={15} color="#24292f" />, action: 'github', mode: 'ask' },
            { title: 'Plan before you build', icon: <Layout size={15} color="#8b5cf6" />, prompt: 'Help me plan a new web app. Ask one clarifying question, then output the architecture plan.', mode: 'plan' },
            { title: 'Task Manager App', icon: <FileText size={15} color="#f97316" />, prompt: 'Build a full-stack task manager app with category filters and status tracking', mode: 'build' },
            { title: 'Quantum Simulator', icon: <Atom size={15} color="#8b5cf6" />, prompt: 'Build an interactive Quantum Circuit & Bell state entanglement simulator', mode: 'build' }
          ].map((card, idx) => (
            <div
              key={idx}
              onClick={() => {
                if (card.mode) setStudioMode(card.mode);
                if (card.action === 'github') {
                  setIsGithubModalOpen(true);
                } else if (card.prompt) {
                  handleSendMessage(card.prompt, { studioMode: card.mode || studioMode });
                }
                if (window.innerWidth < 768) setSidebarOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: '500',
                color: textColor,
                border: '1px solid transparent',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.borderColor = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'transparent';
              }}
            >
              <div style={{ flexShrink: 0 }}>{card.icon}</div>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.title}</span>
            </div>
          ))}
        </div>

        {/* Live model catalogue and lifecycle dashboard */}
        <button
          onClick={() => setShowModelDashboard(true)}
          aria-haspopup="dialog"
          style={{
            border: showModelDashboard ? '1px solid rgba(249, 115, 22, 0.35)' : '1px solid transparent',
            background: showModelDashboard ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.12)') : 'transparent',
            borderRadius: '9px',
            padding: '8px 10px',
            marginBottom: '16px',
            color: showModelDashboard ? '#f97316' : textColor,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.78rem',
            fontWeight: '700',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={15} /> Model Dashboard
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#059669', fontSize: '0.65rem' }}>{modelDashboard?.summary?.available ?? availableModels?.filter((model) => model.available !== false).length ?? 0} ready</span>
            <ChevronDown size={13} style={{ transform: 'rotate(-90deg)' }} />
          </span>
        </button>

        {/* History Section Title */}
        <div style={{ fontSize: '0.72rem', fontWeight: '700', color: subtextColor, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', paddingLeft: '4px' }}>
          Chat History
        </div>

        {/* Sessions List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '2px' }}>
          {chatSessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  background: isActive ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.15)') : 'transparent',
                  border: isActive ? (isLight ? '1px solid #ffedd5' : '1px solid rgba(249, 115, 22, 0.3)') : '1px solid transparent',
                  color: isActive ? '#f97316' : textColor,
                  fontSize: '0.85rem',
                  fontWeight: isActive ? '700' : '500',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.05)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', flex: 1 }}>
                  <MessageSquare size={15} color={isActive ? '#f97316' : subtextColor} style={{ flexShrink: 0 }} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {session.title || 'New Chat'}
                  </span>
                  {session.boundRepo?.name && (
                    <Github size={11} color={isActive ? '#f97316' : subtextColor} style={{ flexShrink: 0, opacity: 0.8 }} title={session.boundRepo.name} />
                  )}
                </div>

                <button
                  onClick={(e) => deleteChatWithMemory(e, session.id)}
                  title="Delete chat"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: subtextColor,
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    opacity: isActive ? 1 : 0.6,
                    transition: 'opacity 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                  onMouseLeave={(e) => e.currentTarget.style.color = subtextColor}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {showModelDashboard && createPortal((
        <div className="model-drawer-backdrop" onMouseDown={() => setShowModelDashboard(false)}>
          <section
            className={`model-drawer ${isLight ? 'is-light' : 'is-dark'}`}
            role="dialog"
            aria-modal="true"
            aria-label="AI model catalogue"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="model-drawer-header">
              <div>
                <div className="model-drawer-title"><Activity size={18} /> Model Dashboard</div>
                <div className="model-drawer-subtitle">
                  {isAdmin ? 'Choose a ready model or approve newly discovered free options.' : 'Choose a ready model for chat and build.'}
                </div>
              </div>
              <button className="model-drawer-close" onClick={() => setShowModelDashboard(false)} aria-label="Close AI models">
                <X size={18} />
              </button>
            </div>
            <ModelDashboard
              data={modelDashboard}
              availableModels={availableModels}
              selectedModel={selectedModel}
              autoSelectEnabled={autoSelectEnabled}
              onToggleAutoSelect={setAutoSelectEnabled}
              onSelectModel={(model) => {
                setAutoSelectEnabled(false);
                setSelectedModel(availableModels?.find((candidate) => candidate.id === model.id) || model);
                setShowModelDashboard(false);
              }}
              isLight={isLight}
              isAdmin={isAdmin}
              onModelsRefresh={onModelsRefresh}
            />
          </section>
        </div>
      ), document.body)}

      {/* Main Chat Interface (Center or Left if Workspace is Open) */}
      <div
        className="ai-studio-conversation"
        style={{
          flex: showBuildSplit || isWorkspaceMode ? '0 0 48%' : 1,
          display: 'flex',
          flexDirection: 'column',
          maxWidth: showBuildSplit || isWorkspaceMode ? '48%' : '100%',
          margin: '0 auto',
          minHeight: 0,
          minWidth: 0,
          width: '100%',
          transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
      <div className="ai-studio-main" style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        margin: '0 auto',
        padding: isWorkspaceMode ? '0 10px 0 0' : 'clamp(4px, 0.8vw, 8px) clamp(12px, 1.6vw, 24px) 0',
        minHeight: 0,
        width: '100%',
        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        <StudioChromeBar
          isLight={isLight}
          textColor={textColor}
          subtextColor={subtextColor}
          sidebarOpen={sidebarOpen}
          onOpenSidebar={() => setSidebarOpen(true)}
          sessionTitle={activeSession?.title}
          showSessionMeta={messages.length > 1}
          isGenerating={isGenerating}
          activeGeneratingModel={activeGeneratingModel}
          autoSelectEnabled={autoSelectEnabled}
          selectedModel={selectedModel}
          hasMemory={hasSessionMemory(conversationContext)}
          memoryLabel={conversationContext.goal || conversationContext.understanding || 'Remembering context'}
          arenaMode={arenaMode}
          onToggleArena={() => setArenaMode(!arenaMode)}
          secondModel={secondModel}
          onSelectSecondModel={(m) => setSecondModel(m)}
          availableModels={availableModels}
          onResetChat={() => updateActiveMessages([])}
        />

        {sessionJourneyNode && (
          <StudioJourneyStrip
            sessionId={activeSessionId}
            dreamNodes={dreamNodes}
            isLight={isLight}
            onOpenJourney={() => setActiveTab?.('canvas')}
          />
        )}

        {showIdleReturn && (
          <StudioIdleReturnBanner
            sessionTitle={activeSession.title}
            isLight={isLight}
            onContinue={() => {
              setIdleReturnDismissed(true);
              updateActiveSession({ lastActiveAt: Date.now() });
              textareaRef.current?.focus();
            }}
            onDismiss={() => {
              setIdleReturnDismissed(true);
              updateActiveSession({ lastActiveAt: Date.now() });
            }}
          />
        )}

        <StudioWorkingNotes
          isLight={isLight}
          textColor={textColor}
          subtextColor={subtextColor}
          conversationContext={conversationContext}
          listeningSignals={listeningSignals}
          onUpdateContext={handleWorkingNotesUpdate}
          memoryConsented={memoryConsented}
          onMemoryConsentChange={handleMemoryConsentChange}
        />

        {arenaMode && !arenaHintDismissed && (
          <div className="studio-arena-hint" role="note">
            <div style={{ flex: 1 }}>
              <strong>Arena mode</strong> — compare two models on the same prompt, side by side.
              <div className="studio-arena-hint__steps">
                <span className="studio-arena-hint__step"><span>1</span> ⋯ menu → Compare models (Arena)</span>
                <span className="studio-arena-hint__step"><span>2</span> Pick Model B in the ⋯ menu</span>
                <span className="studio-arena-hint__step"><span>3</span> Send one prompt — both answer in parallel</span>
              </div>
            </div>
            <button
              type="button"
              className="studio-arena-hint__dismiss"
              onClick={() => {
                setArenaHintDismissed(true);
                try { localStorage.setItem('quantora_arena_hint_dismissed', '1'); } catch { /* best effort */ }
              }}
            >
              Got it
            </button>
          </div>
        )}

      {/* Messages Stream / Initial Hero State */}
      <div
        ref={messageViewportRef}
        onScroll={handleMessageScroll}
        className={`ai-studio-messages ${messages.length <= 1 ? 'ai-studio-messages--empty' : ''}`}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: messages.length <= 1 ? 'center' : 'flex-start', overflowY: 'auto', marginBottom: '12px', scrollBehavior: 'smooth' }}
      >
        {messages.length <= 1 ? (
          /* Clean Hero Empty State */
          <div className="ai-studio-empty-state" style={{
            textAlign: 'center',
            padding: '32px 28px 24px',
            maxWidth: '720px',
            margin: '0 auto',
            width: '100%',
            background: isLight ? 'linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(248, 250, 252, 0.85))' : 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(40px) saturate(200%)',
            WebkitBackdropFilter: 'blur(40px) saturate(200%)',
            border: isLight ? '1px solid rgba(226, 232, 240, 0.8)' : '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '32px',
            boxShadow: isLight ? '0 32px 64px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(255,255,255,0.6) inset' : '0 32px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.2)'
          }}>
            <div className="ai-studio-empty-icon" style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%)',
              border: '1px solid rgba(249, 115, 22, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px auto',
              boxShadow: '0 8px 24px rgba(249, 115, 22, 0.15)'
            }}>
              <Sparkles size={28} color="#f97316" />
            </div>

            <h1 className="ai-studio-empty-title" style={{ fontSize: '2.4rem', fontWeight: '800', margin: '0 0 6px 0', color: textColor, letterSpacing: '-0.03em' }}>
              Hello, {user?.name ? user.name.split(' ')[0] : 'Bharani'}
            </h1>
            <p className="ai-studio-empty-subtitle" style={{ fontSize: '1.1rem', fontWeight: '400', margin: '0 0 16px 0', color: subtextColor }}>
              What would you like to build today?
            </p>

            <div className="studio-starter-templates">
              {STARTER_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={`studio-starter-templates__chip${isLight ? ' is-light' : ''}`}
                  onClick={() => {
                    if (template.domain) setStudioDomain(template.domain);
                    setStudioMode(template.mode);
                    handleSendMessage(template.prompt, { studioMode: template.mode });
                  }}
                >
                  <span aria-hidden="true">{template.emoji}</span>
                  {template.label}
                </button>
              ))}
            </div>

            {/* AI Models Highlight Cards */}
            <div className="ai-studio-model-cards" style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '16px',
              paddingBottom: '20px',
              width: '100%'
            }}>
              
              {[
                { name: "Gemini 1.5 Pro", desc: "2M Context Window • Advanced Reasoning for complex logic.", icon: <Cpu size={20} color="#f97316"/>, badge: "NEW", color: "#f97316" },
                { name: "Claude 3.5 Sonnet", desc: "Ultra-fast coding via OpenRouter integration.", icon: <Sparkles size={20} color="#8b5cf6"/>, badge: "HOT", color: "#8b5cf6" },
                { name: "Llama 3 70B", desc: "Open-source powerhouse with zero filters.", icon: <Layers size={20} color="#10b981"/>, badge: "UPDATED", color: "#10b981" }
              ].map((model, idx) => (
                <div key={idx} className="ai-studio-model-card" style={{
                  flex: '1 1 200px',
                  maxWidth: '280px',
                  background: isLight ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.05)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: isLight ? '1px solid rgba(255, 255, 255, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: isLight ? '0 8px 32px rgba(31, 38, 135, 0.07)' : '0 8px 32px rgba(0, 0, 0, 0.3)',
                  borderRadius: '16px',
                  padding: '16px',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
                }}
                onMouseEnter={(e) => { 
                  e.currentTarget.style.transform = 'translateY(-3px)'; 
                  e.currentTarget.style.boxShadow = `0 12px 24px ${model.color}33`; 
                  e.currentTarget.style.borderColor = `${model.color}66`;
                }}
                onMouseLeave={(e) => { 
                  e.currentTarget.style.transform = 'none'; 
                  e.currentTarget.style.boxShadow = isLight ? '0 4px 12px rgba(0,0,0,0.03)' : '0 8px 32px rgba(0,0,0,0.2)'; 
                  e.currentTarget.style.borderColor = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)';
                }}
                >
                  <div style={{ position: 'absolute', top: 0, right: 0, background: `${model.color}22`, color: model.color, fontSize: '0.65rem', fontWeight: '800', padding: '4px 10px', borderBottomLeftRadius: '12px' }}>
                    {model.badge}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ background: `${model.color}15`, padding: '8px', borderRadius: '12px', display: 'flex' }}>
                      {model.icon}
                    </div>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', color: textColor, fontWeight: '700' }}>{model.name}</h3>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: subtextColor, lineHeight: '1.5' }}>
                    {model.desc}
                  </p>
                </div>
              ))}
            </div>



          </div>
        ) : (
          /* Active Chat Thread */
          <div className="ai-studio-thread" style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1120px', margin: '0 auto', width: '100%' }}>
            <StudioChatFeed
              messages={messages}
              user={user}
              isLight={isLight}
              textColor={textColor}
              subtextColor={subtextColor}
              isGenerating={isGenerating}
              streamingMessageId={streamingMessageId}
              expandedMessageDetails={expandedMessageDetails}
              setExpandedMessageDetails={setExpandedMessageDetails}
              showCodeMap={showCodeMap}
              setShowCodeMap={setShowCodeMap}
              resolveInlineSuggestions={resolveInlineSuggestions}
              handleInlineChoiceSelect={handleInlineChoiceSelect}
              handleInlineContinueSelect={handleInlineContinueSelect}
              dismissInlineSuggestions={dismissInlineSuggestions}
              handleBuildFromPlan={handleBuildFromPlan}
              openCanvasWithCode={openCanvasWithCode}
              saveToJourney={saveToJourney}
              onPushToCanvas={onPushToCanvas}
              onOpenAuth={onOpenAuth}
              handleArenaPreference={handleArenaPreference}
              submitModelFeedback={submitModelFeedback}
            />
            {isGenerating && (
              <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: isLight ? '#ffffff' : 'transparent',
                  border: isLight ? '1px solid var(--border-color)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Sparkles size={18} color="#f97316" className="animate-spin" />
                </div>
                <div style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '16px',
                  background: isLight ? '#ffffff' : '#0d1127',
                  border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#f97316',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <Loader size={15} className="animate-spin" />
                  {autoSelectEnabled
                    ? 'Working on your request…'
                    : `${activeGeneratingModel?.name || selectedModel?.name || 'Qwen 2.5 Coder'} is thinking…`}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Clean Prompt Console Input Area */}
      <div className="ai-studio-prompt" style={{ position: 'relative', width: '100%', maxWidth: '1120px', margin: '0 auto', flexShrink: 0 }}>
        {boundRepo?.name && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', paddingLeft: '4px' }}>
            <span style={{
              fontSize: '0.75rem',
              background: isLight ? '#f0fdf4' : 'rgba(34, 197, 94, 0.12)',
              border: isLight ? '1px solid #bbf7d0' : '1px solid rgba(34, 197, 94, 0.35)',
              color: isLight ? '#166534' : '#86efac',
              padding: '5px 12px',
              borderRadius: '999px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: '600'
            }}>
              <Github size={13} />
              {boundRepo.name}
              <span style={{ opacity: 0.7, fontWeight: '500' }}>· repo context active</span>
              <button type="button" onClick={clearBoundRepo} title="Disconnect repository" style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex' }}>
                <X size={12} />
              </button>
            </span>
          </div>
        )}
        {/* Attachment Files Badge Bar */}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px', paddingLeft: '4px' }}>
            {attachments.map((att, index) => (
              <span
                key={index}
                style={{
                  fontSize: '0.75rem',
                  background: isLight ? '#ffffff' : 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid #f97316',
                  color: textColor,
                  padding: '4px 10px',
                  borderRadius: '16px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}
              >
                {att.type === 'context' ? <Layers size={12} color="#8b5cf6" /> : att.type === 'image' ? <ImageIcon size={12} color="#f97316" /> : <FileText size={12} color="#0284c7" />}
                <span>{att.name}</span>
                {att.type === 'image' && att.dataUrl && (
                  <span style={{ fontSize: '0.65rem', opacity: 0.75 }}>· vision</span>
                )}
                <X
                  size={12}
                  color="#ef4444"
                  style={{ cursor: 'pointer' }}
                  onClick={() => removeAttachment(index)}
                />
              </span>
            ))}
          </div>
        )}

        {spotlightModel && (
          <div className="model-spotlight-card" style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            marginBottom: '10px',
            padding: '12px 14px',
            borderRadius: '16px',
            background: isLight
              ? 'linear-gradient(135deg, #faf5ff 0%, #fff7ed 100%)'
              : 'linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(249,115,22,0.1) 100%)',
            border: isLight ? '1px solid #e9d5ff' : '1px solid rgba(167,139,250,0.35)',
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              background: isLight ? '#ffffff' : 'rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Sparkles size={18} color="#a855f7" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {spotlightModel.isUpdated ? 'Model updated' : 'New model'}
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: textColor, marginTop: '2px' }}>
                {spotlightModel.name}
              </div>
              <div style={{ fontSize: '0.78rem', color: subtextColor, marginTop: '4px', lineHeight: 1.45 }}>
                {spotlightModel.description || spotlightModel.specialty || 'Now available in Quantora\'s free model lineup.'}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (spotlightModel.selectable !== false) {
                    setSelectedModel(availableModels?.find((c) => c.id === spotlightModel.id) || spotlightModel);
                    setAutoSelectEnabled(false);
                  }
                  dismissModelSpotlight(spotlightModel.id);
                }}
                style={{
                  marginTop: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: '#f97316',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Try it →
              </button>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismissModelSpotlight(spotlightModel.id)}
              style={{ background: 'transparent', border: 'none', color: subtextColor, cursor: 'pointer', padding: '2px' }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Overlays — build/refine only; suggestions live in the chat thread */}
        <StudioPromptOverlays
          refineActive={refineActive}
          previewCode={previewCode}
          isGenerating={isGenerating}
          buildSplitDismissed={buildSplitDismissed}
          onNewBuild={() => setRefineActive(false)}
          onOpenSplit={() => setBuildSplitDismissed(false)}
        />

        {/* Prompt input pill — textarea + toolbar only */}
        <div className="floating-input-pill" style={{
          overflow: 'visible',
          position: 'relative',
          padding: '4px'
        }}>
          {/* Intelligent Router Suggestion Pill */}
          {suggestedModel?.model && !showMentionMenu && (
            <div style={{
              position: 'absolute',
              top: '-35px',
              left: '12px',
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 27, 75, 0.95) 100%)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(249, 115, 22, 0.4)',
              borderRadius: '20px',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
              zIndex: 10
            }}>
              <span style={{ fontSize: '0.75rem', color: '#e2e8f0', fontWeight: '500' }}>
                🧠 Auto Select: <strong style={{color: '#f97316'}}>{suggestedModel.model.name}</strong> is the best ready free model for this request.
              </span>
              <button
                onClick={() => { setSelectedModel(suggestedModel.model); setAutoSelectEnabled(false); setSuggestedModel(null); }}
                title={`Switch to ${suggestedModel.model.name} and pin it`}
                style={{ background: '#f97316', color: '#fff', border: 'none', borderRadius: '10px', padding: '3px 10px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                Change
              </button>
            </div>
          )}

          {/* Context Mention Floating Menu */}
          {showMentionMenu && (
            <div style={{
              position: 'absolute',
              bottom: 'calc(100% + 10px)',
              left: '12px',
              background: isLight ? '#ffffff' : '#0d1127',
              border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(139, 92, 246, 0.4)',
              borderRadius: '16px',
              padding: '8px',
              boxShadow: isLight ? '0 -10px 30px rgba(0,0,0,0.15)' : '0 -15px 40px rgba(0,0,0,0.6)',
              zIndex: 100,
              width: '280px'
            }}>
              <div style={{ fontSize: '0.7rem', color: subtextColor, padding: '6px 10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Tag Context
              </div>
              <div
                onClick={() => handleSelectMention('canvas', '@CanvasCode')}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '0.85rem',
                  color: textColor,
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = isLight ? '#f1f5f9' : 'rgba(139, 92, 246, 0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <Code2 size={16} color="#8b5cf6" />
                <div>
                  <div style={{ fontWeight: '600' }}>Current Canvas Code</div>
                  <div style={{ fontSize: '0.7rem', color: subtextColor }}>Ground AI in sandbox code</div>
                </div>
              </div>
              
              <div
                onClick={() => handleSelectMention('history', '@LastSession')}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '0.85rem',
                  color: textColor,
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = isLight ? '#f1f5f9' : 'rgba(139, 92, 246, 0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <MessageSquare size={16} color="#8b5cf6" />
                <div>
                  <div style={{ fontWeight: '600' }}>Last Session Context</div>
                  <div style={{ fontSize: '0.7rem', color: subtextColor }}>Read previous conversation</div>
                </div>
              </div>
            </div>
          )}

          {/* Text Area Input */}
          <div style={{ position: 'relative', padding: '8px 14px' }}>
            <StudioWandStatus
              isPolishing={isEnhancingPrompt}
              undo={wandPolishUndo}
              error={wandPolishError}
              isLight={isLight}
              onUndo={revertWandPolish}
              onShorter={wandPolishUndo ? () => runEnhance(wandPolishUndo.original, 'lighter') : undefined}
              onMoreDetail={wandPolishUndo ? () => runEnhance(wandPolishUndo.original, 'deeper') : undefined}
              onRetry={wandPolishError ? () => runEnhance(inputText, 'auto') : undefined}
              onDismissError={() => setWandPolishError(null)}
            />
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={handleInputTextChange}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowMentionsList(false);
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                  e.target.style.height = 'auto';
                }
              }}
              onPaste={handlePaste}
              placeholder={getPromptPlaceholder({
                studioMode,
                studioDomain,
                boundRepoName: boundRepo?.name,
              })}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: textColor,
                fontSize: '0.94rem',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                lineHeight: '1.45',
                minHeight: '36px',
                maxHeight: '280px',
                overflow: 'auto'
              }}
            />
          </div>

          {/* Bottom Action Toolbar — single Fellow-style row */}
          <div className="studio-prompt-toolbar">
            <div className="studio-prompt-toolbar__left">
              <div ref={studioToolsMenuRef} className="studio-tools-anchor">
                <button
                  type="button"
                  className={`studio-tool-trigger${(studioDomain || studioMode !== 'ask') ? ' is-active' : ''}${showStudioToolsMenu ? ' is-open' : ''}`}
                  onClick={() => setShowStudioToolsMenu((v) => !v)}
                  title="Focus area and response type"
                  aria-expanded={showStudioToolsMenu}
                  aria-haspopup="menu"
                >
                  <SlidersHorizontal size={17} strokeWidth={2.2} />
                  {(studioDomain || studioMode !== 'ask') && (
                    <span className="studio-tool-trigger__label">
                      {activeDomainMeta ? activeDomainMeta.label : getOutputModeLabel(studioMode)}
                    </span>
                  )}
                </button>
                {showStudioToolsMenu && (
                  <StudioToolsMenu
                    isLight={isLight}
                    studioDomain={studioDomain}
                    studioMode={studioMode}
                    onSelectDomain={(domain) => { setStudioDomain(domain); setShowStudioToolsMenu(false); }}
                    onSelectMode={(mode) => { setStudioMode(mode); setShowStudioToolsMenu(false); }}
                  />
                )}
              </div>

              <span className="studio-prompt-toolbar__sep" aria-hidden="true" />

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                multiple
              />

              <button
                type="button"
                className={`studio-prompt-icon-btn${isListening ? ' is-recording' : ''}`}
                onClick={toggleVoiceInput}
                title="Voice Input"
                style={isListening ? { color: '#ef4444', background: 'rgba(239, 68, 68, 0.15)', animation: 'pulse 2s infinite' } : undefined}
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              
              {/* Attachment Dropdown */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className={`studio-prompt-icon-btn${isAttachmentMenuOpen ? ' is-active' : ''}`}
                  onClick={() => setIsAttachmentMenuOpen(!isAttachmentMenuOpen)}
                  title="Attach file, image, or GitHub"
                >
                  <Paperclip size={18} />
                </button>

                {isAttachmentMenuOpen && (
                  <>
                    {/* Backdrop to close menu */}
                    <div 
                      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }} 
                      onClick={() => setIsAttachmentMenuOpen(false)} 
                    />
                    
                    {/* Dropdown Menu */}
                    <div style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: '0',
                      marginBottom: '8px',
                      background: isLight ? '#ffffff' : '#1e293b',
                      border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                      padding: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      minWidth: '200px',
                      zIndex: 101
                    }}>
                      <button 
                        onClick={() => { fileInputRef.current?.click(); setIsAttachmentMenuOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'transparent', border: 'none', color: textColor, cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s', fontSize: '0.9rem', textAlign: 'left' }}
                        onMouseEnter={e => e.currentTarget.style.background = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <FileText size={16} color="#3b82f6" /> Add a File
                      </button>
                      
                      <button 
                        onClick={() => { 
                          if (fileInputRef.current) {
                            fileInputRef.current.accept = "image/*";
                            fileInputRef.current.click();
                            setTimeout(() => { if (fileInputRef.current) fileInputRef.current.accept = ""; }, 1000);
                          }
                          setIsAttachmentMenuOpen(false); 
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'transparent', border: 'none', color: textColor, cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s', fontSize: '0.9rem', textAlign: 'left' }}
                        onMouseEnter={e => e.currentTarget.style.background = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <ImageIcon size={16} color="#10b981" /> Image
                      </button>

                      <div style={{ height: '1px', background: isLight ? '#e2e8f0' : 'rgba(255,255,255,0.1)', margin: '4px 0' }} />

                      <button 
                        onClick={() => { setIsGithubModalOpen(true); setIsAttachmentMenuOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'transparent', border: 'none', color: textColor, cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s', fontSize: '0.9rem', textAlign: 'left' }}
                        onMouseEnter={e => e.currentTarget.style.background = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <Github size={16} color={isLight ? "#334155" : "#e2e8f0"} /> Connect to Github
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Magic Wand Enhancer */}
              <div ref={wandAnchorRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  className={`studio-prompt-icon-btn${isEnhancingPrompt ? ' is-active' : ''}${wandHintOpen ? ' is-active' : ''}`}
                  onClick={handleMagicWandEnhance}
                  disabled={isEnhancingPrompt}
                  title={inputText.trim() ? 'Polish your prompt' : 'Type a rough idea first'}
                >
                  {isEnhancingPrompt ? <RefreshCw size={16} className="animate-spin" /> : <Wand2 size={18} />}
                </button>
                <StudioWandHint
                  isOpen={wandHintOpen}
                  isLight={isLight}
                  textColor={textColor}
                  subtextColor={subtextColor}
                  onClose={() => setWandHintOpen(false)}
                  onPickTemplate={handleWandTemplatePick}
                />
              </div>
            </div>

            <div className="studio-prompt-toolbar__right">
              {/* Engine Settings Popover */}
              <div ref={inBarModelRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowInBarModelDropdown(!showInBarModelDropdown)}
                  title="Select AI Engine"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: showInBarModelDropdown ? (isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.1)') : 'transparent',
                    border: 'none',
                    color: showInBarModelDropdown ? '#f97316' : subtextColor,
                    padding: '4px 10px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}
                >
                  <Cpu size={15} color={showInBarModelDropdown ? "#f97316" : subtextColor} />
                  <span>{autoSelectEnabled ? 'Auto' : (selectedModel ? selectedModel.name.split(' ')[0] : 'Engine')}</span>
                  <ChevronDown size={13} color={showInBarModelDropdown ? "#f97316" : subtextColor} />
                </button>

                {showInBarModelDropdown && (
                  <div style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 10px)',
                    left: 0,
                    width: '300px',
                    maxHeight: '400px',
                    overflowY: 'auto',
                    background: isLight ? '#ffffff' : '#0d1127',
                    border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(249, 115, 22, 0.4)',
                    borderRadius: '16px',
                    padding: '12px',
                    boxShadow: isLight ? '0 -10px 30px rgba(0,0,0,0.15)' : '0 -15px 40px rgba(0,0,0,0.6)',
                    zIndex: 900,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                  }}>
                    {/* Cognitive Effort Control (Inside Popover) */}
                    <div>
                      <div style={{ fontSize: '0.7rem', color: subtextColor, marginBottom: '8px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Cognitive Effort
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', background: isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', padding: '4px', border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.1)' }}>
                        {['Lightning', 'Balanced', 'Deep Think'].map(level => (
                          <button
                            key={level}
                            onClick={() => setCognitiveLevel(level)}
                            style={{
                              flex: 1,
                              background: cognitiveLevel === level ? (isLight ? '#ffffff' : 'rgba(249, 115, 22, 0.2)') : 'transparent',
                              color: cognitiveLevel === level ? '#f97316' : subtextColor,
                              border: 'none',
                              padding: '6px 0',
                              borderRadius: '8px',
                              fontSize: '0.72rem',
                              fontWeight: cognitiveLevel === level ? '700' : '500',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              boxShadow: cognitiveLevel === level && isLight ? '0 2px 6px rgba(0,0,0,0.05)' : 'none'
                            }}
                          >
                            {level === 'Lightning' && '⚡ '}{level === 'Deep Think' && '🧠 '}{level}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* AI Model Control (Inside Popover) */}
                    <div>
                      <div style={{ fontSize: '0.7rem', color: subtextColor, marginBottom: '8px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        AI Model
                      </div>
                      {/* Explicit Auto-Select toggle: on = pick best free model
                          per request; off = use the model chosen below. Picking
                          any model also flips this off. */}
                      <div
                        onClick={() => setAutoSelectEnabled(v => !v)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', marginBottom: '6px', borderRadius: '8px', cursor: 'pointer', background: autoSelectEnabled ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.15)') : (isLight ? '#f1f5f9' : 'rgba(255,255,255,0.05)') }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: autoSelectEnabled ? '#f97316' : textColor }}>Auto-Select</span>
                          <span style={{ fontSize: '0.66rem', color: subtextColor }}>Best ready free model per request</span>
                        </div>
                        <div style={{ width: '34px', height: '20px', borderRadius: '999px', background: autoSelectEnabled ? '#f97316' : (isLight ? '#cbd5e1' : '#334155'), position: 'relative', transition: 'all 0.2s', flexShrink: 0 }}>
                          <div style={{ position: 'absolute', top: '2px', left: autoSelectEnabled ? '16px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'all 0.2s' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {availableModels && availableModels.map(model => {
                          const isAvailable = model.available !== false;
                          
                          return (
                          <div
                            key={model.id}
                            onClick={() => {
                              if (isAvailable) {
                                setAutoSelectEnabled(false);
                                setSelectedModel(model);
                                setShowInBarModelDropdown(false);
                              }
                            }}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '8px',
                              cursor: isAvailable ? 'pointer' : 'not-allowed',
                              background: selectedModel?.id === model.id ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.15)') : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '0.8rem',
                              color: isAvailable ? (selectedModel?.id === model.id ? '#f97316' : textColor) : subtextColor,
                              fontWeight: selectedModel?.id === model.id ? '700' : '500',
                              opacity: isAvailable ? 1 : 0.6,
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              if (isAvailable && selectedModel?.id !== model.id) {
                                e.currentTarget.style.background = isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.05)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (selectedModel?.id !== model.id) e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: !isAvailable ? 'line-through' : 'none' }}>{model.name}</span>
                              <span style={{ fontSize: '0.68rem', color: subtextColor, fontWeight: '400' }}>{model.provider || (model.id.startsWith('gemini') ? 'Google' : 'OpenRouter')}</span>
                            </div>
                            {selectedModel?.id === model.id && (
                              <span style={{ fontSize: '0.65rem', background: '#f97316', color: '#fff', padding: '2px 6px', borderRadius: '10px', flexShrink: 0 }}>Active</span>
                            )}
                            {!isAvailable && (
                              <span style={{ fontSize: '0.65rem', background: isLight ? '#cbd5e1' : '#334155', color: isLight ? '#64748b' : '#94a3b8', padding: '2px 6px', borderRadius: '10px', flexShrink: 0 }}>Unavailable</span>
                            )}
                          </div>
                        )})}
                      </div>
                    </div>
                  </div>
                )}
              </div>



              {/* Web Grounding Chip */}
              <button
                onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                title={webSearchEnabled ? "Live Web Search Enabled" : "Enable Web Search Grounding"}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: webSearchEnabled ? 'rgba(2, 132, 199, 0.15)' : (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)'),
                  border: webSearchEnabled ? '1px solid rgba(2, 132, 199, 0.3)' : '1px solid transparent',
                  color: webSearchEnabled ? '#0ea5e9' : subtextColor,
                  padding: '6px 12px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  marginLeft: '8px'
                }}
                onMouseEnter={e => {
                  if (!webSearchEnabled) {
                    e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)';
                  }
                }}
                onMouseLeave={e => {
                  if (!webSearchEnabled) {
                    e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)';
                  }
                }}
              >
                <Globe size={16} /> 
                {webSearchEnabled ? 'Grounded' : 'Web Grounding'}
              </button>

              <button
                type="button"
                className={`studio-send-btn${(inputText.trim() || attachments.length) ? ' is-ready' : ''}`}
                onClick={() => handleSendMessage()}
                disabled={(!inputText.trim() && !attachments.length) || isGenerating}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>

      </div>
      </div>
      </div>

      {showBuildSplit && (
        <StudioBuildSplit
          code={previewCode}
          isLight={isLight}
          user={user}
          onRequireAuth={onOpenAuth}
          suggestedProjectName={activeSession?.title?.slice(0, 40) || 'quantora-app'}
          onClose={() => setBuildSplitDismissed(true)}
          onExpand={() => openCanvasWithCode(previewCode)}
          onPublishComplete={() => emitQuantora(QUANTORA_EVENTS.PUBLISH_COMPLETED)}
          onShareComplete={() => emitQuantora(QUANTORA_EVENTS.PREVIEW_SHARED)}
        />
      )}

      {/* Background sandbox verification — runs before the preview button unlocks. */}
      {backgroundVerify && !canvasOpen && (
        <div style={{ position: 'fixed', left: '-10000px', top: 0, width: '480px', height: '480px', overflow: 'hidden', pointerEvents: 'none' }} aria-hidden="true">
          <LivePreviewCanvas
            headless
            verifyOnly
            code={backgroundVerify.code}
            isLight={isLight}
            onVerificationStatusChange={handleBackgroundVerificationStatus}
            onClose={() => setBackgroundVerify(null)}
          />
        </div>
      )}

      {/* Live Preview — fixed overlay above app chrome (z-index 20000). */}
      {canvasOpen && createPortal((
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Live Preview"
          className={`preview-overlay${canvasFullscreen ? ' preview-overlay--fullscreen' : ''}`}
          style={{
            background: canvasFullscreen ? (isLight ? '#f8fafc' : '#0d1127') : undefined,
          }}
        >
          <div className={`preview-overlay-panel${canvasFullscreen ? ' preview-overlay-panel--fullscreen' : ''}`} style={{
            background: isLight ? '#f8fafc' : '#0d1127',
            borderRadius: canvasFullscreen ? 0 : '20px',
            border: canvasFullscreen ? 'none' : (isLight ? '1px solid #cbd5e1' : '1px solid rgba(249, 115, 22, 0.5)'),
            boxShadow: canvasFullscreen ? 'none' : '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          }}>
            <div
              className="preview-overlay-chrome"
              style={{
              borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)',
              background: isLight ? '#ffffff' : '#1e293b',
            }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: isLight ? '#334155' : '#e2e8f0' }}>
                Live Preview
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={togglePreviewFullscreen}
                  style={{
                    background: 'transparent',
                    border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.15)',
                    color: isLight ? '#64748b' : '#cbd5e1',
                    borderRadius: '10px',
                    padding: '6px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {canvasFullscreen ? 'Exit full screen' : 'Full screen'}
                </button>
                <button
                  type="button"
                  onClick={closePreviewModal}
                  title="Close preview (Esc)"
                  aria-label="Close preview"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                    border: 'none',
                    color: '#ffffff',
                    borderRadius: '10px',
                    padding: '8px 14px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(249, 115, 22, 0.35)',
                  }}
                >
                  <X size={16} /> Close
                </button>
              </div>
            </div>
            <div className="preview-overlay-body">
              <LivePreviewCanvas
                code={previewCode}
                isLight={isLight}
                isFullscreen={canvasFullscreen}
                hideHeader
                user={user}
                onRequireAuth={onOpenAuth}
                suggestedProjectName={activeSession?.title || 'quantora-app'}
                onToggleFullscreen={togglePreviewFullscreen}
                onClose={closePreviewModal}
                onPublishComplete={(result) => {
                  if (result?.url) {
                    emitQuantora(QUANTORA_EVENTS.PUBLISH_COMPLETED, { publishUrl: result.url });
                  }
                }}
                onShareComplete={(result) => {
                  if (result?.url) {
                    emitQuantora(QUANTORA_EVENTS.PREVIEW_SHARED, { shareUrl: result.url });
                  }
                }}
              />
            </div>
          </div>
        </div>
      ), document.body)}

      {/* Right Panel: Interactive Code Canvas (Pillar 1) */}
      {isWorkspaceMode && (
        <div style={{
          flex: 1,
          background: isLight ? '#ffffff' : '#0d1127',
          border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: isLight ? '0 10px 40px rgba(0,0,0,0.05)' : '0 20px 60px rgba(0,0,0,0.4)',
          animation: 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          position: 'relative'
        }}>
          {/* Canvas Header (File Tabs) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: isLight ? '#f8fafc' : '#0a0d1e',
            borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)',
            padding: '0 16px',
            height: '48px',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', gap: '4px', height: '100%' }}>
              {['App.jsx', 'styles.css', 'package.json'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setWorkspaceActiveTab(tab)}
                  style={{
                    background: workspaceActiveTab === tab ? (isLight ? '#ffffff' : '#0d1127') : 'transparent',
                    border: 'none',
                    color: workspaceActiveTab === tab ? '#f97316' : subtextColor,
                    padding: '0 16px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: workspaceActiveTab === tab ? '600' : '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    height: '100%',
                    borderTop: workspaceActiveTab === tab ? '2px solid #f97316' : '2px solid transparent',
                    borderLeft: workspaceActiveTab === tab && isLight ? '1px solid #e2e8f0' : '1px solid transparent',
                    borderRight: workspaceActiveTab === tab && isLight ? '1px solid #e2e8f0' : '1px solid transparent',
                    borderBottom: 'none',
                    transition: 'all 0.2s ease',
                    marginTop: 'auto'
                  }}
                >
                  {tab.includes('.jsx') ? <Code2 size={14} /> : <FileText size={14} />}
                  {tab}
                </button>
              ))}
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => { try { navigator.clipboard.writeText(workspaceCode || ''); } catch (e) {} }}
                title="Copy code"
                style={{ background: 'transparent', border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.15)', color: subtextColor, padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Copy size={12} /> Copy
              </button>
              <button
                onClick={() => { if (workspaceCode && workspaceCode.trim()) openCanvasWithCode(workspaceCode); }}
                title="Render this code in the Live Canvas"
                style={{ background: 'transparent', border: '1px solid rgba(249, 115, 22, 0.3)', color: '#f97316', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: workspaceCode && workspaceCode.trim() ? 'pointer' : 'not-allowed', opacity: workspaceCode && workspaceCode.trim() ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Play size={12} /> Preview App
              </button>
              <button
                onClick={() => setIsWorkspaceMode(false)}
                style={{ background: 'transparent', border: 'none', color: subtextColor, cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Canvas Editor Area (Pillar 4: Predictive Assist) */}
          <div style={{ flex: 1, overflow: 'auto', background: '#0d1127', padding: '24px', position: 'relative' }}>
             {/* Line Numbers */}
             <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '48px', background: '#0a0d1e', borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '24px', color: 'rgba(255,255,255,0.2)', fontSize: '0.85rem', fontFamily: 'monospace', userSelect: 'none', zIndex: 10 }}>
                {Array.from({ length: Math.max(20, (workspaceCode.match(/\n/g) || []).length + 2) }).map((_, i) => (
                  <div key={i} style={{ lineHeight: '1.6' }}>{i + 1}</div>
                ))}
             </div>
             
             {/* Textarea for actual input */}
             <textarea
                value={workspaceCode}
                onChange={handleCodeChange}
                onKeyDown={handleCodeKeyDown}
                spellCheck="false"
                style={{
                  position: 'absolute',
                  top: '24px',
                  left: '60px',
                  width: 'calc(100% - 84px)',
                  height: 'calc(100% - 48px)',
                  background: 'transparent',
                  color: 'transparent',
                  caretColor: '#e2e8f0',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  fontFamily: '"Fira Code", monospace',
                  fontSize: '0.9rem',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  zIndex: 2,
                  margin: 0,
                  padding: 0
                }}
             />
             
             {/* Syntax Highlighted & Ghost Text Layer */}
             <pre style={{
                position: 'absolute',
                top: '24px',
                left: '60px',
                width: 'calc(100% - 84px)',
                pointerEvents: 'none',
                margin: 0,
                padding: 0,
                fontFamily: '"Fira Code", monospace',
                fontSize: '0.9rem',
                lineHeight: '1.6',
                color: '#e2e8f0',
                outline: 'none',
                whiteSpace: 'pre-wrap',
                zIndex: 1
             }}>
                {workspaceCode}
                {ghostText && <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>{ghostText}</span>}
                {!workspaceCode && <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>{'// Quantora FX Interactive Canvas\n// Start typing or tell Quantora to build something...'}</span>}
             </pre>
          </div>
        </div>
      )}

      {/* GitHub Import Modal */}
      {isGithubModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            background: isLight ? '#ffffff' : '#0f172a',
            border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '24px',
            width: '90%',
            maxWidth: '480px',
            padding: '32px',
            boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
            position: 'relative'
          }}>
            <button
              onClick={() => setIsGithubModalOpen(false)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'transparent',
                border: 'none',
                color: subtextColor,
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              <X size={20} />
            </button>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(249, 115, 22, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f97316' }}>
                <Github size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800', color: textColor }}>Connect Repository</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: subtextColor }}>Bind this repo to the chat — every message will include relevant codebase context.</p>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: textColor, marginBottom: '8px' }}>GitHub Repository URL</label>
              <input
                type="text"
                value={githubRepoUrl}
                onChange={(e) => setGithubRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                disabled={isFetchingGithub}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.2)',
                  background: isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.05)',
                  color: textColor,
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#f97316'}
                onBlur={(e) => e.target.style.borderColor = isLight ? '#cbd5e1' : 'rgba(255, 255, 255, 0.2)'}
              />
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: textColor, marginBottom: '8px' }}>Focus area <span style={{ fontWeight: 500, color: subtextColor }}>(optional)</span></label>
              <textarea
                value={githubChangeRequest}
                onChange={(e) => setGithubChangeRequest(e.target.value)}
                placeholder="For example: Explain the auth flow, or review the API layer"
                disabled={isFetchingGithub}
                rows={4}
                maxLength={2000}
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: '12px', resize: 'vertical',
                  border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.2)',
                  background: isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.05)', color: textColor,
                  fontSize: '0.95rem', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box'
                }}
              />
              <div style={{ marginTop: '8px', fontSize: '0.78rem', color: '#10b981', fontWeight: '600' }}>
                Read-only preview — Quantora will not modify your repository.
              </div>
              {githubError && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '8px', fontWeight: '500' }}>{githubError}</div>}
            </div>

            <button
              onClick={handleImportGithub}
              disabled={isFetchingGithub || !githubRepoUrl}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                background: isFetchingGithub ? '#94a3b8' : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                color: '#fff',
                border: 'none',
                fontWeight: '700',
                fontSize: '1rem',
                cursor: (isFetchingGithub || !githubRepoUrl) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: (isFetchingGithub || !githubRepoUrl) ? 'none' : '0 4px 14px rgba(249, 115, 22, 0.3)',
                transition: 'all 0.2s ease'
              }}
            >
              {isFetchingGithub ? (
                <><RefreshCw size={18} className="animate-spin" /> Connecting repository...</>
              ) : (
                <><Github size={18} /> Connect to this chat</>
              )}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
