/**
 * The desk must never corrupt its own artifact.
 *
 * THE INCIDENT (2026-09-01, post-merge boutique build). The model shipped a
 * valid React shop VFS. `ensureShopDeskInVfs` asked `pickPreviewEntryPath`
 * for "the page" — but that helper returns the RUNTIME entry, which for a
 * React project is `src/main.jsx` — and then ran `injectShopCommerceUi` on
 * it. The injector, finding no <body>, prepended its HTML currency/Bag bar
 * above `import React` and appended its <script> block. Preview died with
 * `Expected ";" but found "import"` (the user's build tripped on a sibling
 * token, "filepath"), the REVIEW pane showed the platform's own
 * data-quantora-shop-ui markup inside App.jsx, and the repair loop had a
 * self-inflicted wound to heal.
 *
 * The law already written at writeHealedPreviewToVfs — "React source is not
 * overwritten with HTML" — now has a gate. The strongest assertion is the
 * real compiler: whatever ensureShopDeskInVfs does to a valid VFS, the
 * result must still compile.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureShopDeskInVfs } from './studio-preview-helpers.js';
import { compilePreviewVfs } from '../../api/_lib/preview-compiler.js';

const SHOP_JOB = { goal: 'A shop website', steps: [] };
const BRIEF = 'boutique online shop with cart and service bookings';

function reactShopVfs() {
  return {
    'package.json': { content: JSON.stringify({ dependencies: { react: '18.2.0', 'react-dom': '18.2.0' } }) },
    'src/main.jsx': {
      content: "import { createRoot } from 'react-dom/client';\nimport App from './App.jsx';\ncreateRoot(document.getElementById('root')).render(<App />);",
    },
    'src/App.jsx': {
      content: "import React, { useState } from 'react';\nconst services = [{ id: 'b1', title: 'Blouse Stitching', price: 799 }];\nexport default function App(){ const [cart] = useState([]); return <div><h1>Saree Boutique</h1><button>Add to Cart</button></div>; }",
    },
    'products.json': { content: JSON.stringify([{ id: 's1', name: 'Kanjivaram', priceCents: 1000 }]) },
  };
}

test('[was-red] ensureShopDeskInVfs never injects HTML into a React module', () => {
  const out = ensureShopDeskInVfs(reactShopVfs(), SHOP_JOB, { brief: BRIEF });
  for (const [path, file] of Object.entries(out.vfs)) {
    if (!/\.(jsx|tsx|js|ts)$/i.test(path)) continue;
    const content = typeof file === 'string' ? file : file?.content || '';
    assert.doesNotMatch(
      content,
      /data-quantora-shop-ui/,
      `${path}: the shop commerce bar was injected into a React module — the 2026-09-01 self-corruption`,
    );
  }
});

test('[was-red] a valid React shop VFS still compiles after the shop desk pass', async () => {
  const out = ensureShopDeskInVfs(reactShopVfs(), SHOP_JOB, { brief: BRIEF });
  // The real compiler is the verifier — the same one Preview uses. If this
  // throws, the desk broke a build the model shipped working.
  const compiled = await compilePreviewVfs(out.vfs, { correlationId: 'shop-ui-react-vfs-gate' });
  assert.ok(compiled?.html, 'compiled preview HTML exists');
});

test('an HTML shop still gets the commerce bar — the guard must not lobotomize the injector', () => {
  const htmlVfs = {
    'index.html': {
      content: '<!DOCTYPE html><html><head><title>Shop</title></head><body><main><h1>Boutique</h1><button>Add to Cart</button></main></body></html>',
    },
    'products.json': { content: JSON.stringify([{ id: 's1', name: 'Kanjivaram', priceCents: 1000 }]) },
  };
  const out = ensureShopDeskInVfs(htmlVfs, SHOP_JOB, { brief: BRIEF });
  assert.match(
    out.vfs['index.html'].content,
    /data-quantora-shop-ui/,
    'HTML entries keep the injected commerce UI',
  );
});
