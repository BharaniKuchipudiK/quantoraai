import assert from 'node:assert/strict';
import test from 'node:test';
import { pushFilesToRepositoryFromBase } from './github-push-from-base.js';

const principal = { userSub: 'u', login: 'octo', token: 'gho_x', scopes: ['repo'], connectedAt: '' };

test('pushFilesToRepositoryFromBase refuses read-only access before any mutation', async () => {
  const mutations: Array<{ url: string; method: string }> = [];
  const fetchImpl = async (url: string, init: any = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    if (method !== 'GET') mutations.push({ url, method });
    const reply = (status: number, payload: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(payload),
    });
    if (/\/repos\/acme\/widget$/.test(url)) {
      return reply(200, {
        name: 'widget',
        owner: { login: 'acme' },
        default_branch: 'main',
        archived: false,
        permissions: { pull: true },
      });
    }
    return reply(404, { message: 'Not Found' });
  };

  await assert.rejects(
    () => pushFilesToRepositoryFromBase(
      { principal, owner: 'acme', repo: 'widget', fetchImpl },
      {
        branch: 'quantora-desk',
        baseBranch: 'main',
        message: 'must not write',
        files: [{ path: 'src/App.jsx', content: 'export default null;' }],
      },
    ),
    /not enough to write/,
  );
  assert.deepEqual(mutations, [], 'read-only access must send zero mutating GitHub requests');
});

test('a missing work branch is created at the selected base before the desk commit', async () => {
  let workBranchExists = false;
  const mutations: Array<{ url: string; method: string; body: any }> = [];

  const fetchImpl = async (url: string, init: any = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    if (method !== 'GET') mutations.push({ url, method, body });
    const reply = (status: number, payload: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(payload),
    });

    // Authorization reads repository permissions twice: once for the branch
    // creation seam and once for the atomic push itself.
    if (/\/repos\/acme\/widget$/.test(url)) {
      return reply(200, {
        name: 'widget', owner: { login: 'acme' }, default_branch: 'main', archived: false,
        permissions: { pull: true, push: true },
      });
    }
    if (url.includes('/git/ref/heads/quantora-desk')) {
      return workBranchExists
        ? reply(200, { object: { sha: 'mainsha' } })
        : reply(404, { message: 'Not Found' });
    }
    if (url.includes('/git/ref/heads/main')) return reply(200, { object: { sha: 'mainsha' } });
    if (method === 'POST' && url.endsWith('/git/refs')) {
      workBranchExists = true;
      return reply(201, { ref: 'refs/heads/quantora-desk', object: { sha: body.sha } });
    }
    if (url.includes('/git/commits/mainsha') && method === 'GET') return reply(200, { tree: { sha: 'maintree' } });
    if (method === 'POST' && url.endsWith('/git/blobs')) return reply(201, { sha: 'blobsha' });
    if (method === 'POST' && url.endsWith('/git/trees')) return reply(201, { sha: 'newtree' });
    if (method === 'POST' && url.endsWith('/git/commits')) return reply(201, { sha: 'newcommit' });
    if (method === 'PATCH' && url.includes('/git/refs/heads/quantora-desk')) return reply(200, { object: { sha: 'newcommit' } });
    return reply(404, { message: `Unhandled ${method} ${url}` });
  };

  const result = await pushFilesToRepositoryFromBase(
    { principal, owner: 'acme', repo: 'widget', fetchImpl },
    {
      branch: 'quantora-desk',
      baseBranch: 'main',
      message: 'Fix repository runtime context',
      files: [{ path: 'src/App.jsx', content: 'export default function App(){ return null; }' }],
    },
  );

  assert.equal(result.branch, 'quantora-desk');
  assert.equal(result.createdBranch, true, 'the UI must be told that Quantora created the PR work branch');
  const branchCreate = mutations.find((entry) => entry.method === 'POST' && entry.url.endsWith('/git/refs'));
  assert.equal(branchCreate?.body.ref, 'refs/heads/quantora-desk');
  assert.equal(branchCreate?.body.sha, 'mainsha', 'work branch must start at the selected base commit');

  const commit = mutations.find((entry) => entry.method === 'POST' && entry.url.endsWith('/git/commits'));
  assert.deepEqual(commit?.body.parents, ['mainsha'], 'desk commit must be a child of the selected base, not a new root');

  const lastMutation = mutations.at(-1);
  assert.equal(lastMutation?.method, 'PATCH');
  assert.match(lastMutation?.url || '', /git\/refs\/heads\/quantora-desk/);
});

test('a missing base branch is refused before any desk blobs are written', async () => {
  const mutations: Array<{ url: string; method: string }> = [];
  const fetchImpl = async (url: string, init: any = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    if (method !== 'GET') mutations.push({ url, method });
    const reply = (status: number, payload: unknown) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) });
    if (/\/repos\/acme\/widget$/.test(url)) return reply(200, { default_branch: 'main', permissions: { pull: true, push: true } });
    if (url.includes('/git/ref/heads/')) return reply(404, { message: 'Not Found' });
    return reply(404, {});
  };

  await assert.rejects(
    () => pushFilesToRepositoryFromBase(
      { principal, owner: 'acme', repo: 'widget', fetchImpl },
      { branch: 'quantora-desk', baseBranch: 'release', message: 'change', files: [{ path: 'a.js', content: '1' }] },
    ),
    /Base branch "release" does not exist/,
  );
  assert.equal(mutations.length, 0, 'no blob/tree/commit/ref write may happen when the base is missing');
});
