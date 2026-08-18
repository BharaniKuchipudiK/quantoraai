import fs from 'node:fs';

const path = 'api/generate-office.ts';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(before, after);
}

if (!source.includes("./_lib/presentation-generation-gate.js")) {
  replaceOnce(
    'generation gate import',
    "} from './_lib/office-artifact.js';\nimport { fetchPublicHttpsImage } from './_lib/safe-image-fetch.js';",
    "} from './_lib/office-artifact.js';\nimport { validateGeneratedPresentationSpec } from './_lib/presentation-generation-gate.js';\nimport { fetchPublicHttpsImage } from './_lib/safe-image-fetch.js';",
  );
}

replaceOnce(
  'candidate generation validation',
  '          const validation = validateSpec(format, candidate);',
  "          const validation = format === 'powerpoint'\n            ? validateGeneratedPresentationSpec(candidate)\n            : validateSpec(format, candidate);",
);

replaceOnce(
  'final pre-compile validation',
  '    const finalSpecValidation = validateSpec(format, validJson, { legacyPowerPoint: legacyPowerPointCompile });',
  "    const finalSpecValidation = (!isCompileRequest && format === 'powerpoint')\n      ? validateGeneratedPresentationSpec(validJson)\n      : validateSpec(format, validJson, { legacyPowerPoint: legacyPowerPointCompile });",
);

fs.writeFileSync(path, source);
console.log('Applied asserted Office generation-quality ordering patch.');
