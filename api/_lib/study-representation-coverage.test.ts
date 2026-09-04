import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  reportStudyRepresentationCoverage,
  STUDY_REPRESENTATION_COVERAGE_VERSION,
} from './study-representation-coverage.js';
import { STUDY_REPRESENTATION_CAPABILITY_VERSION } from './study-representation-capabilities.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

function declaredRendererKinds(): string[] {
  const source = read('api/_lib/study-representation-capabilities.ts');
  const union = source.slice(
    source.indexOf('export type StudyRepresentationRendererKind'),
    source.indexOf('export type StudyRepresentationCapability'),
  );
  return [...union.matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]);
}

test('the coverage catalog names every renderer family and keeps unsupported unavailable', () => {
  const report = reportStudyRepresentationCoverage();
  assert.equal(report.version, STUDY_REPRESENTATION_COVERAGE_VERSION);
  assert.equal(report.capabilityVersion, STUDY_REPRESENTATION_CAPABILITY_VERSION);
  assert.equal(report.source, 'capability_catalog');
  assert.deepEqual(Object.keys(report).sort(), ['capabilityVersion', 'rows', 'source', 'version'].sort());

  const available = new Set(
    report.rows.filter((row) => row.outcome === 'renderer_available').map((row) => row.rendererKind),
  );
  for (const kind of declaredRendererKinds()) {
    assert.equal(available.has(kind), true, `coverage catalog is missing renderer family ${kind}`);
  }

  const unsupported = report.rows.find((row) => row.requestClass === 'visual_unsupported');
  assert.equal(unsupported?.outcome, 'renderer_unavailable');
  assert.equal(unsupported?.rendererKind, null);

  for (const row of report.rows) {
    assert.deepEqual(Object.keys(row).sort(), ['outcome', 'rendererKind', 'requestClass'].sort());
    assert.equal('context' in row, false);
    assert.equal('prompt' in row, false);
    assert.equal('message' in row, false);
    assert.equal('caption' in row, false);
  }
});

test('admin metrics and the technical panel expose the coverage catalog', () => {
  const metrics = read('api/_lib/handlers/admin-metrics.ts');
  assert.match(metrics, /reportStudyRepresentationCoverage/);
  assert.match(metrics, /studyRepresentationCoverage/);

  const dashboard = read('src/components/AdminDashboard.jsx');
  assert.match(dashboard, /studyRepresentationCoverage=\{metrics\.studyRepresentationCoverage\}/);

  const panel = read('src/components/TechnicalAnalyticsPanel.jsx');
  assert.match(panel, /data-quantora-study-representation-coverage/);
});
