import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_OUTPUT_JSON_SCHEMAS } from './office-output-schemas.js';

function walkObjects(schema, visit) {
  if (!schema || typeof schema !== 'object') return;
  if (schema.type === 'object') visit(schema);
  if (schema.properties) Object.values(schema.properties).forEach((child) => walkObjects(child, visit));
  if (schema.items) walkObjects(schema.items, visit);
  if (Array.isArray(schema.anyOf)) schema.anyOf.forEach((child) => walkObjects(child, visit));
}

test('defines strict provider schemas for every Office artifact', () => {
  assert.deepEqual(Object.keys(OFFICE_OUTPUT_JSON_SCHEMAS).sort(), ['excel', 'powerpoint', 'word']);
  for (const schema of Object.values(OFFICE_OUTPUT_JSON_SCHEMAS)) {
    assert.equal(schema.type, 'object');
    walkObjects(schema, (objectSchema) => {
      assert.equal(objectSchema.additionalProperties, false, 'every object must fail closed on unknown fields');
      assert.ok(Array.isArray(objectSchema.required), 'every object must explicitly define required fields');
      assert.deepEqual(new Set(objectSchema.required), new Set(Object.keys(objectSchema.properties || {})));
    });
  }
});

test('PowerPoint contract keeps semantic payloads required in the generated shape', () => {
  const slide = OFFICE_OUTPUT_JSON_SCHEMAS.powerpoint.properties.slides.items;
  for (const field of ['kpis', 'data', 'timeline', 'columns', 'options', 'statuses', 'risks', 'actions', 'financials', 'framework']) {
    assert.ok(slide.required.includes(field), `${field} must always be present (empty when not used)`);
    assert.equal(slide.properties[field].type, 'array');
  }
  assert.ok(slide.properties.type.enum.includes('roadmap'));
  assert.ok(slide.properties.type.enum.includes('comparison'));
  assert.ok(slide.properties.type.enum.includes('status_dashboard'));
});
