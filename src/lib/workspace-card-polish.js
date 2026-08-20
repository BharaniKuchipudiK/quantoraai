const WORKSPACE_TITLES = new Set([
  'Travel Planner',
  'Research Brief',
  'Study Tutor',
  'Finance Coach',
  'Technology Advisor',
]);

const MODEL_NAME_PATTERN = /\b(?:kimi|minimax|step\s*\d|gemini|claude|gpt(?:-|\s)?\d|llama|qwen|deepseek|nemotron|mistral|mixtral|grok|glm|gemma|sonnet|haiku|opus|coder)\b/i;

function leafTextNodes(root) {
  return [...root.querySelectorAll('span,div,p,small,strong')]
    .filter((element) => element.children.length === 0 && element.textContent?.trim());
}

function exactWorkspaceTitleNodes() {
  return [...document.querySelectorAll('h1,h2,h3,h4,span,div,p,strong')]
    .filter((element) => element.children.length === 0 && WORKSPACE_TITLES.has(element.textContent?.trim()));
}

function findWorkspaceCard(titleNode) {
  const clickable = titleNode.closest('button,[role="button"]');
  if (clickable) return clickable;

  let node = titleNode.parentElement;
  for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
    const text = node.textContent?.trim() || '';
    if (text.length >= titleNode.textContent.trim().length + 24) return node;
  }
  return titleNode.parentElement;
}

function isModelLabel(text, title) {
  const value = String(text || '').trim();
  if (!value || value === title || value.length > 72) return false;
  return MODEL_NAME_PATTERN.test(value);
}

function unclipDescription(description, card) {
  if (!description) return;

  Object.assign(description.style, {
    whiteSpace: 'normal',
    overflow: 'visible',
    textOverflow: 'clip',
    maxHeight: 'none',
    height: 'auto',
    lineHeight: '1.45',
  });
  description.style.removeProperty('-webkit-line-clamp');
  description.style.removeProperty('-webkit-box-orient');
  if (description.style.display === '-webkit-box') description.style.display = 'block';

  // Remove inherited clipping wrappers between the copy and the card. Keep the
  // card itself clipped so hover/background effects still respect rounded edges.
  for (let node = description.parentElement; node && node !== card; node = node.parentElement) {
    node.style.maxHeight = 'none';
    node.style.height = 'auto';
    if (node.style.overflow === 'hidden') node.style.overflow = 'visible';
    node.style.removeProperty('-webkit-line-clamp');
  }
}

function polishCard(titleNode) {
  const title = titleNode.textContent?.trim();
  if (!WORKSPACE_TITLES.has(title)) return;

  const card = findWorkspaceCard(titleNode);
  if (!card) return;
  card.dataset.quantoraAgenticWorkspaceCard = 'true';

  const leaves = leafTextNodes(card);
  for (const leaf of leaves) {
    if (leaf === titleNode) continue;
    const text = leaf.textContent?.trim() || '';
    if (isModelLabel(text, title)) {
      leaf.dataset.quantoraWorkspaceModelLabel = 'true';
      leaf.style.setProperty('display', 'none', 'important');
    }
  }

  const description = leafTextNodes(card)
    .filter((leaf) => leaf !== titleNode)
    .filter((leaf) => leaf.dataset.quantoraWorkspaceModelLabel !== 'true')
    .filter((leaf) => !isModelLabel(leaf.textContent, title))
    .filter((leaf) => (leaf.textContent?.trim().length || 0) >= 28)
    .sort((a, b) => (b.textContent?.trim().length || 0) - (a.textContent?.trim().length || 0))[0];

  if (description) {
    description.dataset.quantoraWorkspaceDescription = 'true';
    unclipDescription(description, card);
  }

  // A fixed-height card is what turns a harmless text clamp into visibly chopped
  // copy. Let content define the height while retaining a consistent visual floor.
  card.style.height = 'auto';
  card.style.minHeight = '164px';
}

function polishWorkspaceCards() {
  const heading = [...document.querySelectorAll('h1,h2,h3,h4,div,span,p')]
    .find((element) => element.children.length === 0 && element.textContent?.trim() === 'Agentic Workspaces');
  if (!heading && exactWorkspaceTitleNodes().length === 0) return;

  for (const titleNode of exactWorkspaceTitleNodes()) polishCard(titleNode);
}

export function installWorkspaceCardPolish() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (window.__quantoraWorkspaceCardPolishInstalled) return () => {};
  window.__quantoraWorkspaceCardPolishInstalled = true;

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      polishWorkspaceCards();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  window.addEventListener('resize', schedule);
  schedule();

  return () => {
    observer.disconnect();
    window.removeEventListener('resize', schedule);
    delete window.__quantoraWorkspaceCardPolishInstalled;
  };
}

export function polishWorkspaceCardsForTest() {
  polishWorkspaceCards();
}
