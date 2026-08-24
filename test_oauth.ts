import handler from './api/auth.ts';

// Smoke: auth hub still loads. Full OAuth needs a live Google token.
const req = { method: 'POST', query: { route: 'verify' }, headers: {}, body: {}, socket: {} };
const res = {
  status(code) { console.log('status', code); return this; },
  json(body) { console.log('json', body); return this; },
  setHeader() { return this; },
  end() { return this; },
};
await handler(req, res);
