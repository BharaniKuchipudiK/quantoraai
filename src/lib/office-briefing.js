const EXECUTIVE_AUDIENCE = /\b(cio|cto|cfo|ceo|coo|ciso|chief\s+\w+\s+officer|board|executive(?:s| leadership)?|leadership team|steering committee|steerco|client leadership|senior management)\b/i;
const ACADEMIC_AUDIENCE = /\b(professor|lecturer|faculty|teacher|classmates?|students?|academic|university|college|school|research committee|thesis|dissertation)\b/i;
const DOCUMENT_ARCHETYPE = /\b(qbr|quarterly business review|business case|weekly (?:project )?status|project status|status report|steerco|steering committee|board update|executive briefing|research presentation|academic presentation|thesis defense|sales pitch|proposal|strategy deck|roadmap)\b/i;
const PRESENTER_SIGNAL = /\b(as (?:a|an)\b|i am\b|i'm\b|my role\b|project manager|program manager|programme manager|engagement manager|consultant|analyst|student|researcher|architect|engineer|director|vice president|vp\b)/i;
const PURPOSE_SIGNAL = /\b(approve|approval|decision|decide|funding|investment|buy[- ]?in|align|alignment|inform|update|review|recommend|recommendation|persuade|convince|teach|present findings|status|governance|escalat)/i;
const EVIDENCE_SIGNAL = /\b(attached|source|sources|metrics|kpi|kpis|data|financials?|budget|cost|benefit|roi|npv|timeline|milestone|risk register|research|citation|citations|references|findings|results)\b/i;
const APPROVAL_PHRASE = /\b(go ahead|proceed|approved|approve it|build it|generate it|create it|make it|build the requested artifact|generate the requested artifact|yes[, ]+(?:build|generate|create|proceed)|ready to build)\b/i;
const FAST_TRACK_PHRASE = /\b(just build|build it now|generate it now|create it now|use (?:your|reasonable) (?:judg(?:e)?ment|assumptions)|assume reasonable|do not ask|don't ask|skip the questions|no questions)\b/i;
const GENERATOR_TRIGGER_WORDS = /\b(powerpoint|pptx?|slide deck|slides?|presentation|slideshow|excel|xlsx?|spreadsheet|worksheet|word(?:\s+(?:document|report|file|doc))|docx?)\b/gi;

export const OFFICE_CONTINUE_VALUE = 'Build the requested artifact now using this approved briefing context';

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

  // Normal path: briefing first, then one explicit human approval. The UI
  // Continue button sends OFFICE_CONTINUE_VALUE internally, so users never need
  // to discover or type an approval phrase themselves.
  if (prior && APPROVAL_PHRASE.test(value)) return true;

  // Deliberate bypass: the user can explicitly tell Quantora to skip discovery.
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

  return `OFFICE BRIEFING CONTEXT — HUMAN-IN-THE-LOOP\nYou are helping the user prepare an ${artifactLabel}. Do NOT generate the file yet unless the user explicitly approved generation. Treat this as a senior consultant/editor briefing conversation.\n\nYour job is to understand the communication problem before designing the artifact. Infer what is already known from the current message, recent conversation and session facts. Never re-ask a known fact. Ask exactly ONE highest-value question only when a consequential gap genuinely blocks a useful artifact.\n\nThe briefing dimensions are:\n- WHO is presenting/owning it: role, organization/client context, subject-matter level.\n- AUDIENCE / USERS: roles/seniority, decision authority, familiarity with the topic.\n- ARTIFACT ARCHETYPE: QBR, CIO business case, weekly status, steering committee, board update, academic/research, training, proposal, management report, operating tracker, financial model, dashboard, etc.\n- PURPOSE / DECISION: what the audience should understand, decide, approve, fund or do next.\n- DEPTH / CADENCE: one-off vs weekly/quarterly; meeting or review duration; period covered; refresh frequency.\n- EVIDENCE / DATA: authoritative source material, KPIs, financials, milestones, research/citations, data grain and units; never invent missing numbers.\n- COMMUNICATION STANDARD: executive, consulting, operational, technical, academic/research, teaching, analytical or audit-ready; the standard changes structure, precision and visuals.\n\nAudience- and artifact-specific behavior:\n- CIO/board/executive/business-case: decision-first storyline, economics/value, strategic fit, options/trade-offs, risks, recommendation and explicit ask. Require the decision sought and evidence basis before calling the brief complete.\n- QBR/client leadership: outcomes vs commitments, KPI trends, commercial/financial view where relevant, delivery health, risks, decisions and next-quarter priorities.\n- Weekly project status: concise operational truth — RAG health, milestones, achievements, slippage, RAID/dependencies, decisions/escalations and next-week plan. Avoid decorative filler.\n- Student/academic/research: audience level, course/research question, methodology/evidence, findings, limitations and citation expectations. Prefer academically defensible visuals over executive sales language.\n- Narrative/business document: intended reader, decision/sign-off, required sections, tone, source/citation standard, confidentiality and approval path matter more than decorative formatting.\n- Analytical workbook/model: clarify the business question, authoritative input sources, row/data grain, assumptions, formulas/calculations, currencies/units, required outputs, refresh cadence, controls and auditability before designing tabs or dashboards.\n\nWhen enough context is known, do NOT keep interviewing. Summarize the inferred brief in 4–7 compact bullets and explicitly list any assumptions. Do NOT ask the user to type an approval phrase. End the visible reply with one short sentence such as "If this looks right, choose Continue below." Then append EXACTLY this UI action block as the final content:\n<quantora-modal>\n{"question":"Ready to build the artifact?","direct":true,"options":[{"id":"office_continue","title":"Continue","value":"${OFFICE_CONTINUE_VALUE}","description":"Use this briefing and generate the file now"}]}\n</quantora-modal>\nDo not expose or paraphrase the option value. The user must see only the Continue action.\n\nIf a consequential gap truly remains, ask exactly one blocking question and do not append the Continue action until the gap is resolved.\n\nIf the user changes topic, follow the new topic and drop this briefing rather than forcing the Office workflow.\n${contextBits.length ? `\n${contextBits.join('\n')}` : ''}\n\nCurrent user message: ${current}`;
}

export function isExecutiveOfficeContext(text = '') {
  return EXECUTIVE_AUDIENCE.test(String(text || ''));
}

export function isAcademicOfficeContext(text = '') {
  return ACADEMIC_AUDIENCE.test(String(text || ''));
}
