import {
  STUDIO_DOMAIN_STATE_EVENT,
  normalizeStudioDomain,
  requestStudioDomain,
} from './studio-shell-events.js';

const LEGACY_ACTIVE_DOMAIN_KEY = 'quantora_active_specialist_domain';

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

let activeDomain = null;
let applying = false;

function currentDomain() {
  return normalizeStudioDomain(activeDomain);
}

function setCurrentDomain(domain) {
  activeDomain = normalizeStudioDomain(domain);
  document.documentElement.dataset.quantoraDomain = activeDomain || '';
}

function exactTextElements(text) {
  return [...document.querySelectorAll('div,span,p,h1,h2,h3,button')]
    .filter((element) => element.children.length === 0 && element.textContent?.trim() === text);
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

function restoreDisplay(element) {
  if (!element?.dataset?.quantoraOriginalDisplay) return;
  const original = element.dataset.quantoraOriginalDisplay;
  element.style.display = original === '__empty__' ? '' : original;
  delete element.dataset.quantoraOriginalDisplay;
}

function studioShell() {
  return document.querySelector('.app-shell--studio');
}

function appHeader() {
  return document.querySelector('.app-shell--studio .app-header');
}

function hideGlobalStudioHeader() {
  const header = appHeader();
  if (header) setDisplay(header, 'none');
}

function restoreGlobalStudioHeader() {
  document.querySelectorAll('.app-header[data-quantora-original-display]').forEach(restoreDisplay);
}

function profileFirstName() {
  const image = document.querySelector('.app-header img[alt]');
  const alt = image?.getAttribute('alt')?.trim();
  if (!alt || alt.toLowerCase() === 'user') return '';
  return alt.split(/\s+/)[0] || '';
}

function profileIdentity() {
  const image = document.querySelector('.app-header img[alt]');
  const name = image?.getAttribute('alt')?.trim() || 'Profile';
  return {
    name: name && name.toLowerCase() !== 'user' ? name : 'Profile',
    imageSrc: image?.getAttribute('src') || '',
  };
}

function findResetButton() {
  return [...document.querySelectorAll('button')]
    .find((button) => button.textContent?.trim() === 'Reset Chat') || null;
}

function findChatTopBar() {
  const reset = findResetButton();
  return reset?.parentElement?.parentElement || null;
}

function findChatStream() {
  return findChatTopBar()?.nextElementSibling || null;
}

function hideChatTopBar() {
  const topBar = findChatTopBar();
  if (!topBar) return;
  setDisplay(topBar, 'none');
  const mainColumn = topBar.parentElement;
  if (mainColumn) mainColumn.style.paddingTop = '0';
}

function findHeaderNavigationButton(pattern) {
  const header = appHeader();
  if (!header) return null;
  return [...header.querySelectorAll('button')]
    .find((button) => pattern.test(button.textContent?.trim() || '')) || null;
}

function openCanvasWorkspace() {
  const button = findHeaderNavigationButton(/Dream-to-Action Canvas|Journey/i);
  if (button) button.click();
}

function originalProfileButton() {
  const header = appHeader();
  return header?.querySelector('button[aria-controls="quantora-profile-menu"], button[aria-haspopup="dialog"]') || null;
}

function positionProfileMenuNearSidebar() {
  const menu = document.getElementById('quantora-profile-menu');
  const proxy = document.querySelector('[data-quantora-sidebar-profile]');
  if (!menu || !proxy) return;
  const rect = proxy.getBoundingClientRect();
  const menuWidth = Math.min(320, Math.max(260, window.innerWidth - rect.right - 24));
  Object.assign(menu.style, {
    position: 'fixed',
    left: `${Math.min(window.innerWidth - menuWidth - 12, rect.right + 10)}px`,
    right: 'auto',
    top: 'auto',
    bottom: `${Math.max(12, window.innerHeight - rect.bottom)}px`,
    width: `${menuWidth}px`,
    maxHeight: `${Math.max(220, Math.min(620, rect.bottom - 18))}px`,
    zIndex: '10000',
  });
}

function openProfileMenu() {
  const original = originalProfileButton();
  if (!original) return;
  original.click();
  requestAnimationFrame(positionProfileMenuNearSidebar);
  setTimeout(positionProfileMenuNearSidebar, 40);
}

function createSidebarButton({ label, icon, dataAttribute, onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset[dataAttribute] = 'true';
  Object.assign(button.style, {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 10px',
    borderRadius: '9px',
    border: '1px solid transparent',
    background: 'transparent',
    color: 'var(--text-primary, #fff)',
    fontSize: '0.86rem',
    fontWeight: '600',
    cursor: 'pointer',
    textAlign: 'left',
  });
  const iconNode = document.createElement('span');
  iconNode.textContent = icon;
  iconNode.setAttribute('aria-hidden', 'true');
  Object.assign(iconNode.style, { width: '18px', textAlign: 'center', opacity: '0.9' });
  const labelNode = document.createElement('span');
  labelNode.textContent = label;
  labelNode.style.flex = '1';
  button.append(iconNode, labelNode);
  button.addEventListener('mouseenter', () => {
    button.style.background = 'rgba(255,255,255,0.055)';
    button.style.borderColor = 'rgba(255,255,255,0.08)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.background = 'transparent';
    button.style.borderColor = 'transparent';
  });
  button.addEventListener('click', onClick);
  return button;
}

function ensureCanvasEntry() {
  if (document.querySelector('[data-quantora-sidebar-canvas]')) return;
  const historyLabel = exactTextElements('Chat History')[0];
  const parent = historyLabel?.parentElement;
  if (!historyLabel || !parent) return;

  const block = document.createElement('div');
  block.dataset.quantoraSidebarCanvas = 'true';
  block.style.marginBottom = '18px';

  const heading = document.createElement('div');
  heading.textContent = 'Workspace';
  Object.assign(heading.style, {
    fontSize: '0.72rem',
    fontWeight: '700',
    color: 'var(--text-secondary, #94a3b8)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '7px',
    paddingLeft: '4px',
  });

  const canvas = createSidebarButton({
    label: 'Canvas',
    icon: '◫',
    dataAttribute: 'quantoraSidebarCanvasButton',
    onClick: openCanvasWorkspace,
  });
  canvas.dataset.quantoraSidebarCanvas = 'true';
  block.append(heading, canvas);
  parent.insertBefore(block, historyLabel);
}

function ensureProfileEntry() {
  const existing = document.querySelector('[data-quantora-sidebar-profile]');
  const feedbackLabel = exactTextElements('Feedback & Suggestions')[0];
  const feedbackButton = feedbackLabel?.parentElement;
  const footer = feedbackButton?.parentElement;
  if (!feedbackButton || !footer) return;

  const identity = profileIdentity();
  if (existing) {
    const name = existing.querySelector('[data-quantora-profile-name]');
    if (name) setText(name, identity.name);
    return;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.quantoraSidebarProfile = 'true';
  Object.assign(button.style, {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 9px',
    marginBottom: '6px',
    borderRadius: '10px',
    border: '1px solid transparent',
    background: 'transparent',
    color: 'var(--text-primary, #fff)',
    cursor: 'pointer',
    textAlign: 'left',
  });

  let avatar;
  if (identity.imageSrc) {
    avatar = document.createElement('img');
    avatar.src = identity.imageSrc;
    avatar.alt = '';
    Object.assign(avatar.style, { width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' });
  } else {
    avatar = document.createElement('span');
    avatar.textContent = identity.name.charAt(0).toUpperCase();
    Object.assign(avatar.style, {
      width: '28px',
      height: '28px',
      borderRadius: '50%',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      background: 'linear-gradient(135deg, #f97316, #8b5cf6)',
      fontWeight: '800',
      fontSize: '0.78rem',
      flexShrink: '0',
    });
  }

  const name = document.createElement('span');
  name.dataset.quantoraProfileName = 'true';
  name.textContent = identity.name;
  Object.assign(name.style, { flex: '1', fontSize: '0.85rem', fontWeight: '650', overflow: 'hidden', textOverflow: 'ellipsis' });
  const chevron = document.createElement('span');
  chevron.textContent = '›';
  chevron.style.opacity = '0.6';

  button.append(avatar, name, chevron);
  button.addEventListener('mouseenter', () => {
    button.style.background = 'rgba(255,255,255,0.055)';
    button.style.borderColor = 'rgba(255,255,255,0.08)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.background = 'transparent';
    button.style.borderColor = 'transparent';
  });
  button.addEventListener('click', openProfileMenu);
  footer.insertBefore(button, feedbackButton);
}

function ensureSidebarShell() {
  exactTextElements('Specialized Agents').forEach((element) => setText(element, 'Advisors'));
  [...exactTextElements('Travel Guide AI'), ...exactTextElements('Travel Advisor')]
    .forEach((label) => setText(label, 'Travel Advisor'));
  ensureCanvasEntry();
  ensureProfileEntry();
  positionProfileMenuNearSidebar();
}

function clearAdvisorHighlight() {
  document.querySelectorAll('[data-quantora-active-specialist]').forEach((row) => {
    delete row.dataset.quantoraActiveSpecialist;
    row.style.background = 'transparent';
    row.style.borderColor = 'transparent';
    row.style.fontWeight = '500';
  });
}

function applyAdvisorHighlight(config) {
  clearAdvisorHighlight();
  if (!config) return;
  for (const label of exactTextElements(config.label)) {
    const row = label.parentElement;
    if (!row || row.closest('[data-quantora-sidebar-profile]')) continue;
    row.dataset.quantoraActiveSpecialist = config.domain;
    row.style.background = config.domain === 'travel' ? 'rgba(37, 99, 235, 0.10)' : 'rgba(249, 115, 22, 0.10)';
    row.style.borderColor = config.domain === 'travel' ? 'rgba(37, 99, 235, 0.28)' : 'rgba(249, 115, 22, 0.28)';
    row.style.fontWeight = '700';
  }
}

function findHeroPrompt() {
  const texts = ['What would you like to build today?', ...Object.values(DOMAIN_CONFIG).map((item) => item.hero)];
  for (const text of texts) {
    const found = exactTextElements(text)[0];
    if (found) return found;
  }
  return null;
}

function minimalizeHero(hero) {
  if (!hero) return;
  Object.assign(hero.style, {
    background: 'transparent',
    border: 'none',
    boxShadow: 'none',
    paddingTop: '18px',
    paddingBottom: '18px',
    marginTop: '0',
    maxWidth: '720px',
  });
}

function applyAdvisorHero(config) {
  if (!config) return;
  const prompt = findHeroPrompt();
  if (!prompt) return;
  setText(prompt, config.hero);
  prompt.style.marginBottom = '8px';

  const hero = prompt.parentElement;
  if (!hero) return;
  hero.dataset.quantoraSpecialistHero = config.domain;
  minimalizeHero(hero);

  const greeting = [...hero.querySelectorAll('h1')][0];
  if (greeting) {
    const firstName = profileFirstName();
    setText(greeting, firstName ? `Welcome back, ${firstName}` : 'Welcome back');
  }

  let support = hero.querySelector('[data-quantora-specialist-support]');
  if (!support) {
    support = document.createElement('p');
    support.dataset.quantoraSpecialistSupport = 'true';
    prompt.insertAdjacentElement('afterend', support);
  }
  setText(support, config.supporting);
  Object.assign(support.style, {
    margin: '0 auto 12px',
    maxWidth: '620px',
    fontSize: '0.96rem',
    lineHeight: '1.55',
    color: 'var(--text-secondary, #94a3b8)',
  });

  let capability = hero.querySelector('[data-quantora-specialist-capabilities]');
  if (!capability) {
    capability = document.createElement('div');
    capability.dataset.quantoraSpecialistCapabilities = 'true';
    support.insertAdjacentElement('afterend', capability);
  }
  setText(capability, config.capabilities);
  Object.assign(capability.style, {
    margin: '0 auto 2px',
    fontSize: '0.76rem',
    fontWeight: '700',
    color: config.domain === 'travel' ? '#60a5fa' : '#fb923c',
  });
}

function restoreNeutralHero() {
  document.querySelectorAll('[data-quantora-specialist-support], [data-quantora-specialist-capabilities]').forEach((node) => node.remove());
  const hero = document.querySelector('[data-quantora-specialist-hero]');
  if (!hero) return;
  delete hero.dataset.quantoraSpecialistHero;
  minimalizeHero(hero);

  const firstName = profileFirstName();
  const greeting = hero.querySelector('h1');
  if (greeting) setText(greeting, firstName ? `Welcome back, ${firstName}` : 'Welcome back');

  const prompt = [...hero.querySelectorAll('h2,p,div')]
    .find((node) => Object.values(DOMAIN_CONFIG).some((item) => node.textContent?.trim() === item.hero));
  if (prompt) setText(prompt, 'What would you like to work on?');
}

function applyInput(config) {
  const textarea = document.querySelector('textarea');
  if (!textarea) return;
  const placeholder = config?.placeholder || 'Ask anything — plan a trip, research an idea, study, or build something...';
  if (textarea.getAttribute('placeholder') !== placeholder) textarea.setAttribute('placeholder', placeholder);
}

function specialistFromClick(target) {
  let node = target instanceof Element ? target : null;
  for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
    if (node.matches?.('[data-quantora-sidebar-profile], [data-quantora-sidebar-canvas]')) return null;
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

function applyExperience() {
  if (applying) return;
  applying = true;
  try {
    const shell = studioShell();
    if (!shell) {
      restoreGlobalStudioHeader();
      return;
    }

    hideGlobalStudioHeader();
    hideChatTopBar();
    ensureSidebarShell();

    const domain = currentDomain();
    const config = domain ? DOMAIN_CONFIG[domain] : null;
    applyAdvisorHighlight(config);
    if (config) applyAdvisorHero(config);
    else restoreNeutralHero();
    applyInput(config);
  } finally {
    applying = false;
  }
}

export function installSpecialistExperience() {
  if (typeof window === 'undefined' || window.__quantoraSpecialistExperienceInstalled) return;
  window.__quantoraSpecialistExperienceInstalled = true;

  try {
    // One-time migration: the old global specialist key caused New Chat to
    // inherit Travel/Study forever. Session.studioDomain is now authoritative.
    localStorage.removeItem(LEGACY_ACTIVE_DOMAIN_KEY);
  } catch {
    // Storage cleanup must never block Studio.
  }

  installFetchDomainBridge();

  window.addEventListener(STUDIO_DOMAIN_STATE_EVENT, (event) => {
    setCurrentDomain(event?.detail?.domain);
    requestAnimationFrame(applyExperience);
  });

  document.addEventListener('click', (event) => {
    const specialist = specialistFromClick(event.target);
    if (!specialist) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

    // Optimistic presentation update; useStudioSession immediately creates the
    // real advisor-scoped session and then publishes the authoritative state.
    setCurrentDomain(specialist.domain);
    requestStudioDomain(specialist.domain, { createNew: true });
    requestAnimationFrame(applyExperience);
    setTimeout(applyExperience, 60);

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
  window.addEventListener('resize', () => requestAnimationFrame(positionProfileMenuNearSidebar));
  requestAnimationFrame(applyExperience);
}

export function activeSpecialistDomainForTest() {
  return currentDomain();
}
