import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('admin metrics exposes persisted runtime governor summary', () => {
  const handler = read('api/_lib/handlers/admin-metrics.ts');
  assert.match(handler, /getRuntimeGovernorMetrics\(24\)/);
  assert.match(handler, /governor,/);
});

test('technical dashboard renders governor reliability before deep diagnostics', () => {
  const dashboard = read('src/components/AdminDashboard.jsx');
  assert.match(dashboard, /GovernorMetricsPanel/);
  assert.match(dashboard, /governor=\{metrics\.governor\}/);
  const governorAt = dashboard.indexOf('<GovernorMetricsPanel');
  const commandCenterAt = dashboard.indexOf('<TechnicalCommandCenterBoundary');
  assert.ok(governorAt >= 0 && commandCenterAt > governorAt);
});

test('governor panel names the operational reliability measures', () => {
  const panel = read('src/components/GovernorMetricsPanel.jsx');
  assert.match(panel, /VERIFIED COMPLETION/);
  assert.match(panel, /FAILED/);
  assert.match(panel, /RECOVERED/);
  assert.match(panel, /OUTCOME SATISFIED/);
  assert.match(panel, /JUDGE FALLBACK/);
});
