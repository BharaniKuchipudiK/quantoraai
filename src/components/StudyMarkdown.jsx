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
  studyActiveConcept,
  studyAllowsAutomaticTeachingVisual,
  studyOpticsVisualSpec,
  studyPictureFitsTopic,
} from '../lib/study-concept-visual.js';
import { polishStudyTutorText, studyTutorNudge } from '../lib/study-tutor-presentation.js';

const STUDY_READING_FONT = 'Charter, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

function splitLeadParagraph(text = '') {
  const source = String(text || '');
  const breakMatch = /\n\s*\n/.exec(source);
  if (!breakMatch) return { lead: source, rest: '' };
  return {
    lead: source.slice(0, breakMatch.index),
    rest: source.slice(breakMatch.index + breakMatch[0].length),
  };
}

function StudyReadingBlock({ text, textColor, components, blockKey }) {
  if (!String(text || '').trim()) return null;
  return (
    <div
      key={blockKey}
      data-quantora-study-reading-copy="true"
      style={{
        color: textColor,
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
        {text}
      </ReactMarkdown>
    </div>
  );
}

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
  const nudge = studyTutorNudge(polished, topic);
  /*
   * AiStudio currently supplies the Study syllabus haystack here so historical
   * messages can be rendered from one feed. Resolve the concept that belongs to
   * this specific answer first; otherwise a later Newton turn could reclassify
   * an earlier Algebra answer, or an old topic-selection request could suppress
   * visuals forever.
   */
  const activeTopic = studyActiveConcept(topic, polished);
  const illustrated = studyAllowsAutomaticTeachingVisual(activeTopic)
    ? ensureStudyTeachingVisual(polished, activeTopic)
    : polished;
  const segments = splitStudySegments(decorateStudyMessage(illustrated, activeTopic), activeTopic);
  const flashcards = segments.filter((segment) => segment.type === 'flashcard');
  const firstFlashcardIndex = segments.findIndex((segment) => segment.type === 'flashcard');
  const firstMarkdownIndex = segments.findIndex((segment) => segment.type === 'md');
  const opticsVisual = studyOpticsVisualSpec(polished, activeTopic);

  return (
    <div
      className="study-lesson markdown-prose"
      data-quantora-study-lesson="true"
      style={{ color: textColor, width: '100%' }}
    >
      {nudge ? <StudyTutorNudge kind={nudge.kind} label={nudge.label} isLight={isLight} /> : null}
      {segments.map((segment, index) => {
        if (segment.type === 'flashcard') {
          return index === firstFlashcardIndex ? (
            <StudyFlashcards key="study-flashcard-deck" cards={flashcards} isLight={isLight} />
          ) : null;
        }
        if (segment.type === 'picture') {
          if (!studyPictureFitsTopic(segment.caption, activeTopic)) return null;
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
        if (opticsVisual && index === firstMarkdownIndex) {
          const { lead, rest } = splitLeadParagraph(segment.text);
          return (
            <React.Fragment key={`md-optics-${index}`}>
              <StudyReadingBlock
                text={lead}
                textColor={textColor}
                components={components}
                blockKey={`md-${index}-lead`}
              />
              <StudyOpticsDiagram spec={opticsVisual} isLight={isLight} />
              <StudyReadingBlock
                text={rest}
                textColor={textColor}
                components={components}
                blockKey={`md-${index}-rest`}
              />
            </React.Fragment>
          );
        }
        return (
          <StudyReadingBlock
            key={`md-${index}`}
            text={segment.text}
            textColor={textColor}
            components={components}
            blockKey={`md-${index}`}
          />
        );
      })}
    </div>
  );
}
