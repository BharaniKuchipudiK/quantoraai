import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import StudyPicture from './StudyPicture.jsx';
import StudyFlashcards from './StudyFlashcards.jsx';
import StudyVisualLab from './StudyVisualLab.jsx';
import {
  decorateStudyMessage,
  ensureStudyTeachingVisual,
  splitStudySegments,
} from '../lib/study-pictures.js';
import { polishStudyTutorText } from '../lib/study-tutor-presentation.js';

export default function StudyMarkdown({
  text = '',
  topic = '',
  isLight = false,
  textColor,
  components,
}) {
  /*
   * There is no answer box here any more. It was a second composer: a plain
   * text input calling the same send path as the one at the bottom of the
   * screen, with none of its capabilities — no attachment, no voice, no
   * enhance — and two inputs on one screen is an ambiguity, not a convenience.
   * The question is anchored by the composer's placeholder instead, which
   * costs no vertical space and keeps every capability.
   */
  const polished = polishStudyTutorText(text);
  const illustrated = ensureStudyTeachingVisual(polished, topic);
  const segments = splitStudySegments(decorateStudyMessage(illustrated, topic), topic);
  const flashcards = segments.filter((segment) => segment.type === 'flashcard');
  const firstFlashcardIndex = segments.findIndex((segment) => segment.type === 'flashcard');

  return (
    <div
      className="study-lesson markdown-prose"
      data-quantora-study-lesson="true"
      style={{ color: textColor, width: '100%' }}
    >
      {segments.map((segment, index) => {
        if (segment.type === 'flashcard') {
          return index === firstFlashcardIndex ? (
            <StudyFlashcards key="study-flashcard-deck" cards={flashcards} isLight={isLight} />
          ) : null;
        }
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
    </div>
  );
}
