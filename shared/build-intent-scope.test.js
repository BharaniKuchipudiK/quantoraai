/**
 * Guided intake must trigger on the SHAPE of a request, not on its nouns.
 *
 * THE INCIDENT (2026-09-04). Intake was gated on WEBSITE_INTAKE and
 * BUSINESS_INTAKE — an allowlist of small-business website words. So this got
 * no questions at all and went straight to building:
 *
 *   "Please build CRM platform for IT consulting business includes modules like
 *    Sales, Delivery, HR, Recruitment, Revenue vs Margin, Business Pipeline and
 *    any other relevant modules I would have missed"
 *
 * Seven subsystems and an explicit admission the list was incomplete. A cafe
 * landing page got a conversation; a CRM did not. The allowlist is made of
 * simple things, so the asks that most need scoping are the ones least likely
 * to be in it.
 *
 * TWO NUMBERS PULL AGAINST EACH OTHER HERE, as in travel-comprehension:
 * asking when we should, and NOT asking when we should not. Widening the
 * trigger until everything asks would pass the first set and destroy the
 * product, so the adversarial set below is not optional — it is the half that
 * keeps the fix honest.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { needsGuidedWebsiteIntake, requestScopeNeedsIntake } from './build-intent.js';

/** Sketches of systems: too big or too open to build without asking. */
const MUST_ASK = [
  'Please build CRM platform for IT consulting business includes modules like Sales, Delivery, HR, Recruitment, Revenue vs Margin, Business Pipeline and any other relevant modules I would have missed',
  'Build an internal portal with modules for onboarding, payroll, leave tracking and expenses',
  'Create an ERP including inventory, purchasing, invoicing, and reporting',
  'Build a dashboard and add anything else you think it needs',
  'Make an admin tool with screens for users, billing, audit logs and settings',
];

/**
 * The adversarial half. Every one of these is a build request; none of them is
 * a sketch of a system, and interrogating any of them would be a bug.
 */
const MUST_NOT_ASK = [
  'build me a calculator',
  'make a timer',
  'build a to-do list',
  'create a stopwatch',
  'build a quiz',
  // Specific and complete. Long is not the same as vague.
  'Build a login form that validates the email field and shows an inline error when the password is under eight characters',
  'Add a dark mode toggle to the header',
  'Fix the alignment of the footer links',
];

test('a sketch of a system is asked about', () => {
  for (const brief of MUST_ASK) {
    assert.equal(
      needsGuidedWebsiteIntake(brief), true,
      `should have asked before building: ${JSON.stringify(brief.slice(0, 70))}`,
    );
  }
});

test('a specified, self-contained ask is NOT interrogated', () => {
  for (const brief of MUST_NOT_ASK) {
    assert.equal(
      requestScopeNeedsIntake(brief), false,
      `scope must not fire on a complete ask: ${JSON.stringify(brief.slice(0, 70))}`,
    );
  }
});

test('the original allowlist still fires, so the browser gate cannot regress', () => {
  // guided-intake-browser-gate drives a website brief. Scope is an ADDITIONAL
  // door; removing the old one would trade this bug for a worse one.
  for (const brief of [
    'build a website for my coffee shop',
    'create a landing page for our company',
    'I want an online shop for my bakery',
  ]) {
    assert.equal(needsGuidedWebsiteIntake(brief), true, brief);
  }
});

test('two parts is a detail, three is a system', () => {
  // The boundary, stated so it cannot drift silently. Two named parts is how
  // people describe one feature; three is where a brief stops being a spec.
  assert.equal(requestScopeNeedsIntake('build an app with modules for billing and invoicing'), false);
  assert.equal(requestScopeNeedsIntake('build an app with modules for billing, invoicing and payroll'), true);
});

test('asking us to fill the gaps is itself the signal', () => {
  // Nobody who wants a build immediately also asks what they forgot.
  assert.equal(requestScopeNeedsIntake('build a booking tool and anything else it needs'), true);
  assert.equal(requestScopeNeedsIntake('build a booking tool'), false);
});
