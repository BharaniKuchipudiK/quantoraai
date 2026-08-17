const EXECUTIVE_AUDIENCE = /\b(cio|cto|cfo|ceo|coo|ciso|chief\s+\w+\s+officer|board|executive(?:s| leadership)?|leadership team|steering committee|steerco|client leadership|senior management)\b/i;
const ACADEMIC_AUDIENCE = /\b(professor|lecturer|faculty|teacher|classmates?|students?|academic|university|college|school|research committee|thesis|dissertation)\b/i;
const DOCUMENT_ARCHETYPE = /\b(qbr|quarterly business review|business case|weekly (?:project )?status|project status|status report|steerco|steering committee|board update|executive briefing|research presentation|academic presentation|thesis defense|sales pitch|proposal|strategy deck|roadmap)\b/i;
const PRESENTER_SIGNAL = /\b(as (?:a|an)\b|i am\b|i'm\b|my role\b|project manager|program manager|programme manager|engagement manager|consultant|analyst|student|researcher|architect|engineer|director|vice president|vp\b)/i;
const PURPOSE_SIGNAL = /\b(approve|approval|decision|decide|funding|investment|buy[- ]?in|align|alignment|inform|update|review|recommend|recommendation|persuade|convince|teach|present findings|status|governance|escalat)/i;
const EVIDENCE_SIGNAL = /\b(attached|source|sources|metrics|kpi|kpis|data|financials?|budget|cost|benefit|roi|npv|timeline|milestone|risk register|research|citation|citations|references|findings|results)\b/i;
const APPROVAL_PHRASE = /\b(go ahead|proceed|approved|approve it|build it|generate it|create it|make it|prepare it|build the requested artifact|generate the requested artifact|create the requested artifact|prepare the requested artifact|yes[, ]+(?:build|generate|create|prepare|proceed)|ready to build)\b/i;
const FAST_TRACK_PHRASE = /\b(just build|build it now|generate it now|create it now|prepare it now|use (?:your|reasonable) (?:judg(?:e)?ment|assumptions)|assume reasonable|do not ask|don't ask|skip the questions|no questions)\b/i;
const GENERATOR_TRIGGER_WORDS = /\b(powerpoint|pptx?|slide deck|slides?|presentation|slideshow|excel|xlsx?|spreadsheet|worksheet|word(?:\s+(?:document|report|file|doc))|docx?)\b/gi;
const DIRECT_CREATE_PHRASE = /^(?:(?:as|for)\b[^,\n]{0,120},\s*)?(?:please\s+)?(?:(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)|(?:i\s+(?:want|need|would\s+like)\s+you\s+to\s+)|(?:help\s+me\s+(?:to\s+)?))?(?:create|make|prepare|generate|build|produce|draft|develop|assemble|compose|write|turn|convert|export|save)\b[\s\S]{0,180}\b(?:powerpoint|pptx?|slide deck|slides?|presentation|slideshow|excel|xlsx?|spreadsheet|worksheet|word(?:\s+(?:document|report|file|doc))|docx?)\b/i;
const DIRECT_OUTPUT_PHRASE = /\b(?:give|provide|return|deliver)\s+(?:me\s+)?(?:the\s+)?(?:output|file|artifact)\b[\s\S]{0,120}\b(?:as|in|into)\s+(?:an?\s+)?(?:powerpoint|pptx?|slide deck|slides?|presentation|slideshow|excel|xlsx?|spreadsheet|worksheet|word(?:\s+(?:document|report|file|doc))|docx?)\b/i;

function recentOfficeBriefing(messages = []) {
  return [...(Array.isArray(messages) ? messages : [])]
    .reverse()
    .find((message) => message?.officeBriefing === true && message?.officeBriefingKind);
}

function maskGeneratorTriggerWords(value = '') {
  return String(value || '').replace(GENERATOR_TRIGGER_WORDS, 'requested artifact');
}

export function activeOfficeBriefingKind(messages = []) {
  return recentOfficeBriefing(messages)?.officeBriefingKind || null;
}

export function countOfficeBriefSignals(text = '') {
  const value = String(text || '');
  return [
    DOCUMENT_ARCHETYPE.test(value),
    PRESENTER_SIGNAL.test(value),
    EXECUTIVE_AUDIENCE.test(value) || ACADEMIC_AUDIENCE.test(value),
    PURPOSE_SIGNAL.test(value),
    EVIDENCE_SIGNAL.test(value),
  ].filter(Boolean).length;
}

export function shouldGenerateOfficeNow({ text = '', officeKind = null, messages = [] } = {}) {
  const value = String(text || '').trim();
  const prior = recentOfficeBriefing(messages);
  const activeKind = officeKind || prior?.officeBriefingKind || null;
  if (!activeKind) return false;

  // Explicit artifact creation language is already authorization to create.
  // Do not make the user say the same thing twice. Command-shaped requests such
  // as "prepare a PowerPoint", "can you make a presentation", "help me develop
  // a deck", or "give me the output as a PPT" enter the canonical Office
  // generator immediately. Meta questions ("how do I create a PowerPoint?") and
  // negated requests ("don't create a PowerPoint") deliberately do not match.
  if (officeKind && (DIRECT_CREATE_PHRASE.test(value) || DIRECT_OUTPUT_PHRASE.test(value))) return true;

  // When the conversation previously paused for a briefing, ordinary approval
  // language should hand off immediately to generation.
  if (prior && APPROVAL_PHRASE.test(value)) return true;

  // Deliberate bypass for an explicit fast-track instruction on a first turn.
  if (officeKind && FAST_TRACK_PHRASE.test(value)) return true;

  return false;
}

export function officeBriefingContext({ text = '', officeKind = null, messages = [], sessionContext = null } = {}) {
  const prior = recentOfficeBriefing(messages);
  const activeKind = officeKind || prior?.officeBriefingKind || null;
  if (!activeKind) return null;

  const current = maskGeneratorTriggerWords(String(text || '').trim());
  const contextBits = [];
  if (sessionContext?.goal) contextBits.push(`Known goal: ${maskGeneratorTriggerWords(sessionContext.goal)}`);
  if (sessionContext?.understanding) contextBits.push(`Known context: ${maskGeneratorTriggerWords(sessionContext.understanding)}`);
  if (Array.isArray(sessionContext?.facts) && sessionContext.facts.length) {
    contextBits.push(`Known facts: ${sessionContext.facts.slice(-8).map(maskGeneratorTriggerWords).join(' | ')}`);
  }

  const artifactLabel = activeKind === 'powerpoint' ? 'executive visual artifact'
    : activeKind === 'word' ? 'formatted narrative artifact'
      : activeKind === 'excel' ? 'analytical workbook artifact'
        : 'requested Office artifact';

  return `OFFICE BRIEFING CONTEXT — HUMAN-IN-THE-LOOP\nYou are helping the user prepare an ${artifactLabel}. Do NOT generate the file yet unless the user explicitly approved generation. Treat this as a senior consultant/editor briefing conversation.\n\nYour job is to understand the communication problem before designing the artifact. Infer what is already known from the current message, recent conversation and session facts. Never re-ask a known fact. Ask exactly ONE highest-value question when a consequential gap remains.\n\nThe briefing dimensions are:\n- WHO is presenting/owning it: role, organization/client context, subject-matter level.\n- AUDIENCE / USERS: roles/seniority, decision authority, familiarity with the topic.\n- ARTIFACT ARCHETYPE: QBR, CIO business case, weekly status, steering committee, board update, academic/research, training, proposal, management report, operating tracker, financial model, dashboard, etc.\n- PURPOSE / DECISION: what the audience should understand, decide, approve, fund or do next.\n- DEPTH / CADENCE: one-off vs weekly/quarterly; meeting or review duration; period covered; refresh frequency.\n- EVIDENCE / DATA: authoritative source material, KPIs, financials, milestones, research/citations, data grain and units; never invent missing numbers.\n- COMMUNICATION STANDARD: executive, consulting, operational, technical, academic/research, teaching, analytical or audit-ready; the standard changes structure, precision and visuals.\n\nAudience- and artifact-specific behavior:\n- CIO/board/executive/business-case: decision-first storyline, economics/value, strategic fit, options/trade-offs, risks, recommendation and explicit ask. Require the decision sought and evidence basis before calling the brief complete.\n- QBR/client leadership: outcomes vs commitments, KPI trends, commercial/financial view where relevant, delivery health, risks, decisions and next-quarter priorities.\n- Weekly project status: concise operational truth — RAG health, milestones, achievements, slippage, RAID/dependencies, decisions/escalations and next-week plan. Avoid decorative filler.\n- Student/academic/research: audience level, course/research question, methodology/evidence, findings, limitations and citation expectations. Prefer academically defensible visuals over executive sales language.\n- Narrative/business document: intended reader, decision/sign-off, required sections, tone, source/citation standard, confidentiality and approval path matter more than decorative formatting.\n- Analytical workbook/model: clarify the business question, authoritative input sources, row/data grain, assumptions, formulas/calculations, currencies/units, required outputs, refresh cadence, controls and auditability before designing tabs or dashboards.\n\nWhen enough context is known, do NOT keep interviewing. Summarize the inferred brief in 4–7 compact bullets, explicitly list any assumptions, and ask for one human approval. Append continuation chips with a primary value that literally says "Build the requested artifact now using this approved briefing context" so the next turn can hand off to deterministic generation. Offer at most two secondary options such as adjusting the audience or adding source material.\n\nIf the user changes topic, follow the new topic and drop this briefing rather than forcing the Office workflow.\n${contextBits.length ? `\n${contextBits.join('\n')}` : ''}\n\nCurrent user message: ${current}`;
}

export function isExecutiveOfficeContext(text = '') {
  return EXECUTIVE_AUDIENCE.test(String(text || ''));
}

export function isAcademicOfficeContext(text = '') {
  return ACADEMIC_AUDIENCE.test(String(text || ''));
}
