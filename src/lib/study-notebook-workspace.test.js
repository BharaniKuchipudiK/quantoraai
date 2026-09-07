import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Notebook v2 maps existing subject topic and note fields into notebooks sections and pages', () => {
  const notebook = read('src/components/StudyNotebook.jsx');

  assert.match(notebook, /Notebooks → sections → pages/);
  assert.match(notebook, /aria-label="Notebooks"/);
  assert.match(notebook, /aria-label="Sections and pages"/);
  assert.match(notebook, />Notebook<\/span>/);
  assert.match(notebook, />Section<\/span>/);

  for (const existingField of ['subject', 'topic', 'title', 'body']) {
    assert.match(notebook, new RegExp(`note\\.${existingField}|draft\\.${existingField}`));
  }

  assert.doesNotMatch(notebook, /notebookId|sectionId|pageId/);
});

test('Notebook v2 keeps the existing persistence and evidence boundaries', () => {
  const notebook = read('src/components/StudyNotebook.jsx');

  for (const operation of [
    'loadStudyNotebook',
    'createStudyNotebookNote',
    'updateStudyNotebookNote',
    'deleteStudyNotebookNote',
    'flushPendingSave',
  ]) {
    assert.match(notebook, new RegExp(operation));
  }

  assert.match(notebook, /Personal notes do not change mastery\./);
  assert.match(notebook, /20_000/);
  assert.match(notebook, /NOTE_LIMIT = 200/);
  assert.doesNotMatch(notebook, /tiptap|blocknote|lexical/i);
});

test('Notebook opens as a dedicated expandable Study workspace without creating a second owner', () => {
  const hub = read('src/components/StudyHubLauncher.jsx');
  const css = read('src/components/study-notebook.css');

  assert.match(hub, /setSurface\('notebook'\);[\s\S]*setNotebookExpanded\(true\);[\s\S]*setOpen\(true\);/);
  assert.match(hub, /<StudyNotebook[\s\S]*expanded=\{notebookExpanded\}/);
  assert.match(hub, /study-h1-hub__panel--notebook-expanded/);
  assert.match(css, /\.study-h1-hub__panel--notebook-expanded\s*\{[\s\S]*position:\s*fixed/);
  assert.match(css, /grid-template-columns:\s*190px 280px minmax\(0, 1fr\)/);
  assert.doesNotMatch(hub, /<StudyNotebook[\s\S]*<StudyNotebook/);
});
