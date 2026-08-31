import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import StudyPicture from './StudyPicture.jsx';
import StudyFlashcards from './StudyFlashcards.jsx';
import StudyVisualLab from './StudyVisualLab.jsx';
import StudyTutorNudge from './StudyTutorNudge.jsx';
import StudyOpticsDiagram from './StudyOpticsDiagram.jsx';
import {
  decorateStudyMessage,
  ensureStudyTeachingVisual,
  splitStudySegments,
} from '../lib/study-pictures.js';
import {
  studyAllowsAutomaticTeachingVisual,
  studyOpticsVisualSpec,
  studyPictureFitsTopic,
} from '../lib/study-concept-visual.js';
import { polishStudyTutorText, studyTutorNudge } from '../lib/study-tutor-presentation.js';

const STUDY_READING_FONT = 'Charter, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

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
  const nudge = studyTutorNudge(polished);
  /*
   * Automatic pictures are now topic-locked. The old fallback searched the
   * entire answer, so "Chemical Reactions and Equations" could summon Algebra
   * on a science-topic chooser and "curves inward" could summon a slope graph
   * in an optics lesson. Unknown/broad topics fail closed instead.
   */
  const illustrated = studyAllowsAutomaticTeachingVisual(topic)
    ? ensureStudyTeachingVisual(polished, topic)
    : polished;
  const segments = splitStudySegments(decorateStudyMessage(illustrated, topic), topic);
  const flashcards = segments.filter((segment) => segment.type === 'flashcard');
  const firstFlashcardIndex = segments.findIndex((segment) => segment.type === 'flashcard');
  const opticsVisual = studyOpticsVisualSpec(polished, topic);

  return (
    <div
      className="study-lesson markdown-prose"
      data-quantora-study-lesson="true"
      style={{ color: textColor, width: '100%' }}
    >
      {nudge ? <StudyTutorNudge kind={nudge.kind} label={nudge.label} isLight={isLight} /> : null}
      {opticsVisual ? <StudyOpticsDiagram spec={opticsVisual} isLight={isLight} /> : null}
      {segments.map((segment, index) => {
        if (segment.type === 'flashcard') {
          return index === firstFlashcardIndex ? (
            <StudyFlashcards key="study-flashcard-deck" cards={flashcards} isLight={isLight} />
          ) : null;
        }
        if (segment.type === 'picture') {
          if (!studyPictureFitsTopic(segment.caption, topic)) return null;
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
          <div
            key={`md-${index}`}
            data-quantora-study-reading-copy="true"
            style={{
              fontFamily: STUDY_READING_FONT,
              fontSize: '1.035rem',
              lineHeight: 1.7,
              letterSpacing: '-0.006em',
              textWrap: 'pretty',
            }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={components}
            >
              {segment.text}
            </ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
}
