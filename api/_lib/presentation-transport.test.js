import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESENTATION_TRANSPORT_JSON_SCHEMA,
  materializePresentationTransportSpec,
  presentationSpecToTransport,
} from './presentation-transport.js';

function item(overrides = {}) {
  return {
    primary: '', secondary: '', tertiary: '', value: '', number: 0, number2: 0,
    status: 'neutral', bulletsA: [], bulletsB: [], flag: false,
    ...overrides,
  };
}

function slide(type, items = []) {
  return {
    type,
    title: `${type} takeaway`,
    subtitle: '',
    kicker: '',
    insight: '',
    recommendation: '',
    source: '',
    speakerNotes: '',
    bullets: [],
    chartType: 'bar',
    items,
    images: [],
    quote: '',
    author: '',
  };
}

const transport = {
  version: 2,
  title: 'Cloud modernization',
  archetype: 'strategy',
  audience: 'Executive leadership',
  purpose: 'Choose a migration path',
  decisionAsk: 'Approve the preferred path',
  period: '90 days',
  communicationStandard: 'consulting',
  sourceNotes: ['No invented numeric data'],
  slides: [
    slide('cover'),
    slide('status_dashboard', [
      item({ primary: 'Architecture readiness', status: 'amber', value: 'Assessment', secondary: 'Dependencies remain' }),
      item({ primary: 'Operating model', status: 'green', value: 'Defined', secondary: 'Ownership agreed' }),
    ]),
    slide('comparison', [
      item({ primary: 'Rehost', secondary: 'Fastest path', tertiary: 'Medium', bulletsA: ['Speed'], bulletsB: ['Less modernization'] }),
      item({ primary: 'Replatform', secondary: 'Balanced path', tertiary: 'High', bulletsA: ['Modernize selectively'], bulletsB: ['More change'], flag: true }),
    ]),
    slide('two_column', [
      item({ primary: 'What changes', bulletsA: ['Platform', 'Delivery model'] }),
      item({ primary: 'What stays', bulletsA: ['Business outcomes', 'Controls'] }),
    ]),
    slide('risk_matrix', [
      item({ primary: 'Dependency risk', number: 3, number2: 4, secondary: 'Sequence dependencies', value: 'PMO', status: 'amber' }),
      item({ primary: 'Skills risk', number: 2, number2: 3, secondary: 'Upskill teams', value: 'Engineering', status: 'neutral' }),
    ]),
    slide('roadmap', [
      item({ primary: 'Mobilize', value: 'Program', tertiary: 'Days 0-30', secondary: 'Baseline and govern', status: 'green' }),
      item({ primary: 'Execute', value: 'Platform', tertiary: 'Days 31-90', secondary: 'Migrate priority workloads', status: 'neutral' }),
    ]),
  ],
};

test('provider transport avoids numeric enum incompatibility at version', () => {
  assert.equal(PRESENTATION_TRANSPORT_JSON_SCHEMA.properties.version.type, 'integer');
  assert.equal(PRESENTATION_TRANSPORT_JSON_SCHEMA.properties.version.enum, undefined);
});

test('transport deterministically materializes structured V2 payloads', () => {
  const spec = materializePresentationTransportSpec(transport);
  assert.equal(spec.version, 2);
  assert.equal(spec.slides[1].statuses.length, 2);
  assert.equal(spec.slides[2].options.length, 2);
  assert.equal(spec.slides[3].columns.length, 2);
  assert.equal(spec.slides[4].risks.length, 2);
  assert.equal(spec.slides[5].actions.length, 2);
  assert.equal(spec.slides[2].options[1].recommended, true);
});

test('verified V2 specs can round-trip through transport for refinement', () => {
  const materialized = materializePresentationTransportSpec(transport);
  const roundTrip = materializePresentationTransportSpec(presentationSpecToTransport(materialized));
  assert.deepEqual(roundTrip.slides[1].statuses, materialized.slides[1].statuses);
  assert.deepEqual(roundTrip.slides[2].options, materialized.slides[2].options);
  assert.deepEqual(roundTrip.slides[4].risks, materialized.slides[4].risks);
  assert.deepEqual(roundTrip.slides[5].actions, materialized.slides[5].actions);
});
