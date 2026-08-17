const EXECUTIVE_AUDIENCE = /\b(cio|cto|cfo|ceo|coo|ciso|chief\s+\w+\s+officer|board|executive(?:s| leadership)?|leadership team|steering committee|steerco|client leadership|senior management)\b/i;
const ACADEMIC_AUDIENCE = /\b(professor|lecturer|faculty|teacher|classmates?|students?|academic|university|college|school|research committee|thesis|dissertation)\b/i;
const DOCUMENT_ARCHETYPE = /\b(qbr|quarterly business review|business case|weekly (?:project )?status|project status|status report|steerco|steering committee|board update|executive briefing|research presentation|academic presentation|thesis defense|sales pitch|proposal|strategy deck|roadmap)\b/i;
const PRESENTER_SIGNAL = /\b(as (?:a|an)\b|i am\b|i'm\b|my role\b|project manager|program manager|programme manager|engagement manager|consultant|analyst|student|researcher|architect|engineer|director|vice president|vp\b)/i;
const PURPOSE_SIGNAL = /\b(approve|approval|decision|decide|funding|investment|buy[- ]?in|align|alignment|inform|update|review|recommend|recommendation|persuade|convince|teach|present findings|status|governance|escalat)/i;
const EVIDENCE_SIGNAL = /\b(attached|source|sources|metrics|kpi|kpis|data|financials?|budget|cost|benefit|roi|npv|timeline|milestone|risk register|research|citation|citations|references|findings|results)\b/i;
const GENERATION_VERB = /\b(build|generate|create|produce|prepare|make|compile|render)\b/i;
const APPROVAL_PHRASE = /\b(go ahead|proceed|approved|approve it|build it|generate it|create it|make it|yes[, ]+(?:build|generate|create|proceed)|ready to build)\b/i;
const FAST_TRACK_PHRASE = /\b(just build|build it now|generate it now|create it now|use (?:your|reasonable) (?:judg(?:e)?ment|assumptions)|assume reasonable|do not ask|don't ask|skip the questions|no questions)\b/i;

function recentOfficeBriefing(messages = []) {
  return [...(Array.isArray(messages) ? messages : [])]
    .reverse()
    .find((message) => message?.officeBriefing === true && message?.officeBriefingKind);
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

  // Once the PCL has completed a briefing, a clear human approval is the handoff
  // to deterministic Office generation. The approval text itself does not need
  // to repeat every detail because the recent conversation is sent to the
  // generator as briefing context.
  if (prior && APPROVAL_PHRASE.test(value)) return true;

  // A user can deliberately bypass discovery, but the bypass must be explicit.
  // Ordinary "make me a presentation" wording is NOT a bypass: that is exactly
  // where Quantora should first learn the audience, purpose and evidence basis.
  if (officeKind && FAST_TRACK_PHRASE.test(value)) return true;

  // Detailed power users may provide a complete brief in one message. Require a
  // generation verb plus strong evidence that role/audience/purpose were supplied
  // before allowing a first-turn compile; otherwise keep a human review beat.
  if (officeKind && GENERATION_VERB.test(value) && countOfficeBriefSignals(value) >= 5) return true;

  return false;
}

export function officeBriefingContext({ text = '', officeKind = null, messages = [], sessionContext = null } = {}) {
  const prior = recentOfficeBriefing(messages);
  const activeKind = officeKind || prior?.officeBriefingKind || null;
  if (!activeKind) return null;

  const current = String(text || '').trim();
  const contextBits = [];
  if (sessionContext?.goal) contextBits.push(`Known goal: ${sessionContext.goal}`);
  if (sessionContext?.understanding) contextBits.push(`Known context: ${sessionContext.understanding}`);
  if (Array.isArray(sessionContext?.facts) && sessionContext.facts.length) {
    contextBits.push(`Known facts: ${sessionContext.facts.slice(-8).join(' | ')}`);
  }

  const formatLabel = activeKind === 'powerpoint' ? 'PowerPoint presentation'
    : activeKind === 'word' ? 'Word document'
      : activeKind === 'excel' ? 'Excel workbook'
        : activeKind;

  return `OFFICE BRIEFING CONTEXT — HUMAN-IN-THE-LOOP\nYou are helping the user prepare a ${formatLabel}. Do NOT generate the Office artifact yet unless the user explicitly approved generation. Treat this as a senior consultant/editor briefing conversation.\n\nYour job is to understand the communication problem before designing the artifact. Infer what is already known from the current message, recent conversation and session facts. Never re-ask a known fact. Ask exactly ONE highest-value question when a consequential gap remains.\n\nThe briefing dimensions are:\n- WHO is presenting: role, organization/client context, subject-matter level.\n- AUDIENCE: roles/seniority, decision authority, familiarity with the topic.\n- ARTIFACT TYPE: QBR, CIO business case, weekly status, steering committee, board update, academic/research, training, proposal, etc.\n- PURPOSE / DECISION: what the audience should understand, decide, approve, fund or do next.\n- DEPTH / CADENCE: one-off vs weekly/quarterly; presentation duration; period covered.\n- EVIDENCE: authoritative source material, KPIs, financials, milestones, research/citations; never invent missing numbers.\n- COMMUNICATION STANDARD: executive, consulting, operational, technical, academic/research, or teaching; the standard changes storyline, precision and visuals.\n\nAudience-specific behavior:\n- CIO/board/executive/business-case: decision-first storyline, economics/value, strategic fit, options/trade-offs, risks, recommendation and explicit ask. Require the decision sought and evidence basis before calling the brief complete.\n- QBR/client leadership: outcomes vs commitments, KPI trends, commercial/financial view where relevant, delivery health, risks, decisions and next-quarter priorities.\n- Weekly project status: concise operational truth — RAG health, milestones, achievements, slippage, RAID/dependencies, decisions/escalations and next-week plan. Avoid decorative filler.\n- Student/academic/research: audience level, course/research question, methodology/evidence, findings, limitations and citation expectations. Prefer academically defensible visuals over executive sales language.\n\nWhen enough context is known, do NOT keep interviewing. Summarize the inferred brief in 4–7 compact bullets, explicitly list any assumptions, and ask for one human approval. Append continuation chips with a primary value that literally says "Build the ${formatLabel} now using this approved briefing context" so the next turn can hand off to deterministic generation. Offer at most two secondary options such as adjusting the audience or adding source material.\n\nIf the user changes topic, follow the new topic and drop this briefing rather than forcing the Office workflow.\n${contextBits.length ? `\n${contextBits.join('\n')}` : ''}\n\nCurrent user message: ${current}`;
}

export function isExecutiveOfficeContext(text = '') {
  return EXECUTIVE_AUDIENCE.test(String(text || ''));
}

export function isAcademicOfficeContext(text = '') {
  return ACADEMIC_AUDIENCE.test(String(text || ''));
}
