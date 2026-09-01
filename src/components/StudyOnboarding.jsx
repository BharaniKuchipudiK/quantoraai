import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { saveStudyOnboarding } from '../lib/study-onboarding-client.js';
import './study-h1-onboarding.css';

const CONTEXTS = [
  ['school', 'School'],
  ['university', 'University'],
  ['professional', 'Professional'],
  ['personal', 'Personal learning'],
];
const GOALS = [
  ['understand', 'Understand deeply'],
  ['exam', 'Prepare for an exam'],
  ['grades', 'Improve grades'],
  ['assignment', 'Finish an assignment'],
  ['revise', 'Revise efficiently'],
  ['explore', 'Explore a topic'],
];
const MODALITIES = [
  ['balanced', 'Balanced'],
  ['visual', 'More visual'],
  ['examples', 'More examples'],
  ['concise', 'More concise'],
  ['step_by_step', 'Step by step'],
];

function ChoiceGrid({ options, value, onChange, label }) {
  return (
    <div className="study-h1-onboarding__choices" role="group" aria-label={label}>
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          className="study-h1-onboarding__choice"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export default function StudyOnboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    studyContext: '',
    curriculum: '',
    level: '',
    subjectsText: '',
    goal: '',
    targetExam: '',
    examDate: '',
    weeklyMinutes: '',
    preferredModality: 'balanced',
    diagnosticOptIn: false,
  });

  const subjects = useMemo(() => form.subjectsText
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 12), [form.subjectsText]);

  const persist = async (skipped) => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const profile = await saveStudyOnboarding({
        ...form,
        subjects,
        weeklyMinutes: form.weeklyMinutes === '' ? null : Number(form.weeklyMinutes),
        skipped,
      });
      window.dispatchEvent(new CustomEvent('quantora:study-onboarding-updated', { detail: profile }));
      onComplete?.(profile);
    } catch (saveError) {
      setError(saveError?.message || 'Your Study preferences could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="study-h1-onboarding" role="dialog" aria-modal="false" aria-labelledby="study-onboarding-title" data-quantora-study-onboarding="true">
      <div className="study-h1-onboarding__topline">
        <span>Study setup</span>
        <button type="button" className="study-h1-onboarding__skip" disabled={saving} onClick={() => persist(true)}>Skip</button>
      </div>

      {step === 0 ? (
        <div className="study-h1-onboarding__intro">
          <span className="study-h1-onboarding__symbol" aria-hidden="true"><Sparkles size={22} /></span>
          <h2 id="study-onboarding-title">Let’s make Study fit what you need.</h2>
          <p>Four short steps. You can skip anything. What you tell Quantora here is planning context—not proof of what you know.</p>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="study-h1-onboarding__step">
          <h2 id="study-onboarding-title">What are you studying?</h2>
          <ChoiceGrid label="Study context" options={CONTEXTS} value={form.studyContext} onChange={(studyContext) => setForm((current) => ({ ...current, studyContext }))} />
          <div className="study-h1-onboarding__fields">
            <input value={form.curriculum} onChange={(event) => setForm((current) => ({ ...current, curriculum: event.target.value.slice(0, 120) }))} placeholder="Curriculum or course (optional)" aria-label="Curriculum or course" />
            <input value={form.level} onChange={(event) => setForm((current) => ({ ...current, level: event.target.value.slice(0, 120) }))} placeholder="Level or grade (optional)" aria-label="Level or grade" />
            <input value={form.subjectsText} onChange={(event) => setForm((current) => ({ ...current, subjectsText: event.target.value.slice(0, 600) }))} placeholder="Subjects, separated by commas" aria-label="Subjects" />
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="study-h1-onboarding__step">
          <h2 id="study-onboarding-title">What matters most right now?</h2>
          <ChoiceGrid label="Current Study goal" options={GOALS} value={form.goal} onChange={(goal) => setForm((current) => ({ ...current, goal }))} />
          <div className="study-h1-onboarding__fields study-h1-onboarding__fields--two">
            <input value={form.targetExam} onChange={(event) => setForm((current) => ({ ...current, targetExam: event.target.value.slice(0, 160) }))} placeholder="Target exam (optional)" aria-label="Target exam" />
            <input type="date" value={form.examDate} onChange={(event) => setForm((current) => ({ ...current, examDate: event.target.value }))} aria-label="Exam date" />
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="study-h1-onboarding__step">
          <h2 id="study-onboarding-title">How should Study work with you?</h2>
          <label className="study-h1-onboarding__label">Preferred explanation style</label>
          <ChoiceGrid label="Preferred explanation style" options={MODALITIES} value={form.preferredModality} onChange={(preferredModality) => setForm((current) => ({ ...current, preferredModality }))} />
          <div className="study-h1-onboarding__fields">
            <input type="number" min="0" max="10080" value={form.weeklyMinutes} onChange={(event) => setForm((current) => ({ ...current, weeklyMinutes: event.target.value }))} placeholder="Study minutes available per week (optional)" aria-label="Study minutes available per week" />
          </div>
          <label className="study-h1-onboarding__diagnostic">
            <input type="checkbox" checked={form.diagnosticOptIn} onChange={(event) => setForm((current) => ({ ...current, diagnosticOptIn: event.target.checked }))} />
            <span><strong>Offer a quick diagnostic</strong><small>Quantora may suggest a short verified check when reviewed items exist.</small></span>
          </label>
        </div>
      ) : null}

      {error ? <div className="study-h1-onboarding__error" role="alert">{error}</div> : null}

      <div className="study-h1-onboarding__footer">
        <span>{step + 1} / 4</span>
        <div>
          {step > 0 ? <button type="button" className="study-h1-action" disabled={saving} onClick={() => setStep((current) => current - 1)}><ArrowLeft size={14} /> Back</button> : null}
          {step < 3 ? (
            <button type="button" className="study-h1-action study-h1-action--primary" onClick={() => setStep((current) => current + 1)}>Continue <ArrowRight size={14} /></button>
          ) : (
            <button type="button" className="study-h1-action study-h1-action--primary" disabled={saving} onClick={() => persist(false)}>{saving ? 'Saving…' : 'Start studying'}</button>
          )}
        </div>
      </div>
    </section>
  );
}
