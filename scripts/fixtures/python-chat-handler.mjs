// Test-only infrastructure. The production handler runs unchanged; only
// external provider/storage I/O is replaced, and unexpected network is denied.
export async function invokePythonChatHandler(body, reply) {
  const originalFetch = globalThis.fetch;
  const names = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENROUTER_API_KEY', 'QUANTORA_GOLDEN_CANARY_TOKEN'];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) process.env[name] = '';
  process.env.QUANTORA_GOLDEN_CANARY_TOKEN = 'local-python-boundary-test-token-not-for-production';
  let providerCalls = 0;
  /** @type {{ messages: Array<{ content: string }> } | undefined} */
  let providerRequest;
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'https://openrouter.ai/api/v1/models') return Response.json({ data: [{ id: 'openai/gpt-4o-mini', name: 'Fixture model', context_length: 128000, architecture: { input_modalities: ['text'], output_modalities: ['text'] }, pricing: { prompt: '0.000001', completion: '0.000001' } }] });
    if (url === 'https://openrouter.ai/api/v1/chat/completions') {
      providerCalls += 1;
      providerRequest = JSON.parse(init.body);
      return new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: reply }, finish_reason: null }] }) + '\n\n'
        + 'data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    }
    throw new Error(`Unexpected external I/O in Python handler test: ${new URL(url).origin}`);
  };
  const state = { status: 200, headers: {}, chunks: [], body: null };
  const res = {
    headersSent: false, writableEnded: false,
    setHeader(name, value) { state.headers[name] = value; },
    getHeader(name) { return state.headers[name]; },
    writeHead(status, headers) { state.status = status; Object.assign(state.headers, headers); this.headersSent = true; },
    write(chunk) { state.chunks.push(chunk); return true; },
    status(status) { state.status = status; return this; },
    json(body) { state.body = body; this.end(); return this; },
    end() { this.writableEnded = true; },
  };
  try {
    const { default: handler } = await import('../../api/_lib/chat-handler.ts');
    await handler({ method: 'POST', headers: {
      'x-quantora-golden-canary': process.env.QUANTORA_GOLDEN_CANARY_TOKEN,
      'x-quantora-openrouter-key': 'sk-or-test-key-no-network-access',
    }, socket: {}, body }, res);
    return { ...state, stream: state.chunks.join(''), providerCalls, providerRequest };
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
}
