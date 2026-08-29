import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyRequestKind, requestIsAnalysisNotBuild } from './request-kind.js';

/*
 * THE TURN THAT DIED.
 *
 * A board decision paper was routed to the Coding Desk, the model emitted
 * native iOS files, Preview died, and the reply offered "Add dates / itinerary"
 * chips. The cause was not a missing noun: "Create a portfolio showing
 * CONTINUE, ACCELERATE, DEFER" — a TABLE in a document — matched a build verb
 * and a build noun, and that was the entire decision. Seven analysis markers in
 * the same prompt were read by nothing.
 */
const BOARD_PAPER = `You are the Chief Technology & Transformation Officer of Aurelius Group.
Your task is to determine whether Aurelius should proceed with a proposed $180M
AI-enabled enterprise transformation, modify it, postpone it, or cancel it.
Do NOT merely summarize the information below. You must independently analyse it,
identify at least 12 contradictions, challenge the assumptions, and show your reasoning.
Create an enterprise AI platform using OpenAI models, internal RAG and agentic workflows.
Produce a Board-level decision paper.
Create a portfolio showing CONTINUE, ACCELERATE, REDESIGN, DEFER, STOP.`;

test('a board decision paper is analysis, not a build', () => {
  const verdict = classifyRequestKind(BOARD_PAPER);
  assert.equal(verdict.kind, 'analysis');
  assert.ok(verdict.analysis > verdict.build * 2, 'the analysis signal must genuinely dominate');
  assert.equal(requestIsAnalysisNotBuild(BOARD_PAPER), true);
});

test('real builds are still builds', () => {
  for (const ask of [
    'Build a production scheduling board for a small furniture workshop',
    'help me build a website for my coffee shop',
    'build me a calculator',
    'Create a booking system for my salon',
  ]) {
    assert.equal(classifyRequestKind(ask).kind, 'build', `misread as not-a-build: ${ask}`);
    assert.equal(requestIsAnalysisNotBuild(ask), false);
  }
});

test('one analysis word does not flip a build', () => {
  // "build a dashboard and explain how it works" is a build with a request for
  // commentary, not an essay. The margin exists precisely for this.
  const verdict = classifyRequestKind('Build a dashboard for sales and explain how it works');
  assert.equal(verdict.kind, 'build');
});

test('deciding whether to build something is not building it', () => {
  const verdict = classifyRequestKind(
    'Should we build a booking system or buy one? Analyse the trade-offs, evaluate both, and recommend which we pick.',
  );
  assert.equal(verdict.kind, 'analysis', 'a buy-vs-build question is a question');
});

test('asking for something that runs always wins', () => {
  // However analytical the framing, "I want to click it" is a build.
  const verdict = classifyRequestKind(
    'Analyse our options and evaluate the trade-offs, then give me a working prototype I can click.',
  );
  assert.equal(verdict.kind, 'build');
  assert.match(verdict.reason, /runs/);
});

test('silence is not evidence', () => {
  // No signal either way must never be turned into a verdict — the same rule
  // the route planner uses for a model with no registry record.
  for (const text of ['Scan through the GitHub public repositories', 'hello', '']) {
    assert.equal(classifyRequestKind(text).kind, 'unknown');
    assert.equal(requestIsAnalysisNotBuild(text), false, 'unknown must not block a build');
  }
});

test('the verdict carries its evidence', () => {
  const verdict = classifyRequestKind(BOARD_PAPER);
  assert.equal(typeof verdict.analysis, 'number');
  assert.equal(typeof verdict.build, 'number');
  assert.ok(verdict.reason.length > 0, 'a decision nobody can inspect is the defect this repo keeps removing');
});
