import React, { useState } from 'react';
import { ArrowUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import StudyPicture from './StudyPicture.jsx';
import StudyVisualLab from './StudyVisualLab.jsx';
import { decorateStudyMessage, splitStudySegments } from '../lib/study-pictures.js';

export default function StudyMarkdown({
  text = '',
  topic = '',
  isLight = false,
  textColor,
  components,
  answerEnabled = false,
  onAnswer,
}) {
  const [answer, setAnswer] = useState('');
  const segments = splitStudySegments(decorateStudyMessage(text, topic), topic);
  const waiting = /i[’']m with you|write your attempt|i will wait|wait for (?:your|the learner)/i.test(String(text || ''));

  const submitAnswer = (event) => {
    event.preventDefault();
    const response = answer.trim();
    if (!response || !onAnswer) return;
    onAnswer(response);
    setAnswer('');
  };

  return (
    <div
      className="study-lesson markdown-prose"
      data-quantora-study-lesson="true"
      style={{ color: textColor, width: '100%' }}
    >
      {segments.map((segment, index) => {
        if (segment.type === 'picture') {
          return (
            <StudyPicture
              key={`pic-${index}-${segment.caption}`}
              caption={segment.caption}
              isLight={isLight}
            />
          );
        }
        if (segment.type === 'lab') {
          return (
            <StudyVisualLab
              key={`lab-${index}-${segment.kind}`}
              kind={segment.kind}
              isLight={isLight}
            />
          );
        }
        return (
          <ReactMarkdown
            key={`md-${index}`}
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={components}
          >
            {segment.text}
          </ReactMarkdown>
        );
      })}
      {waiting && answerEnabled ? (
        <form
          onSubmit={submitAnswer}
          data-quantora-study-answer-affordance="embedded"
          data-quantora-study-loop-phase="awaiting_learner_response"
          style={{
            marginTop: '8px',
            padding: '5px 5px 5px 11px',
            borderRadius: '12px',
            border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(148,163,184,0.34)',
            background: isLight ? '#ffffff' : 'rgba(15,23,42,0.56)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <input
            aria-label="Answer the tutor question"
            placeholder="Write your answer…"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: textColor,
              font: 'inherit',
              fontSize: '0.88rem',
              lineHeight: 1.35,
              padding: '5px 0',
            }}
          />
          <button
            type="submit"
            aria-label="Send answer"
            disabled={!answer.trim()}
            style={{
              width: '31px',
              height: '31px',
              border: 'none',
              borderRadius: '9px',
              background: answer.trim() ? '#f97316' : (isLight ? '#e2e8f0' : '#334155'),
              color: answer.trim() ? '#fff' : (isLight ? '#94a3b8' : '#64748b'),
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: answer.trim() ? 'pointer' : 'default',
              transition: 'transform 160ms ease, background 160ms ease',
            }}
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        </form>
      ) : null}
    </div>
  );
}
