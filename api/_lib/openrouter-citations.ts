/**
 * OpenRouter web-plugin citations, recovered from the stream.
 *
 * When a turn is grounded on the OpenRouter route, the request carries
 * `plugins: [{ id: "web" }]` — and OpenRouter returns what it found as
 * `url_citation` ANNOTATIONS on the streamed deltas (and on the final
 * message), not inside `delta.content`. The router's stream loop read only
 * `delta.content`, so a grounded reply arrived with its citations woven
 * into the prose while the server-side source list stayed empty: no
 * canonical **Sources** block was appended, the Research board honestly
 * counted the turn "not backed by live sources", and the evidence the
 * plugin actually found was unverifiable. Caught in a 2026-09-02 field
 * test — the first real research chat turn shipped inline links the board
 * refused to credit.
 *
 * This parser is deliberately defensive: annotation shapes come from an
 * external gateway, so anything malformed contributes nothing rather than
 * throwing mid-stream.
 */

export type OpenRouterCitationSource = { uri: string; title: string };

export function extractOpenRouterAnnotationSources(event: unknown): OpenRouterCitationSource[] {
  const choice = (event as any)?.choices?.[0];
  const annotations = [
    ...(Array.isArray(choice?.delta?.annotations) ? choice.delta.annotations : []),
    ...(Array.isArray(choice?.message?.annotations) ? choice.message.annotations : []),
  ];
  const out: OpenRouterCitationSource[] = [];
  for (const annotation of annotations) {
    if (annotation?.type !== "url_citation") continue;
    const citation = annotation?.url_citation;
    const uri = typeof citation?.url === "string" ? citation.url.trim() : "";
    if (!/^https?:\/\//i.test(uri)) continue;
    const title = typeof citation?.title === "string" && citation.title.trim() ? citation.title.trim() : uri;
    out.push({ uri, title });
  }
  return out;
}
