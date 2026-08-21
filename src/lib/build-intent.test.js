import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectBuildIntent,
  isSpecifiedRunnableTool,
  needsGuidedWebsiteIntake,
  shouldHonorGuidedBuild,
  shouldStartGuidedBuild,
} from './build-intent.js';

test('a calculator is a build, not a question', () => {
  assert.equal(detectBuildIntent('Make me a simple calculator app'), true);
  assert.equal(detectBuildIntent('How do I build an app?'), false);
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
