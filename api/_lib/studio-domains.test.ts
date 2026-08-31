import assert from "node:assert/strict";
import test from "node:test";
import { buildDomainDirective, normalizeStudioDomain } from "./studio-domains.js";

test("normalizeStudioDomain accepts known domains", () => {
  assert.equal(normalizeStudioDomain("travel"), "travel");
  assert.equal(normalizeStudioDomain("finance"), "finance");
  assert.equal(normalizeStudioDomain("invalid"), null);
  assert.equal(normalizeStudioDomain(null), null);
});

test("buildDomainDirective makes Travel an engaged outcome partner", () => {
  const directive = buildDomainDirective("travel");
  assert.match(directive, /DOMAIN FOCUS: TRAVEL ADVISOR/);
  assert.match(directive, /SESSION LOCK/i);
  assert.match(directive, /Travel Advisor only/i);
  assert.match(directive, /Study Tutor/i);
  assert.match(directive, /ONE highest-value next question or offer/i);
  assert.match(directive, /Never re-ask details/i);
  assert.match(directive, /dates.*travellers.*budget.*passport\/visa/is);
  assert.match(directive, /end with a short conversational bridge/i);
});

test("Travel directive requires ratings and usable property links without inventing hotel class", () => {
  const directive = buildDomainDirective("travel");
  assert.match(directive, /Never call get_places_routing for hotels/i);
  assert.match(directive, /Never list hotels from memory/i);
  assert.match(directive, /★ 4\.6\/5/);
  assert.match(directive, /NOT an official hotel star classification/i);
  assert.match(directive, /property name clickable/i);
  assert.match(directive, /View property & photos/i);
  assert.match(directive, /Omit any field.*instead of guessing/is);
});

test("Education directive behaves as an evidence-backed Study Advisor instead of a score bot", () => {
  const directive = buildDomainDirective("education");
  assert.match(directive, /DOMAIN FOCUS: STUDY ADVISOR/);
  assert.match(directive, /SESSION LOCK/i);
  assert.match(directive, /Study Tutor only/i);
  assert.match(directive, /Travel Advisor/i);
  assert.match(directive, /Icebreaker first/i);
  assert.match(directive, /No leaderboards/i);
  assert.match(directive, /8\/10 is evidence, not the advice/i);
  assert.match(directive, /confidently wrong answer.*misconception/is);
  assert.match(directive, /smallest useful diagnostic/i);
  assert.match(directive, /durable mastery/i);
  assert.match(directive, /quantora-study-picture/i);
  assert.match(directive, /caption=/);
  assert.match(directive, /this conversation/i);
  assert.match(directive, /One idea per message/i);
  assert.match(directive, /wall of text/i);
  assert.match(directive, /SWAYAM/i);
  assert.match(directive, /NotebookLM/i);
  assert.match(directive, /Never invent a specific video/i);
  assert.match(directive, /End on the question itself/i);
  assert.match(directive, /do not.*say that you will wait/i);
  assert.match(directive, /shortest clean method/i);
  assert.match(directive, /not an official IIT\/NEET timetable/i);
  assert.match(directive, /TUTOR STANCE/i);
  assert.match(directive, /Never invent a syllabus chapter/i);
  assert.match(directive, /Empathize with struggle/i);
  assert.match(directive, /gaps in THEIR syllabus graph/i);
  assert.doesNotMatch(directive, /Newton's laws of motion/i);
});

test("Education directive appends the finite real-world teaching turn policy", () => {
  const directive = buildDomainDirective("education");
  assert.match(directive, /STUDY TEACHING TURN POLICY \(study-teaching-policy-/);
  assert.match(directive, /TOPIC_SELECTION.*NEW_CONCEPT.*DIRECT_QUESTION.*CONTINUATION.*LEARNER_ATTEMPT/is);
  assert.match(directive, /DIRECT_QUESTION: ANSWER THE QUESTION FIRST/i);
  assert.match(directive, /HOOK → PREDICT → SEE → EXPLAIN → TRY → VERIFY → EXAM_READY/);
  assert.match(directive, /supersedes any earlier Study instruction.*wait for the learner to say “I’m with you”/is);
  assert.match(directive, /No “let me know when you’re ready”/i);
});

test("the Study teaching policy is isolated from non-education domains", () => {
  assert.doesNotMatch(buildDomainDirective("travel"), /STUDY TEACHING TURN POLICY/);
  assert.doesNotMatch(buildDomainDirective("finance"), /STUDY TEACHING TURN POLICY/);
  assert.doesNotMatch(buildDomainDirective("research"), /STUDY TEACHING TURN POLICY/);
});

test("buildDomainDirective is empty for general chat", () => {
  assert.equal(buildDomainDirective(null), "");
});
