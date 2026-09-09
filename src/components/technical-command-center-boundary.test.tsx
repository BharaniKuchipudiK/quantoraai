import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TechnicalCommandCenterBoundary, { getTechnicalCommandCenterVisibility } from './TechnicalCommandCenterBoundary.jsx';

function technical(overrides: any = {}) {
  return {
    operations: {
      circuits: { source: 'measured', open: 0, impaired: 0, healthy: 12, rows: [] },
      vercel: { source: 'measured', current: { id: 'd1', state: 'READY' } },
      ...overrides,
    },
  };
}

test('command center is rendered only when circuit and current production deployment truth are measured', () => {
  assert.equal(getTechnicalCommandCenterVisibility(technical()).ready, true);
  assert.equal(getTechnicalCommandCenterVisibility(technical({ circuits: { source: 'unavailable' } })).ready, false);
  assert.equal(getTechnicalCommandCenterVisibility(technical({ vercel: { source: 'partial', current: null } })).ready, false);
  assert.equal(getTechnicalCommandCenterVisibility(technical({ vercel: { source: 'measured', current: null } })).ready, false);
});

test('blind critical telemetry renders an explicit partial-state warning instead of green zeroes', () => {
  const markup = renderToStaticMarkup(
    <TechnicalCommandCenterBoundary
      technical={technical({
        circuits: { source: 'unavailable', open: 0, impaired: 0, healthy: 0, rows: [] },
        vercel: { source: 'partial', current: null, environment: 'production' },
      })}
      isLight={false}
    />,
  );

  assert.match(markup, /Operating picture partially observed/);
  assert.match(markup, /will not render green zeroes/);
  assert.match(markup, /data-quantora-technical-command-center="partial"/);
  assert.doesNotMatch(markup, /0 CIRCUITS OPEN/);
  assert.doesNotMatch(markup, /VERCEL PRODUCTION/);
});
