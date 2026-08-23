import React from 'react';
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
}) {
  const segments = splitStudySegments(decorateStudyMessage(text, topic), topic);
  const waiting = /i[’']m with you|write your attempt|i will wait/i.test(String(text || ''));

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
      {waiting ? (
        <div
          data-quantora-study-your-turn="true"
          style={{
            marginTop: '12px',
            padding: '10px 14px',
            borderRadius: '14px',
            background: isLight ? '#fff7ed' : 'rgba(249,115,22,0.12)',
            color: isLight ? '#9a3412' : '#fdba74',
            fontFamily: "var(--font-study-body), sans-serif",
            fontWeight: 700,
            fontSize: '0.9rem',
          }}
        >
          Your turn — tap or type when you are with me.
        </div>
      ) : null}
    </div>
  );
}
