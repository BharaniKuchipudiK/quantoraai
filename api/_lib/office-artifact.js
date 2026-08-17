const OFFICE_FORMATS = new Set(['powerpoint', 'word', 'excel']);
const SLIDE_TYPES = new Set(['cover', 'section', 'bullets', 'data_viz', 'matrix', 'quote']);

export const OFFICE_ARTIFACT_VERSION = 1;
export const OFFICE_MANIFEST_ID = 'quantora-office-manifest';
export const MAX_OFFICE_BINARY_BYTES = 2_800_000;

export const OFFICE_META = Object.freeze({
  powerpoint: {
    extension: '.pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    requiredZipEntries: ['[Content_Types].xml', 'ppt/slides/slide1.xml'],
  },
  word: {
    extension: '.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    requiredZipEntries: ['[Content_Types].xml', 'word/document.xml'],
  },
  excel: {
    extension: '.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    requiredZipEntries: ['[Content_Types].xml', 'xl/workbook.xml'],
  },
});

function cleanString(value, max = 5000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function cleanArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanImage(image) {
  if (!image || typeof image !== 'object') return null;
  const url = cleanString(image.url, 2_000_000);
  if (!url || (!/^https?:\/\//i.test(url) && !/^data:image\//i.test(url))) return null;
  return {
    url,
    caption: cleanString(image.caption || image.altText, 500),
    altText: cleanString(image.altText || image.caption, 500),
  };
}

function inferSlideType(slide, index) {
  const raw = cleanString(slide?.type, 40).toLowerCase();
  if (SLIDE_TYPES.has(raw)) return raw;
  if (index === 0) return 'cover';
  if (cleanArray(slide?.data).length) return 'data_viz';
  if (cleanString(slide?.quote)) return 'quote';
  if (cleanArray(slide?.bullets).length) return 'bullets';
  return 'section';
}

function normalizePowerPointSpec(input = {}) {
  const rawSlides = cleanArray(input.slides).slice(0, 40);
  const slides = rawSlides.map((slide, index) => {
    const s = slide && typeof slide === 'object' ? slide : {};
    const type = inferSlideType(s, index);
    const bullets = cleanArray(s.bullets)
      .map((item) => cleanString(item, 320))
      .filter(Boolean)
      .slice(0, type === 'matrix' ? 4 : 10);
    const data = cleanArray(s.data)
      .map((row) => ({
        label: cleanString(row?.label, 120),
        value: Number(row?.value),
      }))
      .filter((row) => row.label && Number.isFinite(row.value))
      .slice(0, 16);
    const images = cleanArray(s.images).map(cleanImage).filter(Boolean).slice(0, 2);

    return {
      type,
      title: cleanString(s.title, 240) || (type === 'cover' ? cleanString(input.title, 240) : `Slide ${index + 1}`),
      subtitle: cleanString(s.subtitle, 420),
      bullets,
      data,
      quote: cleanString(s.quote, 1200),
      author: cleanString(s.author, 180),
      speakerNotes: cleanString(s.speakerNotes, 5000),
      ...(images.length ? { images } : {}),
    };
  });

  return {
    title: cleanString(input.title, 240) || slides[0]?.title || 'Presentation',
    slides,
  };
}

function normalizeWordSpec(input = {}) {
  const sections = cleanArray(input.sections).slice(0, 60).map((section, index) => {
    const s = section && typeof section === 'object' ? section : {};
    const images = cleanArray(s.images).map(cleanImage).filter(Boolean).slice(0, 4);
    return {
      heading: cleanString(s.heading, 300) || `Section ${index + 1}`,
      paragraphs: cleanArray(s.paragraphs).map((p) => cleanString(p, 6000)).filter(Boolean).slice(0, 50),
      bullets: cleanArray(s.bullets).map((b) => cleanString(b, 1200)).filter(Boolean).slice(0, 40),
      ...(images.length ? { images } : {}),
    };
  });

  return {
    title: cleanString(input.title, 300) || 'Document',
    sections,
  };
}

function normalizeSheetName(value, index, seen) {
  const base = cleanString(value, 31)
    .replace(/[\\/?*\[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || `Sheet${index + 1}`;
  let name = base.slice(0, 31);
  let suffix = 2;
  while (seen.has(name.toLowerCase())) {
    const extra = ` ${suffix++}`;
    name = (base.slice(0, 31 - extra.length) + extra).slice(0, 31);
  }
  seen.add(name.toLowerCase());
  return name;
}

function normalizeExcelCell(cell) {
  if (cell === null || cell === undefined) return { value: '', type: 'String' };
  if (typeof cell === 'number' && Number.isFinite(cell)) return { value: cell, type: 'Number' };
  if (typeof cell === 'boolean') return { value: cell ? 'TRUE' : 'FALSE', type: 'String' };
  if (typeof cell === 'string') return { value: cleanString(cell, 32000), type: 'String' };

  if (typeof cell === 'object') {
    const requestedNumber = String(cell.type || '').toLowerCase() === 'number';
    const numeric = Number(cell.value);
    const value = requestedNumber && Number.isFinite(numeric)
      ? numeric
      : cleanString(cell.value, 32000);
    const out = {
      value,
      type: requestedNumber && Number.isFinite(numeric) ? 'Number' : 'String',
    };
    if (cell.fontWeight === 'bold') out.fontWeight = 'bold';
    if (typeof cell.format === 'string' && cell.format.trim()) out.format = cell.format.trim().slice(0, 120);
    if (/^#?[0-9a-f]{6}$/i.test(String(cell.backgroundColor || ''))) out.backgroundColor = String(cell.backgroundColor).replace('#', '').toUpperCase();
    if (/^#?[0-9a-f]{6}$/i.test(String(cell.color || ''))) out.color = String(cell.color).replace('#', '').toUpperCase();
    if (['left', 'center', 'right'].includes(cell.align)) out.align = cell.align;
    if (typeof cell.wrap === 'boolean') out.wrap = cell.wrap;
    if (Number.isFinite(Number(cell.fontSize))) out.fontSize = Math.max(8, Math.min(36, Number(cell.fontSize)));
    return out;
  }

  return { value: cleanString(cell, 32000), type: 'String' };
}

function normalizeExcelSpec(input = {}) {
  const seen = new Set();
  const sheets = cleanArray(input.sheets).slice(0, 12).map((sheet, index) => {
    const s = sheet && typeof sheet === 'object' ? sheet : {};
    const data = cleanArray(s.data).slice(0, 2000).map((row) =>
      cleanArray(row).slice(0, 50).map(normalizeExcelCell),
    );
    return {
      name: normalizeSheetName(s.name, index, seen),
      data,
    };
  });

  return {
    filename: cleanString(input.filename, 120) || 'Spreadsheet',
    sheets,
  };
}

export function normalizeOfficeSpec(format, input) {
  if (!OFFICE_FORMATS.has(format)) throw new Error(`Unsupported Office format: ${format}`);
  if (format === 'powerpoint') return normalizePowerPointSpec(input || {});
  if (format === 'word') return normalizeWordSpec(input || {});
  return normalizeExcelSpec(input || {});
}

export function validateOfficeSpec(format, input) {
  const issues = [];
  const warnings = [];
  let spec;

  try {
    spec = normalizeOfficeSpec(format, input);
  } catch (error) {
    return { valid: false, issues: [error?.message || 'Invalid Office specification'], warnings, spec: null };
  }

  if (format === 'powerpoint') {
    if (!spec.slides.length) issues.push('PowerPoint must contain at least one slide.');
    if (!spec.slides.some((slide) => slide.title || slide.quote || slide.bullets.length || slide.data.length)) {
      issues.push('PowerPoint has no meaningful slide content.');
    }
    if (cleanArray(input?.slides).length > 40) warnings.push('Deck was capped at 40 slides for reliable generation.');
    spec.slides.forEach((slide, index) => {
      if (slide.type === 'data_viz' && !slide.data.length && !slide.bullets.length) {
        warnings.push(`Slide ${index + 1} requested data visualization but has no valid numeric data.`);
      }
    });
  } else if (format === 'word') {
    if (!spec.sections.length) issues.push('Word document must contain at least one section.');
    if (!spec.sections.some((section) => section.paragraphs.length || section.bullets.length || section.images?.length)) {
      issues.push('Word document has no meaningful body content.');
    }
    if (cleanArray(input?.sections).length > 60) warnings.push('Document was capped at 60 sections for reliable generation.');
  } else if (format === 'excel') {
    if (!spec.sheets.length) issues.push('Excel workbook must contain at least one sheet.');
    if (!spec.sheets.some((sheet) => sheet.data.some((row) => row.length))) {
      issues.push('Excel workbook has no cell data.');
    }
    if (cleanArray(input?.sheets).length > 12) warnings.push('Workbook was capped at 12 sheets for reliable generation.');
  }

  return { valid: issues.length === 0, issues, warnings, spec };
}

export function normalizePreviewHtml(html) {
  return String(html || '').replace(/\r\n/g, '\n').trim();
}

export function fingerprintOfficePreview(html) {
  const text = normalizePreviewHtml(html);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenPresent(text, token) {
  const clean = cleanString(token, 180).toLowerCase();
  return !clean || text.includes(clean.slice(0, Math.min(clean.length, 80)));
}

const CONSULTING_STANDARDS = new Set(['consulting', 'executive']);
const DECISION_ARCHETYPES = new Set(['strategy', 'business_case', 'executive_briefing', 'qbr', 'proposal']);
const NON_BODY_TYPES = new Set(['cover', 'section', 'quote', 'appendix']);
const ANALYTICAL_TYPES = new Set(['chart_insight', 'risk_matrix', 'comparison', 'financial_case', 'framework', 'evidence', 'status_dashboard', 'kpi_strip']);
const TOPIC_ONLY_HEADLINE = /^(overview|summary|executive summary|background|context|risks?|timeline|roadmap|status|project status|financials?|recommendation|next steps|key findings|findings|pros?\s*(?:&|and|\/)?\s*cons?)\b/i;
const QUESTION_HEADLINE = /^(what|why|how|should|can|could|will|would|is|are|do|does|when|where)\b|\?\s*$/i;

function countWords(value) {
  return cleanString(value, 500).split(/\s+/).filter(Boolean).length;
}

function payloadUnits(slide = {}) {
  return [
    slide.bullets,
    slide.kpis,
    slide.data,
    slide.timeline,
    slide.columns,
    slide.options,
    slide.statuses,
    slide.risks,
    slide.actions,
    slide.financials,
    slide.framework,
  ].reduce((total, value) => total + cleanArray(value).length, 0);
}

function isV2Presentation(spec) {
  return Number(spec?.version || 0) >= 2 || Boolean(spec?.archetype || spec?.communicationStandard);
}

/**
 * Fail-closed executive/consulting communication gate. This deliberately checks
 * the semantic artifact, not CSS aesthetics. It prevents the recurring failure
 * class where a generic AI/HTML slide (question headline + decorative stock image
 * + tiny pros/cons cards) is technically valid but professionally unusable.
 */
export function verifyPresentationCommunicationQuality(spec = {}) {
  const issues = [];
  if (!isV2Presentation(spec)) return { passed: true, issues };

  const standard = cleanString(spec.communicationStandard, 40).toLowerCase();
  const archetype = cleanString(spec.archetype, 60).toLowerCase();
  const strict = CONSULTING_STANDARDS.has(standard) || DECISION_ARCHETYPES.has(archetype);
  if (!strict) return { passed: true, issues };

  const slides = cleanArray(spec.slides);
  const bodySlides = slides.filter((slide) => !NON_BODY_TYPES.has(cleanString(slide?.type, 40).toLowerCase()));
  const sourceNotes = cleanArray(spec.sourceNotes).map((value) => cleanString(value, 500)).filter(Boolean);

  bodySlides.forEach((slide, bodyIndex) => {
    const slideNumber = slides.indexOf(slide) + 1 || bodyIndex + 2;
    const type = cleanString(slide?.type, 40).toLowerCase();
    const title = cleanString(slide?.title, 240);

    if (!title || QUESTION_HEADLINE.test(title) || TOPIC_ONLY_HEADLINE.test(title) || countWords(title) < 5) {
      issues.push(`Slide ${slideNumber} needs an assertion-led executive headline; “${title || 'Untitled slide'}” reads like a topic/question rather than a takeaway.`);
    }

    const images = cleanArray(slide?.images);
    if (images.length) {
      const evidenceReady = Boolean(cleanString(slide?.source, 500)) && images.every((image) => cleanString(image?.caption || image?.altText, 500));
      if (!evidenceReady) {
        issues.push(`Slide ${slideNumber} contains imagery without a source + meaningful caption. Decorative stock imagery is not allowed in consulting/executive body slides.`);
      }
    }

    const units = payloadUnits(slide);
    if (type === 'bullets' && cleanArray(slide?.bullets).length < 3 && !cleanString(slide?.insight) && !cleanString(slide?.recommendation)) {
      issues.push(`Slide ${slideNumber} is too thin for an executive slide: generic bullets require at least three substantive points or an explicit governing insight/recommendation.`);
    } else if (units < 2 && !cleanString(slide?.insight) && !cleanString(slide?.recommendation)) {
      issues.push(`Slide ${slideNumber} has insufficient decision-support density for a consulting/executive artifact.`);
    }

    if (type === 'executive_summary' && !cleanString(slide?.insight) && !cleanString(slide?.recommendation) && !cleanString(spec?.decisionAsk)) {
      issues.push(`Slide ${slideNumber} executive summary has no governing insight, recommendation, or decision ask.`);
    }

    if (type === 'comparison') {
      const options = cleanArray(slide?.options);
      if (options.length < 2 || options.some((option) => !cleanString(option?.summary) || !cleanArray(option?.pros).length || !cleanArray(option?.cons).length)) {
        issues.push(`Slide ${slideNumber} comparison must show at least two real alternatives with summary, upside, and trade-offs.`);
      }
      if (!options.some((option) => option?.recommended === true) && !cleanString(slide?.recommendation) && !cleanString(slide?.insight)) {
        issues.push(`Slide ${slideNumber} comparison does not land a recommendation or management implication.`);
      }
    }

    const hasQuantitativeEvidence = cleanArray(slide?.kpis).length || cleanArray(slide?.data).length || cleanArray(slide?.financials).length;
    if (hasQuantitativeEvidence && !cleanString(slide?.source, 500) && !sourceNotes.length) {
      issues.push(`Slide ${slideNumber} uses quantitative evidence without a source or explicit evidence boundary.`);
    }
  });

  if (bodySlides.length >= 4) {
    const types = new Set(bodySlides.map((slide) => cleanString(slide?.type, 40).toLowerCase()));
    if (archetype !== 'project_status' && !types.has('executive_summary')) {
      issues.push('Consulting/executive decks with four or more body slides require an executive_summary that states the governing answer early.');
    }
    if (![...types].some((type) => ANALYTICAL_TYPES.has(type))) {
      issues.push('Consulting/executive decks require at least one analytical/evidence composition; narrative-only cards are not sufficient.');
    }
    const landsAction = types.has('roadmap') || Boolean(cleanString(spec?.decisionAsk)) || bodySlides.some((slide) => cleanString(slide?.recommendation));
    if (DECISION_ARCHETYPES.has(archetype) && !landsAction) {
      issues.push('Decision-oriented deck does not land an explicit recommendation, decision ask, or action path.');
    }
  }

  return { passed: issues.length === 0, issues: [...new Set(issues)] };
}

export function verifyCompiledOfficeArtifact(format, { buffer, spec, htmlPreview } = {}) {
  const meta = OFFICE_META[format];
  const issues = [];
  const warnings = [];
  const checks = {};
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);

  checks.zipSignature = bytes.length >= 2 && bytes.subarray(0, 2).toString('latin1') === 'PK';
  if (!checks.zipSignature) issues.push('Generated Office file is not a valid OOXML zip container.');

  checks.minimumSize = bytes.length >= 1500;
  if (!checks.minimumSize) issues.push('Generated Office file is unexpectedly small.');

  checks.withinTransferBudget = bytes.length <= MAX_OFFICE_BINARY_BYTES;
  if (!checks.withinTransferBudget) {
    issues.push(`Generated Office file is ${Math.ceil(bytes.length / 1024)} KB, above the reliable transfer budget. Reduce image count or image size and try again.`);
  } else if (bytes.length > 2_000_000) {
    warnings.push('Artifact is close to the response-size safety limit; image-heavy revisions may require fewer images.');
  }

  checks.requiredEntries = Boolean(meta) && meta.requiredZipEntries.every((entry) => bytes.includes(Buffer.from(entry)));
  if (!checks.requiredEntries) issues.push('Generated Office package is missing required OOXML parts.');

  const preview = normalizePreviewHtml(htmlPreview);
  const previewText = htmlToText(preview);
  checks.previewPresent = preview.length > 100;
  if (!checks.previewPresent) issues.push('Preview HTML is missing or incomplete.');

  if (format === 'powerpoint') {
    const expected = spec?.slides?.length || 0;
    const actual = (preview.match(/<section\b/gi) || []).length;
    checks.structureParity = expected > 0 && actual >= expected;
    if (!checks.structureParity) issues.push(`Preview contains ${actual} slide sections but specification contains ${expected} slides.`);
    const keySlides = (spec?.slides || []).slice(0, 4);
    checks.contentParity = keySlides.every((slide) => tokenPresent(previewText, slide.title || slide.quote));

    const communicationQuality = verifyPresentationCommunicationQuality(spec || {});
    checks.communicationQuality = communicationQuality.passed;
    if (!communicationQuality.passed) issues.push(...communicationQuality.issues);
  } else if (format === 'word') {
    const expected = spec?.sections?.length || 0;
    const actual = (preview.match(/<h2\b/gi) || []).length;
    checks.structureParity = expected > 0 && actual >= expected;
    if (!checks.structureParity) issues.push(`Preview contains ${actual} section headings but specification contains ${expected} sections.`);
    checks.contentParity = tokenPresent(previewText, spec?.title) && (spec?.sections || []).slice(0, 3).every((section) => tokenPresent(previewText, section.heading));
  } else if (format === 'excel') {
    const expected = spec?.sheets?.length || 0;
    const actual = (preview.match(/data-sheet-name=/gi) || []).length;
    checks.structureParity = expected > 0 && actual >= expected;
    if (!checks.structureParity) issues.push(`Preview contains ${actual} sheets but specification contains ${expected} sheets.`);
    checks.contentParity = (spec?.sheets || []).slice(0, 4).every((sheet) => tokenPresent(previewText, sheet.name));
  }

  if (checks.contentParity === false) issues.push('Preview and specification do not contain the same key content.');

  return {
    passed: issues.length === 0,
    issues,
    warnings,
    checks,
    binaryBytes: bytes.length,
    previewFingerprint: fingerprintOfficePreview(preview),
  };
}

export function injectOfficeManifest(html, { kind, spec, previewFingerprint }) {
  const manifest = {
    version: OFFICE_ARTIFACT_VERSION,
    kind,
    previewFingerprint: previewFingerprint || fingerprintOfficePreview(html),
    spec,
  };
  const json = JSON.stringify(manifest).replace(/</g, '\\u003c');
  const tag = `<script type="application/json" id="${OFFICE_MANIFEST_ID}">${json}</script>`;
  const source = String(html || '');
  return /<\/body>/i.test(source) ? source.replace(/<\/body>/i, `${tag}</body>`) : source + tag;
}
