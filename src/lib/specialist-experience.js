const ACTIVE_DOMAIN_KEY = 'quantora_active_specialist_domain';

const SPECIALISTS = Object.freeze({
  'Travel Guide AI': {
    domain: 'travel',
    label: 'Travel Advisor',
    hero: 'Where should Quantora take you?',
    supporting: 'Tell me the destination or the kind of trip you have in mind. I’ll help you shape the dates, flights, hotels, attractions and practical details from there.',
    placeholder: 'Where would you like to go? Tell me a destination, dates, or just the kind of trip you want…',
    capabilities: 'Flights · Hotels · Attractions · Itineraries',
  },
  'Travel Advisor': {
    domain: 'travel',
    label: 'Travel Advisor',
    hero: 'Where should Quantora take you?',
    supporting: 'Tell me the destination or the kind of trip you have in mind. I’ll help you shape the dates, flights, hotels, attractions and practical details from there.',
    placeholder: 'Where would you like to go? Tell me a destination, dates, or just the kind of trip you want…',
    capabilities: 'Flights · Hotels · Attractions · Itineraries',
  },
  'Finance Advisor': {
    domain: 'finance',
    label: 'Finance Advisor',
    hero: 'What financial outcome are you working towards?',
    supporting: 'Bring me the decision, portfolio question, debt problem or goal. We’ll work through the numbers and the trade-offs together.',
    placeholder: 'What financial decision or goal should we work through?',
    capabilities: 'Portfolio · Cash flow · Debt · Decisions',
  },
  'Study Tutor': {
    domain: 'education',
    label: 'Study Tutor',
    hero: 'What would you like to understand better?',
    supporting: 'Tell me the topic or goal and I’ll adapt the explanation, practice and study plan to you.',
    placeholder: 'What would you like to learn or work through?',
    capabilities: 'Explain · Practise · Plan · Review',
  },
  'Research Analyst': {
    domain: 'research',
    label: 'Research Analyst',
    hero: 'What should Quantora investigate?',
    supporting: 'Give me the question or decision you are working on. I’ll help structure the research, compare the evidence and move it towards a conclusion.',
    placeholder: 'What question, topic or decision should we research?',
    capabilities: 'Research · Compare · Evidence · Decide',
  },
});

const DOMAIN_CONFIG = Object.values(SPECIALISTS).reduce((acc, value) => {
  acc[value.domain] = value;
  return acc;
}, {});

function currentDomain() {
  try {
    const value = localStorage.getItem(ACTIVE_DOMAIN_KEY);
    return DOMAIN_CONFIG[value] ? value : null;
  } catch {
    return null;
  }
}

function setCurrentDomain(domain) {
  try {
    if (domain) localStorage.setItem(ACTIVE_DOMAIN_KEY, domain);
    else localStorage.removeItem(ACTIVE_DOMAIN_KEY);
  } catch {
    // Domain state is a UX enhancement; storage failure must not block Studio.
  }
  document.documentElement.dataset.quantoraDomain = domain || '';
}

function exactTextElements(text) {
  return [...document.querySelectorAll('div,span,p,h1,h2,h3,button')]
    .filter((element) => element.children.length === 0 && element.textContent?.trim() === text);
}

function firstTextElement(predicate) {
  return [...document.querySelectorAll('div,span,p,h1,h2,h3,button')]
    .find((element) => element.children.length === 0 && predicate(element.textContent?.trim() || '')) || null;
}

function setText(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function setDisplay(element, display) {
  if (!element) return;
  if (!element.dataset.quantoraOriginalDisplay) {
    element.dataset.quantoraOriginalDisplay = element.style.display || '__empty__';
  }
  if (element.style.display !== display) element.style.display = display;
}

function hideInternalModelControls() {
  const selectedModel = firstTextElement((text) => text.startsWith('Selected Model:'));
  if (selectedModel) setDisplay(selectedModel, 'none');

  exactTextElements('Live API Engine Active').forEach((element) => setDisplay(element, 'none'));

  [...document.querySelectorAll('button')].forEach((button) => {
    const text = button.textContent?.trim() || '';
    if (text.includes('Dual Arena Mode') || text.includes('Arena Mode Active')) {
      setDisplay(button, 'none');
    }
  });
}

function applyHero(config) {
  const genericPrompt = exactTextElements('What would you like to build today?')[0];
  const existingDomainPrompt = Object.values(DOMAIN_CONFIG)
    .map((item) => item.hero)
    .flatMap((hero) => exactTextElements(hero))[0];
  const prompt = genericPrompt || existingDomainPrompt;
  if (!prompt) return;

  setText(prompt, config.hero);
  prompt.style.marginBottom = '10px';

  const hero = prompt.parentElement;
  if (!hero) return;
  hero.dataset.quantoraSpecialistHero = config.domain;
  hero.style.paddingTop = '28px';
  hero.style.paddingBottom = '26px';
  hero.style.marginTop = '8px';
  hero.style.maxWidth = '760px';

  let support = hero.querySelector('[data-quantora-specialist-support]');
  if (!support) {
    support = document.createElement('p');
    support.dataset.quantoraSpecialistSupport = 'true';
    prompt.insertAdjacentElement('afterend', support);
  }
  setText(support, config.supporting);
  Object.assign(support.style, {
    margin: '0 auto 18px',
    maxWidth: '620px',
    fontSize: '0.98rem',
    lineHeight: '1.6',
    color: 'var(--text-secondary)',
  });

  let capability = hero.querySelector('[data-quantora-specialist-capabilities]');
  if (!capability) {
    capability = document.createElement('div');
    capability.dataset.quantoraSpecialistCapabilities = 'true';
    support.insertAdjacentElement('afterend', capability);
  }
  setText(capability, config.capabilities);
  Object.assign(capability.style, {
    margin: '0 auto 4px',
    fontSize: '0.78rem',
    fontWeight: '700',
    letterSpacing: '0.02em',
    color: config.domain === 'travel' ? '#2563eb' : '#f97316',
  });

  // The generic empty state advertises models. In a specialist workspace the
  // user is buying an outcome, not choosing infrastructure.
  [...hero.children].forEach((child) => {
    const text = child.textContent?.trim() || '';
    if (child === prompt || child === support || child === capability) return;
    if (text.includes('Do not show this next time')) setDisplay(child, 'none');
    const hasModelCards = text.includes('Gemini') && child.querySelectorAll('h3').length > 0;
    if (hasModelCards) setDisplay(child, 'none');
  });
}

function applyHeader(config) {
  hideInternalModelControls();

  const resetButton = exactTextElements('Reset Chat')[0];
  const header = resetButton?.parentElement?.parentElement || null;
  if (!header) return;

  header.style.marginBottom = '8px';
  header.style.paddingBottom = '8px';

  const title = header.querySelector('h2');
  if (title) {
    setText(title, config.label);
    title.style.opacity = '1';
    title.style.fontSize = '1.05rem';
  }

  const mainColumn = header.parentElement;
  if (mainColumn) mainColumn.style.paddingTop = '6px';
}

function applySidebar(config) {
  exactTextElements('Specialized Agents').forEach((element) => setText(element, 'Advisors'));

  const travelLabels = [...exactTextElements('Travel Guide AI'), ...exactTextElements('Travel Advisor')];
  travelLabels.forEach((label) => setText(label, 'Travel Advisor'));

  document.querySelectorAll('[data-quantora-active-specialist]').forEach((row) => {
    if (row.dataset.quantoraActiveSpecialist === config.domain) return;
    delete row.dataset.quantoraActiveSpecialist;
    row.style.background = 'transparent';
    row.style.borderColor = 'transparent';
    row.style.fontWeight = '500';
  });

  for (const label of exactTextElements(config.label)) {
    const row = label.parentElement;
    if (!row) continue;
    row.dataset.quantoraActiveSpecialist = config.domain;
    row.style.background = config.domain === 'travel' ? 'rgba(37, 99, 235, 0.10)' : 'rgba(249, 115, 22, 0.10)';
    row.style.borderColor = config.domain === 'travel' ? 'rgba(37, 99, 235, 0.28)' : 'rgba(249, 115, 22, 0.28)';
    row.style.fontWeight = '700';
  }
}

function applyInput(config) {
  const textarea = document.querySelector('textarea[placeholder*="Ask Quantora"], textarea[placeholder*="Where would you like"], textarea[placeholder*="financial"], textarea[placeholder*="research"], textarea[placeholder*="learn"]');
  if (textarea && textarea.getAttribute('placeholder') !== config.placeholder) {
    textarea.setAttribute('placeholder', config.placeholder);
  }
}

let applying = false;
function applyExperience() {
  if (applying) return;
  applying = true;
  try {
    const domain = currentDomain();
    const config = domain ? DOMAIN_CONFIG[domain] : null;
    document.documentElement.dataset.quantoraDomain = domain || '';
    if (!config) return;

    applySidebar(config);
    applyHeader(config);
    applyHero(config);
    applyInput(config);
  } finally {
    applying = false;
  }
}

function specialistFromClick(target) {
  let node = target instanceof Element ? target : null;
  for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
    const text = node.textContent?.trim() || '';
    if (SPECIALISTS[text]) return SPECIALISTS[text];
  }
  return null;
}

function installFetchDomainBridge() {
  if (window.__quantoraSpecialistFetchInstalled) return;
  window.__quantoraSpecialistFetchInstalled = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const domain = currentDomain();
    if (!domain || !url.includes('/api/chat') || typeof init?.body !== 'string') {
      return nativeFetch(input, init);
    }

    try {
      const body = JSON.parse(init.body);
      if (body && typeof body === 'object') {
        body.studioDomain = domain;
        body.studioMode = body.studioMode || 'ask';
        return nativeFetch(input, { ...init, body: JSON.stringify(body) });
      }
    } catch {
      // Preserve the original request if it is not JSON.
    }
    return nativeFetch(input, init);
  };
}

export function installSpecialistExperience() {
  if (typeof window === 'undefined' || window.__quantoraSpecialistExperienceInstalled) return;
  window.__quantoraSpecialistExperienceInstalled = true;

  installFetchDomainBridge();
  const stored = currentDomain();
  if (stored) setCurrentDomain(stored);

  document.addEventListener('click', (event) => {
    const specialist = specialistFromClick(event.target);
    if (!specialist) return;

    // The legacy Studio onClick sends a fake prompt such as "Act as a world-class
    // travel planner". Capture the click before React and turn it into a mode
    // switch instead. The user's first visible message must be their own words.
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

    setCurrentDomain(specialist.domain);
    requestAnimationFrame(applyExperience);
    setTimeout(applyExperience, 80);

    if (window.innerWidth < 768) document.activeElement?.blur?.();
  }, true);

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyExperience();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  requestAnimationFrame(applyExperience);
}

export function activeSpecialistDomainForTest() {
  return currentDomain();
}
