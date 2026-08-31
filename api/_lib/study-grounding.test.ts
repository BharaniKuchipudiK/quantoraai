import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyStudyGroundingSource,
  normalizeStudyGroundingSources,
  studyGroundingEvidenceAllowed,
  studyGroundingEvidenceMatchesSource,
  studyGroundingSourceAllowedForMode,
} from './study-grounding.js';

test('official authority is derived from governed hosts rather than caller labels', () => {
  const ncert = classifyStudyGroundingSource({
    ref: 'https://ncert.nic.in/textbook.php?gesc1=1-10',
    kind: 'web',
  });
  assert.equal(ncert?.kind, 'official');
  assert.equal(ncert?.authorityId, 'ncert');
  assert.equal(ncert?.canonical, true);

  const fake = classifyStudyGroundingSource({
    ref: 'https://example.com/cbse-science',
    kind: 'official',
  });
  assert.equal(fake?.kind, 'web');
  assert.equal(fake?.canonical, false);
});

test('look-alike official domains cannot satisfy canonical authority', () => {
  const spoof = classifyStudyGroundingSource({
    ref: 'https://ncert.nic.in.evil.example/textbook.pdf',
    kind: 'official',
  });
  assert.equal(spoof?.kind, 'web');
  assert.equal(spoof?.authorityId, null);
});

test('official grounding requires HTTPS and rejects opaque caller-made authority refs', () => {
  assert.equal(classifyStudyGroundingSource({ ref: 'http://ncert.nic.in/textbook.php', kind: 'official' }), null);
  assert.equal(classifyStudyGroundingSource({ ref: 'ncert:physics:class-11:chapter-5', kind: 'official' }), null);
});

test('recognized exam and board authorities are canonical', () => {
  const refs = [
    ['https://cbseacademic.nic.in/curriculum_2027.html', 'cbse-academic'],
    ['https://jeemain.nta.nic.in/2026/', 'jee-main-nta'],
    ['https://exams.nta.ac.in/NEET/', 'nta-exams'],
    ['https://www.seab.gov.sg/gce-o-level/', 'seab-sg'],
  ];
  for (const [ref, authorityId] of refs) {
    const source = classifyStudyGroundingSource({ ref });
    assert.equal(source?.kind, 'official');
    assert.equal(source?.authorityId, authorityId);
    assert.equal(source?.canonical, true);
  }
});

test('Exam Grounded accepts canonical official sources while Explore may cite ordinary web', () => {
  const [official, web, connected] = normalizeStudyGroundingSources([
    { ref: 'https://ncert.nic.in/textbook.php?gesc1=1-10' },
    { ref: 'web:https://example.com/reference' },
    { ref: 'connected:learner-notes/chapter-4' },
  ]);
  assert.equal(studyGroundingSourceAllowedForMode(official, 'exam_grounded'), true);
  assert.equal(studyGroundingSourceAllowedForMode(web, 'exam_grounded'), false);
  assert.equal(studyGroundingSourceAllowedForMode(connected, 'exam_grounded'), false);
  assert.equal(studyGroundingSourceAllowedForMode(web, 'explore'), true);
  assert.equal(studyGroundingSourceAllowedForMode(connected, 'explore'), true);
});

test('grounding evidence must bind back to the admitted source', () => {
  const source = 'https://ncert.nic.in/textbook.php?gesc1=1-10';
  assert.equal(studyGroundingEvidenceMatchesSource(`${source}#chapter-10`, source), true);
  assert.equal(studyGroundingEvidenceMatchesSource(`grounding:${source}#chapter-10`, source), true);
  assert.equal(studyGroundingEvidenceMatchesSource('https://example.com/reference#chapter-10', source), false);
});

test('a web citation cannot masquerade as the evidence for an Exam Grounded official source', () => {
  const sources = normalizeStudyGroundingSources([
    { ref: 'https://ncert.nic.in/textbook.php?gesc1=1-10', kind: 'official' },
    { ref: 'https://example.com/reference', kind: 'web' },
  ]);
  assert.equal(
    studyGroundingEvidenceAllowed('https://example.com/reference#support', sources, 'exam_grounded'),
    false,
  );
  assert.equal(
    studyGroundingEvidenceAllowed('https://ncert.nic.in/textbook.php?gesc1=1-10#support', sources, 'exam_grounded'),
    true,
  );
  assert.equal(
    studyGroundingEvidenceAllowed('https://example.com/reference#support', sources, 'explore'),
    true,
  );
});
