import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import StudyFlashcards from './StudyFlashcards.jsx';
import StudyVisualLab from './StudyVisualLab.jsx';
import StudyTutorNudge from './StudyTutorNudge.jsx';
import StudyOpticsDiagram from './StudyOpticsDiagram.jsx';
import { studyMicroVisualKind } from '../lib/study-micro-visuals.js';
import { decorateStudyMessage, enforceStudyRendererContract, splitStudySegments } from '../lib/study-pictures.js';
import {
  studyActiveConcept,
  studyOpticsVisualSpec,
  studyPictureFitsTopic,
} from '../lib/study-concept-visual.js';
import { polishStudyTutorText, studyTutorNudge } from '../lib/study-tutor-presentation.js';

// Subject-native teaching art (circuits, free-body diagrams, cells, number lines).
// Split out of the desk entry chunk: only a Study lesson that actually renders a
// picture segment needs it, but a static import put every renderer family in the
// bundle each Coding-desk visitor downloads. The code payload gate caps that chunk
// at 300 KB and it was within ~70 bytes of the cap, so each new renderer family
// (H3.5.4 adds more) was spending budget every visitor paid for and few used.
const StudyMicroVisual = React.lazy(() => import('./StudyMicroVisual.jsx'));
const StudyPicture = React.lazy(() => import('./StudyPicture.jsx'));

const STUDY_READING_FONT = 'Charter, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

function splitLeadParagraph(text = '') {
  const source = String(text || '');
  const breakMatch = /\n\s*\n/.exec(source);
  if (!breakMatch) return { lead: source, rest: '' };
  return { lead: source.slice(0, breakMatch.index), rest: source.slice(breakMatch.index + breakMatch[0].length) };
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
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default function StudyMarkdown({ text = '', topic = '', studyRouting = null, isLight = false, textColor, components }) {
  const routedText = enforceStudyRendererContract(text, studyRouting);
  const polished = polishStudyTutorText(routedText);
  const nudge = studyTutorNudge(polished);
  const activeTopic = studyActiveConcept(topic, polished);

  // Representation authority is server-owned. StudyMarkdown may validate and
  // render a model/server-authored Study tag, but it must never manufacture a
  // new subject picture by scanning generated prose. That old fallback caused
  // stale mechanics diagrams to appear on study-plan and progress-review turns.
  const segments = splitStudySegments(decorateStudyMessage(polished, activeTopic), activeTopic);
  const flashcards = segments.filter((segment) => segment.type === 'flashcard');
  const firstFlashcardIndex = segments.findIndex((segment) => segment.type === 'flashcard');
  const firstMarkdownIndex = segments.findIndex((segment) => segment.type === 'md');
  const opticsVisual = studyOpticsVisualSpec(polished, activeTopic);

  return (
    <div className="study-lesson markdown-prose" data-quantora-study-lesson="true" style={{ color: textColor, width: '100%' }}>
      {nudge ? <StudyTutorNudge kind={nudge.kind} label={nudge.label} isLight={isLight} /> : null}
      {segments.map((segment, index) => {
        if (segment.type === 'flashcard') {
          return index === firstFlashcardIndex ? <StudyFlashcards key="study-flashcard-deck" cards={flashcards} isLight={isLight} /> : null;
        }
        if (segment.type === 'picture') {
          if (!studyPictureFitsTopic(segment.caption, activeTopic)) return null;
          const microKind = studyMicroVisualKind(segment.caption);
          if (microKind) {
            return (
              <React.Suspense key={`micro-${index}-${segment.caption}`} fallback={null}>
                <StudyMicroVisual kind={microKind} caption={segment.caption} isLight={isLight} />
              </React.Suspense>
            );
          }
          return (
            <React.Suspense key={`pic-${index}-${segment.caption}`} fallback={null}>
              <StudyPicture caption={segment.caption} isLight={isLight} />
            </React.Suspense>
          );
        }
        if (segment.type === 'lab') {
          return <StudyVisualLab key={`lab-${index}-${segment.kind}`} kind={segment.kind} isLight={isLight} />;
        }
        if (opticsVisual && index === firstMarkdownIndex) {
          const { lead, rest } = splitLeadParagraph(segment.text);
          return (
            <React.Fragment key={`md-optics-${index}`}>
              <StudyReadingBlock text={lead} textColor={textColor} components={components} blockKey={`md-${index}-lead`} />
              <StudyOpticsDiagram spec={opticsVisual} isLight={isLight} />
              <StudyReadingBlock text={rest} textColor={textColor} components={components} blockKey={`md-${index}-rest`} />
            </React.Fragment>
          );
        }
        return <StudyReadingBlock key={`md-${index}`} text={segment.text} textColor={textColor} components={components} blockKey={`md-${index}`} />;
      })}
    </div>
  );
}
