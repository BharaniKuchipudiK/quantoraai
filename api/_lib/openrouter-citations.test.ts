import assert from "node:assert/strict";
import test from "node:test";
import { extractOpenRouterAnnotationSources } from "./openrouter-citations.js";

test("url_citation annotations on a streamed delta become sources", () => {
  const sources = extractOpenRouterAnnotationSources({
    choices: [{
      delta: {
        content: "Enforcement began in August",
        annotations: [
          { type: "url_citation", url_citation: { url: "https://www.euractiv.com/ai-act", title: "EU orders AI labs" } },
          { type: "url_citation", url_citation: { url: "https://www.reuters.com/story", title: "" } },
        ],
      },
    }],
  });
  assert.deepEqual(sources, [
    { uri: "https://www.euractiv.com/ai-act", title: "EU orders AI labs" },
    { uri: "https://www.reuters.com/story", title: "https://www.reuters.com/story" },
  ]);
});

test("annotations on the final message shape are read too", () => {
  const sources = extractOpenRouterAnnotationSources({
    choices: [{
      message: {
        annotations: [
          { type: "url_citation", url_citation: { url: "https://www.ft.com/report", title: "FT report" } },
        ],
      },
    }],
  });
  assert.deepEqual(sources, [{ uri: "https://www.ft.com/report", title: "FT report" }]);
});

test("non-citation annotations, bad urls, and malformed events contribute nothing", () => {
  assert.deepEqual(extractOpenRouterAnnotationSources({
    choices: [{
      delta: {
        annotations: [
          { type: "file_citation", url_citation: { url: "https://www.example.com" } },
          { type: "url_citation", url_citation: { url: "javascript:alert(1)" } },
          { type: "url_citation", url_citation: { url: 42 } },
          { type: "url_citation" },
          null,
        ],
      },
    }],
  }), []);
  assert.deepEqual(extractOpenRouterAnnotationSources(null), []);
  assert.deepEqual(extractOpenRouterAnnotationSources({ choices: [] }), []);
  assert.deepEqual(extractOpenRouterAnnotationSources("data: [DONE]"), []);
});
