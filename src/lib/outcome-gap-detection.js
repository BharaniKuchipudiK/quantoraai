/**
 * Outcome gap detection — compare what the user asked for vs what the AI delivered.
 * Powers proactive continue chips so users don't have to say "that's missing."
 */

function beat(id, label, value, priority = 0) {
  return { id, label, value, priority };
}

/** Preview facts win. Chat HTML must not invent or hide a photo gap. */
function previewHasPhotos(deskFacts) {
  if (!deskFacts || typeof deskFacts !== 'object') return null;
  if (deskFacts.hasPhotos === true || Number(deskFacts.photoCount) > 0) return true;
  if (deskFacts.hasPhotos === false) return false;
  if (Number.isFinite(Number(deskFacts.photoCount)) && Number(deskFacts.photoCount) === 0) return false;
  return null;
}

function chatHasPhotoMarkup(ai = '') {
  return /<img\b[^>]*\bsrc\s*=\s*["'](?:https?:\/\/|\/api\/preview-image)/i.test(String(ai || ''));
}

function photosPresent({ deskFacts = null, ai = '' } = {}) {
  const preview = previewHasPhotos(deskFacts);
  return preview === null ? chatHasPhotoMarkup(ai) : preview;
}

function chipsFromDeskChecks(checks = []) {
  if (!Array.isArray(checks) || !checks.length) return [];
  const beats = {
    photos: beat('gap-photos', 'Add real product photos', 'Put a different real photo on every product card in the running Preview. Repeating one image on the whole catalog is not done.', 108),
    cart: beat('gap-cart', 'Add to Cart on Preview', 'Put a working Add to Cart control on the running page. Do not say it is done unless Preview shows it.', 107),
    currency: beat('gap-currency', 'Add a currency converter', 'Put a currency converter on the running Preview. Do not say it is done unless Preview shows it.', 106),
    catalog: beat('gap-catalog', 'Fill the product catalog', 'Put named products in products.json and on the page. Preview is the proof.', 105),
    'cart-click': beat('gap-cart-click', 'Fix Add to Cart', 'Add to Cart is on the page but the bag does not increment. Fix the running Preview.', 107),
    'calc-display': beat('gap-calc', 'Fix the calculator display', 'The calculator Preview is missing a working display. Fix the running page.', 108),
    'calc-key': beat('gap-calc-key', 'Fix the calculator keys', 'The calculator Preview is missing working keys. Fix the running page.', 107),
    'calc-scientific': beat('gap-calc-scientific', 'Add scientific keys on Preview', 'Patch the web Preview entry (index.html / App.jsx) with sin/cos (or DEG/RAD). Python-only files never run in Preview.', 109),
    'job-add-item': beat('gap-add-item', 'Make adding an item work', 'The running Preview has an add control that does not add anything. Fix it on the page.', 108),
    'job-controls': beat('gap-controls', 'Make the controls respond', 'Clicking a control on the running Preview changes nothing. Fix it on the page.', 107),
    'job-runs': beat('gap-page-runs', 'Make the page render', 'The running Preview renders nothing. Fix the page before anything else.', 109),
  };
  return checks
    .filter((check) => check && check.state !== 'unverified' && check.ok === false && beats[check.id])
    .map((check) => beats[check.id]);
}

/** Detect gaps between user intent and assistant reply. Returns proactive fix chips. */
export function detectOutcomeGaps(userPrompt = '', aiResponse = '', {
  officeKind = null,
  studioDomain = null,
  deskChecks = [],
  deskFacts = null,
} = {}) {
  const user = String(userPrompt).toLowerCase();
  const ai = String(aiResponse);
  const gaps = [];

  if (officeKind) {
    return officeFollowUpGaps(officeKind);
  }

  const probeGaps = chipsFromDeskChecks(deskChecks);

  const wantsUrls = /\b(url|urls|link|links|clickable)\b/i.test(userPrompt);
  const hasUrls = /https?:\/\//i.test(ai);

  if (studioDomain === 'travel') {
    const wantsStayFacts = /\b(rating|ratings|review|link|links|website|maps|propert(?:y|ies)|hotel|stay|stays)\b/i.test(userPrompt);
    const hasStayFacts = /★/.test(ai) && /https?:\/\//i.test(ai);
    if (wantsStayFacts && !hasStayFacts) {
      gaps.push(beat(
        'gap-live-hotels',
        'Look up live stays',
        'Call search_hotels for these properties. Paste Google user ratings ★ x/5 with review count, plus website or Maps links. Do not use map routing. Do not invent ratings.',
        110,
      ));
    }
  } else if (wantsUrls && !hasUrls) {
    gaps.push(beat(
      'gap-missing-urls',
      'Add direct links',
      'Please give me the direct, clickable website URLs for each option you mentioned — raw https links, one per property.',
      100,
    ));
  }

  const wantsPrices = /\b(price|prices|cost|budget|how much|rate|rates)\b/i.test(userPrompt);
  const hasPrices = /\$\s?\d|€\s?\d|£\s?\d|\b\d+\s*(?:usd|eur|gbp|night|per night)\b/i.test(ai);

  if (wantsPrices && !hasPrices && !wantsUrls) {
    gaps.push(beat(
      'gap-missing-prices',
      'Add price ranges',
      'Include realistic price ranges or nightly rates for each option you mentioned.',
      90,
    ));
  }

  const wantsDates = /\b(when|dates?|itinerary|schedule|day-by-day|days?\s+\d)\b/i.test(userPrompt);
  const hasDates = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}[/-]\d|day\s+\d|week \d)\b/i.test(ai.toLowerCase());

  if (wantsDates && !hasDates) {
    gaps.push(beat(
      'gap-missing-dates',
      'Add dates / itinerary',
      'Turn this into a day-by-day plan with specific dates based on what we discussed.',
      85,
    ));
  }

  const wantsComparison = /\b(compare|versus|vs\.?|which one|pros and cons|side by side)\b/i.test(userPrompt);
  const hasComparison = /\b(vs\.?|versus|compared to|pros|cons|better for)\b/i.test(ai.toLowerCase());

  if (wantsComparison && !hasComparison && ai.length > 200) {
    gaps.push(beat(
      'gap-missing-compare',
      'Compare side by side',
      'Compare these options in a simple side-by-side table with pros and cons.',
      80,
    ));
  }

  const wantsActionable = /\b(action|next step|what should i|checklist|to-do|todo)\b/i.test(user);
  const hasActionable = /\b\d+\.\s|\-\s|\*\s|step \d|next step/i.test(ai);

  if (wantsActionable && !hasActionable && ai.length > 300) {
    gaps.push(beat(
      'gap-missing-actions',
      'Make it actionable',
      'Give me a short numbered action plan — what should I do next, in order?',
      75,
    ));
  }

  const chatWithoutCode = ai.replace(/```[\s\S]*?```/g, ' ');
  const wantsShop = /\b(saree|sari|boutique|ready.?made|dress(?:es)?|shop|storefront|e-?commerce|online shop|catalog|sell)\b/i.test(userPrompt)
    || /\b(cart|checkout|products\.json|book appointment)\b/i.test(ai);
  const lifeAdvisor = studioDomain === 'travel'
    || studioDomain === 'education'
    || studioDomain === 'finance'
    || studioDomain === 'research';
    if (wantsShop && !lifeAdvisor) {
    const hasPhotos = photosPresent({ deskFacts, ai });
    if (!hasPhotos && !probeGaps.some((gap) => gap.id === 'gap-photos')) {
      gaps.push(beat(
        'gap-photos',
        'Add real product photos',
        'Put real <img src="https://images.unsplash.com/..."> photos on every product card. Do not use SVG empty frames. Do not say images are done until Preview shows photos.',
        108,
      ));
    }
    if (!/\b(stripe|razorpay|payment gateway|pay online|checkout session)\b/i.test(chatWithoutCode)) {
      gaps.push(beat(
        'gap-payments',
        'Add a payment gateway',
        'Add a real payment gateway so customers can check out — ask me Stripe vs Razorpay if it matters, then wire checkout.',
        96,
      ));
    }
    if (!/\b(domestic|international|shipping|deliver(?:y|ies)|ship to|pickup)\b/i.test(chatWithoutCode)) {
      gaps.push(beat(
        'gap-shipping',
        'Domestic or international?',
        'Do you ship only domestically, internationally as well, or in-store pickup only? Update the boutique site for that.',
        95,
      ));
    }
    if (hasPhotos && !/\b(publish|vercel|go live|live url)\b/i.test(chatWithoutCode)) {
      gaps.push(beat(
        'gap-publish',
        'Publish this site',
        'The site looks ready. Publish this website to Vercel and give me the live URL.',
        90,
      ));
    }
  } else {
    const wantsPhotos = /\b(images?|photos?|pictures?|visuals?)\b/i.test(userPrompt);
    const hasPhotos = photosPresent({ deskFacts, ai });
    if (wantsPhotos && !lifeAdvisor && !hasPhotos && !probeGaps.some((gap) => gap.id === 'gap-photos')) {
      gaps.push(beat(
        'gap-photos',
        'Add real product photos',
        'Put real <img src="https://images.unsplash.com/..."> photos on the page. Do not use SVG empty frames. Do not say images are done until Preview shows photos.',
        108,
      ));
    }
  }

  return [...probeGaps, ...gaps]
    .filter((gap, index, list) => list.findIndex((item) => item.id === gap.id) === index)
    .sort((a, b) => b.priority - a.priority);
}

function officeFollowUpGaps(officeKind) {
  if (officeKind === 'excel') {
    return [
      beat('office-formulas', 'Check the formulas', 'Walk the workbook formulas and controls against the briefing. Do not turn this into a website.', 70),
      beat('office-download', 'Download the workbook', 'Show the Excel file in Preview so I can download the .xlsx.', 60),
    ];
  }
  if (officeKind === 'word') {
    return [
      beat('office-tighten', 'Tighten the narrative', 'Tighten the document for the named audience. Keep it a Word file, not a website.', 70),
      beat('office-download', 'Download the document', 'Show the Word file in Preview so I can download the .docx.', 60),
    ];
  }
  return [
    beat('office-story', 'Tighten the storyline', 'Tighten the deck storyline for the named audience and decision. Keep this a PowerPoint, not a website.', 70),
    beat('office-notes', 'Add speaker notes', 'Add concise speaker notes on the key slides so I can present this.', 65),
    beat('office-download', 'Download the PPTX', 'Show the presentation in Preview so I can download the .pptx.', 60),
  ];
}

export function filterContinuesForOffice(continueSet, officeKind = null) {
  if (!officeKind || !continueSet?.items?.length) return continueSet;
  const items = continueSet.items.filter((item) => (
    !/vercel|publish this site|go live|payment gateway|shipping/i.test(`${item.label} ${item.value}`)
  ));
  if (!items.length) return null;
  return { ...continueSet, items: items.slice(0, 3) };
}

/** Travel/Study must not inherit boutique/website continue chips. */
export function filterContinuesForAdvisor(continueSet, studioDomain = null) {
  if (
    studioDomain !== 'travel'
    && studioDomain !== 'education'
    && studioDomain !== 'finance'
    && studioDomain !== 'research'
  ) {
    return continueSet;
  }
  if (!continueSet?.items?.length) return continueSet;
  const items = continueSet.items.filter((item) => (
    !/vercel|publish this site|go live|payment gateway|shipping|boutique|calculator/i.test(`${item.label} ${item.value}`)
  ));
  if (!items.length) return null;
  return { ...continueSet, items: items.slice(0, 3) };
}

/** Merge gap-fix chips ahead of model/domain continues (deduped, max 3). */
export function injectGapContinues(continueSet, gaps = []) {
  if (!gaps.length) return continueSet;

  const existing = continueSet?.items ? [...continueSet.items] : [];
  const seen = new Set(existing.map((i) => i.label.toLowerCase()));

  const merged = [];
  for (const gap of gaps) {
    if (merged.length >= 3) break;
    if (seen.has(gap.label.toLowerCase())) continue;
    merged.push({ id: gap.id, label: gap.label, value: gap.value });
    seen.add(gap.label.toLowerCase());
  }

  for (const item of existing) {
    if (merged.length >= 3) break;
    if (seen.has(item.label.toLowerCase())) continue;
    merged.push(item);
    seen.add(item.label.toLowerCase());
  }

  return {
    prompt: gaps.length ? 'I noticed something may be missing — fix it with one tap:' : (continueSet?.prompt || 'Where next?'),
    items: merged,
  };
}
