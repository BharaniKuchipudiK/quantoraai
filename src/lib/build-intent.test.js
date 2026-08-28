import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectBuildIntent,
  isSpecifiedRunnableTool,
  needsGuidedWebsiteIntake,
  resolveEffectiveBuildMode,
  resolveIsCodingRequest,
  shouldHonorGuidedBuild,
  shouldStartGuidedBuild,
} from './build-intent.js';

test('Study flashcards are a tutor move, not an iOS app to preview', () => {
  assert.equal(isSpecifiedRunnableTool("Make 6 flashcards for Newton's laws"), true);
  assert.equal(resolveEffectiveBuildMode({
    message: "Make 6 flashcards for Newton's laws",
    studioDomain: 'education',
    studioMode: 'ask',
    studioModeExplicit: true,
  }), false);
  assert.equal(resolveEffectiveBuildMode({
    message: 'Build a calculator app',
    studioDomain: null,
    studioMode: 'ask',
    studioModeExplicit: true,
  }), true);
});

test('a calculator is a build, not a question', () => {
  assert.equal(detectBuildIntent('Make me a simple calculator app'), true);
  assert.equal(detectBuildIntent('How do I build an app?'), false);
});

test('a Drive organize agent is a Coding Desk build, not a chat plan', () => {
  assert.equal(detectBuildIntent('build a Google Drive crawling / organize agent for macOS'), true);
  assert.equal(resolveIsCodingRequest('build a Google Drive crawling / organize agent for macOS', {
    codingDeskOpen: true,
  }), true);
  assert.equal(resolveIsCodingRequest('Build a crawler for Google Drive on macOS', {
    codingDeskOpen: true,
  }), true);
});

test('a named tool skips coffee-shop intake', () => {
  assert.equal(isSpecifiedRunnableTool('Build a calculator app'), true);
  assert.equal(isSpecifiedRunnableTool('Help me create a calculator that can handle all the basic functions with the iOS theme.'), true);
  assert.equal(detectBuildIntent('Help me create a calculator that can handle all the basic functions with the iOS theme.'), true);
  assert.equal(needsGuidedWebsiteIntake('Build a calculator app'), false);
  assert.equal(shouldStartGuidedBuild({ text: 'Make me a simple calculator app' }), false);
  assert.equal(shouldHonorGuidedBuild({
    guidedBuild: true,
    message: 'create a calculator',
    studioMode: 'ask',
  }), false);
});

test('a coffee shop website still uses guided intake in Ask mode', () => {
  assert.equal(needsGuidedWebsiteIntake('Build me a website for my coffee shop'), true);
  assert.equal(shouldStartGuidedBuild({
    text: 'Build me a website for my coffee shop',
    studioMode: 'ask',
  }), true);
});

test('Build mode means act — no intake delay', () => {
  assert.equal(shouldStartGuidedBuild({
    text: 'Build me a website for my coffee shop',
    studioMode: 'build',
  }), false);
});

/*
 * THE GATE MUST STAY WIRED.
 *
 * shouldStartGuidedBuild was exported and tested for months while nothing
 * called it, so the platform never asked a single intake question. These cases
 * are the real session that exposed it.
 */
test('a bare website request asks first', () => {
  assert.equal(shouldStartGuidedBuild({
    text: 'help me build a website for my coffee shop',
    hasPreview: false,
    isWorkspace: false,
    studioMode: 'ask',
  }), true, 'the shop name, the menu and the cart are all still unknown');
});

test('intake never re-opens on a desk that already has a build', () => {
  const args = { text: 'help me build a website for my coffee shop', studioMode: 'ask' };
  assert.equal(shouldStartGuidedBuild({ ...args, hasPreview: true }), false,
    'a running preview means the questions are already answered');
  assert.equal(shouldStartGuidedBuild({ ...args, isWorkspace: true }), false);
});

test('a named tool is built, not interviewed', () => {
  assert.equal(shouldStartGuidedBuild({
    text: 'build me a tip calculator',
    studioMode: 'ask',
  }), false, 'nothing about a tip calculator is ambiguous enough to stall on');
});

test('an explicit Build or Plan mode skips intake', () => {
  const args = { text: 'help me build a website for my coffee shop' };
  assert.equal(shouldStartGuidedBuild({ ...args, studioMode: 'build' }), false);
  assert.equal(shouldStartGuidedBuild({ ...args, studioMode: 'plan' }), false);
});

test('a question about a screenshot is not a build', () => {
  assert.equal(shouldStartGuidedBuild({
    text: 'help me build a website for my coffee shop',
    studioMode: 'ask',
    isVisionQuestion: true,
  }), false);
});

/*
 * THE COMPLAINT, AS A TEST.
 *
 * "The calculator or coffee websites are a joke — not what real users use the
 * Coding Desk for." They were the only nouns it could HEAR: the original list
 * was consumer-shaped, so six of these eight were not recognised as builds at
 * all and never reached the desk.
 */
test('real business software is recognised as a build', () => {
  const asks = [
    'Build a production scheduling board for a small furniture workshop',
    'Build a shift scheduler for my cafe',
    'Build a booking system for my salon',
    'Build an inventory management screen',
    'Build a CRM for my agency',
    'Build a kanban board for my team',
    'Create a rota planner for the kitchen staff',
    'Make an invoice generator for my consultancy',
  ];
  for (const ask of asks) {
    assert.equal(detectBuildIntent(ask), true, `not recognised as a build: ${ask}`);
  }
});

test('a broader noun list does not turn conversation into a build', () => {
  // A verb is still required alongside the noun, so ordinary talk about a
  // system or a plan stays ordinary talk.
  const notBuilds = [
    'What is the weather in Singapore?',
    'Explain quantum computing simply',
    'I might rebrand the business someday',
    'How do I make a good first impression?',
    'The booking system at my gym is terrible',
    'Can you explain how a CRM works?',
  ];
  for (const text of notBuilds) {
    assert.equal(detectBuildIntent(text), false, `wrongly treated as a build: ${text}`);
  }
});
