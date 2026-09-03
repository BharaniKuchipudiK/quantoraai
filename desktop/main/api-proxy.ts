import { net } from "electron";
import { readSessionToken } from "./session-store.js";
import { downstreamHeaders, methodHasBody, upstreamHeaders, upstreamUrl } from "./api-proxy-policy.js";

/*
 * quantora://app/api/*  →  <apiOrigin>/api/*
 *
 * Streaming responses (/api/chat SSE) pass through untouched: the upstream
 * body stream is handed straight to the renderer's Response. Request bodies
 * are buffered — every API body is JSON of a few MB at most, and buffering
 * sidesteps duplex-stream support differences between fetch implementations.
 */
export async function proxyApiRequest(request: Request, apiOrigin: string): Promise<Response> {
  const token = readSessionToken();
  const headers = upstreamHeaders(request.headers.entries(), token);
  const body = methodHasBody(request.method) ? await request.arrayBuffer() : undefined;

  let upstream: Response;
  try {
    upstream = await net.fetch(upstreamUrl(apiOrigin, request.url), {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    });
  } catch (error: any) {
    return Response.json(
      { error: `Quantora is unreachable: ${error?.message || String(error)}`, offline: true },
      { status: 503 },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: downstreamHeaders(upstream.headers.entries()),
  });
}
