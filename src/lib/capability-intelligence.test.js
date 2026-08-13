import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAPABILITY_EFFECT,
  CAPABILITY_RISK,
  getCapabilityApprovalPolicy,
  proposeCapabilities,
} from './capability-intelligence.js';

const userTurn = [{ sender: 'user', text: 'Help me launch a useful product.' }];

test('proposes native capabilities from outcome state rather than keywords', () => {
  const proposals = proposeCapabilities({
    isSignedIn: true,
    memoryConsented: false,
    hasJourneyNode: false,
    conversationContext: { goal: 'Launch a useful product' },
    messages: userTurn,
  });

  assert.deepEqual(proposals.map((item) => item.capability.id), ['outcome-memory', 'journey-track']);
  assert.ok(proposals.every((item) => item.reasonCode && item.score > 0));
  assert.deepEqual(proposals.map((item) => item.capability.evidenceType), ['outcome_state_version', 'journey_node']);
});

test('does not activate a vendor capability because a keyword appears', () => {
  const proposals = proposeCapabilities({
    isSignedIn: false,
    memoryConsented: false,
    hasJourneyNode: false,
    conversationContext: {},
    messages: [{ sender: 'user', text: 'Compare Jira and Java for my example.' }],
  });

  assert.deepEqual(proposals.map((item) => item.capability.id), ['journey-track']);
  assert.ok(proposals.every((item) => !/jira|java/i.test(item.capability.id)));
});

test('suppresses capabilities that are already active or cannot be used', () => {
  assert.deepEqual(proposeCapabilities({
    isSignedIn: true,
    memoryConsented: true,
    hasJourneyNode: true,
    conversationContext: { goal: 'Ship it' },
    messages: userTurn,
  }), []);
});

test('centralizes approval policy for future tool capabilities', () => {
  assert.equal(getCapabilityApprovalPolicy({ requiresConsent: true, risk: CAPABILITY_RISK.LOW }), 'consent');
  assert.equal(getCapabilityApprovalPolicy({ effect: CAPABILITY_EFFECT.EXTERNAL_WRITE, risk: CAPABILITY_RISK.MEDIUM }), 'preview_then_confirm');
  assert.equal(getCapabilityApprovalPolicy({ effect: CAPABILITY_EFFECT.LOCAL_STATE, risk: CAPABILITY_RISK.LOW }), 'direct');
  assert.equal(getCapabilityApprovalPolicy({ effect: CAPABILITY_EFFECT.EXTERNAL_WRITE, risk: CAPABILITY_RISK.HIGH }), 'explicit_confirmation');
});
