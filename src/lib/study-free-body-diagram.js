const PHYSICS_TERMS = /\b(force|forces|newton|friction|tension|normal reaction|free[ -]?body|equilibrium|inclined plane|incline|vector|vectors|kinematics|motion)\b/i;

export function isFreeBodyDiagramRelevant({ topic = '' } = {}) {
  return PHYSICS_TERMS.test(String(topic));
}

function force(id, label, symbol, x2, y2, color) {
  return { id, label, symbol, x1: 160, y1: 105, x2, y2, color };
}

/**
 * Original deterministic scene model. Arrows are forces, never velocity.
 * The default surface example is in vertical equilibrium.
 */
export function buildFreeBodyScene({ applied = false, friction = false } = {}) {
  const forces = [
    force('normal', 'Normal force from the surface', 'N', 160, 35, '#0284c7'),
    force('weight', 'Weight due to gravity', 'mg', 160, 175, '#7c3aed'),
  ];
  if (applied) forces.push(force('applied', 'Applied force', 'F', 235, 105, '#059669'));
  if (friction) forces.push(force('friction', 'Friction opposing the applied force', 'f', 85, 105, '#dc2626'));
  return {
    title: 'Object on a horizontal surface',
    description: applied
      ? `Vertical forces balance. ${friction ? 'Applied force and friction are shown in opposite horizontal directions.' : 'An applied horizontal force is shown without assuming a balancing force.'}`
      : 'Normal force and weight are equal and opposite; there is no horizontal force arrow.',
    forces,
  };
}

export function validateFreeBodyScene(scene) {
  const issues = [];
  const forces = Array.isArray(scene?.forces) ? scene.forces : [];
  const ids = new Set();
  for (const arrow of forces) {
    if (!arrow?.id || ids.has(arrow.id)) issues.push('force_ids_must_be_unique');
    ids.add(arrow?.id);
    if (![arrow?.x1, arrow?.y1, arrow?.x2, arrow?.y2].every(Number.isFinite)) issues.push('force_coordinates_must_be_finite');
    if (arrow?.x1 === arrow?.x2 && arrow?.y1 === arrow?.y2) issues.push('force_vector_cannot_have_zero_length');
  }
  const normal = forces.find((arrow) => arrow.id === 'normal');
  const weight = forces.find((arrow) => arrow.id === 'weight');
  if (!normal || !weight) issues.push('surface_example_requires_normal_and_weight');
  if (normal && weight) {
    const normalDy = normal.y2 - normal.y1;
    const weightDy = weight.y2 - weight.y1;
    if (normal.x2 !== normal.x1 || weight.x2 !== weight.x1 || normalDy !== -weightDy) {
      issues.push('vertical_equilibrium_vectors_must_be_equal_and_opposite');
    }
  }
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}
