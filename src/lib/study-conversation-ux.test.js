import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('the lesson never renders a second composer', () => {
  const markdown = read('src/components/StudyMarkdown.jsx');
  assert.doesNotMatch(markdown, /data-quantora-study-answer-affordance/);
  assert.doesNotMatch(markdown, /<input|<form/);
  assert.doesNotMatch(markdown, /data-quantora-study-your-turn|Your turn — tap or type/);
});

test('the question is anchored in the composer, and only when one was asked', () => {
  const studio = read('src/components/AiStudio.jsx');
  assert.match(studio, /studyAwaitsAnswer\(/);
  assert.match(studio, /awaitingStudyAnswer \? 'Write your answer to the question above/);
});

test('incorrect resolution offers repair choices without punitive red failure styling', () => {
  const shell = read('src/components/StudyTutorShell.jsx');
  assert.match(shell, /Good attempt — here is the key distinction/);
  assert.match(shell, />\s*Another example\s*</);
  assert.match(shell, />\s*Useful reference\s*</);
  assert.match(shell, /onRemediation\?\.\('retry'\)/);
  assert.doesNotMatch(shell, /#9f1239|#fb7185/);
});

test('Study affordances stay hard-gated at the education render boundary', () => {
  const studio = read('src/components/AiStudio.jsx');
  assert.match(studio, /studioDomain === 'education' && msg\.sender === 'ai'/);
  assert.match(studio, /studioDomain === 'education' \? \(/);
  assert.equal((studio.match(/<StudyTutorWorkspace/g) || []).length, 1);
  assert.equal((studio.match(/<StudyMarkdown/g) || []).length, 1);
});

test('Study model guidance forbids automatic repeats after a correct answer', () => {
  const directives = read('api/_lib/studio-domains.ts');
  const education = directives.slice(directives.indexOf('education:'), directives.indexOf('finance:'));
  assert.match(education, /answers a question correctly[\s\S]*Do not repeat it automatically/i);
});

test('Study explanations use the available width and keep the platform UI font at the message boundary', () => {
  const css = read('src/index.css');
  const studyCss = css.slice(css.indexOf('html[data-quantora-domain="education"] .app-shell--studio .markdown-prose'));
  assert.match(studyCss, /font-family: var\(--font-body\)/);
  assert.match(studyCss, /max-width: none/);
  assert.doesNotMatch(studyCss.slice(0, 500), /max-width: (?:34|68)rem|font-study-body/);
});

test('Study reading copy has a quiet book-like type voice without changing controls', () => {
  const markdown = read('src/components/StudyMarkdown.jsx');
  assert.match(markdown, /STUDY_READING_FONT/);
  assert.match(markdown, /Charter/);
  assert.match(markdown, /Iowan Old Style/);
  assert.match(markdown, /data-quantora-study-reading-copy="true"/);
  assert.match(markdown, /fontFamily: STUDY_READING_FONT/);
});

test('Study responses carry subtle tutor illustration cues rather than a chatbot avatar', () => {
  const markdown = read('src/components/StudyMarkdown.jsx');
  const nudge = read('src/components/StudyTutorNudge.jsx');
  assert.match(markdown, /<StudyTutorNudge/);
  assert.match(nudge, /data-quantora-study-nudge=\{kind\}/);
  for (const visual of ['wave', 'book', 'pencil', 'spark', 'magnify', 'idea']) {
    assert.match(nudge, new RegExp(`${visual}:`));
  }
  assert.doesNotMatch(nudge, /avatar|mascot/i);
});

test('Study removes robotic response labels without changing other domain renderers', () => {
  const markdown = read('src/components/StudyMarkdown.jsx');
  const studio = read('src/components/AiStudio.jsx');
  assert.match(markdown, /polishStudyTutorText\(text\)/);
  assert.match(studio, /String\(tool\)\.startsWith\('study-'\)[\s\S]*visibleUserText: action\.visibleText/);
  assert.match(studio, /String\(tool\)\.startsWith\('travel-'\)[\s\S]*handleSendMessage\(action\.text\)/);
});

test('Study flashcards are an interactive hidden-answer deck, not a Front/Back table', () => {
  const deck = read('src/components/StudyFlashcards.jsx');
  const markdown = read('src/components/StudyMarkdown.jsx');
  assert.match(deck, /data-quantora-study-flashcard=\{revealed \? 'back' : 'front'\}/);
  assert.match(deck, /Tap when you have an answer in mind/);
  assert.match(deck, />Next <ArrowRight/);
  assert.match(markdown, /<StudyFlashcards/);
});

test('Study keeps three permanent lesson moves while plus and AI have distinct jobs', () => {
  const shell = read('src/components/StudyTutorShell.jsx');
  const hub = read('src/components/StudyHubLauncher.jsx');
  const plus = read('src/lib/studio-tools-menu.js');
  const history = read('src/components/StudyAssessmentHistory.jsx');
  const notebook = read('src/components/StudyNotebook.jsx');

  assert.match(shell, /data-quantora-study-next-choices="true"/);
  assert.match(shell, />\s*Explain\s*</);
  assert.match(shell, />\s*Practice\s*</);
  assert.match(shell, /:\s*'Check'/);

  for (const label of ['Explain differently', 'Show visually', 'Real-world example', 'Where next?', 'Assessment history']) {
    assert.match(hub, new RegExp(escapeRegExp(label)));
  }
  for (const duplicated of ['Notebook', 'Flashcards', 'Make concise notes']) {
    assert.doesNotMatch(hub, new RegExp(`label:\\s*['"]${escapeRegExp(duplicated)}['"]`));
  }

  for (const title of ['New topic', 'Assessment', 'Flashcards', 'Notebook']) {
    assert.match(plus, new RegExp(`title:\\s*['"]${escapeRegExp(title)}['"]`));
  }
  for (const removed of ['Icebreaker', 'Apply', 'Plan', 'Notes']) {
    const visibleEducationCatalog = plus.slice(plus.indexOf("if (studioDomain === 'education')"), plus.indexOf("if (studioDomain === 'finance'"));
    assert.doesNotMatch(visibleEducationCatalog, new RegExp(`title:\\s*['"]${escapeRegExp(removed)}['"]`));
  }

  for (const label of ['Notebook', 'Assessment history', 'Explain differently', 'Show visually', 'Real world', 'Mini practice', 'Quick sketch', 'Did you know?', 'Where next?']) {
    assert.doesNotMatch(shell, new RegExp(`${escapeRegExp(label)}\\s*<\\/button>`));
  }

  assert.match(hub, /data-quantora-study-hub-launcher="true"/);
  assert.match(hub, /aria-expanded=\{open\}/);
  assert.match(hub, /<StudyAssessmentHistory/);
  assert.match(hub, /<StudyNotebook/);
  assert.match(history, /data-quantora-study-assessment-history="true"/);
  assert.match(history, /Last \{state\.data\?\.windowDays \|\| 30\} days/);
  assert.match(notebook, /data-quantora-study-notebook="true"/);
  assert.match(notebook, /Personal notes do not change mastery/);

  assert.doesNotMatch(hub, /label:\s*['"](?:Coming soon|Dashboard)['"]/i);
  assert.doesNotMatch(hub, />\s*(?:Coming soon|Dashboard)\s*</i);
});

test('Study plus surfaces open existing governed features and cannot become dead controls before context exists', () => {
  const menu = read('src/components/StudioToolsMenu.jsx');
  const shell = read('src/components/StudyTutorShell.jsx');
  const hub = read('src/components/StudyHubLauncher.jsx');
  const navigation = read('src/lib/study-surface-navigation.js');

  assert.match(menu, /requestStudySurface\(item\.surface\)/);
  assert.match(menu, /item\?\.requiresTopic && !hasStudyTopic/);
  assert.match(menu, /disabled=\{disabled\}/);
  assert.match(menu, /Start a Study topic first\./);
  assert.match(navigation, /ASSESSMENT:\s*'assessment'/);
  assert.match(navigation, /NOTEBOOK:\s*'notebook'/);
  assert.match(shell, /STUDY_SURFACE\.ASSESSMENT/);
  assert.match(shell, /requestCheck\(\{ explicitRetry: completedCheck \}\)/);
  assert.match(hub, /STUDY_SURFACE\.NOTEBOOK/);
  assert.match(hub, /setSurface\('notebook'\)/);
});

test('H1 Study controls stay restrained while the dedicated Study AI launcher carries brand color', () => {
  const shell = read('src/components/StudyTutorShell.jsx');
  const hub = read('src/components/StudyHubLauncher.jsx');
  const css = read('src/components/study-h1.css');
  const historyCss = read('src/components/study-assessment-history.css');
  const notebookCss = read('src/components/study-notebook.css');
  const contentControls = `${shell}\n${hub}\n${historyCss}\n${notebookCss}`;

  assert.doesNotMatch(contentControls, /#f97316|#fff7ed|#ecfdf5|#fde68a|#92400e|#6ee7b7|#fcd34d/i);
  assert.match(css, /--study-h1-strong: #111111/);
  assert.match(css, /\.study-h1-hub__launcher[\s\S]*linear-gradient\(135deg,[\s\S]*#d946ef[\s\S]*#6366f1[\s\S]*#22d3ee/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /focus-visible/);
});

test('persisted private Study prompts are removed from both rendering and model history', () => {
  const studio = read('src/components/AiStudio.jsx');
  const stream = read('src/hooks/useChatStream.js');
  assert.match(studio, /cleanStudyMessages = useMemo\(\s*\(\) => withoutPrivateStudyInstructions\(messages, studioDomain\)/);
  assert.match(studio, /return cleanStudyMessages\.filter/);
  assert.match(stream, /withoutPrivateStudyInstructions\([\s\S]*studioDomain/);
});
