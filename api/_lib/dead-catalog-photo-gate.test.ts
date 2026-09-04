import test from "node:test";
import assert from "node:assert/strict";
import {
  collectRemoteImageProbes,
  collectUnservablePreviewImages,
  verifyBuild,
} from "./verify-build.js";

/**
 * ---------------------------------------------------------------------------
 * A CATALOGUE OF BROKEN FRAMES MUST NOT VERIFY CLEAN.
 *
 * On 2026-09-01 a boutique shipped with cart and checkout working and every
 * product frame empty. The note above img-live in verify-build.ts records the
 * cause as "invented Unsplash IDs AND the retired source.unsplash.com", and the
 * probe written for it closed only the FIRST half: an invented id sits on an
 * allowed host, so it was fetched and 404'd, while source.unsplash.com is not
 * allowlisted and was dropped before any check existed to see it.
 *
 * On 2026-09-04 the same thing reached a user, on a coffee shop: five product
 * cards, every image dead, verification clean. Measured on their page shape:
 *
 *   images in the page          4
 *   URLs the verifier probed    1
 *
 * With NO probes at all the block was skipped entirely — so the emptier the
 * catalogue, the quieter the gate. That is the §4 case at its worst: a check
 * whose blind spot grows with the severity of the defect.
 * ---------------------------------------------------------------------------
 */

const card = (src: string, name: string) =>
  `<div class="card"><img src="${src}" alt="${name}"><h2>${name}</h2><p>$18.00</p>`
  + `<button onclick="addToBag('${name}')">Add to Bag</button></div>`;

const shop = (...srcs: Array<[string, string]>) => `<!doctype html><html><head><style>
body{font-family:system-ui;margin:0}.card{padding:24px;border-radius:12px;box-shadow:0 1px 4px #0002}
</style></head><body><h1>Koa &amp; Ember</h1><nav><a href="#">Daily Menu</a></nav>
${srcs.map(([src, name]) => card(src, name)).join("\n")}
<script>let bag=0;function addToBag(){bag++;document.getElementById('cart').textContent=bag;}</script>
<span id="cart">0</span></body></html>`;

const CATALOG_BRIEF = "A coffee shop website with a product catalog and shopping cart";
const loads = async () => ({ status: 200, ok: true, headers: { get: () => "image/jpeg" } }) as any;

test("a catalogue whose photo hosts Preview cannot serve FAILS, and says which", async () => {
  const report = await verifyBuild({
    code: shop(
      ["https://source.unsplash.com/800x600/?coffee", "House Blend Whole Bean"],
      ["https://cdn.shopify.com/s/files/cortado.jpg", "Artisanal Cortado"],
      ["https://images.squarespace-cdn.com/latte.jpg", "Honey Oat Latte"],
    ),
    brief: CATALOG_BRIEF,
    fetchImage: loads,
  });
  const img = report.checks.find((c) => c.id === "img-live");
  assert.ok(img, "the check must EXIST — with zero probes it used to be skipped entirely");
  assert.equal(img.ok, false);
  assert.equal(img.critical, true, "a storefront of empty frames is not a cosmetic miss");
  assert.equal(report.passed, false);
  // Named individually: "some photos are broken" gives the repair loop nothing
  // to act on, and the repair loop is the only thing that can fix it.
  for (const host of ["source.unsplash.com", "cdn.shopify.com", "images.squarespace-cdn.com"]) {
    assert.match(String(img.detail), new RegExp(host.replace(/\./g, "\\.")));
  }
});

test("the retired host is named as retired, not as our restriction", async () => {
  /*
   * "not allowed in Preview" reads as a Quantora policy the model should route
   * around. source.unsplash.com cannot serve an image to ANYONE any more, and
   * the model reaches for it constantly, so the difference is the whole message.
   */
  const [only] = collectUnservablePreviewImages(shop(["https://source.unsplash.com/800x600/?tea", "Tea"]));
  assert.equal(only.url, "https://source.unsplash.com/800x600/?tea");
  assert.match(only.why, /retired and can never return an image/);
});

test("both halves of the 2026-09-01 incident are caught together", async () => {
  // An invented id on an allowed host (probed, 404) AND a retired host
  // (unprobeable, known bad). The old check saw only the first.
  const notFound = async () => ({ status: 404, ok: false, headers: { get: () => "text/html" } }) as any;
  const report = await verifyBuild({
    code: shop(
      ["https://images.unsplash.com/photo-0000000000000-invented", "Nitro Cold Brew"],
      ["https://source.unsplash.com/800x600/?pastry", "Cardamom Almond Croissant"],
    ),
    brief: CATALOG_BRIEF,
    fetchImage: notFound,
  });
  const img = report.checks.find((c) => c.id === "img-live");
  assert.equal(img?.ok, false);
  assert.match(String(img?.detail), /2 of 2/, "both halves must be counted, not just the probed one");
});

test("photos that DO load still pass — this is not a gate that always fires", async () => {
  const report = await verifyBuild({
    code: shop(["https://images.unsplash.com/photo-1500000000000-real", "House Blend"]),
    brief: CATALOG_BRIEF,
    fetchImage: loads,
  });
  const img = report.checks.find((c) => c.id === "img-live");
  assert.equal(img?.ok, true);
});

test("self-hosted and embedded photos are not remote, and are not judged", async () => {
  // A build that ships its own images has nothing for this check to say.
  // Flagging them would push the model AWAY from the most reliable option.
  for (const src of ["/images/house-blend.jpg", "data:image/png;base64,iVBORw0KGgo="]) {
    const report = await verifyBuild({ code: shop([src, "House Blend"]), brief: CATALOG_BRIEF, fetchImage: loads });
    assert.equal(report.checks.find((c) => c.id === "img-live"), undefined, `${src} must not be treated as remote`);
    assert.deepEqual(collectUnservablePreviewImages(shop([src, "x"])), []);
  }
});

test("the SSRF guard is untouched: a disallowed host is never FETCHED", async () => {
  /*
   * The reason these were dropped in the first place (Codex P1 on PR #442):
   * this markup is model-controlled and the probe runs server-side, so fetching
   * an arbitrary host reaches cloud metadata and internal services. Reporting a
   * url is not requesting it — and this asserts the difference, because losing
   * it would trade a cosmetic bug for an SSRF.
   */
  const forbidden: string[] = [];
  const recordingFetch = async (url: any) => {
    forbidden.push(String(url));
    return { status: 200, ok: true, headers: { get: () => "image/jpeg" } } as any;
  };
  await verifyBuild({
    code: shop(
      ["https://169.254.169.254/latest/meta-data/", "Metadata"],
      ["https://cdn.shopify.com/s/files/cortado.jpg", "Cortado"],
      ["https://images.unsplash.com/photo-1500000000000-real", "Allowed"],
    ),
    brief: CATALOG_BRIEF,
    fetchImage: recordingFetch,
  });
  assert.deepEqual(
    forbidden,
    ["https://images.unsplash.com/photo-1500000000000-real"],
    "only the allowlisted host may be requested",
  );
  assert.equal(collectRemoteImageProbes(shop(["https://169.254.169.254/x", "m"])).length, 0);
});

test("a link-local address is reported as unloadable without being contacted", () => {
  // It appears in the report so the model is told to replace it; nothing dials it.
  const found = collectUnservablePreviewImages(shop(["https://169.254.169.254/latest/meta-data/", "m"]));
  assert.equal(found.length, 1);
  assert.match(found[0].why, /not a photo host Preview can load/);
});
