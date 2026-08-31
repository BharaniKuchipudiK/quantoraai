export const STUDY_GROUNDING_VERSION = 'study-grounding-2026-08-31.2';

export type StudyGroundingSourceKind =
  | 'official'
  | 'open_licensed'
  | 'quantora_reviewed'
  | 'connected_source'
  | 'web';

/**
 * Input remains backward-compatible with the original verification contract,
 * but `kind` is only a caller hint. It is never trusted to elevate authority.
 */
export type StudyGroundingSourceInput = {
  ref: string;
  kind?: StudyGroundingSourceKind | null;
};

export type StudyGroundingSource = {
  ref: string;
  kind: StudyGroundingSourceKind;
  authorityId: string | null;
  canonical: boolean;
};

type OfficialAuthority = {
  id: string;
  hosts: readonly string[];
};

/*
 * Authority lives in code, not in model prose or client payloads. Keep this
 * list deliberately small. A new board/provider must be reviewed before its
 * pages can satisfy Exam Grounded verification.
 *
 * The registry describes authority only; it does NOT say that every sentence
 * on an allowed site supports a particular learner-facing claim. Semantic
 * support remains a separate grounding/evidence responsibility.
 */
const OFFICIAL_AUTHORITIES: readonly OfficialAuthority[] = Object.freeze([
  { id: 'ncert', hosts: ['ncert.nic.in'] },
  { id: 'cbse-academic', hosts: ['cbseacademic.nic.in'] },
  { id: 'cbse', hosts: ['cbse.gov.in'] },
  { id: 'jee-main-nta', hosts: ['jeemain.nta.nic.in'] },
  { id: 'nta-exams', hosts: ['exams.nta.ac.in'] },
  { id: 'nta', hosts: ['nta.ac.in'] },
  { id: 'seab-sg', hosts: ['seab.gov.sg'] },
  { id: 'moe-sg', hosts: ['moe.gov.sg'] },
]);

function clean(value: unknown, max = 2000): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length <= max ? normalized : '';
}

function hostMatches(hostname: string, allowedHost: string): boolean {
  const host = hostname.toLowerCase();
  const allowed = allowedHost.toLowerCase();
  return host === allowed || host.endsWith(`.${allowed}`);
}

function authorityForHost(hostname: string): OfficialAuthority | null {
  for (const authority of OFFICIAL_AUTHORITIES) {
    if (authority.hosts.some((host) => hostMatches(hostname, host))) return authority;
  }
  return null;
}

function unwrapWebRef(ref: string): string {
  return /^web:https:\/\//i.test(ref) ? ref.slice(4) : ref;
}

function normalizedHttpsUrl(ref: string): URL | null {
  const candidate = unwrapWebRef(clean(ref));
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    // Canonical authority is HTTPS on the authority's normal origin. Refuse
    // non-standard ports rather than assuming an arbitrary listener on the same
    // hostname is part of the reviewed curriculum surface.
    if (url.protocol !== 'https:' || !url.hostname || url.port) return null;
    url.username = '';
    url.password = '';
    return url;
  } catch {
    return null;
  }
}

/**
 * Classify one source using code-owned authority. Caller-supplied `kind` can
 * never turn example.com (or a look-alike host) into an official source.
 */
export function classifyStudyGroundingSource(input: StudyGroundingSourceInput | null | undefined): StudyGroundingSource | null {
  const rawRef = clean(input?.ref);
  if (!rawRef) return null;

  if (/^connected:[a-z0-9._:/-]+$/i.test(rawRef)) {
    return {
      ref: rawRef,
      kind: 'connected_source',
      authorityId: null,
      canonical: false,
    };
  }

  const url = normalizedHttpsUrl(rawRef);
  if (!url) return null;
  const authority = authorityForHost(url.hostname);
  if (authority) {
    return {
      ref: url.toString(),
      kind: 'official',
      authorityId: authority.id,
      canonical: true,
    };
  }

  return {
    ref: url.toString(),
    kind: 'web',
    authorityId: null,
    canonical: false,
  };
}

export function normalizeStudyGroundingSources(input: StudyGroundingSourceInput[] | null | undefined): StudyGroundingSource[] {
  if (!Array.isArray(input)) return [];
  const result: StudyGroundingSource[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const source = classifyStudyGroundingSource(raw);
    if (!source || seen.has(source.ref)) continue;
    seen.add(source.ref);
    result.push(source);
    if (result.length >= 32) break;
  }
  return result;
}

export function studyGroundingSourceAllowedForMode(
  source: StudyGroundingSource,
  mode: 'exam_grounded' | 'explore',
): boolean {
  if (mode === 'exam_grounded') return source.canonical === true && source.kind === 'official';
  if (mode === 'explore') {
    return source.kind === 'official' || source.kind === 'web' || source.kind === 'connected_source';
  }
  return false;
}

function evidenceUrl(ref: string): URL | null {
  const value = clean(ref);
  const direct = normalizedHttpsUrl(value);
  if (direct) return direct;

  // Grounding traces may prefix the cited URL while retaining it verbatim.
  const match = value.match(/^grounding:(https:\/\/[^\s]+)$/i);
  return match ? normalizedHttpsUrl(match[1]) : null;
}

/**
 * Evidence for a grounded-source check must point back to a source admitted by
 * the verification plan. Fragment anchors are allowed; cross-host or unrelated
 * citations cannot satisfy the check merely because status='verified'.
 */
export function studyGroundingEvidenceMatchesSource(evidenceRef: string, sourceRef: string): boolean {
  const evidence = evidenceUrl(evidenceRef);
  const source = normalizedHttpsUrl(sourceRef);
  if (!evidence || !source) {
    const cleanEvidence = clean(evidenceRef);
    const cleanSource = clean(sourceRef);
    return Boolean(cleanEvidence && cleanSource)
      && cleanEvidence === cleanSource
      && /^connected:/i.test(cleanSource);
  }

  if (evidence.origin !== source.origin) return false;
  if (evidence.pathname !== source.pathname) return false;
  if (evidence.search !== source.search) return false;
  return true;
}

export function studyGroundingEvidenceAllowed(
  evidenceRef: string,
  sources: StudyGroundingSource[],
  mode: 'exam_grounded' | 'explore',
): boolean {
  return sources
    .filter((source) => studyGroundingSourceAllowedForMode(source, mode))
    .some((source) => studyGroundingEvidenceMatchesSource(evidenceRef, source.ref));
}
