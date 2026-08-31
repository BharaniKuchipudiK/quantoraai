import { extractRunnableCode, assembleStudioPreview, applyWorkspaceFromChat, applyDeskReviewPatch, canOpenStudioPreviewPane, messageHasExtractableWorkspaceCode, runningPreviewCode, writeHealedPreviewToVfs, ensureShopDeskInVfs, userAskedForPreviewPhotos, userAskedForSemanticPhotoEdit, userAskedForShopDeskFix, userAskedForDeskReview, vfsLooksLikeShop, previewAssemblyFingerprint } from '../lib/studio-preview-helpers.js';
import { deferredWriteStillValid, resolveDeskSaveTarget } from '../lib/desk-session-ownership.js';
import { pickPreviewEntry } from '../lib/preview-utils.js';
import { deskCommitRegressesPreview } from '../lib/desk-commit-guard.js';
import { deskShellVfs } from '../lib/studio-workspace-tree.js';
import { resolveMessageActions } from '../lib/message-actions.js';
import { getChatDisplayText, stripArtifactFromChatDisplay } from '../lib/build-communication.js';
import { deskChatClaimWasFiltered, filterDeskChatClaims } from '../lib/desk-chat-claim-filter.js';
import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { Sparkles, Send, Play, Code2, Minimize2, ArrowUpRight, Search, Copy, Workflow, RefreshCw, Cpu, Layers, MessageSquare, Terminal, Calculator, Music, Smartphone, Plus, Globe, ChevronDown, ChevronUp, Paperclip, X, Lightbulb, FileText, Image as ImageIcon, Activity, FolderPlus, Smile, Utensils, PieChart, Atom, Sun, Wand2, Trash2, PanelLeft, PanelLeftClose, Info, Settings, Mic, MicOff, Github, Layout, Check, Square , ThumbsUp, ThumbsDown, List, MoreHorizontal, Volume2, Flag, GitBranch, Clock, Rocket, Link2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import PlainCodeBlock from './PlainCodeBlock.jsx';
import LivePreviewCanvas from './LivePreviewCanvas';
import StudioInlineSuggestions from './StudioInlineSuggestions';
import { detectOutcomeGaps, injectGapContinues, filterContinuesForOffice, filterContinuesForAdvisor } from '../lib/outcome-gap-detection.js';
import { resolveStudioPartnerStatus, studioPreviewRunLabel, assistantClaimsImagesReady, assistantClaimsShopUiReady, previewShellIsWarming } from '../lib/studio-partner-status.js';
import { assessShopBuildAsk, shopPhotoTurnFailureCopy, messageLooksLikeShopBuild } from '../lib/shop-catalog-scale.js';
import { buildStudioJobCard, studioJobCardLabel } from '../lib/studio-job-card.js';
import { deriveSessionResume, deriveStudioMission, isResumeSession } from '../lib/studio-mission.js';
import { learnFromChipSelection } from '../lib/communication-intelligence.js';
import { canOfferVercelPublish } from '../lib/preview-publish-policy.js';
import StudioMissionCard from './StudioMissionCard';
import StudioToolsMenu from './StudioToolsMenu';
import {
  PINNED_DESK_TAB,
  closeDeskTab,
  nextDeskTab,
  openDeskTab,
  pruneDeskTabs,
} from '../lib/desk-tabs.js';
import { deskLadderChipColors, deskLadderChipLabel, deskLadderStatus, deskLadderSummary } from '../lib/desk-ladder-status.js';
import {
  GITHUB_IMPORT_ENDPOINT,
  buildGithubImportRequestBody,
  readGithubApiJson,
} from '../lib/github-import.js';
import { buildStudioDeskSnapshot, restoreStudioDeskSnapshot } from '../lib/studio-desk-snapshot.js';
import { buildDeskContextPacket, mergeLiveDeskProbe, describeMissingShopUi } from '../lib/studio-desk-context.js';
import { describePatchFailures } from '../lib/diff-patcher.js';
import { describeEmptyFenceKept } from '../lib/vfs-parser.js';
import { advanceBuildJob, buildJobIsComplete, describeBuildJob, readPlanMarker } from '../lib/build-job.js';
import { CODING_DESK_AUTO_MODEL, isCodingDeskAutoSelection } from '../lib/coding-desk-auto-model.js';
import { diffVfsReview, mergeDeskReview } from '../lib/studio-file-review.js';
import { newThreadLabel } from '../lib/advisor-thread.js';
import { STUDIO_PLUS_ACTION, resolveStudioPlusAction } from '../lib/studio-tools-menu.js';
import { wantsStudyLab } from '../lib/study-pictures.js';
import {
  applyStudySyllabusOverlay,
  inferStudySyllabus,
  shouldShowStudySyllabusChips,
  STUDY_SYLLABUS_CHIPS,
  studySyllabusContinueSet,
  studySyllabusHaystack,
} from '../lib/study-syllabus-overlay.js';
import StudioDecisionModal from './StudioDecisionModal';
import { shouldShowAssistantDecisionCard } from '../lib/studio-choices.js';
import { useChatStream } from '../hooks/useChatStream';
import { planFromMessageSnapshot } from '../lib/coding-turn-skills.js';
import { proveCodingTurn, codingTurnMayClaimSuccess } from '../lib/proof-control-plane.js';
import { usePCLMemory } from '../hooks/usePCLMemory';
import { useStudioSession } from '../hooks/useStudioSession.js';
import {
  loadStudioSidebarSections,
  persistStudioSidebarSections,
  studioSidebarFrameStyle,
  studioSidebarHistoryHint,
  studioSidebarHistoryListStyle,
  studioSidebarHistoryPaneStyle,
  studioSidebarHistoryTitle,
  studioSidebarMembershipCopy,
  studioSidebarYieldingSectionStyle,
  relativeChatTime,
  filterChatSessions,
  chatSearchEmptyCopy,
} from '../lib/studio-sidebar.js';
import { useProfileAvatar } from '../hooks/useProfileAvatar.js';
import VerifiedMediaLink from './VerifiedMediaLink.jsx';
import TravelPlaceLink from './TravelPlaceLink.jsx';
import StudyMarkdown from './StudyMarkdown.jsx';
import FinanceBoard from './FinanceBoard.jsx';
import { deriveFinanceBrief } from '../lib/finance-board-brief.js';
import { travelPlacePreviewHtml } from '../lib/travel-place-shortlist.js';
import { studioDomainPolicy, canAutoOpenCodeWorkspace, canExplicitlyPreviewCode } from '../lib/studio-domain-policy.js';
import { detectOfficeIntent, isPresentationIntent as detectSlideDeck } from '../lib/office-intent.js';
import { activeOfficeArtifact } from '../lib/office-briefing.js';
import { downloadOfficeArtifact, resolveOfficeDownloadPayload } from '../lib/office-artifact-cache.js';
import { normalizeDeck, hasSlideHtml } from '../lib/deck-builder.js';
import { shouldApplyPromptPolishResult } from '../lib/prompt-polish-guard.js';
import { shouldKeepWorkspaceForPrompt } from '../lib/workspace-intent.js';
import { recordClientBoundary } from '../lib/transaction-trace.js';
import { sessionHandoverLabel, describeSessionHandover } from '../lib/session-continuity.js';
import { studyAwaitsAnswer } from '../lib/study-conversation-loop.js';
import { deriveStudyTutorBrief } from '../lib/study-tutor-brief.js';
import { withoutPrivateStudyInstructions } from '../lib/study-private-instructions.js';
import {
  isStudioSplitMobile,
  loadChatWidthPct,
  loadFilesWidthPx,
  maxChatWidthPctForShell,
  saveChatWidthPct,
  saveFilesWidthPx,
} from '../lib/studio-split-layout.js';

const StudioFileTree = lazy(() => import('./StudioFileTree.jsx'));
const StudioTerminal = lazy(() => import('./StudioTerminal.jsx'));
const StudioGit = lazy(() => import('./StudioGit.jsx'));
const StudioPreviewControls = lazy(() => import('./StudioPreviewControls.jsx'));
const StudioActivityRail = lazy(() => import('./StudioActivityRail.jsx'));
const StudioTabBar = lazy(() => import('./StudioTabBar.jsx'));
const StudioFileFinder = lazy(() => import('./StudioFileFinder.jsx'));
const WorkspaceCodeEditor = lazy(() => import('./WorkspaceCodeEditor.jsx'));
const StudyTutorWorkspace = lazy(() => import('./StudyTutorWorkspace.jsx'));
// Only a travel thread ever renders the trip board, and code-highlight-browser-gate
// holds the desk entry chunk to 300 KB gzipped. Loading it on demand keeps a
// travel-only surface off every other desk's download.
const TravelTripBoard = lazy(() => import('./TravelTripBoard.jsx'));

// A short human title for a generated deck, taken from the first user prompt.
const deriveDeckTitle = (messages) => {
  const firstUser = (messages || []).find((m) => m.sender === 'user' && m.text);
  const t = (firstUser?.text || 'Presentation').replace(/\s+/g, ' ').trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
};
const LiveIosCalculator = lazy(() => import('./interactive/LiveIosCalculator'));
const LiveBeatMaker = lazy(() => import('./interactive/LiveBeatMaker'));
const LiveQuantumSimulator = lazy(() => import('./interactive/LiveQuantumSimulator'));
// Graphic Brand Logo Renderer for Tech Stack Pills
function TechLogo({ name }) {
  switch (name) {
    case 'React':
      return (
        <svg width="15" height="15" viewBox="-11.5 -10.2 23 20.4" fill="none">
          <circle cx="0" cy="0" r="2.05" fill="#61DAFB"/>
          <g stroke="#61DAFB" strokeWidth="1" fill="none">
            <ellipse rx="11" ry="4.2"/>
            <ellipse rx="11" ry="4.2" transform="rotate(60)"/>
            <ellipse rx="11" ry="4.2" transform="rotate(120)"/>
          </g>
        </svg>
      );
    case 'Next.js':
      return (
        <svg width="15" height="15" viewBox="0 0 180 180" fill="none">
          <circle cx="90" cy="90" r="85" fill="#000" stroke="#888" strokeWidth="8"/>
          <path d="M149.5 157.5L69.1 54H54V126H67.5V70.9L138.2 162.2C142.2 160.8 146 159.2 149.5 157.5Z" fill="#fff"/>
          <rect x="115.5" y="54" width="13.5" height="72" fill="#fff"/>
        </svg>
      );
    case 'Go':
      return (
        <svg width="18" height="11" viewBox="0 0 100 50" fill="none">
          <path d="M 25,5 C 12,5 4,16 4,30 C 4,44 12,55 25,55 C 35,55 42,48 44,38 L 25,38 L 25,28 L 54,28 C 55,31 55,34 55,38 C 55,52 44,62 25,62 C 8,62 0,48 0,30 C 0,12 8,0 25,0 C 37,0 48,8 51,18 L 41,23 C 38,13 31,5 25,5 Z" fill="#00ADD8"/>
          <path d="M 95,30 C 95,48 82,58 66,58 C 50,58 37,48 37,30 C 37,12 50,2 66,2 C 82,2 95,12 95,30 Z M 50,30 C 50,42 56,50 66,50 C 76,50 82,42 82,30 C 82,18 76,10 66,10 C 56,10 50,18 50,30 Z" fill="#00ADD8"/>
        </svg>
      );
    case 'Python':
      return (
        <svg width="15" height="15" viewBox="0 0 110 110" fill="none">
          <path d="M51.6 3C27.8 3 29.1 13.3 29.1 13.3l.1 10.4h23.2v3.3H19.7S3 24.3 3 48.1c0 23.8 14.5 22.9 14.5 22.9h8.7V58.7s-.5-14.8 14.8-14.8h22.8V21.1S55.2 3 51.6 3zm-11 7.2a3.3 3.3 0 1 1 0 6.6 3.3 3.3 0 0 1 0-6.6z" fill="#3776AB"/>
          <path d="M58.4 107c23.8 0 22.5-10.3 22.5-10.3l-.1-10.4H57.6v-3.3h32.7s16.7 2.7 16.7-21.1c0-23.8-14.5-22.9-14.5-22.9h-8.7v12.3s.5 14.8-14.8 14.8H56.2v22.8s-1.4 18.1 2.2 18.1zm11-7.2a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6z" fill="#FFD43B"/>
        </svg>
      );
    case 'Flutter':
      return (
        <svg width="14" height="14" viewBox="0 0 100 100" fill="none">
          <path d="M58 8L15 51L28 64L85 8H58Z" fill="#42A5F5"/>
          <path d="M58 51L34 75L47 88L85 51H58Z" fill="#0D47A1"/>
          <path d="M34 75L58 51H85L47 88.5L34 75Z" fill="#167EE6"/>
        </svg>
      );
    case 'Gemini AI':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M12 0C12 6.627 6.627 12 0 12C6.627 12 17.373 12 24 12C17.373 12 12 6.627 12 0Z" fill="url(#gemini_grad_pill)"/>
          <defs>
            <linearGradient id="gemini_grad_pill" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f97316"/>
              <stop offset="0.5" stopColor="#ec4899"/>
              <stop offset="1" stopColor="#3b82f6"/>
            </linearGradient>
          </defs>
        </svg>
      );
    case 'Angular':
      return (
        <svg width="15" height="15" viewBox="0 0 250 250" fill="none">
          <polygon points="125,30 31.9,63.2 46.1,186.3 125,230 203.9,186.3 218.1,63.2" fill="#DD0031"/>
          <polygon points="125,30 125,52.2 125,153.4 175.3,178.5 188.5,95.7" fill="#C3002F"/>
          <polygon points="125,52.1 74.7,178.5 96.6,178.5 106.8,153.4 143.2,153.4 125,108" fill="#FFFFFF"/>
        </svg>
      );
    case 'Node.js':
      return (
        <svg width="15" height="15" viewBox="0 0 256 289" fill="none">
          <path d="M128 0L0 74v141l128 74 128-74V74L128 0z" fill="#5FA04E"/>
          <path d="M128 141.5V289l128-74V74L128 141.5z" fill="#43853D"/>
        </svg>
      );
    case 'Java':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M18.5 10.5C18.5 10.5 19 8.5 16 8.5C13 8.5 13 10 10.5 10C8 10 7.5 8.5 7.5 8.5M10.5 3C10.5 3 12.5 4.5 10.5 6C8.5 7.5 11.5 9 11.5 9M13.5 13.5C15.5 13.5 18 12.5 18 12.5M12 21C6.477 21 2 19.5 2 17.5C2 15.5 6.477 14 12 14C17.523 14 22 15.5 22 17.5C22 19.5 17.523 21 12 21Z" stroke="#ED8B00" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      );
    case '.NET':
      return (
        <svg width="16" height="14" viewBox="0 0 24 20" fill="none">
          <rect width="24" height="20" rx="4" fill="#512BD4"/>
          <text x="12" y="14" fontSize="10" fontWeight="800" fill="#fff" textAnchor="middle" fontFamily="sans-serif">.NET</text>
        </svg>
      );
    default:
      return <Sparkles size={13} color="#f97316" />;
  }
}

// Interactive Tech Stack Badge Component (Fixed width, no shaking)
function TechBadge({ tech, isLight, textColor, onSelect }) {
  const [hovered, setHovered] = useState(false);
  return (
    <span
      onClick={() => onSelect(`Build a ${tech} application starter template`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={tech}
      style={{
        fontSize: '0.76rem',
        fontWeight: '600',
        padding: '6px 12px',
        borderRadius: '10px',
        background: hovered
          ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.22)')
          : (isLight ? '#ffffff' : 'rgba(255, 255, 255, 0.08)'),
        color: hovered ? '#f97316' : textColor,
        cursor: 'pointer',
        border: hovered
          ? '1px solid #f97316'
          : (isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.12)'),
        whiteSpace: 'nowrap',
        transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        boxShadow: hovered ? '0 4px 12px rgba(249, 115, 22, 0.2)' : 'none'
      }}
    >
      <TechLogo name={tech} />
      <span style={{ fontWeight: '600' }}>{tech}</span>
    </span>
  );
}

// Interactive Quick Suggestion Chip Component (Fixed width, no shaking)
function QuickPromptChip({ chip, isLight, onSelect }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={() => onSelect(chip.prompt)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={chip.label}
      style={{
        background: hovered
          ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.22)')
          : (isLight ? '#ffffff' : 'rgba(255, 255, 255, 0.08)'),
        border: hovered
          ? '1px solid #f97316'
          : (isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.12)'),
        color: hovered ? '#f97316' : (isLight ? '#475569' : '#94a3b8'),
        padding: '6px 14px',
        borderRadius: '20px',
        fontSize: '0.78rem',
        fontWeight: '600',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        boxShadow: hovered ? '0 4px 12px rgba(249, 115, 22, 0.2)' : 'none'
      }}
    >
      {chip.iconType === 'currency' && <Globe size={15} color="#10b981" />}
      {chip.iconType === 'calc' && <Calculator size={15} color="#3b82f6" />}
      {chip.iconType === 'music' && <Music size={15} color="#d946ef" />}
      {chip.iconType === 'quantum' && <Atom size={15} color="#8b5cf6" />}
      {chip.iconType === 'weather' && <Sun size={15} color="#f59e0b" />}
      {chip.iconType === 'joke' && <Smile size={15} color="#f97316" />}
      {chip.iconType === 'recipe' && <Utensils size={15} color="#10b981" />}
      {chip.iconType === 'expense' && <PieChart size={15} color="#8b5cf6" />}

      <span style={{ fontWeight: '600' }}>{chip.label}</span>
    </button>
  );
}

const formatModelName = (name) => name ? name.replace(/\s*\(free\)/ig, '').trim() : '';

// Dual Arena (compare two models side-by-side) is a power-user experiment, not
// part of the clean, purposeful advisor surface — hidden across all workspaces.
// Flip to true to bring the toggle back; the arena code below stays intact.
const SHOW_DUAL_ARENA = false;

export default function AiStudio({ onOpenAuth, selectedModel, setSelectedModel, availableModels, onPushToCanvas, user, isLight, dreamNodes, setDreamNodes, setActiveTab, inputText: externalInputText, setInputText: setExternalInputText }) {
  // Chat Sessions & History Management (Claude / ChatGPT / Gemini style)
  const {
    storageFault,
    chatSessions,
    activeSessionId,
    setActiveSessionId,
    messages,
    updateActiveMessages,
    handleCreateNewChat,
    handleCreateHandoverChat,
    handleCreateAdvisorChat,
    handleDeleteChat,
    handleMoveChatToProject,
    projects,
    activeProjectId,
    activeProject,
    setActiveProjectId,
    handleCreateProject,
    projectContext,
    projectArtifacts,
    projectResume,
    studioDomain,
    setStudioDomain,
    openAdvisorWorkspace,
    forkChatFromMessage,
    conversationContext,
    updateActiveSession,
  } = useStudioSession({ user, selectedModel });

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarSections, setSidebarSections] = useState(() => loadStudioSidebarSections());
  const toggleSidebarSection = useCallback((key) => {
    setSidebarSections((prev) => persistStudioSidebarSections({ ...prev, [key]: !prev[key] }));
  }, []);
  const { avatarSrc: profileAvatarSrc } = useProfileAvatar(user);
  const [profileAvatarFailed, setProfileAvatarFailed] = useState(false);

  useEffect(() => {
    setProfileAvatarFailed(false);
  }, [profileAvatarSrc]);

  // Derive current session and messages
  const activeSession = chatSessions.find(s => s.id === activeSessionId) || chatSessions[0];
  const domainPolicy = studioDomainPolicy(studioDomain);

  const isAdvisorWorkspace = Boolean(domainPolicy.domain);

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
    const editingProjectFile = workspaceActiveTab !== 'preview' && workspaceActiveTab !== 'code' && workspaceActiveTab !== 'terminal' && workspaceActiveTab !== 'git' && vfs[workspaceActiveTab];
    if (editingProjectFile) {
      setVfs(prev => ({
        ...prev,
        [workspaceActiveTab]: { ...prev[workspaceActiveTab], content: val }
      }));
    } else {
      setWorkspaceCode(val);
    }
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
  const inputText = externalInputText !== undefined ? externalInputText : localInputText;
  const setInputText = setExternalInputText || setLocalInputText;
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCodeMap, setShowCodeMap] = useState({});
  const [cognitiveLevel, setCognitiveLevel] = useState('Balanced');
  const [suggestedModel, setSuggestedModel] = useState(null);
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [openActionMenuId, setOpenActionMenuId] = useState(null);

  const [showScrollUp, setShowScrollUp] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    setShowScrollUp(scrollTop > 100);
    setShowScrollDown(scrollHeight - scrollTop - clientHeight > 10);
  };

  const [showMentionMenu, setShowMentionMenu] = useState(false);

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isGenerating]);

  const handleInputTextChange = (e) => {
    const text = e.target.value;
    setInputText(text);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 400) + 'px';
    
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
  const [showInBarModelDropdown, setShowInBarModelDropdown] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [hideWelcomeScreen, setHideWelcomeScreen] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('quantora_hide_welcome') === 'true';
    }
    return false;
  });  const [arenaMode, setArenaMode] = useState(false);
  const [secondModel, setSecondModel] = useState({ id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nvidia Nemotron 3 Ultra' });
  const [showSecondModelDropdown, setShowSecondModelDropdown] = useState(false);
  const [isWorkspaceMode, setIsWorkspaceMode] = useState(false);
  const [codingDeskOpen, setCodingDeskOpen] = useState(false);
  const [workspaceCode, setWorkspaceCode] = useState('');
  const [vfs, setVfs] = useState({});
  // Which session this saver last ran for, and the live session id a deferred
  // write re-checks against. Refs, because both are read inside a timer.
  const deskSaveSessionRef = useRef(null);
  const activeSessionIdRef = useRef(null);
  const [deskReview, setDeskReview] = useState([]);
  const vfsRef = useRef({});
  useEffect(() => { vfsRef.current = vfs; }, [vfs]);
  const commitDeskVfs = useCallback((nextVfs) => {
    if (!nextVfs || typeof nextVfs !== 'object') return false;
    const before = vfsRef.current || {};
    // Never let a broken/truncated turn overwrite a working preview. A failed
    // edit must leave the last working page intact, not destroy it. Returns
    // whether the commit was accepted so callers can gate their follow-up state.
    if (deskCommitRegressesPreview(before, nextVfs).reject) return false;
    setDeskReview((prev) => mergeDeskReview(prev, before, nextVfs));
    vfsRef.current = nextVfs;
    setVfs(nextVfs);
    return true;
  }, []);
  const [deskJob, setDeskJob] = useState(null);
  const [liveDeskProbe, setLiveDeskProbe] = useState(null);
  /*
   * Edits the model asked for that could not be applied to the file.
   * The reply describes what it INTENDED to change; this says what actually
   * landed. Without it a two-part edit where one part missed reads as a
   * complete success over a half-changed build.
   */
  const [patchNote, setPatchNote] = useState('');
  /*
   * Phase 04. A build too large for one reply becomes a job: a goal and steps,
   * each naming the files it must leave behind. Steps go green only when those
   * files exist on the desk — never because a turn said so.
   */
  const [buildJob, setBuildJob] = useState(null);
  // Steps taken without being asked. Reset when a new plan starts; capped so an
  // agent loop can never become an open tap.
  const autoPauseRef = useRef('');
  const [previewRunStatus, setPreviewRunStatus] = useState('');
  const [workspaceCorrelationId, setWorkspaceCorrelationId] = useState(null);
  const [workspaceGoldenTransaction, setWorkspaceGoldenTransaction] = useState(null);
  // Legacy deckSpec state removed
  const [workspaceActiveTab, setWorkspaceActiveTab] = useState('preview');
  /*
   * The tab strip.
   *
   * `workspaceActiveTab` above is unchanged and still the single source of
   * truth for which pane renders — every existing caller that sets it keeps
   * working untouched. `openTabs` is the list beside it, and it is kept in
   * sync by an effect rather than by editing those callers, so a build that
   * opens a file gets a tab for free and nothing downstream had to learn a
   * new API.
   */
  const [openTabs, setOpenTabs] = useState([PINNED_DESK_TAB]);
  const openTabsRef = useRef(openTabs);
  openTabsRef.current = openTabs;
  const [deskFullscreen, setDeskFullscreen] = useState(false);
  const [deskFilesOpen, setDeskFilesOpen] = useState(true);
  const [deskFinderOpen, setDeskFinderOpen] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasCode, setCanvasCode] = useState('');
  const [canvasVfs, setCanvasVfs] = useState({});
  const [deskPublishMenuOpen, setDeskPublishMenuOpen] = useState(false);
  const [chatWidthPct, setChatWidthPct] = useState(() => loadChatWidthPct());
  const [filesWidthPx, setFilesWidthPx] = useState(() => loadFilesWidthPx());
  const [splitMobile, setSplitMobile] = useState(() => (
    typeof window !== 'undefined' ? isStudioSplitMobile(window.innerWidth) : false
  ));
  const chatDeskSplitRef = useRef(null);
  const filesPreviewSplitRef = useRef(null);
  const deskPublishMenuRef = useRef(null);
  const deskShellRef = useRef(null);
  const [deskWidthPx, setDeskWidthPx] = useState(0);
  // Reported by LivePreviewCanvas so its Download / Improve / viewport controls
  // can live in the desk header instead of a second strip beneath it.
  const [previewChrome, setPreviewChrome] = useState(null);
  // Sidebar chat search. Filters what is rendered — never the stored sessions.
  const [chatQuery, setChatQuery] = useState('');
  const [showMentionsList, setShowMentionsList] = useState(false);
  const [lastProcessedMessageId, setLastProcessedMessageId] = useState(null);
  const [thinkingTime, setThinkingTime] = useState(0);
  const dismissedOfficeFingerprintRef = useRef(null);
  const dismissedOfficeMessageIdRef = useRef(null);
  const openedTravelPreviewForRef = useRef(null);

  const closeStudioWorkspace = useCallback(() => {
    const lastAi = [...messages].reverse().find((message) => message.sender === 'ai');
    const fingerprint = (lastAi?.officeAttachment || activeOfficeArtifact(messages))?.verification?.previewFingerprint;
    if (fingerprint) {
      dismissedOfficeFingerprintRef.current = fingerprint;
      dismissedOfficeMessageIdRef.current = lastAi?.id ?? null;
    }
    setCodingDeskOpen(false);
    if (!canAutoOpenCodeWorkspace(studioDomain)) {
      setIsWorkspaceMode(false);
    }
  }, [messages, studioDomain]);

  const openCodingDesk = useCallback(() => {
    if (!canAutoOpenCodeWorkspace(studioDomain)) {
      handleCreateNewChat();
      setStudioDomain(null);
    }
    setCodingDeskOpen(true);
    if (typeof window !== 'undefined' && window.innerWidth < 768) setSidebarOpen(false);
  }, [studioDomain, handleCreateNewChat, setStudioDomain]);

  /*
   * One effect owns the strip: open the active pane, then drop tabs the VFS no
   * longer backs.
   *
   * This is deliberately an effect on `workspaceActiveTab` and not a wrapper
   * around its setter. There are a dozen-odd places that switch the desk to
   * Preview mid-turn; making each of them call a new opener would have been a
   * dozen chances to miss one and leave the strip lying about what is open.
   *
   * Open and prune must share one pass. They were two effects on the same
   * dependency, and the prune read a ref the open had not written yet: clicking
   * Terminal or Git set the active pane to a tab the stale list did not contain,
   * so prune called it unknown and bounced the desk back to Preview. Splitting
   * them made the rail's own buttons dead. Computed here, prune sees the tab the
   * open just added.
   *
   * Both values are computed in the effect body rather than inside a state
   * updater. An updater must be pure — React double-invokes them in StrictMode
   * and may replay them when the queue is rebased behind a higher-priority
   * update — so calling a second setter from inside one queues an update
   * mid-render. That converged only because the value happened to be idempotent.
   */
  useEffect(() => {
    const opened = openDeskTab(openTabsRef.current, workspaceActiveTab);
    const pruned = pruneDeskTabs(opened, vfs, workspaceActiveTab);
    const current = openTabsRef.current;
    const sameStrip = pruned.tabs.length === current.length
      && pruned.tabs.every((tab, i) => tab === current[i]);
    if (!sameStrip) setOpenTabs(pruned.tabs);
    if (pruned.active !== workspaceActiveTab) setWorkspaceActiveTab(pruned.active);
  }, [vfs, workspaceActiveTab]);

  const closeDeskTabAt = useCallback((tabId) => {
    const result = closeDeskTab(openTabsRef.current, tabId, workspaceActiveTab);
    setOpenTabs(result.tabs);
    if (result.active !== workspaceActiveTab) setWorkspaceActiveTab(result.active);
  }, [workspaceActiveTab]);

  /*
   * Desk keys.
   *
   * Only bindings a browser actually lets a page keep are offered here. Ctrl/Cmd
   * + W is deliberately absent: browsers reserve it to close their own tab and
   * will not hand it over, and a shortcut that works in one browser and closes
   * your session in another is worse than no shortcut. Tabs close with the ×,
   * or a middle click.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onKeyDown = (event) => {
      // Escape leaves full screen from anywhere, including a focused editor.
      if (event.key === 'Escape' && deskFullscreen && !deskFinderOpen) {
        setDeskFullscreen(false);
        return;
      }
      if (!codingDeskOpen) return;

      const target = event.target;
      const tag = String(target?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || target?.isContentEditable;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      // Cmd/Ctrl + Shift + Enter — enter or leave the full-screen IDE.
      if (event.shiftKey && (event.key === 'Enter' || event.key === 'Return')) {
        event.preventDefault();
        setDeskFullscreen((open) => !open);
        return;
      }
      // Cmd/Ctrl + Alt + Arrow — walk the tab strip.
      if (event.altKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        event.preventDefault();
        setWorkspaceActiveTab(nextDeskTab(openTabs, workspaceActiveTab, event.key === 'ArrowRight' ? 1 : -1));
        return;
      }
      if (event.altKey || event.shiftKey) return;

      // The rest would fight the field you are typing in.
      if (typing && event.key.toLowerCase() !== 'p') return;

      if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setDeskFilesOpen((open) => !open);
        return;
      }
      if (event.key === '`') {
        event.preventDefault();
        setWorkspaceActiveTab((current) => (current === 'terminal' ? PINNED_DESK_TAB : 'terminal'));
        return;
      }
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setDeskFinderOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [codingDeskOpen, deskFullscreen, deskFinderOpen, openTabs, workspaceActiveTab]);

  /* Leaving the desk must never strand you in a full-screen shell with no desk. */
  useEffect(() => {
    if (!codingDeskOpen && deskFullscreen) setDeskFullscreen(false);
  }, [codingDeskOpen, deskFullscreen]);

  const handleHealedPreview = useCallback((healedHtml) => {
    const next = writeHealedPreviewToVfs(vfs, healedHtml, deskJob);
    if (!next.wrote) return;
    setDeskReview(diffVfsReview(vfs, next.vfs));
    setVfs(next.vfs);
    setWorkspaceCode(pickPreviewEntry(next.vfs) || healedHtml);
  }, [vfs, deskJob]);

  // Make the model's OWN shop images load in Preview: wire its image files in as
  // data-URIs and proxy the remote image URLs it chose. This never fabricates
  // products or injects stock photos — a shop the model shipped without images
  // stays an honest empty catalog (no "instant fake shop").
  useEffect(() => {
    if (!vfsLooksLikeShop(vfs, deskJob)) return;
    const brief = [...messages].reverse().find((m) => m?.sender === 'user' && m.text)?.text || '';
    const next = ensureShopDeskInVfs(vfs, deskJob, { brief });
    if (!next.changed) return;
    setDeskReview(diffVfsReview(vfs, next.vfs));
    setVfs(next.vfs);
    const code = pickPreviewEntry(next.vfs);
    if (code) setWorkspaceCode(code);
  }, [vfs, deskJob, messages]);

  useEffect(() => {
    const onResize = () => setSplitMobile(isStudioSplitMobile(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /*
   * The desk header carries a lot: title, ladder chip, job, run status, the
   * activity rail and the actions. How much fits depends on the desk's real
   * width — which the chat/desk splitter changes at will — so it is measured
   * rather than guessed from the window or the split percentage.
   */
  useEffect(() => {
    const node = deskShellRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width;
      if (Number.isFinite(width)) setDeskWidthPx(Math.round(width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [codingDeskOpen]);

  useEffect(() => {
    if (!deskPublishMenuOpen) return undefined;
    const onDoc = (event) => {
      if (deskPublishMenuRef.current && !deskPublishMenuRef.current.contains(event.target)) {
        setDeskPublishMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [deskPublishMenuOpen]);

  const beginChatDeskResize = useCallback((event) => {
    if (splitMobile || !codingDeskOpen) return;
    event.preventDefault();
    const startX = event.clientX;
    const startPct = chatWidthPct;
    const onMove = (moveEvent) => {
      const parent = chatDeskSplitRef.current?.parentElement;
      const width = parent?.getBoundingClientRect().width || window.innerWidth;
      if (!width) return;
      const deltaPct = ((moveEvent.clientX - startX) / width) * 100;
      const capped = Math.min(startPct + deltaPct, maxChatWidthPctForShell(width));
      setChatWidthPct(saveChatWidthPct(capped));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [splitMobile, codingDeskOpen, chatWidthPct]);

  const beginFilesPreviewResize = useCallback((event) => {
    if (splitMobile) return;
    event.preventDefault();
    const startX = event.clientX;
    const startPx = filesWidthPx;
    const onMove = (moveEvent) => {
      setFilesWidthPx(saveFilesWidthPx(startPx + (moveEvent.clientX - startX)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [splitMobile, filesWidthPx]);

  const startNewChat = useCallback(() => {
    // A new chat starts blank — clear every preview surface up front instead of
    // relying on the session-change effect, which never reset the Canvas
    // (canvasOpen/canvasCode). Without this the old, often-broken Preview stayed
    // on the right after "New Chat".
    setCodingDeskOpen(false);
    setCanvasOpen(false);
    setCanvasCode('');
    setIsWorkspaceMode(false);
    setVfs({});
    vfsRef.current = {};
    setWorkspaceCode('');
    setDeskReview([]);
    setDeskJob(null);
    setPreviewRunStatus('');
    setLiveDeskProbe(null);
    handleCreateNewChat();
  }, [handleCreateNewChat]);

  useEffect(() => {
    if (canAutoOpenCodeWorkspace(studioDomain)) return;
    setCodingDeskOpen(false);
    setIsWorkspaceMode(false);
    setCanvasOpen(false);
  }, [studioDomain]);

  const deskSessionIdRef = useRef(null);
  useEffect(() => {
    if (deskSessionIdRef.current === activeSessionId) return;
    deskSessionIdRef.current = activeSessionId;
    setImportedGithubRepoUrl('');
    setImportedGithubBaseBranch('main');
    if (!canAutoOpenCodeWorkspace(studioDomain)) {
      setVfs({});
      setWorkspaceCode('');
      setCodingDeskOpen(false);
      setIsWorkspaceMode(false);
      setDeskReview([]);
      vfsRef.current = {};
      setDeskJob(null);
      setPreviewRunStatus('');
      setCanvasOpen(false);
      setCanvasCode('');
      setLiveDeskProbe(null);
      return;
    }
    const session = chatSessions.find((item) => item.id === activeSessionId);
    const restored = restoreStudioDeskSnapshot(session);
    if (!restored) {
      setVfs({});
      setWorkspaceCode('');
      setCodingDeskOpen(false);
      setIsWorkspaceMode(false);
      setLastProcessedMessageId(null);
      setDeskReview([]);
      vfsRef.current = {};
      setDeskJob(null);
      setPreviewRunStatus('');
      setCanvasOpen(false);
      setCanvasCode('');
      setLiveDeskProbe(null);
      return;
    }
    setVfs(restored.vfs);
    vfsRef.current = restored.vfs || {};
    setWorkspaceCode(restored.workspaceCode);
    setWorkspaceActiveTab('preview');
    setIsWorkspaceMode(true);
    setCodingDeskOpen(restored.codingDeskOpen);
    setLastProcessedMessageId(restored.lastProcessedMessageId);
    setDeskReview(restored.review || []);
    setDeskJob(restored.job || null);
  }, [activeSessionId, studioDomain, chatSessions]);

  activeSessionIdRef.current = activeSessionId;

  useEffect(() => {
    if (!canAutoOpenCodeWorkspace(studioDomain)) return;
    /*
     * A desk belongs to the chat that built it.
     *
     * This save is debounced 400ms and its effect re-runs when activeSessionId
     * changes — so on a chat switch it used to build a snapshot from the
     * PREVIOUS chat's files and write it to whichever session was active when
     * the timer fired. The new chat then restored it: you opened a fresh chat,
     * typed a brief, and the desk beside you force-opened somebody else's
     * build, persisted into your session record.
     *
     * Two guards. Skip the pass on which the session changed, because the files
     * in state are the outgoing chat's and its own desk was already saved.
     * And re-check at fire time, because the session can change inside the
     * debounce window.
     */
    const target = resolveDeskSaveTarget({
      activeSessionId,
      lastSeenSession: deskSaveSessionRef.current,
    });
    deskSaveSessionRef.current = target.nextSeen;
    if (!target.save) return;

    const built = buildStudioDeskSnapshot({
      vfs,
      workspaceCode,
      codingDeskOpen,
      lastProcessedMessageId,
      review: deskReview,
      job: deskJob,
    });
    if (!built.ok) return;
    const sessionAtBuild = activeSessionId;
    const timer = setTimeout(() => {
      if (!deferredWriteStillValid({ sessionAtBuild, sessionNow: activeSessionIdRef.current })) return;
      updateActiveSession({ desk: built.snapshot });
    }, 400);
    return () => clearTimeout(timer);
  }, [vfs, workspaceCode, codingDeskOpen, lastProcessedMessageId, deskReview, deskJob, studioDomain, updateActiveSession, activeSessionId]);
  const { checkModelHealth, logPreference, logFeedback } = usePCLMemory();
  const [pclIntercept, setPclIntercept] = useState(null);
  const [feedbackStates, setFeedbackStates] = useState({});
  
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
  const [importedGithubRepoUrl, setImportedGithubRepoUrl] = useState('');
  const [importedGithubBaseBranch, setImportedGithubBaseBranch] = useState('main');
  const [isFetchingGithub, setIsFetchingGithub] = useState(false);
  const [githubError, setGithubError] = useState('');

  const handleImportGithub = async () => {
    if (!githubRepoUrl) {
      setGithubError("Please enter a valid GitHub URL");
      return;
    }
    
    setIsFetchingGithub(true);
    setGithubError('');

    try {
      const response = await fetch(GITHUB_IMPORT_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildGithubImportRequestBody(githubRepoUrl)),
      });

      const parsed = await readGithubApiJson(response);
      if (!parsed.ok) {
        throw new Error(parsed.error || 'Failed to import repository');
      }

      const data = parsed.data || {};
      if (!data.name || !data.content) {
        throw new Error('GitHub import succeeded but returned no repository context.');
      }

      setAttachments(prev => [...prev, {
        type: 'context',
        name: data.name,
        content: data.content
      }]);
      setImportedGithubRepoUrl(githubRepoUrl.trim());
      setImportedGithubBaseBranch(typeof data.branch === 'string' && data.branch.trim() ? data.branch.trim() : 'main');
      
      setIsGithubModalOpen(false);
      setGithubRepoUrl('');
    } catch (err) {
      setGithubError(err.message || 'Failed to import repository');
    } finally {
      setIsFetchingGithub(false);
    }
  };

  const openCanvasWithCode = (rawText) => {
    if (!canExplicitlyPreviewCode(studioDomain) && !detectOfficeIntent({ messages })) return;
    // Presentations: rebuild a guaranteed-renderable deck from whatever the
    // model produced (HTML, or a leaked slide-data array) instead of trusting
    // the model to emit a perfect self-contained slide viewer.
    if (detectSlideDeck(messages)) {
      const deckHtml = normalizeDeck(rawText, { title: deriveDeckTitle(messages) });
      if (deckHtml) {
        setCanvasVfs({});
        setCanvasCode(deckHtml);
        setCanvasOpen(true);
        return;
      }
    }

    const brief = [...messages].reverse().find((message) => message.sender === 'user')?.text || '';
    const assembled = applyWorkspaceFromChat(rawText, vfs, deskJob, { brief });
    // A plan turn starts the job; every other turn re-judges it against the
    // files that now exist, so a step can also go BACK to not-done if its file
    // is later emptied. The job describes the desk, not the history of claims.
    /*
     * Auto-advance is REVERTED here, not debugged in place.
     *
     * It broke the desk-job browser gate — the Preview stopped rendering — and
     * the same PR carries the fix for a live Travel outage. Holding a
     * production fix hostage to a feature is the wrong trade, so the loop comes
     * out and goes back in on its own PR with that gate passing first.
     *
     * shouldAutoAdvanceJob and its stop conditions stay in build-job.js, tested.
     */
    const proposed = readPlanMarker(rawText);
    /*
     * `assembled.vfs || vfs` was not a fallback. `{}` is truthy, so it never
     * fired once: a turn that built nothing handed the job planner an empty
     * desk and every step was judged against no files at all.
     *
     * That is now fixed at the producer: `assembled.vfs` is the desk this turn
     * should leave behind, so a no-op returns the existing files rather than
     * nothing. The one reading that still needs the emptiness — the proof
     * plane's repair path — takes `producedVfs` by name a few lines below.
     */
    const deskForJob = assembled.vfs;
    if (proposed) setBuildJob(advanceBuildJob(proposed, deskForJob));
    else setBuildJob((prev) => (prev ? advanceBuildJob(prev, deskForJob) : prev));
    setPatchNote([
      ...(assembled.patchFailures || [])
        .map((failure) => describePatchFailures(failure.result, failure.filepath)),
      // An empty fence keeps the file rather than blanking it. Saying so is the
      // whole point: a silent keep is as confusing as the silent delete was.
      describeEmptyFenceKept(assembled.emptyFenceKept),
    ].filter(Boolean).join('\n\n'));
    if (assembled.rejected) return;
    const lastAi = [...messages].reverse().find((message) => message.sender === 'ai');
    const skillPlan = planFromMessageSnapshot(lastAi?.codingTurnPlan, {
      messageForModel: brief,
      displayUserText: brief,
    }) || {
      mode: 'execute',
      isCodingTurn: true,
      intent: { kind: vfsLooksLikeShop(assembled.vfs, assembled.job || deskJob) ? 'shop_build' : 'app_build' },
      skillsRequired: vfsLooksLikeShop(assembled.vfs, assembled.job || deskJob)
        ? ['preview_html', 'shop_catalog_photos', 'shop_commerce_ui']
        : ['preview_html'],
      messageForModel: brief,
    };
    const proved = proveCodingTurn({
      plan: skillPlan,
      // What this turn BUILT, not the desk it should leave behind: the repair
      // path reads emptiness as "produced nothing" and must keep doing so.
      vfs: assembled.producedVfs,
      job: assembled.job || deskJob,
      brief,
      allowRepair: true,
      sessionId: activeSessionId,
    });
    const finalVfs = proved.vfs;
    if (assembled.code || proved.evidence.hasHtml || Object.keys(finalVfs).length > 0) {
      setCanvasVfs(finalVfs);
      setCanvasCode(pickPreviewEntry(finalVfs) || assembled.code);
      if (canAutoOpenCodeWorkspace(studioDomain)) {
        // Route through the guard: a truncated/broken turn must not overwrite a
        // working desk, and downstream state must not adopt a rejected VFS.
        const accepted = Object.keys(finalVfs).length > 0
          && !deskCommitRegressesPreview(vfsRef.current || {}, finalVfs).reject;
        if (accepted) {
          setDeskReview(diffVfsReview(vfs, finalVfs));
          vfsRef.current = finalVfs;
          setVfs(finalVfs);
          if (assembled.job) setDeskJob(assembled.job);
          setWorkspaceCode(pickPreviewEntry(finalVfs) || assembled.code);
        }
        setWorkspaceActiveTab('preview');
        setCodingDeskOpen(true);
        setIsWorkspaceMode(true);
      } else {
        setCanvasOpen(true);
      }
    }
  };

  const fileInputRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const inBarModelRef = useRef(null);
  const textareaRef = useRef(null);
  const plusMenuAnchorRef = useRef(null);
  const [dismissedContinueId, setDismissedContinueId] = useState(null);
  const [dismissedSyllabus, setDismissedSyllabus] = useState(false);

  useEffect(() => {
    setDismissedSyllabus(false);
  }, [activeSessionId]);

  // Auto-resize textarea when inputText changes programmatically (e.g., Magic Wand)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 400) + 'px';
    }
  }, [inputText]);

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

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newAttachments = await Promise.all(files.map((file) => new Promise((resolve) => {
      const base = {
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        type: file.type.includes('image') ? 'image' : 'file'
      };
      /*
       * Carry WHY there is no dataUrl. Without it a 4MB photo arrived at the
       * send path indistinguishable from a spreadsheet, and the user was told
       * "I can read images (PNG/JPG), but not holiday.png" — which is both
       * wrong and unactionable, when the true answer is "that one is too big,
       * send a smaller copy".
       */
      if (!file.type.includes('image')) {
        resolve({ ...base, excludedReason: 'unsupported' });
        return;
      }
      if (file.size > 3 * 1024 * 1024) {
        resolve({ ...base, excludedReason: 'size' });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve({ ...base, dataUrl: String(reader.result || '') });
      reader.onerror = () => resolve(base);
      reader.readAsDataURL(file);
    })));
    setAttachments(prev => [...prev, ...newAttachments]);
    e.target.value = '';
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  /*
   * A handover moves the conversation to a fresh chat. Firing that on one click
   * meant the person never saw what travelled with them, and could not tell a
   * complete handover from a lossy one until they were already in the new chat
   * with no way back. The chip now opens what it would carry; only the second
   * click commits.
   */
  const [pendingHandover, setPendingHandover] = useState(null);

  /*
   * The session goal had no way to close. On an advisor workspace it is sticky
   * by design, so it sat forever echoing a truncated sentence the Study card
   * above it was already showing — two cards, one string, in the scarcest
   * space on the screen. Keyed by session so hiding it in one chat does not
   * hide it in the next.
   */
  const [missionDismissedFor, setMissionDismissedFor] = useState(null);
  const missionDismissed = missionDismissedFor === activeSessionId;


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

  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
  const [showHeroCardModal, setShowHeroCardModal] = useState(false);
  const [intentSelectedIndex, setIntentSelectedIndex] = useState(0);

  const handleMagicWandEnhance = async () => {
    const draftValueAtStart = inputText;
    const draftAtStart = draftValueAtStart.trim();
    if (!draftAtStart) {
      textareaRef.current?.focus();
      return;
    }

    const requestSessionId = activeSessionId;
    const recentHistory = messages
      .filter((message) => message?.text && (message.sender === 'user' || message.sender === 'ai'))
      .slice(-8)
      .map((message) => ({ sender: message.sender, text: message.text }));

    setIsEnhancingPrompt(true);
    try {
      const res = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: draftAtStart,
          depth: 'auto',
          history: recentHistory,
          sessionContext: projectContext,
        })
      });
      const data = await res.json();
      const currentDraft = textareaRef.current?.value ?? inputText;
      if (res.ok && data.enhancedPrompt && shouldApplyPromptPolishResult({
        requestSessionId,
        currentSessionId: activeSessionId,
        draftAtStart: draftValueAtStart,
        currentDraft,
      })) {
        setInputText(data.enhancedPrompt);
        setShowHeroCardModal(false);
      } else if (!res.ok) {
        console.error("Magic Wand failed:", data.error);
      }
    } catch (e) {
      console.error("Magic Wand network error:", e);
    } finally {
      setIsEnhancingPrompt(false);
    }
  };

  const [, setLastPrompt] = useState('');

  // Intelligent Router Logic — Auto Mode switches silently; never interrupt with a Switch pill.
  useEffect(() => {
    const text = inputText.toLowerCase();
    if (!text.trim() || isCodingDeskAutoSelection(selectedModel)) {
      setSuggestedModel(null);
      return;
    }
    const isCode = /react|function|const|python|api|bug|error|html|css|javascript|code|app|component/.test(text);
    const isResearch = /analyze|summarize|explain|compare|theory|architecture|research/.test(text);

    if (isCode && selectedModel?.name !== 'Qwen 2.5 Coder 32B') {
      const qwen = availableModels?.find(m => m.name.includes('Qwen 2.5 Coder')) || { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B' };
      setSuggestedModel(qwen);
    } else if (isResearch && selectedModel?.name !== 'DeepSeek V3') {
      const ds = availableModels?.find(m => m.name.includes('DeepSeek V3')) || { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3' };
      setSuggestedModel(ds);
    } else {
      setSuggestedModel(null);
    }
  }, [inputText, selectedModel, availableModels]);

  const handlePushToDream = (msg) => {
    if (!setDreamNodes || !dreamNodes) return;
    const newNode = {
      id: Date.now().toString(),
      stage: 'dream',
      dreamText: msg.text,
      ideaSpec: null,
      thoughtCode: null,
      actionUrl: null,
      isExecuting: false,
      timestamp: Date.now()
    };
    setDreamNodes([...dreamNodes, newNode]);
    if (setActiveTab) setActiveTab('canvas');
  };

  const onCodingTurnExecute = useCallback((plan) => {
    if (!plan?.runSkillsFirst && !plan?.intent?.kind?.startsWith('shop')) return;
    const verdict = proveCodingTurn({
      plan,
      vfs,
      job: deskJob,
      brief: plan.messageForModel || plan.displayUserText || '',
      allowRepair: true,
      sessionId: activeSessionId,
    });
    if (!verdict.vfs || (!verdict.ok && !verdict.evidence?.hasHtml && !Object.keys(verdict.vfs).length)) return;
    const nextVfs = verdict.vfs;
    // Gate all follow-up state on acceptance: a rejected (broken/truncated) VFS
    // must not set workspaceCode or be shown as this turn's result.
    if (!commitDeskVfs(nextVfs)) return;
    const entry = pickPreviewEntry(nextVfs);
    if (entry) setWorkspaceCode(entry);
    setWorkspaceActiveTab('preview');
    setCodingDeskOpen(true);
    setIsWorkspaceMode(true);
  }, [vfs, deskJob, activeSessionId, commitDeskVfs]);

  /*
   * Commit a deterministic rename. Returns whether the desk actually took it,
   * so the caller reports a rename only when one happened — a "Renamed X to Y"
   * message over an unchanged desk is the exact class of claim this codebase
   * keeps having to delete.
   */
  const onDeskRename = useCallback((nextVfs) => {
    if (!nextVfs || !Object.keys(nextVfs).length) return false;
    if (!commitDeskVfs(nextVfs)) return false;
    const entry = pickPreviewEntry(nextVfs);
    if (entry) setWorkspaceCode(entry);
    setWorkspaceActiveTab('preview');
    return true;
  }, [commitDeskVfs]);

  const onCodingTurnProved = useCallback((verdict) => {
    if (!verdict?.vfs || !Object.keys(verdict.vfs).length) return;
    // Do not adopt state derived from a rejected VFS (Code tab / Preview / desk
    // open) — only when the commit was actually accepted.
    if (!commitDeskVfs(verdict.vfs)) return;
    const entry = pickPreviewEntry(verdict.vfs);
    if (entry) {
      setWorkspaceCode(entry);
      setWorkspaceActiveTab('preview');
      setCodingDeskOpen(true);
      setIsWorkspaceMode(true);
    }
  }, [commitDeskVfs]);

  const { handleSendMessage: streamSendMessage, cancelStream } = useChatStream({
    inputText, setInputText,
    attachments, setAttachments,
    isGenerating, setIsGenerating,
    updateActiveMessages,
    chatSessions, activeSessionId,
    selectedModel,
    availableModels,
    arenaMode, secondModel,
    cognitiveLevel,
    canvasCode,
    vfs,
    isWorkspaceMode,
    codingDeskOpen,
    deskJob,
    liveDeskProbe,
    messages,
    setLastPrompt,
    sessionContext: projectContext,
    conversationContext,
    updateActiveSession,
    onCodingTurnExecute,
    onCodingTurnProved,
    onDeskRename,
    buildJob,
  });

  const showStudySyllabus = shouldShowStudySyllabusChips({
    studioDomain,
    conversationContext,
    messages,
    extra: inputText,
    dismissed: dismissedSyllabus,
  });
  const studySyllabusSet = showStudySyllabus
    ? studySyllabusContinueSet(conversationContext?.goal || '')
    : null;

  const financeBrief = React.useMemo(
    () => (studioDomain === 'finance' ? deriveFinanceBrief({ messages }) : null),
    [studioDomain, messages],
  );

  const handlePreviewCodeBlock = useCallback((codeString, lang) => {
    if (!canExplicitlyPreviewCode(studioDomain)) return;
    const lastAi = [...messages].reverse().find((message) => message.sender === 'ai' && message.text);
    const assembled = assembleStudioPreview(lastAi?.text || '', vfs);
    const htmlFromMessage = assembled.code && /<!DOCTYPE html>|<html[\s>]/i.test(assembled.code) ? assembled.code : '';
    const htmlFromFence = /<!DOCTYPE html>|<html[\s>]/i.test(String(codeString || '')) ? String(codeString) : '';
    const html = htmlFromMessage || htmlFromFence;
    if (!html) return;

    setWorkspaceCorrelationId(null);
    setWorkspaceGoldenTransaction(null);
    // Guard this write path too: a truncated fence still contains <!DOCTYPE, so a
    // timed-out message's code must not overwrite a working desk. If rejected,
    // keep the working page and just open the desk on it.
    const candidateVfs = Object.keys(assembled.vfs).length > 0
      ? assembled.vfs
      : { 'index.html': { content: html, language: 'html' } };
    if (!deskCommitRegressesPreview(vfsRef.current || {}, candidateVfs).reject) {
      setDeskReview(diffVfsReview(vfs, candidateVfs));
      vfsRef.current = candidateVfs;
      setVfs(candidateVfs);
      setDeskJob((prev) => buildStudioJobCard({
        brief: [...messages].reverse().find((message) => message.sender === 'user')?.text || '',
        vfs: candidateVfs,
        existing: prev,
      }));
      setWorkspaceCode(html);
    }
    setWorkspaceActiveTab('preview');
    setCodingDeskOpen(true);
    setIsWorkspaceMode(true);
  }, [studioDomain, messages, vfs]);

  const handleTravelPlacePlay = useCallback((place) => {
    const html = travelPlacePreviewHtml({
      name: place?.name,
      website: place?.href || place?.website,
      googleMapsUrl: place?.googleMapsUrl,
      userRating: place?.userRating,
      userRatingCount: place?.userRatingCount,
      address: place?.address,
    });
    if (!html) return;
    setWorkspaceCorrelationId(null);
    setWorkspaceGoldenTransaction(null);
    setVfs({ 'index.html': { content: html, language: 'html' } });
    setWorkspaceCode(html);
    setWorkspaceActiveTab('preview');
    setIsWorkspaceMode(true);
  }, []);

  const markdownComponents = React.useMemo(() => ({
    a({node, children, href, ...props}) {
      if (studioDomain === 'travel' && /^https?:\/\//i.test(String(href || ''))) {
        return (
          <TravelPlaceLink
            href={href}
            onPlay={handleTravelPlacePlay}
            style={{ color: '#38bdf8', textDecoration: 'underline', textUnderlineOffset: '2px' }}
            {...props}
          >
            {children}
          </TravelPlaceLink>
        );
      }
      return <VerifiedMediaLink href={href} style={{ color: '#3b82f6', textDecoration: 'underline', textUnderlineOffset: '2px' }} {...props}>{children}</VerifiedMediaLink>
    },
    code({node, inline, className, children, ...props}) {
      const match = /language-(\w+)/.exec(className || '');
      const rawCode = String(children).replace(/\n$/, '');
      const isRunnable = match && ['javascript', 'jsx', 'tsx', 'html', 'css', 'json'].includes(match[1]);
      
      return !inline && match ? (
        <div style={{ position: 'relative', margin: '10px 0', group: 'code-block' }}>
          {isRunnable && canExplicitlyPreviewCode(studioDomain) && (
            <button
              onClick={() => handlePreviewCodeBlock(rawCode, match[1])}
              title="Preview in Workspace"
              style={{
                position: 'absolute', top: '8px', right: '40px', background: 'rgba(249, 115, 22, 0.9)', 
                border: 'none', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', 
                fontWeight: 'bold', cursor: 'pointer', zIndex: 10, display: 'flex', alignItems: 'center', gap: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#ea580c'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(249, 115, 22, 0.9)'}
            >
              <Play size={12} fill="currentColor" /> Preview
            </button>
          )}
          <PlainCodeBlock language={match[1]} PreTag="div" customStyle={{ borderRadius: '8px', fontSize: '0.85rem', paddingTop: '30px' }} {...props}>
            {rawCode}
          </PlainCodeBlock>
        </div>
      ) : (
        <code style={{ background: 'rgba(128,128,128,0.2)', padding: '2px 5px', borderRadius: '4px', fontFamily: 'monospace' }} {...props}>{children}</code>
      )
    }
  }), [handlePreviewCodeBlock, handleTravelPlacePlay, studioDomain]);

  useEffect(() => {
    if (studioDomain !== 'travel' || isGenerating) return;
    const last = [...messages].reverse().find((message) => (
      message?.sender === 'ai' && Array.isArray(message.travelPlaces) && message.travelPlaces.length
    ));
    if (!last || openedTravelPreviewForRef.current === last.id) return;
    const place = last.travelPlaces[0];
    const href = place.website || place.googleMapsUrl;
    if (!href) return;
    openedTravelPreviewForRef.current = last.id;
    handleTravelPlacePlay({ ...place, href });
  }, [messages, studioDomain, isGenerating, handleTravelPlacePlay]);

  // Pick a genuinely DIFFERENT, currently-healthy model to fall back to when the
  // selected one just failed. Returns null when there's no better option — in
  // which case we must NOT nag the user with a pointless "route to itself" prompt.
  const pickHealthyFallback = (failedModel) => {
    const candidates = (availableModels || []).filter(
      (m) => m && m.id && m.id !== failedModel.id && checkModelHealth(m.id).isHealthy,
    );
    if (!candidates.length) return null;
    // Prefer a fast model to recover from latency, else the first healthy one.
    return candidates.find((m) => /flash|mini|fast|lite/i.test(`${m.id} ${m.name}`)) || candidates[0];
  };

  const handleSendMessage = (overrideText = null, sendOptions = null) => {
    const textToSend = overrideText || inputText;
    if (!textToSend.trim() && !attachments.length) return;

    const keepExisting = (isWorkspaceMode || canvasOpen) && shouldKeepWorkspaceForPrompt({
      prompt: textToSend,
      hasWorkspace: true,
      officeKind: detectOfficeIntent({ messages }),
    });
    if ((isWorkspaceMode || canvasOpen) && !keepExisting) {
      setIsWorkspaceMode(false);
      setCanvasOpen(false);
    }

    const deskFileCount = Object.keys(vfs || {}).length;
    if ((userAskedForShopDeskFix(textToSend) || userAskedForDeskReview(textToSend)) && deskFileCount) {
      const patched = applyDeskReviewPatch(vfs, deskJob, { brief: textToSend });
      if (patched.changed && !patched.rejected
        && !deskCommitRegressesPreview(vfsRef.current || {}, patched.vfs).reject) {
        setDeskReview(diffVfsReview(vfs, patched.vfs));
        vfsRef.current = patched.vfs;
        setVfs(patched.vfs);
        const code = pickPreviewEntry(patched.vfs);
        if (code) setWorkspaceCode(code);
        setWorkspaceActiveTab('preview');
        setIsWorkspaceMode(true);
        setCodingDeskOpen(true);
      }
      // Deterministic repair only for cart/currency or broken-photo intents.
      // Semantic asks (“replace photos with blue dresses”) must reach the model.
      if (
        userAskedForShopDeskFix(textToSend)
        && !patched.rejected
        && !userAskedForSemanticPhotoEdit(textToSend)
      ) {
        // Short-circuit ONLY when the deterministic patch actually changed the
        // desk. It used to also fire on "the images are broken" whenever the HTML
        // still contained <img> tags — but countRealPreviewPhotos counts TAGS, not
        // whether they decode. A page full of <img> elements that all fail to load
        // therefore answered "already has loadable product photos" and returned
        // WITHOUT EVER CALLING THE MODEL, so every follow-up replayed the same
        // canned line and the user could never reach the AI to get it fixed.
        // When we changed nothing we have nothing to report: fall through to the
        // model so a real repair can happen.
        if (patched.changed) {
          const trimmed = String(textToSend || '').trim();
          if (!overrideText) setInputText('');
          updateActiveMessages((prev) => [
            ...prev,
            { id: Date.now(), sender: 'user', text: trimmed, attachments: [...attachments] },
            {
              id: Date.now() + 1,
              sender: 'ai',
              text: 'Patched Preview with product photos (same-origin data URIs), cart, and currency. Hard-refresh Preview if the iframe still shows broken remote images.',
            },
          ]);
          setAttachments([]);
          return;
        }
      }
    }

    // Provider health/failover is handled below the UX surface. Keep model choice manual, never block a send.
    streamSendMessage(overrideText, null, sendOptions);
  };

  const commitStudySyllabusChip = (item) => {
    if (!STUDY_SYLLABUS_CHIPS.some((chip) => chip.id === item.id)) return;
    updateActiveSession({
      conversationContext: applyStudySyllabusOverlay(
        learnFromChipSelection(conversationContext, {
          label: item.label,
          value: item.value,
          domain: studioDomain,
        }),
        item.id,
      ),
    });
    setDismissedSyllabus(true);
    handleSendMessage(item.value);
  };

  const handlePclDecision = (routeToFallback) => {
    if (!pclIntercept) return;
    if (routeToFallback && pclIntercept.fallbackModel) {
      const fallbackModel = pclIntercept.fallbackModel;
      if (setSelectedModel) setSelectedModel(fallbackModel);
      streamSendMessage(pclIntercept.text, fallbackModel);
    } else {
      streamSendMessage(pclIntercept.text);
    }
    setPclIntercept(null);
  };

  const handleRegenerateMessage = (messageId) => {
    const messageIndex = messages.findIndex((message) => message.id === messageId);
    const previousUserMessage = messageIndex >= 0
      ? messages.slice(0, messageIndex).reverse().find((message) => message.sender === 'user' && message.text)
      : null;
    if (previousUserMessage?.text) handleSendMessage(previousUserMessage.text);
  };

  const lastAiMessage = [...messages].reverse().find((message) => message.sender === 'ai' && message.type !== 'greeting');

  /*
   * Study used to put a second input under the lesson whenever the tutor said
   * "Write your attempt" — a phrase the prompt tells it to end with, so the box
   * appeared under lessons that had asked nothing. The question now anchors
   * itself in the composer that was always there, and only when a question was
   * genuinely asked.
   *
   * Declared HERE, after lastAiMessage. It was 487 lines above it, which is a
   * temporal dead zone: const is hoisted but not initialised, so every render
   * threw a ReferenceError and the whole studio went blank. Lint did not see
   * it, the build did not see it, and no unit test renders this component.
   */
  const awaitingStudyAnswer = studioDomain === 'education'
    && !isGenerating
    && studyAwaitsAnswer(lastAiMessage?.text || '');
  const cleanStudyMessages = withoutPrivateStudyInstructions(messages, studioDomain);
  const lastUserMessage = [...cleanStudyMessages].reverse().find((message) => message.sender === 'user');
  const previewRunCode = runningPreviewCode(vfs, workspaceCode);
  const previewAssemblyKey = previewAssemblyFingerprint(vfs);
  const shellVfs = deskShellVfs(vfs, previewRunCode);
  const deskPacket = mergeLiveDeskProbe(buildDeskContextPacket({
    vfs,
    job: deskJob,
    html: previewRunCode,
    studioDomain,
  }), liveDeskProbe);
  const photosMissing = Boolean(previewRunCode)
    && deskPacket?.facts?.shop
    && (!deskPacket.facts.hasPhotos || deskPacket.facts.hasDistinctPhotos === false);
  // Name only what is actually absent — see describeMissingShopUi.
  const shopUiMissingNote = describeMissingShopUi(deskPacket?.facts);
  const shopUiMissing = Boolean(shopUiMissingNote);

  useEffect(() => {
    if (!previewRunCode) setLiveDeskProbe(null);
  }, [previewRunCode]);

  // Same shell gate as partner strip: warming/running/healing = not past embedReady/verify.
  const previewWarming = previewShellIsWarming(previewRunStatus);
  const claimFilterOpts = { previewWarming };

  const renderedChatFeed = React.useMemo(() => {
    return cleanStudyMessages.filter((msg) => msg.type !== 'greeting').map(msg => {
      const runnableCode = msg.sender === 'ai' ? (msg.codeSnippet || extractRunnableCode(msg.text)) : null;
      const isActiveGenerating = isGenerating && msg.id === messages[messages.length - 1].id;
      const isFailover = isActiveGenerating && msg.isFailover;
      
      // Hide empty AI message block while generating to avoid redundant avatar above "is thinking..." indicator
      if (msg.sender === 'ai' && !msg.text && isActiveGenerating) {
        return null;
      }
      
      const displayText = getChatDisplayText(msg.text?.replace(/<!--\s*quantora-[\s\S]*?-->/g, '') || '');
      let cleanText = msg.sender === 'ai'
        ? filterDeskChatClaims(displayText, deskPacket, studioDomain, claimFilterOpts)
        : displayText;
      const claimFiltered = msg.sender === 'ai' && deskChatClaimWasFiltered(displayText, cleanText);
      let modalData = null;
      if (cleanText) {
        const match = cleanText.match(/<quantora-modal>([\s\S]*?)<\/quantora-modal>/);
        if (match) {
          try {
            modalData = JSON.parse(match[1]);
            cleanText = cleanText.replace(match[0], '').trim();
          } catch (e) {
            console.error("Failed to parse modal data", e);
          }
        }
      }
      if (modalData && !shouldShowAssistantDecisionCard({
        choiceUsed: msg.choiceUsed,
        messageId: msg.id,
        messages,
      })) {
        modalData = null;
      }
      
      return (
        <div key={msg.id} className="animate-slide-up" style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
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
                <div style={{ flex: 1 }}>
                  {msg.isDual ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', width: '100%' }}>
                      {/* Model A Card */}
                      <div style={{
                        background: isLight ? '#ffffff' : '#0d1127',
                        border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(249, 115, 22, 0.35)',
                        borderRadius: '24px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: isLight ? '0 4px 12px rgba(0,0,0,0.05)' : '0 8px 24px rgba(0,0,0,0.3)'
                      }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingBottom: '8px', borderBottom: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.08)' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f97316', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Cpu size={14} /> {formatModelName(msg.modelA.modelName)}
                            </span>
                            <span style={{ fontSize: '0.7rem', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>
                              ⚡ {msg.modelA.latencyMs}ms
                            </span>
                          </div>
                          <div className="markdown-prose" style={{ width: '100%', overflowX: 'hidden', fontSize: '0.9rem', lineHeight: 1.6, color: textColor }}>
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              components={{
                                a({node, children, href, ...props}) {
                              return <VerifiedMediaLink href={href} style={{ color: '#3b82f6', textDecoration: 'underline', textUnderlineOffset: '2px' }} {...props}>{children}</VerifiedMediaLink>
                            },
                            code({node, inline, className, children, ...props}) {
                                  const match = /language-(\w+)/.exec(className || '')
                                  return !inline && match ? (
                                    <PlainCodeBlock language={match[1]} PreTag="div" customStyle={{ borderRadius: '8px', margin: '10px 0', fontSize: '0.85rem' }} {...props}>
                                      {String(children).replace(/\n$/, '')}
                                    </PlainCodeBlock>
                                  ) : (
                                    <code style={{ background: 'rgba(128,128,128,0.2)', padding: '2px 5px', borderRadius: '4px', fontFamily: 'monospace' }} {...props}>{children}</code>
                                  )
                                }
                              }}
                            >
                              {filterDeskChatClaims(getChatDisplayText(msg.modelA.text?.replace(/<!--\s*quantora-[\s\S]*?-->/g, '') || ''), deskPacket, studioDomain, claimFilterOpts)}
                            </ReactMarkdown>
                          </div>
                        </div>
                        <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.7rem', color: subtextColor }}>Engine: {msg.modelA.provider}</span>
                          
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button 
                                  onClick={() => {
                                    navigator.clipboard.writeText(msg.modelA.text);
                                    setCopiedMessageId(`${msg.id}-A`);
                                    setTimeout(() => setCopiedMessageId(null), 2000);
                                  }}
                                  style={{ background: 'transparent', border: 'none', color: copiedMessageId === `${msg.id}-A` ? '#10b981' : subtextColor, cursor: 'pointer', padding: 0 }}
                                  title="Copy response"
                                >
                                  {copiedMessageId === `${msg.id}-A` ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                              </div>
                              <button 
                                onClick={() => {
                                  logPreference(msg.modelA.modelName);
                                  alert('Preference logged to Cognitive Memory!');
                                }}
                                style={{ background: 'transparent', border: '1px solid #3b82f6', color: '#3b82f6', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                👍 Select Model A
                              </button>
                            </div>

                        </div>
                      </div>

                      {/* Model B Card */}
                      <div style={{
                        background: isLight ? '#ffffff' : '#0d1127',
                        border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(59, 130, 246, 0.35)',
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: isLight ? '0 4px 12px rgba(0,0,0,0.05)' : '0 8px 24px rgba(0,0,0,0.3)'
                      }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingBottom: '8px', borderBottom: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.08)' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Cpu size={14} /> {formatModelName(msg.modelB.modelName)}
                            </span>
                            <span style={{ fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>
                              ⚡ {msg.modelB.latencyMs}ms
                            </span>
                          </div>
                          <div className="markdown-prose" style={{ width: '100%', overflowX: 'hidden', fontSize: '0.9rem', lineHeight: 1.6, color: textColor }}>
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              components={{
                                a({node, children, href, ...props}) {
                              return <VerifiedMediaLink href={href} style={{ color: '#3b82f6', textDecoration: 'underline', textUnderlineOffset: '2px' }} {...props}>{children}</VerifiedMediaLink>
                            },
                            code({node, inline, className, children, ...props}) {
                                  const match = /language-(\w+)/.exec(className || '')
                                  return !inline && match ? (
                                    <PlainCodeBlock language={match[1]} PreTag="div" customStyle={{ borderRadius: '8px', margin: '10px 0', fontSize: '0.85rem' }} {...props}>
                                      {String(children).replace(/\n$/, '')}
                                    </PlainCodeBlock>
                                  ) : (
                                    <code style={{ background: 'rgba(128,128,128,0.2)', padding: '2px 5px', borderRadius: '4px', fontFamily: 'monospace' }} {...props}>{children}</code>
                                  )
                                }
                              }}
                            >
                              {filterDeskChatClaims(getChatDisplayText(msg.modelB.text?.replace(/<!--\s*quantora-[\s\S]*?-->/g, '') || ''), deskPacket, studioDomain, claimFilterOpts)}
                            </ReactMarkdown>
                          </div>
                        </div>
                        <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.7rem', color: subtextColor }}>Engine: {msg.modelB.provider}</span>
                          
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button 
                                  onClick={() => {
                                    navigator.clipboard.writeText(msg.modelB.text);
                                    setCopiedMessageId(`${msg.id}-B`);
                                    setTimeout(() => setCopiedMessageId(null), 2000);
                                  }}
                                  style={{ background: 'transparent', border: 'none', color: copiedMessageId === `${msg.id}-B` ? '#10b981' : subtextColor, cursor: 'pointer', padding: 0 }}
                                  title="Copy response"
                                >
                                  {copiedMessageId === `${msg.id}-B` ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                              </div>
                              <button 
                                onClick={() => {
                                  logPreference(msg.modelB.modelName);
                                  alert('Preference logged to Cognitive Memory!');
                                }}
                                style={{ background: 'transparent', border: '1px solid #3b82f6', color: '#3b82f6', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                👍 Select Model B
                              </button>
                            </div>

                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="prose" style={{
                      background: msg.sender === 'user' ? (isLight ? '#f0f4f9' : '#1e1f20') : 'transparent',
                      border: 'none',
                      padding: msg.sender === 'user' ? '12px 18px' : '4px 0',
                      borderRadius: '20px',
                      color: textColor,
                      fontSize: '1rem',
                      lineHeight: 1.65,
                      boxShadow: 'none',
                      width: '100%'
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

                      {/* Render Ollama Style "Thought for a moment" Header */}
                      {msg.thoughtProcess && (
                        <div style={{ fontSize: '0.8rem', color: subtextColor, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', padding: '12px 16px', background: isLight ? '#f8fafc' : 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                          <Lightbulb size={16} color="#f97316" />
                          <span style={{ fontWeight: 500 }}>Thought for a moment ({msg.thoughtProcess})</span>
                        </div>
                      )}

                      <div
                        className="markdown-prose"
                        data-quantora-assistant-prose={msg.sender === 'ai' ? 'true' : undefined}
                        data-quantora-desk-claim-filter={claimFiltered ? 'true' : undefined}
                        style={{ width: '100%', overflowX: 'hidden' }}
                      >
                        {studioDomain === 'education' && msg.sender === 'ai' ? (
                          <StudyMarkdown
                            text={cleanText}
                            topic={studySyllabusHaystack({ conversationContext, messages })}
                            isLight={isLight}
                            textColor={textColor}
                            components={markdownComponents}
                          />
                        ) : (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                          >
                            {cleanText}
                          </ReactMarkdown>
                        )}
                      </div>
                      {msg.sender === 'ai' && lastAiMessage?.id === msg.id && photosMissing && (assistantClaimsImagesReady(msg.text) || userAskedForPreviewPhotos(lastUserMessage?.text || '')) ? (
                        <div
                          data-quantora-preview-honesty="true"
                          style={{ marginTop: '10px', fontSize: '0.8rem', color: '#fbbf24', lineHeight: 1.45 }}
                        >
                          Preview still has no product photos. Empty picture boxes are not images — tap Add real product photos so the desk injects catalog photos.
                        </div>
                      ) : null}
                      {msg.sender === 'ai' && lastAiMessage?.id === msg.id && shopUiMissing && (assistantClaimsShopUiReady(msg.text) || userAskedForShopDeskFix(lastUserMessage?.text || '')) ? (
                        <div
                          data-quantora-preview-honesty="shop-ui"
                          style={{ marginTop: '10px', fontSize: '0.8rem', color: '#fbbf24', lineHeight: 1.45 }}
                        >
                          {shopUiMissingNote}
                        </div>
                      ) : null}
                      {msg.sender === 'ai' && lastAiMessage?.id === msg.id && buildJob?.steps?.length ? (
                        <div
                          data-quantora-build-job="true"
                          style={{ marginTop: '12px', fontSize: '0.82rem', color: buildJobIsComplete(buildJob) ? '#4ade80' : subtextColor, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
                        >
                          {describeBuildJob(buildJob)}
                          {autoPauseRef.current && !buildJobIsComplete(buildJob)
                            ? `

Paused — ${autoPauseRef.current}.`
                            : ''}
                        </div>
                      ) : null}
                      {msg.sender === 'ai' && lastAiMessage?.id === msg.id && patchNote ? (
                        <div
                          data-quantora-preview-honesty="patch"
                          style={{ marginTop: '10px', fontSize: '0.8rem', color: '#fbbf24', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}
                        >
                          {patchNote}
                        </div>
                      ) : null}

                      {/* Render Dedicated Office Download Card */}
                      {msg.officeAttachment && (
                        <div style={{
                          marginTop: '20px',
                          padding: '24px',
                          background: isLight ? '#ffffff' : '#0f172a',
                          border: isLight ? '1px solid #e2e8f0' : '1px solid #1e293b',
                          borderRadius: '16px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '16px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ padding: '12px', background: 'rgba(37, 99, 235, 0.1)', borderRadius: '12px' }}>
                              <FileText size={32} color="#2563eb" />
                            </div>
                            <div>
                              <h4 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: 'bold', color: textColor }}>
                                {msg.officeAttachment.fileName || 'Generated Document'}
                              </h4>
                              <p style={{ margin: 0, fontSize: '0.85rem', color: subtextColor }}>
                                Ready for download
                              </p>
                              {msg.officeAttachment.generation?.provider && (
                                <p style={{ margin: '5px 0 0 0', fontSize: '0.7rem', color: subtextColor, opacity: 0.82 }}>
                                  Engine: {msg.officeAttachment.generation?.model || 'unknown'} ({msg.officeAttachment.generation.provider})
                                  {Number.isFinite(msg.officeAttachment.generation?.attempts) && msg.officeAttachment.generation.attempts > 1
                                    ? ` · repaired in ${msg.officeAttachment.generation.attempts} attempts`
                                    : ''}
                                </p>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              try {
                                downloadOfficeArtifact(resolveOfficeDownloadPayload(msg.officeAttachment, messages));
                              } catch (error) {
                                console.error('Office download failed:', error);
                              }
                            }}
                            style={{
                              background: '#2563eb',
                              color: 'white',
                              border: 'none',
                              padding: '10px 20px',
                              borderRadius: '8px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              transition: 'background 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#1d4ed8'}
                            onMouseLeave={e => e.currentTarget.style.background = '#2563eb'}
                          >
                            Download
                          </button>
                        </div>
                      )}

                      {modalData && (
                        <StudioDecisionModal
                          modalData={modalData}
                          isLight={isLight}
                          onSubmit={(choiceText) => {
                            updateActiveMessages((prev) => prev.map((item) => (
                              item.id === msg.id ? { ...item, choiceUsed: true } : item
                            )));
                            handleSendMessage(choiceText);
                          }}
                          onSkip={() => {
                            updateActiveMessages((prev) => prev.map((item) => (
                              item.id === msg.id ? { ...item, choiceUsed: true } : item
                            )));
                          }}
                        />
                      )}

                      {msg.sender === 'ai' && msg.autoRouted && msg.modelUsed && !isActiveGenerating && (
                        <div style={{
                          marginTop: '6px',
                          fontSize: '0.68rem',
                          color: subtextColor,
                          fontWeight: 500,
                          opacity: 0.85,
                        }}>
                          using {String(msg.modelUsed).replace(/^.*\(([^)]+)\).*$/, '$1')}
                        </div>
                      )}

                      {/* Minimalist Message Footer */}
                      {msg.sender === 'ai' && !isActiveGenerating && (() => {
                        // Actions are DERIVED from the message content — not a
                        // fixed row dumped on every reply. Right-aligned.
                        const actions = resolveMessageActions({ text: cleanText, hasPreview: !!runnableCode, isOfficeArtifact: Boolean(msg.officeAttachment) });
                        const iconBtn = { background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' };
                        const latestAiId = [...messages].reverse().find((item) => item.sender === 'ai' && item.text)?.id;
                        const priorUser = [...messages].slice(0, messages.findIndex((item) => item.id === msg.id) + 1).reverse().find((item) => item.sender === 'user')?.text || '';
                        const officeKindForChips = detectOfficeIntent({ messages }) || activeOfficeArtifact(messages)?.kind;
                        const advisorContinues = msg.id === latestAiId && dismissedContinueId !== msg.id
                          ? filterContinuesForAdvisor(
                            filterContinuesForOffice(
                              injectGapContinues(msg.continueSet, detectOutcomeGaps(priorUser, msg.text, {
                                officeKind: officeKindForChips,
                                studioDomain,
                                deskChecks: deskPacket?.checks || [],
                                deskFacts: deskPacket?.facts || null,
                              })),
                              officeKindForChips,
                            ),
                            studioDomain,
                          )
                          : null;
                        const continueSet = studySyllabusSet && msg.id === latestAiId
                          ? studySyllabusSet
                          : advisorContinues;
                        return (
                        <>
                        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {/* Preview (code / presentation / app) — only when previewable */}
                          {actions.preview && runnableCode && canExplicitlyPreviewCode(studioDomain) && (
                            <button
                              onClick={() => openCanvasWithCode(msg.text)}
                              style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '700', boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)' }}
                              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                              onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
                              title="Preview"
                            >
                              <Play size={12} fill="currentColor" /> Preview
                            </button>
                          )}

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button onClick={() => setFeedbackStates(prev => ({ ...prev, [msg.id]: 'up' }))} style={{ ...iconBtn, color: feedbackStates[msg.id] === 'up' ? '#22c55e' : subtextColor }} title="Helpful response"><ThumbsUp size={14} /></button>
                            <button
                              onClick={() => {
                                setFeedbackStates(prev => ({ ...prev, [msg.id]: 'down' }));
                                const userMsg = messages.slice().reverse().find(m => m.id < msg.id && m.sender === 'user');
                                logFeedback(userMsg ? userMsg.text : '', msg.text, false);
                              }}
                              style={{ ...iconBtn, color: feedbackStates[msg.id] === 'down' ? '#ef4444' : subtextColor }} title="Incorrect response"
                            ><ThumbsDown size={14} /></button>
                          </div>

                          {/* Summarize — only for long replies (not one-liners) */}
                          {actions.summarize && (
                            <button onClick={() => handleSendMessage('Please summarize this.')} title="Summarize" style={{ ...iconBtn, color: subtextColor }}><List size={14} /></button>
                          )}

                          <button onClick={() => handleRegenerateMessage(msg.id)} title="Regenerate" style={{ ...iconBtn, color: subtextColor }}><RefreshCw size={14} /></button>

                          <button
                            onClick={() => { navigator.clipboard.writeText(cleanText); setCopiedMessageId(msg.id); setTimeout(() => setCopiedMessageId(null), 2000); }}
                            title="Copy" style={{ ...iconBtn, color: copiedMessageId === msg.id ? '#10b981' : subtextColor }}
                          >{copiedMessageId === msg.id ? <Check size={14} /> : <Copy size={14} />}</button>

                          <button
                            type="button"
                            data-quantora-message-fork="true"
                            onClick={() => forkChatFromMessage(msg.id)}
                            title="Fork Chat"
                            style={{ ...iconBtn, color: subtextColor, gap: '5px', fontSize: '0.72rem', fontWeight: 700 }}
                          ><GitBranch size={14} /><span>Fork Chat</span></button>

                          {/* Overflow — real menu (was a dead button); shown only when it has items */}
                          {actions.overflow.length > 0 && (
                            <div style={{ position: 'relative', display: 'flex' }}>
                              <button title="More" onClick={() => setOpenActionMenuId(openActionMenuId === msg.id ? null : msg.id)} style={{ ...iconBtn, color: subtextColor }}><MoreHorizontal size={14} /></button>
                              {openActionMenuId === msg.id && (
                                <>
                                  <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpenActionMenuId(null)} />
                                  <div style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: '6px', zIndex: 50, minWidth: '160px', background: isLight ? '#ffffff' : '#0f172a', border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', boxShadow: '0 12px 32px rgba(0,0,0,0.28)', padding: '6px', display: 'flex', flexDirection: 'column' }}>
                                    {actions.overflow.includes('read-aloud') && (
                                      <button
                                        onClick={() => { try { window.speechSynthesis?.cancel(); window.speechSynthesis?.speak(new SpeechSynthesisUtterance(cleanText)); } catch { /* unsupported */ } setOpenActionMenuId(null); }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '8px 10px', borderRadius: '6px', fontSize: '0.82rem', textAlign: 'left' }}
                                      ><Volume2 size={14} /> Read aloud</button>
                                    )}
                                    <button
                                      onClick={() => { setFeedbackStates(prev => ({ ...prev, [msg.id]: 'down' })); const userMsg = messages.slice().reverse().find(m => m.id < msg.id && m.sender === 'user'); logFeedback(userMsg ? userMsg.text : '', msg.text, false); setOpenActionMenuId(null); }}
                                      style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '8px 10px', borderRadius: '6px', fontSize: '0.82rem', textAlign: 'left' }}
                                    ><Flag size={14} /> Report issue</button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        {msg.sessionContinuity && !msg.sessionContinuityDismissed ? (
                          <div
                            data-quantora-session-continuity="true"
                            style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px' }}
                          >
                            <button
                              type="button"
                              onClick={() => setPendingHandover(
                                pendingHandover?.id === msg.sessionContinuity.id ? null : msg.sessionContinuity,
                              )}
                              title={sessionHandoverLabel(msg.sessionContinuity)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '7px',
                                maxWidth: 'min(100%, 420px)',
                                padding: '7px 11px',
                                borderRadius: '999px',
                                border: isLight ? '1px solid #fed7aa' : '1px solid rgba(249,115,22,0.4)',
                                background: isLight ? '#fff7ed' : 'rgba(249,115,22,0.1)',
                                color: isLight ? '#9a3412' : '#fdba74',
                                cursor: 'pointer',
                                fontSize: '0.76rem',
                                fontWeight: 700,
                              }}
                            >
                              <Link2 size={13} aria-hidden="true" />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {sessionHandoverLabel(msg.sessionContinuity)}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => updateActiveMessages((prev) => prev.map((item) => (
                                item.id === msg.id ? { ...item, sessionContinuityDismissed: true } : item
                              )))}
                              title="Dismiss"
                              aria-label="Dismiss"
                              style={{ ...iconBtn, color: subtextColor }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : null}
                        {msg.sessionContinuity
                          && !msg.sessionContinuityDismissed
                          && pendingHandover?.id === msg.sessionContinuity.id ? (
                          <div
                            data-quantora-handover-preview="true"
                            style={{
                              marginTop: '8px',
                              padding: '12px 14px',
                              borderRadius: '12px',
                              border: isLight ? '1px solid #fed7aa' : '1px solid rgba(249,115,22,0.3)',
                              background: isLight ? '#fffbf5' : 'rgba(249,115,22,0.06)',
                              fontSize: '0.8rem',
                              color: textColor,
                              lineHeight: 1.55,
                            }}
                          >
                            <div style={{ color: subtextColor, marginBottom: '8px' }}>
                              {describeSessionHandover(pendingHandover).reason}
                            </div>
                            {describeSessionHandover(pendingHandover).carried > 0 ? (
                              <>
                                <div style={{ fontWeight: 700, marginBottom: '6px' }}>
                                  This is what moves to the new chat:
                                </div>
                                <ul style={{ margin: '0 0 10px', paddingLeft: '18px' }}>
                                  {describeSessionHandover(pendingHandover).lines.map((line, i) => (
                                    <li key={i} style={{ marginBottom: '3px' }}>{line}</li>
                                  ))}
                                </ul>
                              </>
                            ) : (
                              <div style={{ marginBottom: '10px' }}>
                                Nothing has been recorded to carry across yet — the new chat would start empty.
                                Everything above stays in this one.
                              </div>
                            )}
                            <div style={{ color: subtextColor, marginBottom: '10px' }}>
                              This chat stays exactly as it is. Nothing here is deleted.
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  const contract = pendingHandover;
                                  setPendingHandover(null);
                                  handleCreateHandoverChat(contract);
                                }}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '999px',
                                  border: 'none',
                                  background: '#f97316',
                                  color: '#fff',
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                Start the new chat
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingHandover(null)}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '999px',
                                  border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.15)',
                                  background: 'transparent',
                                  color: subtextColor,
                                  fontSize: '0.76rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Keep going here
                              </button>
                            </div>
                          </div>
                        ) : null}
                        {continueSet?.items?.length > 0 && (
                          <div data-quantora-study-syllabus={studySyllabusSet && msg.id === latestAiId ? 'true' : undefined}>
                          <StudioInlineSuggestions
                            suggestions={{ kind: 'continues', continueSet }}
                            isLight={isLight}
                            onSelectContinue={(item) => {
                              if (STUDY_SYLLABUS_CHIPS.some((chip) => chip.id === item.id)) {
                                commitStudySyllabusChip(item);
                                return;
                              }
                              updateActiveSession({
                                conversationContext: learnFromChipSelection(conversationContext, {
                                  label: item.label,
                                  value: item.value,
                                  domain: studioDomain,
                                }),
                              });
                              const chipText = `${item.label || ''} ${item.value || ''}`;
                              if (studioDomain === 'education' && wantsStudyLab(chipText)) {
                                const labKind = /fbd|free-?body/i.test(chipText)
                                  ? 'fbd'
                                  : /\bnewton\b|inertia tab/i.test(chipText)
                                    ? 'newton'
                                    : null;
                                if (!labKind) {
                                  handleSendMessage(item.value);
                                  return;
                                }
                                updateActiveMessages((prev) => [...prev, {
                                  id: Date.now(),
                                  sender: 'ai',
                                  text: `<quantora-study-lab kind="${labKind}" />\n\nThis is the visual workspace — in this chat. Use the controls. There is no separate canvas.`,
                                }]);
                                return;
                              }
                              handleSendMessage(item.value);
                            }}
                            onDismiss={() => {
                              if (studySyllabusSet && msg.id === latestAiId) {
                                setDismissedSyllabus(true);
                                updateActiveSession({
                                  conversationContext: applyStudySyllabusOverlay(conversationContext, 'open'),
                                });
                                return;
                              }
                              setDismissedContinueId(msg.id);
                            }}
                          />
                          </div>
                        )}
                        {studioDomain === 'finance' && msg.id === latestAiId && financeBrief?.active ? (
                          <FinanceBoard
                            brief={financeBrief}
                            onAsk={(text) => setInputText(text)}
                            onSend={(text) => handleSendMessage(text)}
                          />
                        ) : null}
                        {studioDomain === 'travel' && msg.id === latestAiId ? (
                          <Suspense fallback={null}>
                            <TravelTripBoard
                              messages={messages}
                              isLight={isLight}
                              textColor={textColor}
                              subtextColor={subtextColor}
                              signedIn={Boolean(user)}
                              onAsk={(text) => setInputText(text)}
                              onRequireAuth={onOpenAuth}
                            />
                          </Suspense>
                        ) : null}
                        </>
                        );
                      })()}
                    </div>
                  )}

                  {/* Minimalist User Message Footer */}
                  {msg.sender === 'user' && (
                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(msg.text);
                          setCopiedMessageId(msg.id);
                          setTimeout(() => setCopiedMessageId(null), 2000);
                        }}
                        style={{ background: 'transparent', border: 'none', color: copiedMessageId === msg.id ? '#10b981' : subtextColor, cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: copiedMessageId === msg.id ? 1 : 0.4, transition: 'all 0.2s', padding: 0 }}
                        onMouseEnter={(e) => copiedMessageId !== msg.id && (e.currentTarget.style.opacity = 1)}
                        onMouseLeave={(e) => copiedMessageId !== msg.id && (e.currentTarget.style.opacity = 0.4)}
                        title="Copy prompt"
                      >
                        {copiedMessageId === msg.id ? <Check size={14} /> : <Copy size={14} />}
                      </button>

                      <button 
                        onClick={() => {
                          setInputText(msg.text);
                        }}
                        style={{ background: 'transparent', border: 'none', color: subtextColor, cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.4, transition: 'opacity 0.2s', padding: 0 }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = 0.4}
                        title="Edit prompt"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                      </button>
                      
                      <button 
                        onClick={() => alert("Prompt pushed to journey flow.")}
                        style={{ background: 'transparent', border: 'none', color: subtextColor, cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.4, transition: 'opacity 0.2s', padding: 0 }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = 0.4}
                        title="Push to Dream Canvas"
                      >
                        <Workflow size={14} />
                      </button>
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
                  {msg.componentType === 'calculator' && <Suspense fallback={<div style={{padding: 20, color: '#888'}}>Loading Calculator...</div>}><LiveIosCalculator /></Suspense>}
                  {msg.componentType === 'beat' && <Suspense fallback={<div style={{padding: 20, color: '#888'}}>Loading BeatMaker...</div>}><LiveBeatMaker /></Suspense>}
                  {msg.componentType === 'quantum' && <Suspense fallback={<div style={{padding: 20, color: '#888'}}>Loading Quantum Simulator...</div>}><LiveQuantumSimulator /></Suspense>}

                  {/* Source Code Toggle Button — developer-only, never shown for Office artifacts */}
                  {msg.codeSnippet && !msg.officeAttachment && canExplicitlyPreviewCode(studioDomain) && (
                    <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <button
                        onClick={() => setShowCodeMap({ ...showCodeMap, [msg.id]: !showCodeMap[msg.id] })}
                        style={{ background: 'transparent', border: 'none', color: '#0284c7', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Code2 size={14} /> {showCodeMap[msg.id] ? 'Hide Source Code' : 'Inspect Source Code'}
                      </button>

                      <button
                        onClick={() => onPushToCanvas && onPushToCanvas(msg.codeSnippet)}
                        style={{ background: isLight ? '#f3e8ff' : 'rgba(139, 92, 246, 0.2)', border: isLight ? '1px solid #d8b4fe' : '1px solid rgba(139, 92, 246, 0.4)', color: isLight ? '#7c3aed' : '#a78bfa', padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Workflow size={12} /> Push to Canvas
                      </button>
                    </div>
                  )}

                  {/* Optional Source Code Panel */}
                  {showCodeMap[msg.id] && msg.codeSnippet && !msg.officeAttachment && canExplicitlyPreviewCode(studioDomain) && (
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
  }, [messages, isLight, textColor, subtextColor, openCanvasWithCode, showCodeMap, arenaMode, secondModel, onOpenAuth, isGenerating, studioDomain, forkChatFromMessage, handleCreateHandoverChat, handleSendMessage, dismissedContinueId, conversationContext, updateActiveSession, updateActiveMessages, studySyllabusSet, financeBrief, user, setInputText, commitStudySyllabusChip, lastAiMessage, lastUserMessage, photosMissing, shopUiMissing, deskPacket, claimFilterOpts]);

  
  useEffect(() => {
    let interval;
    if (isGenerating) {
      setThinkingTime(0);
      interval = setInterval(() => {
        setThinkingTime(prev => prev + 1);
      }, 1000);
    } else {
      setThinkingTime(0);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  useEffect(() => {
    if (!isGenerating && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      const lastOffice = lastMsg.officeAttachment?.htmlPreview
        ? lastMsg.officeAttachment
        : null;
      if (lastOffice?.htmlPreview && !(lastMsg.text && lastMsg.text.includes('<clear-workspace />'))) {
        const fingerprint = lastOffice.verification?.previewFingerprint || null;
        const dismissed = fingerprint
          && fingerprint === dismissedOfficeFingerprintRef.current
          && lastMsg.id === dismissedOfficeMessageIdRef.current;
        if (!dismissed) {
          const fileName = lastOffice.kind === 'excel'
            ? 'workbook.html'
            : lastOffice.kind === 'word'
              ? 'document.html'
              : 'presentation.html';
          dismissedOfficeFingerprintRef.current = null;
          dismissedOfficeMessageIdRef.current = null;
          setWorkspaceCode(lastOffice.htmlPreview);
          setVfs({ [fileName]: { content: lastOffice.htmlPreview, language: 'html' } });
          setWorkspaceActiveTab('preview');
          setIsWorkspaceMode(true);
          if (lastMsg.sender === 'ai') setLastProcessedMessageId(lastMsg.id);
          return;
        }
        if (lastMsg.sender === 'ai') setLastProcessedMessageId(lastMsg.id);
        return;
      }
      if (!lastMsg.officeAttachment && activeOfficeArtifact(messages) && (isWorkspaceMode || dismissedOfficeFingerprintRef.current)) {
        if (lastMsg.sender === 'ai' && lastMsg.id !== lastProcessedMessageId) {
          setLastProcessedMessageId(lastMsg.id);
        }
        return;
      }
      if (lastMsg.sender === 'ai' && lastMsg.id !== lastProcessedMessageId) {
        setLastProcessedMessageId(lastMsg.id);
        
        // Check for intentional context switch
        if (lastMsg.text && lastMsg.text.includes('<clear-workspace />')) {
           setIsWorkspaceMode(false);
           setCanvasOpen(false);
           return;
        }

        // Generic Code/Preview is a neutral Studio capability. Advisor workspaces
        // may open only explicit verified artifacts (for example an Office file);
        // ordinary chat/code text must never steal half the screen.
        if (!canAutoOpenCodeWorkspace(studioDomain) && !lastMsg.officeAttachment) {
          setIsWorkspaceMode(false);
          setCanvasOpen(false);
          return;
        }

        // Provider-dead / stream errors: apply extractable fences when present.
        // Otherwise prove existing desk Files (shop/coding) so Preview can still land.
        const errorHasExtractableCode = lastMsg.isError
          && messageHasExtractableWorkspaceCode(lastMsg.text, vfs);
        if (lastMsg.isError && !errorHasExtractableCode) {
          const userBrief = [...messages].reverse().find((message) => message.sender === 'user')?.text || '';
          const skillPlan = planFromMessageSnapshot(lastMsg.codingTurnPlan, {
            messageForModel: userBrief,
            displayUserText: userBrief,
          });
          if (skillPlan?.isCodingTurn || messageLooksLikeShopBuild(userBrief)) {
            const proved = proveCodingTurn({
              plan: skillPlan || {
                mode: 'execute',
                isCodingTurn: true,
                intent: { kind: 'shop_build' },
                skillsRequired: ['preview_html', 'shop_catalog_photos', 'shop_commerce_ui'],
                messageForModel: userBrief,
              },
              vfs,
              job: deskJob,
              brief: userBrief,
              allowRepair: true,
              sessionId: activeSessionId,
            });
            if (proved?.vfs && Object.keys(proved.vfs).length && commitDeskVfs(proved.vfs)) {
              const entry = pickPreviewEntry(proved.vfs);
              if (entry) setWorkspaceCode(entry);
              setWorkspaceActiveTab('preview');
              setIsWorkspaceMode(true);
              setCodingDeskOpen(true);
            }
            return;
          }
          const keepWorkspace = shouldKeepWorkspaceForPrompt({
            prompt: messages.length >= 2 ? messages[messages.length - 2].text : '',
            hasWorkspace: isWorkspaceMode || canvasOpen,
            officeKind: detectOfficeIntent({ messages }),
          });
          if (!keepWorkspace) {
            setIsWorkspaceMode(false);
            setCanvasOpen(false);
          }
          return;
        }

        // Proof Control Plane already rejected this turn — do not open as success.
        // Exception: error turns with extractable fences still land the partial workspace.
        if (lastMsg.codingProof && lastMsg.codingProof.ok === false && !errorHasExtractableCode) {
          return;
        }

        const userBrief = [...messages].reverse().find((message) => message.sender === 'user')?.text || '';
        const assembled = applyWorkspaceFromChat(lastMsg.text, vfs, deskJob, { brief: userBrief });
        if (assembled.rejected) return;
        const skillPlan = planFromMessageSnapshot(lastMsg.codingTurnPlan, {
          messageForModel: userBrief,
          displayUserText: userBrief,
        }) || {
          mode: 'execute',
          isCodingTurn: true,
          intent: {
            kind: vfsLooksLikeShop(assembled.vfs, assembled.job || deskJob) ? 'shop_build' : 'app_build',
          },
          skillsRequired: vfsLooksLikeShop(assembled.vfs, assembled.job || deskJob)
            ? ['preview_html', 'shop_catalog_photos', 'shop_commerce_ui']
            : ['preview_html'],
          messageForModel: userBrief,
        };
        const proved = proveCodingTurn({
          plan: skillPlan,
          // As above — the proof plane judges what was produced, not the desk.
          vfs: assembled.producedVfs,
          job: assembled.job || deskJob,
          brief: userBrief,
          allowRepair: true,
          sessionId: activeSessionId,
        });
        const parsedVfs = proved.vfs;
        const previewable = canOpenStudioPreviewPane(lastMsg.text, vfs)
          || /<!DOCTYPE html>|<html[\s>]/i.test(assembled.code || '')
          || assembled.needsWebEntry === true
          || proved.evidence.hasHtml;

        if (!previewable || (skillPlan.intent?.kind?.startsWith('shop') && !codingTurnMayClaimSuccess(proved))) {
          const userPrompt = messages.length >= 2 ? messages[messages.length - 2].text : '';
          if (vfsLooksLikeShop(vfs, deskJob) || proved.evidence.hasHtml) {
            if (proved.vfs && Object.keys(proved.vfs).length && commitDeskVfs(proved.vfs)) {
              setWorkspaceCode(pickPreviewEntry(proved.vfs));
              setWorkspaceActiveTab('preview');
              setIsWorkspaceMode(true);
              setCodingDeskOpen(true);
            }
            return;
          }
          const keepWorkspace = shouldKeepWorkspaceForPrompt({
            prompt: userPrompt,
            hasWorkspace: isWorkspaceMode || canvasOpen,
            officeKind: detectOfficeIntent({ messages }),
          });
          if (!keepWorkspace) {
            setIsWorkspaceMode(false);
            setCanvasOpen(false);
          }
          return;
        }

        if (Object.keys(parsedVfs).length > 0) {
           const shopVfs = proved.vfs;
           // Only adopt job/correlation/"parsed"/workspaceCode when the commit is
           // accepted — a rejected (truncated) VFS must not be reported as parsed
           // or shown as this turn's result while the desk keeps the prior page.
           if (commitDeskVfs(shopVfs)) {
             setDeskJob((prev) => {
               const base = assembled.job || buildStudioJobCard({
                 brief: userBrief || [...messages].reverse().find((message) => message.sender === 'user')?.text || '',
                 vfs: shopVfs,
                 existing: prev,
               });
               if (assembled.needsWebEntry && /scientific/i.test(userBrief || '')) {
                 return {
                   ...base,
                   purpose: /scientific/i.test(base.purpose || '') ? base.purpose : 'A scientific calculator',
                   mustWork: Array.from(new Set([...(base.mustWork || []), 'Scientific keys (sin/cos) appear on Preview'])),
                 };
               }
               return base;
             });
             setWorkspaceCorrelationId(lastMsg.correlationId || null);
             setWorkspaceGoldenTransaction(lastMsg.goldenTransaction || null);
             void recordClientBoundary(lastMsg.correlationId, 'artifact.vfs', 'parsed', {
               transaction: lastMsg.goldenTransaction || null,
               fileCount: Object.keys(parsedVfs).length,
               detailCode: 'runnable-files-present',
             });
             setWorkspaceCode(pickPreviewEntry(shopVfs) || assembled.code || pickPreviewEntry(parsedVfs));
           }
           setWorkspaceActiveTab('preview');
           setIsWorkspaceMode(true);
           if (assembled.reopenDesk) setCodingDeskOpen(true);
        } else {
           const code = assembled.code || extractRunnableCode(lastMsg.text);
              if (code) {
              const isHtml = /<!DOCTYPE html>|<html[\s>]/i.test(code);
              const seedPath = detectSlideDeck(messages) ? 'presentation.html' : (isHtml ? 'index.html' : 'App.jsx');
              const seedVfs = { [seedPath]: { content: code, language: detectSlideDeck(messages) || isHtml ? 'html' : 'jsx' } };
              const nextJob = assembled.job || buildStudioJobCard({
                brief: userBrief,
                vfs: seedVfs,
                existing: deskJob,
              });
              const nextVfs = ensureShopDeskInVfs(seedVfs, nextJob, { brief: userBrief }).vfs;
              // Only show the code / record it parsed / adopt the job when the
              // guard accepts the write — otherwise the desk keeps the prior page.
              if (commitDeskVfs(nextVfs)) {
                setWorkspaceCode(code);
                setDeskJob(nextJob);
                setWorkspaceCorrelationId(lastMsg.correlationId || null);
                setWorkspaceGoldenTransaction(lastMsg.goldenTransaction || null);
                void recordClientBoundary(lastMsg.correlationId, 'artifact.vfs', 'parsed', {
                  transaction: lastMsg.goldenTransaction || null,
                  fileCount: 1,
                  detailCode: 'single-runnable-file',
                });
              }
              setWorkspaceActiveTab('preview');
              setIsWorkspaceMode(true);
           } else {
              const userPrompt = messages.length >= 2 ? messages[messages.length - 2].text : '';
              const keepWorkspace = shouldKeepWorkspaceForPrompt({
                prompt: userPrompt,
                hasWorkspace: isWorkspaceMode || canvasOpen,
                officeKind: detectOfficeIntent({ messages }),
              });
              if (!keepWorkspace) {
                setIsWorkspaceMode(false);
                setCanvasOpen(false);
              }
           }
        }
      }
    }
  }, [isGenerating, messages, lastProcessedMessageId, studioDomain, vfs, isWorkspaceMode, canvasOpen, commitDeskVfs, deskJob, activeSessionId]);

  const hasUserTurn = messages.some((message) => message.sender === 'user');
  const generatingStatus = lastAiMessage?.executionStatus?.label;
  const partnerContinueLabel = lastAiMessage?.text && lastUserMessage?.text
    ? (filterContinuesForAdvisor(
      filterContinuesForOffice(
        injectGapContinues(lastAiMessage.continueSet, detectOutcomeGaps(lastUserMessage.text, lastAiMessage.text, {
          officeKind: detectOfficeIntent({ messages }) || activeOfficeArtifact(messages)?.kind,
          studioDomain,
          deskChecks: deskPacket?.checks || [],
          deskFacts: deskPacket?.facts || null,
        })),
        detectOfficeIntent({ messages }) || activeOfficeArtifact(messages)?.kind,
      ),
      studioDomain,
    )?.items?.[0]?.label || '')
    : '';
  const officeKindNow = detectOfficeIntent({ messages }) || activeOfficeArtifact(messages)?.kind || null;
  /* Filters the rendered list only; stored sessions are never touched. */
  const visibleChatSessions = useMemo(
    () => filterChatSessions(chatSessions, chatQuery),
    [chatSessions, chatQuery],
  );

  const isCodingDesk = canAutoOpenCodeWorkspace(studioDomain) && codingDeskOpen;

  /*
   * What the model ladder actually did on the last turn.
   *
   * Read off the message the router already stamped — never re-decided here. If
   * the turn carried no routing decision (a pinned model, or an older message
   * from before the reason was recorded) this is null and the chip does not
   * render. A ladder chip that guesses is worse than no chip.
   */
  const deskLadder = (() => {
    const lastAi = [...messages].reverse().find((message) => message.sender === 'ai');
    if (!lastAi) return null;
    return deskLadderStatus({
      reason: lastAi.autoLadderReason,
      modelName: lastAi.modelUsed,
      autoRouted: lastAi.autoRouted,
    });
  })();

  /* Screenshot-2 style change counters, straight off the review the desk already keeps. */
  const deskChangedCount = Array.isArray(deskReview) ? deskReview.length : 0;
  const deskAddedLines = (Array.isArray(deskReview) ? deskReview : []).reduce((sum, row) => sum + (Number(row?.added) || 0), 0);
  const deskRemovedLines = (Array.isArray(deskReview) ? deskReview : []).reduce((sum, row) => sum + (Number(row?.removed) || 0), 0);
  const hasRunnablePreview = Boolean(previewRunCode || activeOfficeArtifact(messages));
  const hasDeskFiles = Boolean(vfs && Object.keys(vfs).some((path) => path && vfs[path]?.content));
  const shopIntake = assessShopBuildAsk(lastUserMessage?.text || '');
  const shopTurnFailureCopy = lastAiMessage?.isError
    && (shopIntake.oversize || userAskedForPreviewPhotos(lastUserMessage?.text || '') || userAskedForShopDeskFix(lastUserMessage?.text || ''))
    ? shopPhotoTurnFailureCopy({
      timedOut: /timed out|90s limit|hit the \d+s limit/i.test(lastAiMessage?.text || ''),
      seconds: 90,
      assessment: shopIntake,
    })
    : '';
  const partnerStatus = resolveStudioPartnerStatus({
    isGenerating,
    generatingLabel: generatingStatus,
    elapsedSec: thinkingTime,
    lastAiIsError: Boolean(lastAiMessage?.isError),
    hasPreview: hasRunnablePreview,
    continueLabel: partnerContinueLabel,
    lastAiText: lastAiMessage?.text || '',
    hasUserTurn,
    officeKind: officeKindNow,
    studioDomain,
    codingDeskOpen,
    hasDeskFiles,
    photosMissing,
    shopUiMissing,
    shopIntake,
    shopTurnFailureCopy,
    previewRunStatus,
  });
  const studioMission = deriveStudioMission({
    conversationContext,
    messages,
    hasPreview: hasRunnablePreview,
    continueLabel: partnerContinueLabel,
    officeKind: officeKindNow,
    studioDomain,
    lastTurnFailed: Boolean(lastAiMessage?.isError) && !isGenerating,
  });
  const studyTopicLabel = studioDomain === 'education'
    ? deriveStudyTutorBrief({ conversationContext, messages }).label
    : '';
  const previewRunLabel = studioPreviewRunLabel(previewRunStatus);
  const deskJobLabel = studioJobCardLabel(deskJob);
  const isIdeLayout = isCodingDesk;

  return (
    <div
      className="ai-studio-shell"
      style={{
      display: 'flex',
      gap: '12px',
      maxWidth: isIdeLayout ? '100%' : '1400px',
      padding: isIdeLayout ? '12px' : '0',
      margin: '0 auto',
      flex: 1,
      minHeight: 0,
      height: '100%',
      width: '100%',
      alignItems: 'stretch',
      position: 'relative',
      overflow: 'hidden',
      transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      {/*
        Browser storage is full or unreadable. Saving is degraded RIGHT NOW, and
        the consequence lands later — on refresh — so it has to be stated while
        the user can still act. 'evicted' means the conversation was kept by
        dropping desk snapshots: the chats are safe, the builds are not.
        Absolutely positioned so the shell's flex row is untouched.
      */}
      {storageFault ? (
        <div
          role="status"
          data-quantora-storage-fault={storageFault.kind}
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            maxWidth: 'min(680px, 92%)',
            padding: '9px 14px',
            borderRadius: 10,
            fontSize: '0.82rem',
            lineHeight: 1.45,
            border: '1px solid rgba(249,115,22,0.45)',
            background: isLight ? '#fff7ed' : 'rgba(120,53,15,0.92)',
            color: isLight ? '#7c2d12' : '#fed7aa',
            boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
          }}
        >
          {storageFault.kind === 'evicted'
            ? `Browser storage was full. Your chats were kept, but ${storageFault.deskSnapshotsDropped || 1} saved Coding desk build${(storageFault.deskSnapshotsDropped || 1) === 1 ? ' was' : 's were'} dropped to make room — they will not survive a refresh. Publish or download anything you need.`
            : storageFault.kind === 'corrupt'
              ? 'Saved chats could not be read, so a fresh session was started. The previous data was kept aside rather than overwritten.'
              : storageFault.kind === 'quota'
                ? 'Browser storage is full, so new messages are no longer being saved. Delete an old chat to free space before refreshing.'
                : 'This browser is blocking local storage, so new messages are not being saved. Private browsing or a site-data setting is the usual cause — deleting chats will not help.'}
        </div>
      ) : null}
      {/* Left Navigation Sidebar — New Chat + footer stay; Chat History is the scroll region. */}
      <div
        data-quantora-studio-sidebar="true"
        style={{
        // deskFullscreen folds the sidebar without touching sidebarOpen, so
        // leaving full screen restores whatever the user had chosen.
        width: sidebarOpen && !deskFullscreen ? (isIdeLayout ? '220px' : '260px') : '0px',
        opacity: sidebarOpen && !deskFullscreen ? 1 : 0,
        pointerEvents: sidebarOpen && !deskFullscreen ? 'auto' : 'none',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        ...studioSidebarFrameStyle(),
        background: isLight ? '#f0f4f9' : 'var(--bg-secondary)',
        border: 'none',
        borderRadius: isIdeLayout ? '16px' : '0 24px 24px 0',
        padding: sidebarOpen && !deskFullscreen ? '14px 12px' : '0px',
        flexShrink: 0
      }}>
        {/* Sidebar Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexShrink: 0 }}>
          <button
            onClick={startNewChat}
            title="New Chat"
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

        {/* Projects — picker stays; one-line goal/description. Resume lives on the chat row. */}
        <div
          data-quantora-sidebar-projects="true"
          style={{
          ...studioSidebarYieldingSectionStyle({
            padding: '10px',
            marginBottom: '10px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }),
          borderRadius: '12px',
          background: isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.72)',
          border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148, 163, 184, 0.16)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <button
              type="button"
              data-quantora-sidebar-section="projectDetails"
              aria-expanded={sidebarSections.projectDetails}
              onClick={() => toggleSidebarSection('projectDetails')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: subtextColor,
                fontSize: '0.68rem',
                fontWeight: '800',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              <span>Projects</span>
              {sidebarSections.projectDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <button
              type="button"
              onClick={() => {
                const name = window.prompt('What should we call this project?', 'New project');
                if (name && name.trim()) handleCreateProject({ name: name.trim() });
              }}
              title="New Project"
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'transparent',
                color: isLight ? '#2563eb' : '#60a5fa',
                border: isLight ? '1px solid #bfdbfe' : '1px solid rgba(96, 165, 250, 0.35)',
                borderRadius: '7px',
                padding: '4px 7px',
                fontSize: '0.68rem',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              <Plus size={12} /> New
            </button>
          </div>
          <select
            aria-label="Active project"
            value={activeProjectId}
            onChange={(event) => setActiveProjectId(event.target.value)}
            style={{ width: '100%', background: isLight ? '#f8fafc' : '#111827', color: textColor, border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(148, 163, 184, 0.28)', borderRadius: '8px', padding: '7px 8px', fontSize: '0.82rem', fontWeight: '650', outline: 'none' }}
          >
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <div data-quantora-project-resume="true" style={{ color: subtextColor, fontSize: '0.73rem', lineHeight: 1.35, marginTop: '8px', minHeight: 0, maxHeight: sidebarSections.projectDetails ? '28vh' : undefined, overflow: sidebarSections.projectDetails ? 'auto' : 'hidden', flexShrink: 1 }}>
            <div style={{
              whiteSpace: sidebarSections.projectDetails ? 'normal' : 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {activeProject?.goal || activeProject?.description || 'Keep related chats and deliverables together.'}
            </div>
          </div>
          {sidebarSections.projectDetails && projectArtifacts.length > 0 && (
            <div style={{ color: subtextColor, fontSize: '0.7rem', marginTop: '8px', textAlign: 'center' }}>
              {projectArtifacts.length} linked artifact{projectArtifacts.length === 1 ? '' : 's'}
            </div>
          )}
        </div>

        {/* Specialized Agents — collapsible, open by default so desks stay discoverable for gates. */}
        <div data-quantora-sidebar-agents="true" style={studioSidebarYieldingSectionStyle({ marginBottom: sidebarSections.agents ? '10px' : '8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' })}>
          <button
            type="button"
            data-quantora-sidebar-section="agents"
            aria-expanded={sidebarSections.agents}
            onClick={() => toggleSidebarSection('agents')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'transparent',
              border: 'none',
              padding: '0 4px',
              marginBottom: sidebarSections.agents ? '8px' : 0,
              cursor: 'pointer',
              color: subtextColor,
              fontSize: '0.72rem',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              flexShrink: 0,
            }}
          >
            <span>Specialized Agents</span>
            {sidebarSections.agents ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {sidebarSections.agents ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingRight: '2px', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', flex: '1 1 auto' }}>
          <div
            data-quantora-coding-desk-nav="true"
            onClick={openCodingDesk}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 10px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: '500',
              color: isCodingDesk ? '#f97316' : textColor,
              background: isCodingDesk ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.12)') : 'transparent',
              border: isCodingDesk ? '1px solid rgba(249, 115, 22, 0.28)' : '1px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ flexShrink: 0 }}><Code2 size={15} color="#f97316" /></div>
            <span>Coding desk</span>
          </div>
          {[
            { domain: 'travel', title: 'Travel Advisor', icon: <Globe size={15} color="#3b82f6" /> },
            { domain: 'finance', title: 'Finance Advisor', icon: <PieChart size={15} color="#10b981" /> },
            { domain: 'education', title: 'Study Tutor', icon: <Lightbulb size={15} color="#64748b" /> },
            { domain: 'research', title: 'Research Analyst', icon: <Layers size={15} color="#8b5cf6" /> }
          ].map((card) => {
            const selected = studioDomain === card.domain;
            return (
            <div key={card.domain}>
            <div
              data-quantora-advisor={card.domain}
              data-quantora-active-specialist={selected ? card.domain : undefined}
              onClick={() => {
                openAdvisorWorkspace(card.domain);
                if (window.innerWidth < 768) setSidebarOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 10px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: '500',
                color: selected ? '#f97316' : textColor,
                background: selected ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.12)') : 'transparent',
                border: selected ? '1px solid rgba(249, 115, 22, 0.28)' : '1px solid transparent',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (selected) return;
                e.currentTarget.style.background = isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.borderColor = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                if (selected) return;
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'transparent';
              }}
            >
              <div style={{ flexShrink: 0 }}>{card.icon}</div>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.title}</span>
            </div>
            </div>
            );
          })}
        </div>
          ) : null}
        </div>

        {/* Chat History — always visible, flex-grow, internal scroll, scoped to the selected project. */}
        <div
          data-quantora-sidebar-history="true"
          style={studioSidebarHistoryPaneStyle()}
        >
          <div style={{ flexShrink: 0, paddingLeft: '4px', marginBottom: '8px' }}>
            <div
              data-quantora-sidebar-history-title="true"
              style={{ fontSize: '0.78rem', fontWeight: '750', color: textColor, letterSpacing: '0.01em' }}
            >
              {studioSidebarHistoryTitle(activeProject?.name)}
            </div>
            <div
              data-quantora-sidebar-history-hint="true"
              style={{ fontSize: '0.68rem', fontWeight: '500', color: subtextColor, marginTop: '3px' }}
            >
              {studioSidebarHistoryHint(chatSessions.length, activeProject?.name)}
            </div>
            {/*
              Which project new chats land in is worth saying — but not while
              someone is searching, when it is two lines of noise above the
              results they are looking at.
            */}
            {chatQuery.trim() ? null : (
              <div
                data-quantora-sidebar-history-membership="true"
                style={{ fontSize: '0.66rem', fontWeight: '500', color: subtextColor, marginTop: '3px', lineHeight: 1.35 }}
              >
                {studioSidebarMembershipCopy(activeProject?.name)}
              </div>
            )}
            {/*
              Search the chats, not just their titles. A title is generated from
              the opening line, so it cannot find the chat where the thing was
              discussed halfway through — which is the search people need.
            */}
            <div style={{ position: 'relative', marginTop: '8px', marginRight: '4px' }}>
              <Search
                size={13}
                color={subtextColor}
                style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              />
              <input
                data-quantora-sidebar-chat-search="true"
                value={chatQuery}
                onChange={(event) => setChatQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Escape') setChatQuery(''); }}
                placeholder="Search chats"
                aria-label="Search chats"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '6px 8px 6px 27px',
                  borderRadius: '9px',
                  border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.12)',
                  background: isLight ? '#ffffff' : 'rgba(255,255,255,0.05)',
                  color: textColor,
                  fontSize: '0.74rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div data-quantora-sidebar-history-list="true" style={studioSidebarHistoryListStyle()}>
            {visibleChatSessions.length === 0 ? (
              <div style={{ color: subtextColor, fontSize: '0.78rem', lineHeight: 1.4, padding: '8px 4px' }}>
                {/* A search that found nothing is a different fact from having no chats. */}
                {chatQuery.trim()
                  ? chatSearchEmptyCopy(chatQuery)
                  : studioSidebarHistoryHint(0, activeProject?.name)}
              </div>
            ) : visibleChatSessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const resume = deriveSessionResume(session);
            const showResumeChip = isResumeSession(session, projectResume);
            return (
              <div
                key={session.id}
                data-quantora-sidebar-chat={session.id}
                onClick={() => setActiveSessionId(session.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '6px',
                  minWidth: 0,
                  padding: '8px 10px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  flexShrink: 0,
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', flex: '1 1 120px', minWidth: 0 }}>
                  <MessageSquare size={15} color={isActive ? '#f97316' : subtextColor} style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0, overflow: 'hidden', flex: 1 }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: 0 }}>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
                        {session.title || 'New Chat'}
                      </span>
                      {/*
                        Age, so a long list is scannable. updatedAt is what the
                        reader cares about — "when did I last touch this" — and
                        createdAt only stands in for a chat that predates it.
                      */}
                      {(() => {
                        const age = relativeChatTime(session.updatedAt || session.createdAt);
                        return age ? (
                          <span
                            data-quantora-sidebar-chat-age="true"
                            style={{ fontSize: '0.66rem', fontWeight: 500, color: subtextColor, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
                          >
                            {age}
                          </span>
                        ) : null;
                      })()}
                    </span>
                    {resume?.next ? (
                      <span style={{
                        display: 'block',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontSize: '0.68rem',
                        fontWeight: 500,
                        color: subtextColor,
                        marginTop: '2px',
                      }}>
                        {resume.next}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, marginLeft: 'auto', minWidth: 0 }}
                  onClick={(event) => event.stopPropagation()}
                >
                  {showResumeChip ? (
                    <span
                      data-quantora-sidebar-resume-chip="true"
                      title="Latest outcome in this project"
                      style={{
                        flexShrink: 0,
                        borderRadius: '999px',
                        padding: '2px 6px',
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                        color: isLight ? '#c2410c' : '#fdba74',
                        background: isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.16)',
                        border: isLight ? '1px solid #fed7aa' : '1px solid rgba(249, 115, 22, 0.35)',
                      }}
                    >
                      Resume
                    </span>
                  ) : null}
                  {projects.length > 1 ? (
                    <select
                      aria-label="Move chat to project"
                      data-quantora-sidebar-move-chat={session.id}
                      value=""
                      onChange={(event) => {
                        const nextProjectId = event.target.value;
                        if (nextProjectId) handleMoveChatToProject(event, session.id, nextProjectId);
                      }}
                      style={{
                        maxWidth: '92px',
                        background: isLight ? '#f8fafc' : '#111827',
                        color: subtextColor,
                        border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148, 163, 184, 0.28)',
                        borderRadius: '6px',
                        padding: '2px 4px',
                        fontSize: '0.62rem',
                        fontWeight: 650,
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="" disabled>Move to…</option>
                      {projects
                        .filter((project) => project.id !== (session.projectId || activeProjectId))
                        .map((project) => (
                          <option key={project.id} value={project.id}>{project.name}</option>
                        ))}
                    </select>
                  ) : null}
                  <button
                    onClick={(e) => handleDeleteChat(e, session.id)}
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
              </div>
            );
          })}
          </div>
        </div>

        {/* Product feedback — explicit signed-in Studio entry point. */}
        <div style={{ paddingTop: '10px', marginTop: '8px', borderTop: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('quantora:open-feedback'))}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              borderRadius: '8px',
              background: 'transparent',
              border: '1px solid transparent',
              color: textColor,
              fontSize: '0.82rem',
              fontWeight: '600',
              cursor: 'pointer',
              textAlign: 'left'
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
            <MessageSquare size={15} color="#f97316" />
            <span>Feedback & Suggestions</span>
          </button>
        </div>
      </div>

      {/* Main Chat Interface (Center or Left if Workspace is Open) */}
      <div style={{
        flex: isIdeLayout ? `0 0 ${splitMobile ? 36 : chatWidthPct}%` : 1,
        // Hidden, not unmounted: the composer's draft, the scroll position and
        // every message stay exactly as they were while the IDE is full screen.
        display: deskFullscreen ? 'none' : 'flex',
        flexDirection: 'column',
        maxWidth: isIdeLayout ? `${splitMobile ? 36 : chatWidthPct}%` : '100%',
        margin: '0 auto',
        padding: isIdeLayout ? '0 8px 0 0' : '8px 20px 0',
        minHeight: 0,
        transition: splitMobile ? 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'
      }}>
        {/* Top Header Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: hasUserTurn ? '10px' : '0',
          paddingBottom: hasUserTurn ? '10px' : '0',
          borderBottom: hasUserTurn
            ? (isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)')
            : 'none'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                title="Open Chat History Sidebar"
                style={{
                  background: isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.08)',
                  border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.12)',
                  color: textColor,
                  padding: '8px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '4px'
                }}
              >
                <PanelLeft size={18} />
              </button>
            )}



            {hasUserTurn && (
              <>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(249, 115, 22, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={16} color="#f97316" />
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
              <h2 style={{ fontSize: '1.05rem', margin: 0, fontWeight: '700', color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {isAdvisorWorkspace ? domainPolicy.title : (activeSession ? activeSession.title : 'New Workspace')}
              </h2>
            </div>
              </>
            )}
          </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
          {/* Dual Model Arena Toggle Button — hidden across workspaces (SHOW_DUAL_ARENA) */}
          {SHOW_DUAL_ARENA && (
          <button
            data-quantora-dual-arena="true"
            aria-pressed={arenaMode}
            onClick={() => setArenaMode(!arenaMode)}
            title="Compare two AI models side-by-side in real time"
            style={{
              background: arenaMode ? 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)' : (isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.05)'),
              border: arenaMode ? 'none' : (isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.1)'),
              color: arenaMode ? '#ffffff' : textColor,
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: arenaMode ? '0 4px 12px rgba(249, 115, 22, 0.3)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <Layers size={14} /> {arenaMode ? '⚔️ Arena Active' : '⚔️ Dual Arena'}
          </button>
          )}

          {/* Model B Selector Dropdown in Arena Mode */}
          {arenaMode && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowSecondModelDropdown(!showSecondModelDropdown)}
                style={{
                  background: isLight ? '#ffffff' : '#0d1127',
                  border: '1px solid #f97316',
                  color: '#f97316',
                  padding: '6px 12px',
                  borderRadius: '18px',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>VS: {secondModel ? secondModel.name : 'Nvidia Nemotron 3'}</span>
                <ChevronDown size={12} />
              </button>

              {showSecondModelDropdown && (
                <div style={{
                  position: 'absolute',
                  top: '120%',
                  right: 0,
                  width: '240px',
                  background: isLight ? '#ffffff' : '#0d1127',
                  border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(249, 115, 22, 0.4)',
                  borderRadius: '14px',
                  padding: '8px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                  zIndex: 300
                }}>
                  <div style={{ fontSize: '0.7rem', color: subtextColor, padding: '4px 8px', fontWeight: '700', textTransform: 'uppercase' }}>
                    Select Competitor Model (Model B)
                  </div>
                  {availableModels && availableModels.map(m => (
                    <div
                      key={m.id}
                      onClick={() => {
                        setSecondModel(m);
                        setShowSecondModelDropdown(false);
                      }}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        background: secondModel?.id === m.id ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.2)') : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.8rem',
                        color: secondModel?.id === m.id ? '#f97316' : textColor,
                        fontWeight: secondModel?.id === m.id ? '700' : '500'
                      }}
                    >
                      <span>{m.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Messages Stream / Initial Hero State */}
      <div ref={chatContainerRef} onScroll={handleScroll} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: messages.length <= 1 ? 'center' : 'flex-start', overflowY: 'auto', marginBottom: '8px', position: 'relative' }}>
        {messages.length <= 1 && (isAdvisorWorkspace || !hideWelcomeScreen) ? (
          /* Clean Hero Empty State */
          <div style={{ 
            textAlign: 'center', 
            padding: '28px 24px 20px', 
            maxWidth: '640px', 
            margin: '0 auto', 
            width: '100%',
            background: isLight ? 'linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(248, 250, 252, 0.85))' : 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(24px) saturate(160%)',
            WebkitBackdropFilter: 'blur(24px) saturate(160%)',
            border: isLight ? '1px solid rgba(226, 232, 240, 0.8)' : '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            boxShadow: isLight ? '0 32px 64px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(255,255,255,0.6) inset' : '0 32px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.2)'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%)',
              border: '1px solid rgba(249, 115, 22, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px auto',
              boxShadow: '0 8px 24px rgba(249, 115, 22, 0.15)'
            }}>
              <Sparkles size={20} color="#f97316" />
            </div>

            <h1 style={{ fontSize: '1.85rem', fontWeight: '700', margin: '0 0 6px 0', color: textColor, letterSpacing: '-0.03em' }}>
              Hello, {user?.name ? user.name.split(' ')[0] : 'Bharani'}
            </h1>
            <p style={{ fontSize: '1rem', fontWeight: '400', margin: '0 0 20px 0', color: subtextColor }}>
              {isAdvisorWorkspace ? domainPolicy.hero : 'What would you like to build today?'}
            </p>

            {isAdvisorWorkspace && (
              <div data-quantora-workspace-capabilities={studioDomain} style={{ margin: '0 auto 24px auto', maxWidth: '660px' }}>
                <p style={{ margin: '0 0 18px 0', color: subtextColor, fontSize: '0.95rem', lineHeight: 1.6 }}>{domainPolicy.supporting}</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '9px', flexWrap: 'wrap' }}>
                  {domainPolicy.capabilities.map((capability) => (
                    <span key={capability} style={{ padding: '7px 12px', borderRadius: '999px', border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,0.22)', background: isLight ? '#ffffff' : 'rgba(15,23,42,0.48)', color: textColor, fontSize: '0.8rem', fontWeight: 700 }}>{capability}</span>
                  ))}
                </div>
                {studioDomain === 'education' && studySyllabusSet ? (
                  <div data-quantora-study-syllabus="true" style={{ marginTop: '16px' }}>
                    <StudioInlineSuggestions
                      suggestions={{ kind: 'continues', continueSet: studySyllabusSet }}
                      isLight={isLight}
                      onSelectContinue={commitStudySyllabusChip}
                      onDismiss={() => {
                        setDismissedSyllabus(true);
                        updateActiveSession({
                          conversationContext: applyStudySyllabusOverlay(conversationContext, 'open'),
                        });
                      }}
                    />
                  </div>
                ) : null}
              </div>
            )}

            {!isAdvisorWorkspace && (
              <>
            {/* AI Models Highlight Cards */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '10px',
              paddingBottom: '8px',
              width: '100%'
            }}>
              
              {(availableModels || [])
                .filter(m => m.available !== false)
                .slice(0, 3)
                .map((model, idx) => {
                  const colors = ['#f97316', '#8b5cf6', '#10b981'];
                  const icons = [<Cpu size={20} color={colors[idx]}/>, <Sparkles size={20} color={colors[idx]}/>, <Layers size={20} color={colors[idx]}/>];
                  const badges = ["HOT", "RECOMMENDED", "UPDATED"];
                  
                  return (
                    <div key={idx} style={{
                      flex: '1 1 200px',
                      maxWidth: '280px',
                      background: isLight ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.05)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      border: isLight ? '1px solid rgba(255, 255, 255, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: isLight ? '0 8px 32px rgba(31, 38, 135, 0.07)' : '0 8px 32px rgba(0, 0, 0, 0.3)',
                      borderRadius: '12px',
                      padding: '12px',
                      position: 'relative',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
                    }}
                    onMouseEnter={(e) => { 
                      e.currentTarget.style.transform = 'translateY(-3px)'; 
                      e.currentTarget.style.boxShadow = `0 12px 24px ${colors[idx]}33`; 
                      e.currentTarget.style.borderColor = `${colors[idx]}66`;
                    }}
                    onMouseLeave={(e) => { 
                      e.currentTarget.style.transform = 'none'; 
                      e.currentTarget.style.boxShadow = isLight ? '0 4px 12px rgba(0,0,0,0.03)' : '0 8px 32px rgba(0,0,0,0.2)'; 
                      e.currentTarget.style.borderColor = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)';
                    }}
                    onClick={() => {
                      if (setSelectedModel) setSelectedModel(model);
                    }}
                    >
                      <div style={{ position: 'absolute', top: 0, right: 0, background: `${colors[idx]}22`, color: colors[idx], fontSize: '0.65rem', fontWeight: '800', padding: '4px 10px', borderBottomLeftRadius: '12px' }}>
                        {model.tag || badges[idx]}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <div style={{ background: `${colors[idx]}15`, padding: '8px', borderRadius: '12px', display: 'flex' }}>
                          {icons[idx]}
                        </div>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', color: textColor, fontWeight: '700' }}>{formatModelName(model.name)}</h3>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: subtextColor, lineHeight: '1.5' }}>
                        {model.description}
                      </p>
                    </div>
                  );
              })}
            </div>

              </>
            )}
            
            <div style={{ marginTop: '10px', display: isAdvisorWorkspace ? 'none' : 'flex', justifyContent: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: subtextColor, fontSize: '0.78rem' }}>
                <input 
                  type="checkbox" 
                  checked={hideWelcomeScreen}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setHideWelcomeScreen(val);
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('quantora_hide_welcome', val);
                    }
                  }}
                  style={{ accentColor: '#f97316' }}
                />
                Do not show this next time
              </label>
            </div>

          </div>
        ) : (
          /* Active Chat Thread */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
            {renderedChatFeed}
            {studioDomain === 'education' ? (
              <Suspense fallback={null}>
                <StudyTutorWorkspace
                  key={activeSessionId}
                  activeSessionId={activeSessionId}
                  conversationContext={conversationContext}
                  messages={messages}
                  isLight={isLight}
                  textColor={textColor}
                  subtextColor={subtextColor}
                  onAsk={(text) => setInputText(text)}
                  onSend={(text, sendOptions) => handleSendMessage(text, sendOptions)}
                />
              </Suspense>
            ) : null}
            {pclIntercept && (
              <div className="animate-slide-up" style={{ 
                margin: '20px 0', 
                padding: '20px', 
                background: isLight ? '#fff' : '#0f172a', 
                border: '1px solid rgba(249, 115, 22, 0.4)', 
                borderRadius: '16px',
                boxShadow: isLight ? '0 10px 25px rgba(0,0,0,0.05)' : '0 10px 25px rgba(0,0,0,0.3)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', color: '#f97316', fontWeight: 'bold' }}>
                  <Sparkles size={20} /> PCL Observation
                </div>
                <div style={{ color: 'var(--text-primary)', marginBottom: '20px', lineHeight: '1.5' }}>
                  <strong>{pclIntercept.targetModel.name}</strong> hit an error on your last request a few moments ago.
                  Want me to route this one to <strong>{pclIntercept.fallbackModel?.name}</strong> instead?
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => handlePclDecision(true)}
                    style={{ background: '#f97316', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', flex: 1 }}
                  >
                    Route to {pclIntercept.fallbackModel?.name}
                  </button>
                  <button
                    onClick={() => handlePclDecision(false)}
                    style={{ background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: 'none', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', flex: 1 }}
                  >
                    Stay on {pclIntercept.targetModel.name}
                  </button>
                </div>
              </div>
            )}
            {isGenerating && (
              <div className="animate-slide-up" style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', marginTop: '4px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Sparkles size={18} className="animate-spin" color="#f97316" />
                </div>
                <div style={{ flex: 1, color: '#f97316', fontSize: '0.95rem', paddingTop: '8px', fontWeight: 500, lineHeight: 1.45 }}>
                  <div>{partnerStatus?.now || generatingStatus || 'Working on a result you can actually use…'}</div>
                  {partnerStatus?.next ? (
                    <div style={{ fontSize: '0.82rem', color: subtextColor, fontWeight: 500, marginTop: '4px' }}>
                      {partnerStatus.next}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Scroll Navigation */}
      <div style={{ position: 'absolute', bottom: '110px', right: '30px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 100 }}>
        {showScrollUp && (
          <button
            onClick={() => chatContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            style={{ background: isLight ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)', color: subtextColor, width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', transition: 'background 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.background = isLight ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,0.7)'}
            onMouseLeave={(e) => e.currentTarget.style.background = isLight ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)'}
            title="Scroll to top"
          >
            <ChevronUp size={18} />
          </button>
        )}
        {showScrollDown && (
          <button
            onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
            style={{ background: isLight ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)', color: subtextColor, width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', transition: 'background 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.background = isLight ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,0.7)'}
            onMouseLeave={(e) => e.currentTarget.style.background = isLight ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)'}
            title="Scroll to bottom"
          >
            <ChevronDown size={18} />
          </button>
        )}
      </div>

      {/* Clean Prompt Console Input Area */}
      <div style={{ position: 'relative', width: '100%', maxWidth: '1000px', margin: '0 auto' }}>
        <StudioMissionCard
          mission={
            // Coding Desk: mission chrome is not a progress indicator — it sits forever
            // echoing the last oversize ask ("Building: 100 unique…") and mocks failure.
            // Advisors keep a short sticky goal; coding only shows it while generating.
            missionDismissed
              ? null
              : ['travel', 'education', 'finance', 'research'].includes(studioDomain)
                ? studioMission
                : (isGenerating ? studioMission : null)
          }
          // Study shows the topic in its own focus card; repeating it here is noise.
          hideGoal={studioDomain === 'education'}
          onDismiss={() => setMissionDismissedFor(activeSessionId)}
          isLight={isLight}
          textColor={textColor}
          subtextColor={subtextColor}
        />
        {partnerStatus && !isGenerating && previewShellIsWarming(previewRunStatus) ? (
          <div
            data-quantora-partner-status="true"
            role="status"
            aria-live="polite"
            style={{
              margin: '0 8px 8px',
              padding: '8px 12px',
              borderRadius: '10px',
              background: isLight ? '#f8fafc' : 'rgba(255,255,255,0.04)',
              border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ fontSize: '0.78rem', fontWeight: 650, color: textColor, lineHeight: 1.4 }}>{partnerStatus.now}</div>
            {partnerStatus.next ? (
              <div style={{ fontSize: '0.74rem', color: subtextColor, marginTop: '2px', lineHeight: 1.4 }}>{partnerStatus.next}</div>
            ) : null}
          </div>
        ) : null}
        {/* Prompt Card Container */}
        <div className="floating-input-pill" style={{
          overflow: 'visible',
          position: 'relative',
          padding: '12px 14px',
          background: isLight ? '#f4f4f5' : '#27272a',
          borderRadius: '24px',
          border: isLight ? '1px solid #e4e4e7' : '1px solid #3f3f46',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          {/* Attachment Files Badge Bar (Moved inside pill) */}
          {attachments.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
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
          {/* Intelligent Router Suggestion Pill */}
          {suggestedModel && !showMentionMenu && !isAdvisorWorkspace && (
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
                🧠 Looks like you're {suggestedModel.name.includes('Qwen') ? 'coding' : 'researching'}. Recommend: <strong style={{color: '#f97316'}}>{suggestedModel.name}</strong>
              </span>
              <button 
                onClick={() => { setSelectedModel(suggestedModel); setSuggestedModel(null); }}
                style={{ background: '#f97316', color: '#fff', border: 'none', padding: '3px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}>
                Switch
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
          <div style={{ position: 'relative', padding: '0' }}>
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
              placeholder={awaitingStudyAnswer ? 'Write your answer to the question above…' : domainPolicy.placeholder}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: textColor,
                fontSize: '1rem',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                lineHeight: '1.5',
                minHeight: '24px',
                maxHeight: isAdvisorWorkspace ? '170px' : '220px',
                overflowY: 'auto',
                overflowX: 'hidden',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Bottom Action Toolbar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 14px 10px 14px',
            background: 'transparent',
            gap: '10px',
            flexWrap: 'wrap'
          }}>
            {/* Left Toolbar Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                multiple
              />

              {/* Attachment Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Attach File"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: subtextColor,
                  padding: '6px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.color = textColor;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = subtextColor;
                }}
              >
                <Paperclip size={18} />
              </button>

              {/* Plus Button for Tools Menu */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  ref={plusMenuAnchorRef}
                  data-quantora-plus-trigger="true"
                  aria-expanded={showToolsMenu}
                  aria-haspopup="menu"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setShowToolsMenu((open) => !open);
                  }}
                  title={studioDomain === 'travel' ? 'This trip' : studioDomain === 'education' ? 'This topic' : 'Tools'}
                  style={{
                    background: showToolsMenu ? (isLight ? '#f1f5f9' : 'rgba(255,255,255,0.1)') : 'transparent',
                    border: 'none',
                    color: showToolsMenu ? textColor : subtextColor,
                    padding: '6px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={e => {
                    if (!showToolsMenu) {
                      e.currentTarget.style.background = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.08)';
                      e.currentTarget.style.color = textColor;
                    }
                  }}
                  onMouseLeave={e => {
                    if (!showToolsMenu) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = subtextColor;
                    }
                  }}
                >
                  <Plus size={18} />
                </button>
                <StudioToolsMenu
                  isOpen={showToolsMenu}
                  anchorRef={plusMenuAnchorRef}
                  onClose={() => setShowToolsMenu(false)}
                  isLight={isLight}
                  studioDomain={studioDomain}
                  topic={studioDomain === 'education' ? (studyTopicLabel || 'this topic') : (conversationContext?.goal || '')}
                  onSelectTool={(tool) => {
                    const overlay = inferStudySyllabus({
                      conversationContext,
                      messages,
                      extra: inputText,
                    });
                    const action = resolveStudioPlusAction(
                      tool,
                      studioDomain,
                      studioDomain === 'education' ? (studyTopicLabel || 'this topic') : (conversationContext?.goal || ''),
                      overlay,
                    );
                    setShowToolsMenu(false);
                    if (action.kind === STUDIO_PLUS_ACTION.FRESH_THREAD && action.domain) {
                      handleCreateAdvisorChat(action.domain);
                      return;
                    }
                    if (action.kind === STUDIO_PLUS_ACTION.OPEN_DOMAIN && action.domain) {
                      openAdvisorWorkspace(action.domain);
                      return;
                    }
                    if (action.kind === STUDIO_PLUS_ACTION.PROMPT && action.text) {
                      if (String(tool).startsWith('study-')) {
                        handleSendMessage(action.text, { visibleUserText: action.visibleText });
                        return;
                      }
                      if (String(tool).startsWith('travel-')) {
                        handleSendMessage(action.text);
                        return;
                      }
                      setInputText(action.text);
                      if (textareaRef.current) {
                        textareaRef.current.focus();
                      }
                    }
                  }}
                />
              </div>

              {/* Attach File */}
              <button
                onClick={toggleVoiceInput}
                title="Voice Input"
                style={{
                  background: isListening ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                  border: 'none',
                  color: isListening ? '#ef4444' : subtextColor,
                  padding: '6px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: isListening ? 'pulse 2s infinite' : 'none'
                }}
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              
              {/* Attachment Dropdown */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setIsAttachmentMenuOpen(!isAttachmentMenuOpen)}
                  title="Attach file, image, or GitHub"
                  style={{
                    background: isAttachmentMenuOpen ? (isLight ? '#f1f5f9' : 'rgba(255,255,255,0.1)') : 'transparent',
                    border: 'none',
                    color: isAttachmentMenuOpen ? textColor : subtextColor,
                    padding: '6px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={e => {
                    if (!isAttachmentMenuOpen) {
                      e.currentTarget.style.background = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.08)';
                      e.currentTarget.style.color = textColor;
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isAttachmentMenuOpen) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = subtextColor;
                    }
                  }}
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
              <button
                onClick={handleMagicWandEnhance}
                disabled={isEnhancingPrompt}
                title="Refine prompt"
                style={{
                  background: isEnhancingPrompt ? (isLight ? 'rgba(249, 115, 22, 0.1)' : 'rgba(249, 115, 22, 0.2)') : 'transparent',
                  border: 'none',
                  color: isEnhancingPrompt ? '#f97316' : subtextColor,
                  padding: isEnhancingPrompt ? '4px 12px' : '6px',
                  borderRadius: '12px',
                  cursor: isEnhancingPrompt ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  fontWeight: '600',
                  fontSize: '0.8rem'
                }}
              >
                {isEnhancingPrompt ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Polishing...
                  </>
                ) : (
                  <Wand2 size={18} color={subtextColor} />
                )}
              </button>

              {/* Engine Settings Popover */}
              <div ref={inBarModelRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowInBarModelDropdown(!showInBarModelDropdown)}
                  title="Select AI Engine"
                  style={{
                    display: isAdvisorWorkspace ? 'none' : 'flex',
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
                  <span>{isCodingDeskAutoSelection(selectedModel) ? 'Auto' : (selectedModel ? formatModelName(selectedModel.name).split(' ')[0] : 'Engine')}</span>
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {[CODING_DESK_AUTO_MODEL, ...((availableModels || []).filter(m => m.available !== false && m.id !== CODING_DESK_AUTO_MODEL.id))].map(model => {
                          const isActive = isCodingDeskAutoSelection(selectedModel)
                            ? model.id === CODING_DESK_AUTO_MODEL.id
                            : selectedModel?.id === model.id;
                          return (
                          <div
                            key={model.id}
                            onClick={() => {
                              setSelectedModel(model);
                              setShowInBarModelDropdown(false);
                            }}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              background: isActive ? (isLight ? '#fff7ed' : 'rgba(249, 115, 22, 0.15)') : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '0.8rem',
                              color: isActive ? '#f97316' : textColor,
                              fontWeight: isActive ? '700' : '500',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              if (!isActive) {
                                e.currentTarget.style.background = isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.05)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isActive) e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatModelName(model.name)}</span>
                              <span style={{ fontSize: '0.68rem', color: subtextColor, fontWeight: '400' }}>{model.id === 'auto' ? 'Silent routing for Coding Desk' : (model.provider || (model.id.startsWith('gemini') ? 'Google' : 'OpenRouter'))}</span>
                            </div>
                            {isActive && (
                              <span style={{ fontSize: '0.65rem', background: '#f97316', color: '#fff', padding: '2px 6px', borderRadius: '10px', flexShrink: 0 }}>Active</span>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>



            </div>

            {/* Right Control: Send & Push Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => {
                  if (!inputText.trim()) return;
                  if (setDreamNodes && dreamNodes) {
                    const newNode = {
                      id: Date.now().toString(),
                      stage: 'dream',
                      dreamText: inputText,
                      ideaSpec: null,
                      thoughtCode: null,
                      actionUrl: null,
                      isExecuting: false,
                      timestamp: Date.now()
                    };
                    setDreamNodes([...dreamNodes, newNode]);
                    if (setActiveTab) setActiveTab('canvas');
                  }
                }}
                disabled={!inputText.trim()}
                title="Push raw prompt to Dream Canvas"
                style={{
                  display: domainPolicy.showGenericCanvasNavigation ? 'flex' : 'none',
                  background: inputText.trim() ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                  border: inputText.trim() ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid transparent',
                  color: inputText.trim() ? '#8b5cf6' : (isLight ? '#94a3b8' : 'rgba(255, 255, 255, 0.45)'),
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  cursor: inputText.trim() ? 'pointer' : 'default',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease'
                }}
              >
                <Workflow size={16} />
              </button>

              {isGenerating ? (
                <button
                  onClick={() => cancelStream()}
                  title="Stop generating"
                  style={{
                    background: isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: isLight ? '#64748b' : '#94a3b8',
                    width: '38px',
                    height: '38px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                    boxShadow: 'none'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#ef4444';
                    e.currentTarget.style.background = isLight ? '#fee2e2' : 'rgba(239, 68, 68, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = isLight ? '#64748b' : '#94a3b8';
                    e.currentTarget.style.background = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)';
                  }}
                >
                  <Square size={14} fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!inputText.trim() && !attachments.length}
                  style={{
                    background: (inputText.trim() || attachments.length) ? '#f97316' : (isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)'),
                    border: 'none',
                    color: (inputText.trim() || attachments.length)
                      ? '#ffffff'
                      : (isLight ? '#94a3b8' : 'rgba(255, 255, 255, 0.45)'),
                    width: '38px',
                    height: '38px',
                    borderRadius: '12px',
                    cursor: (inputText.trim() || attachments.length) ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                    fontWeight: 'bold',
                    boxShadow: (inputText.trim() || attachments.length) ? '0 4px 14px rgba(249, 115, 22, 0.35)' : 'none'
                  }}
                >
                  <Send size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

      </div>
      </div>

      {/* Live Preview Canvas Overlay Modal */}
      {canvasOpen && (canExplicitlyPreviewCode(studioDomain) || Boolean(detectOfficeIntent({ messages }))) && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '1200px',
            height: '90vh',
            background: isLight ? '#f8fafc' : '#0d1127',
            borderRadius: '20px',
            border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(249, 115, 22, 0.5)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
          <div style={{
            flex: 1, 
            background: isLight ? '#f8fafc' : '#0f172a',
            overflow: 'hidden',
            position: 'relative'
          }}>
              <LivePreviewCanvas
                code={canvasCode}
                vfs={canvasVfs}
                isLight={isLight}
                onClose={() => setCanvasOpen(false)}
                user={user}
                onRequireAuth={onOpenAuth}
                turnBusy={isGenerating}
                isPresentationIntent={detectSlideDeck(messages)}
                officeKind={detectOfficeIntent({ messages })}
                allowPublish={canOfferVercelPublish({
                  messages,
                  vfs: canvasVfs,
                  conversationContext,
                  officeKind: detectOfficeIntent({ messages }) || activeOfficeArtifact(messages)?.kind,
                })}
                modelId={selectedModel?.id}
                correlationId={workspaceCorrelationId}
                goldenTransaction={workspaceGoldenTransaction}
                verifyBrief={[...messages].reverse().find((message) => message.sender === 'user')?.text || ''}
              />
          </div>
          </div>
        </div>
      )}

      {/* Right Panel: Studio coding desk */}
      {isCodingDesk && !splitMobile && !deskFullscreen ? (
        <div
          ref={chatDeskSplitRef}
          data-quantora-chat-desk-split="true"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat and Coding desk"
          onMouseDown={beginChatDeskResize}
          style={{ width: '5px', flexShrink: 0, cursor: 'col-resize', alignSelf: 'stretch', margin: '0 2px', borderLeft: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.06)' }}
        />
      ) : null}
      {isCodingDesk && (
        <div
          ref={deskShellRef}
          data-quantora-code-workspace="true"
          data-quantora-studio-ide="true"
          data-quantora-desk-fullscreen={deskFullscreen ? 'true' : 'false'}
          style={{
          /*
           * Full screen gives the desk the whole studio area by collapsing the
           * chat column and the sidebar beside it — it is not a fixed overlay
           * and not a portal.
           *
           * An overlay was tried first and lost: the desk sits inside a
           * stacking context that the product header paints above, so the desk
           * header — and with it the only way back out — ended up underneath
           * the nav. Widening the element that is already mounted has no
           * stacking to lose, keeps the product nav reachable, and never
           * reparents the preview iframe, so nothing reloads on the way in or
           * out.
           */
          flex: 1,
          position: 'relative',
          borderRadius: deskFullscreen ? '12px' : '16px',
          border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)',
          background: isLight ? '#ffffff' : '#0d1127',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: isLight ? '0 10px 40px rgba(0,0,0,0.05)' : '0 20px 60px rgba(0,0,0,0.4)',
          minWidth: 0,
        }}>
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
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: textColor, display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 auto', minWidth: 0, overflow: 'hidden' }}>
              <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>Coding desk</span>
              {deskLadder ? (
                <span
                  data-quantora-desk-ladder="true"
                  data-quantora-desk-ladder-tier={deskLadder.tier}
                  title={deskLadderSummary(deskLadder)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    flexShrink: 0,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    ...deskLadderChipColors(deskLadder.tier, isLight, subtextColor),
                  }}
                >
                  <Layers size={10} />
                  {deskLadderChipLabel(deskLadder)}
                </span>
              ) : null}
              {deskJobLabel ? (
                <span
                  data-quantora-desk-job="true"
                  title={deskJob?.mustWork?.join(' • ') || deskJobLabel}
                  style={{ fontSize: '0.68rem', fontWeight: 600, color: subtextColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {deskJobLabel}
                </span>
              ) : null}
              {previewRunLabel ? (
                <span
                  data-quantora-preview-run-status="true"
                  style={{ fontSize: '0.68rem', fontWeight: 600, color: subtextColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {previewRunLabel}
                </span>
              ) : null}
            </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '0 0 auto' }}>
              <Suspense fallback={<div aria-hidden="true" style={{ width: (!deskFullscreen && deskWidthPx > 0 && deskWidthPx < 1060) ? '150px' : '330px', height: '28px' }} />}>
              <StudioActivityRail
                activeTab={workspaceActiveTab}
                onOpenTab={setWorkspaceActiveTab}
                filesOpen={deskFilesOpen}
                onToggleFiles={() => setDeskFilesOpen((open) => !open)}
                changedCount={deskChangedCount}
                addedLines={deskAddedLines}
                removedLines={deskRemovedLines}
                isLight={isLight}
                textColor={textColor}
                subtextColor={subtextColor}
                compact={!deskFullscreen && deskWidthPx > 0 && deskWidthPx < 1060}
              />
              </Suspense>
              <span aria-hidden="true" style={{ width: '1px', height: '18px', background: isLight ? '#e2e8f0' : 'rgba(255,255,255,0.12)' }} />
              {canOfferVercelPublish({
                messages,
                vfs,
                conversationContext,
                officeKind: detectOfficeIntent({ messages }) || activeOfficeArtifact(messages)?.kind,
              }) && previewRunCode && (
                <div ref={deskPublishMenuRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    data-quantora-publish="true"
                    data-quantora-desk-publish="true"
                    onClick={() => setDeskPublishMenuOpen((open) => !open)}
                    style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Link2 size={12} /> Publish <ChevronDown size={12} />
                  </button>
                  {deskPublishMenuOpen ? (
                    <div data-quantora-desk-publish-menu="true" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 40, minWidth: '180px', background: isLight ? '#ffffff' : '#0f172a', border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', boxShadow: '0 12px 32px rgba(0,0,0,0.28)', padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <button type="button" onClick={() => { setDeskPublishMenuOpen(false); setWorkspaceActiveTab('preview'); previewCanvasRef.current?.openShare?.(); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', cursor: 'pointer', color: textColor, padding: '8px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, textAlign: 'left' }}>
                        <Link2 size={13} color="#0284c7" /> Share link
                      </button>
                      <button type="button" onClick={() => { setDeskPublishMenuOpen(false); setWorkspaceActiveTab('preview'); previewCanvasRef.current?.openPublish?.(); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', cursor: 'pointer', color: textColor, padding: '8px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, textAlign: 'left' }}>
                        <Rocket size={13} color="#f97316" /> Publish to Vercel
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
              {workspaceActiveTab === 'preview' && previewRunCode ? (
                <Suspense fallback={null}>
                  <StudioPreviewControls
                    chrome={previewChrome}
                    onDownload={() => previewCanvasRef.current?.download?.()}
                    onImprove={() => previewCanvasRef.current?.improve?.()}
                    onViewport={(next) => previewCanvasRef.current?.setViewport?.(next)}
                    isLight={isLight}
                    textColor={textColor}
                    subtextColor={subtextColor}
                    compact={!deskFullscreen && deskWidthPx > 0 && deskWidthPx < 1060}
                  />
                </Suspense>
              ) : null}
              <button
                type="button"
                data-quantora-desk-canvas="true"
                disabled={!previewRunCode}
                onClick={() => {
                  if (!previewRunCode) return;
                  setWorkspaceActiveTab('preview');
                  setCanvasVfs(vfs);
                  setCanvasCode(previewRunCode);
                  setCanvasOpen(true);
                }}
                title="Open full Preview canvas"
                style={{ background: 'transparent', border: '1px solid rgba(249, 115, 22, 0.3)', color: previewRunCode ? '#f97316' : subtextColor, padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: previewRunCode ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '4px', opacity: previewRunCode ? 1 : 0.55 }}
              >
                <Layers size={12} /> Canvas
              </button>
              <button
                type="button"
                data-quantora-desk-ide="true"
                data-quantora-desk-ide-open={deskFullscreen ? 'true' : 'false'}
                onClick={() => setDeskFullscreen((open) => !open)}
                title={deskFullscreen ? 'Leave full screen  (Esc)' : 'Open IDE full screen  (Ctrl/Cmd + Shift + Enter)'}
                aria-label={deskFullscreen ? 'Leave full screen' : 'Open IDE full screen'}
                aria-pressed={deskFullscreen}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: deskFullscreen ? (isLight ? 'rgba(249,115,22,0.12)' : 'rgba(249,115,22,0.16)') : 'transparent',
                  border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.12)',
                  color: deskFullscreen ? '#f97316' : subtextColor,
                  padding: '4px 9px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                IDE
                {deskFullscreen ? <Minimize2 size={11} /> : <ArrowUpRight size={11} />}
              </button>
              <button
                onClick={closeStudioWorkspace}
                title="Hide coding desk"
                aria-label="Hide coding desk"
                style={{ background: 'transparent', border: 'none', color: subtextColor, cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <Suspense fallback={<div style={{ minHeight: '36px', flexShrink: 0, background: isLight ? '#f1f5f9' : '#070913', borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.08)' }} />}>
          <StudioTabBar
            tabs={openTabs}
            activeTab={workspaceActiveTab}
            onSelect={setWorkspaceActiveTab}
            onClose={closeDeskTabAt}
            onOpenFinder={() => setDeskFinderOpen(true)}
            isLight={isLight}
            textColor={textColor}
            subtextColor={subtextColor}
          />
          </Suspense>

          <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
            {deskFilesOpen ? (
            <Suspense fallback={<div aria-hidden="true" style={{ width: `${splitMobile ? 212 : filesWidthPx}px`, flexShrink: 0, height: '100%', background: isLight ? '#f8fafc' : '#070913', borderRight: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.08)' }} />}>
            <StudioFileTree
              vfs={vfs}
              activePath={workspaceActiveTab}
              onSelect={setWorkspaceActiveTab}
              isLight={isLight}
              textColor={textColor}
              subtextColor={subtextColor}
              review={deskReview}
              probes={deskPacket?.checks || []}
              nextBeat={deskPacket?.nextBeat || ''}
              job={deskJob}
              width={splitMobile ? 212 : filesWidthPx}
            />
            </Suspense>
            ) : null}
            {deskFilesOpen && !splitMobile ? (
              <div
                ref={filesPreviewSplitRef}
                data-quantora-files-preview-split="true"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize Files and Preview"
                onMouseDown={beginFilesPreviewResize}
                style={{ width: '5px', flexShrink: 0, cursor: 'col-resize', background: isLight ? '#f1f5f9' : '#0a0d1e', borderRight: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.06)' }}
              />
            ) : null}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: workspaceActiveTab === 'preview' ? (isLight ? '#f8fafc' : '#0f172a') : '#0d1127', position: 'relative', overflow: 'hidden', minWidth: 0 }}>
             {workspaceActiveTab === 'preview' ? (
                  <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                    {!previewRunCode ? (
                      isGenerating ? (
                      <div data-quantora-preview-waiting="true" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', color: subtextColor, background: isLight ? '#f8fafc' : '#0f172a' }}>
                        <Clock size={26} color="#f97316" />
                        <div style={{ fontWeight: 800, color: textColor }}>Preview is starting…</div>
                        <div style={{ fontSize: '0.82rem' }}>Your app will appear here as soon as it is ready to run.</div>
                      </div>
                      ) : (
                      <div data-quantora-ide-empty="true" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', color: subtextColor, background: isLight ? '#f8fafc' : '#0f172a', padding: '24px', textAlign: 'center' }}>
                        <Code2 size={26} color="#f97316" />
                        <div style={{ fontWeight: 800, color: textColor }}>Ask me to build something</div>
                        <div style={{ fontSize: '0.82rem', maxWidth: '280px' }}>Files will show up here. This is the coding desk — not Travel, not Study.</div>
                      </div>
                      )
                    ) : (
                    <LivePreviewCanvas
                      ref={previewCanvasRef}
                      code={previewRunCode}
                      assemblyKey={previewAssemblyKey}
                      isLight={isLight}
                      onClose={closeStudioWorkspace}
                      hideHeader
                      user={user}
                      onRequireAuth={onOpenAuth}
                      vfs={vfs}
                      turnBusy={isGenerating}
                      onVerificationStatusChange={setPreviewRunStatus}
                      onChromeChange={setPreviewChrome}
                      jobCard={deskJob}
                      onHealedPreview={handleHealedPreview}
                      onLiveDeskProbe={setLiveDeskProbe}
                      suggestedProjectName={messages.length > 0 ? messages[0].text.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'quantora-app'}
                      isPresentationIntent={detectSlideDeck(messages)}
                      officeKind={detectOfficeIntent({ messages })}
                      allowPublish={canOfferVercelPublish({
                        messages,
                        vfs,
                        conversationContext,
                        officeKind: detectOfficeIntent({ messages }) || activeOfficeArtifact(messages)?.kind,
                      })}
                      modelId={selectedModel?.id}
                      correlationId={workspaceCorrelationId}
                      goldenTransaction={workspaceGoldenTransaction}
                      verifyBrief={[...messages].reverse().find((message) => message.sender === 'user')?.text || ''}
                    />
                    )}
                    {isGenerating && workspaceCode && messages.some((message) => message?.officeAttachment?.verification?.passed === true) && detectOfficeIntent({ messages }) && (
                      <div
                        role="status"
                        aria-live="polite"
                        style={{
                          position: 'absolute', top: '14px', right: '16px', zIndex: 30,
                          display: 'flex', alignItems: 'center', gap: '10px',
                          padding: '10px 14px', borderRadius: '12px',
                          background: isLight ? 'rgba(255,255,255,0.96)' : 'rgba(15,23,42,0.94)',
                          border: isLight ? '1px solid #dbeafe' : '1px solid rgba(96,165,250,0.35)',
                          boxShadow: '0 8px 24px rgba(15,23,42,0.18)',
                          color: isLight ? '#1e3a8a' : '#bfdbfe',
                          maxWidth: '360px',
                        }}
                      >
                        <RefreshCw size={15} className="animate-spin" />
                        <div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 800 }}>Updating presentation…</div>
                          <div style={{ fontSize: '0.68rem', marginTop: '2px', opacity: 0.78 }}>Last verified version stays visible until the revision passes verification.</div>
                        </div>
                      </div>
                    )}
                  </div>
             ) : workspaceActiveTab === 'terminal' ? (
               <Suspense fallback={<div style={{ flex: 1, minHeight: 0, background: isLight ? '#f8fafc' : '#0d1127' }} />}>
               <StudioTerminal
                 vfs={shellVfs}
                 isLight={isLight}
                 textColor={textColor}
                 subtextColor={subtextColor}
               />
               </Suspense>
             ) : workspaceActiveTab === 'git' ? (
               <Suspense fallback={<div style={{ flex: 1, minHeight: 0, background: isLight ? '#f8fafc' : '#0d1127' }} />}>
               <StudioGit
                 vfs={shellVfs}
                 workspaceKey={activeSessionId || ''}
                 githubRepoUrl={importedGithubRepoUrl}
                 githubBaseBranch={importedGithubBaseBranch}
                 isLight={isLight}
                 textColor={textColor}
               />
               </Suspense>
             ) : (
               <Suspense fallback={<div style={{ padding: '24px', color: subtextColor }}>Loading editor…</div>}>
                 <WorkspaceCodeEditor
                   path={workspaceActiveTab}
                   isLight={isLight}
                   value={(workspaceActiveTab !== 'preview' && workspaceActiveTab !== 'code' && workspaceActiveTab !== 'terminal' && workspaceActiveTab !== 'git' && vfs[workspaceActiveTab]) ? vfs[workspaceActiveTab].content : workspaceCode}
                   onChange={(val) => handleCodeChange({ target: { value: val, selectionStart: String(val || '').length } })}
                 />
               </Suspense>
             )}
            </div>
          </div>
        </div>
      )}

      {deskFinderOpen ? (
        <Suspense fallback={null}>
          <StudioFileFinder
            open
            vfs={vfs}
            onPick={setWorkspaceActiveTab}
            onClose={() => setDeskFinderOpen(false)}
            isLight={isLight}
          />
        </Suspense>
      ) : null}

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
                <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800', color: textColor }}>Import Repository</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: subtextColor }}>Load read-only codebase context into AI Studio (not a full clone).</p>
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
                <><RefreshCw size={18} className="animate-spin" /> Fetching Codebase...</>
              ) : (
                <><Github size={18} /> Import to Context</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Magic Wand Blocking Loader Overlay */}
      {isEnhancingPrompt && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: isLight ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(36px) saturate(200%)',
          WebkitBackdropFilter: 'blur(36px) saturate(200%)',
          zIndex: 3000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={{
            background: isLight ? 'rgba(255,255,255,0.95)' : 'rgba(15, 23, 42, 0.9)',
            border: isLight ? '1px solid rgba(226,232,240,1)' : '1px solid rgba(255,255,255,0.1)',
            padding: '48px 64px',
            borderRadius: '24px',
            boxShadow: isLight ? '0 40px 80px rgba(0,0,0,0.06)' : '0 40px 80px rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px',
            minWidth: '400px'
          }}>
            <Wand2 size={56} color="#f97316" className="animate-spin" style={{ animationDuration: '4s' }} />
            <h3 style={{ margin: 0, fontSize: '1.75rem', fontWeight: '800', color: textColor, letterSpacing: '-0.02em' }}>
              Synthesizing Architecture
            </h3>
            <p style={{ margin: 0, color: subtextColor, fontSize: '1.1rem', fontWeight: '400' }}>
              Orchestrating multi-model pipelines for your prompt.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
