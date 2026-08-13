/**
 * Domain anticipation — suggest next-beat continue chips from session context
 * when the model's chips are missing or thin.
 */

const STAGES = ['captured', 'in_progress', 'done'];

function contextBlob(ctx = {}) {
  return [ctx.goal, ctx.understanding, ...(ctx.facts || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function hasPattern(text, pattern) {
  return pattern.test(text);
}

function beat(id, label, value) {
  return { id, label, value };
}

function travelBeats(text, mode) {
  const beats = [];
  const hasDates = hasPattern(text, /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}[/-]\d|weekend|weeks?|days?|nights?|month)\b/i);
  const hasBudget = hasPattern(text, /\b(budget|\$|€|£|inr|rupee|usd|lakh|cost|spend|cheap|luxury)\b/i);
  const hasGroup = hasPattern(text, /\b(solo|couple|family|kids|friends|group)\b/i);

  if (!hasDates) {
    beats.push(beat('travel-dates', 'Pin down dates', 'Help me choose the best dates for this trip based on what we discussed.'));
  }
  if (!hasBudget) {
    beats.push(beat('travel-budget', 'Set a budget', 'Let\'s set a realistic budget range for this trip — ask me one question at a time.'));
  }
  if (!hasGroup) {
    beats.push(beat('travel-group', 'Who\'s traveling?', 'It\'s just me — adjust the plan for solo travel.'));
  }
  if (hasDates && hasBudget) {
    beats.push(beat('travel-itinerary', 'Day-by-day plan', 'Build a day-by-day itinerary from what we know so far.'));
  }
  if (mode === 'build') {
    beats.push(beat('travel-site', 'Build trip page', 'Turn this trip plan into a shareable travel page I can preview.'));
  }
  return beats;
}

function financeBeats(text, mode) {
  const beats = [];
  const hasAmount = hasPattern(text, /\b(\$|€|£|inr|rupee|usd|\d+k|\d+\s*(lakh|million)|salary|income)\b/i);
  const hasHorizon = hasPattern(text, /\b(month|year|retire|short-term|long-term|5 year|10 year)\b/i);
  const hasGoal = hasPattern(text, /\b(save|invest|debt|budget|emergency|sip|stock|loan|mortgage)\b/i);

  if (!hasGoal) {
    beats.push(beat('fin-goal', 'Clarify my goal', 'Help me clarify my main financial goal in one sentence.'));
  }
  if (!hasAmount) {
    beats.push(beat('fin-amount', 'Rough numbers', 'Ask me for rough numbers so you can give practical advice.'));
  }
  if (!hasHorizon) {
    beats.push(beat('fin-horizon', 'Time horizon', 'What time horizon should I plan for? Help me pick one.'));
  }
  if (hasGoal && hasAmount) {
    beats.push(beat('fin-plan', 'Action plan', 'Give me a simple step-by-step action plan based on what we know.'));
  }
  if (mode === 'build') {
    beats.push(beat('fin-dashboard', 'Build tracker', 'Build a simple personal finance tracker page I can preview.'));
  }
  return beats;
}

function researchBeats(text, mode) {
  const beats = [];
  const hasScope = text.length > 80;
  const hasCompare = hasPattern(text, /\b(compare|versus|vs|pros|cons|options)\b/i);
  const hasAudience = hasPattern(text, /\b(presentation|thesis|blog|investor|team|beginner|expert)\b/i);

  if (!hasScope) {
    beats.push(beat('res-scope', 'Narrow the scope', 'Help me narrow the research scope — ask one clarifying question.'));
  }
  if (!hasCompare) {
    beats.push(beat('res-compare', 'Compare options', 'Compare the main options side by side with pros and cons.'));
  }
  if (!hasAudience) {
    beats.push(beat('res-audience', 'Who is this for?', 'Who is the audience for this research? I\'ll tailor depth accordingly.'));
  }
  beats.push(beat('res-summary', 'Executive summary', 'Write a concise executive summary of what we\'ve covered so far.'));
  if (mode === 'build') {
    beats.push(beat('res-page', 'Research page', 'Turn this research into a clean one-page brief I can preview and share.'));
  }
  return beats;
}

function educationBeats(text, mode) {
  const beats = [];
  const hasLevel = hasPattern(text, /\b(beginner|intermediate|advanced|student|exam|grade|class)\b/i);
  const hasTopic = text.length > 40;
  const hasTimeline = hasPattern(text, /\b(week|month|exam|deadline|daily|hours?)\b/i);

  if (!hasLevel) {
    beats.push(beat('edu-level', 'My level', 'Ask about my background so you can match the explanation level.'));
  }
  if (!hasTopic) {
    beats.push(beat('edu-topic', 'Focus topic', 'Help me pick one focused topic to go deep on first.'));
  }
  if (!hasTimeline) {
    beats.push(beat('edu-plan', 'Study plan', 'Create a simple study plan for the next two weeks.'));
  }
  beats.push(beat('edu-quiz', 'Quiz me', 'Quiz me on what we covered — 5 questions, increasing difficulty.'));
  if (mode === 'build') {
    beats.push(beat('edu-app', 'Build learning app', 'Build a small interactive study page for this topic.'));
  }
  return beats;
}

function buildBeats(mode, { hasPreview = false, guidedIntake = false } = {}) {
  if (mode === 'build' && guidedIntake && !hasPreview) {
    return [
      beat('build-name', 'Business name', 'The business name is...'),
      beat('build-service', 'Dine-in or takeaway?', 'We offer both dine-in and takeaway.'),
      beat('build-offerings', 'What we offer', 'We serve coffee, pastries, and light meals.'),
      beat('build-draft', 'Build first draft', 'Build a first draft now using reasonable defaults for anything we skipped.'),
    ];
  }
  if (mode === 'build' && hasPreview) {
    return [
      beat('build-refine', 'Refine design', 'Refine the layout and visual design — explain what you would change and ask what I think before updating the preview.'),
      beat('build-feature', 'Add a feature', 'Suggest one high-impact feature we could add — explain why it helps and ask what I think before building.'),
      beat('build-mobile', 'Mobile polish', 'Review mobile spacing and polish — tell me what you would fix and ask if I agree before updating the preview.'),
    ];
  }
  if (mode === 'plan') {
    return [
      beat('plan-build', 'Build this plan', 'Build this plan into a runnable preview.'),
      beat('plan-scope', 'Trim scope', 'Suggest a smaller MVP scope we can ship faster.'),
    ];
  }
  return [
    beat('ask-deeper', 'Go deeper', 'Go deeper on the most important part of your last answer.'),
    beat('ask-action', 'Next action', 'What should I do next — one concrete step?'),
  ];
}

export function getAnticipatedContinues({ domain, mode, conversationContext, hasPreview = false, guidedIntake = false } = {}) {
  const text = contextBlob(conversationContext);
  let beats = [];

  switch (domain) {
    case 'travel':
      beats = travelBeats(text, mode);
      break;
    case 'finance':
      beats = financeBeats(text, mode);
      break;
    case 'research':
      beats = researchBeats(text, mode);
      break;
    case 'education':
      beats = educationBeats(text, mode);
      break;
    default:
      beats = buildBeats(mode, { hasPreview, guidedIntake });
      break;
  }

  const domainPrompts = {
    travel: 'Where should we take this trip next?',
    finance: 'What money decision is next?',
    research: 'How should we deepen this research?',
    education: 'What should we learn next?',
  };

  const intakePrompt = 'What should we nail down first?';

  return {
    prompt: guidedIntake && !hasPreview && mode === 'build'
      ? intakePrompt
      : (domainPrompts[domain] || 'Where next?'),
    items: beats,
  };
}

/** Merge model continue chips with domain-anticipated beats (deduped, max 3). */
export function enrichContinueSet(continueSet, options = {}) {
  const { domain, mode, conversationContext, hasPreview = false, guidedIntake = false } = options;
  const anticipated = getAnticipatedContinues({ domain, mode, conversationContext, hasPreview, guidedIntake });
  const existing = continueSet?.items?.length ? [...continueSet.items] : [];
  const seen = new Set(existing.map((i) => i.label.toLowerCase()));

  for (const item of anticipated.items) {
    if (existing.length >= 3) break;
    if (seen.has(item.label.toLowerCase())) continue;
    existing.push(item);
    seen.add(item.label.toLowerCase());
  }

  if (!existing.length) return continueSet;

  return {
    prompt: continueSet?.prompt || anticipated.prompt,
    items: existing.slice(0, 3),
  };
}

export { STAGES };
