import { getWorld } from 'workflow/runtime';
import express from 'express';
import { start, getRun } from 'workflow/api';
import { recoveryProof } from './workflow.js';
const app = express();
let boot: Promise<void> | undefined;
app.use(async (_req, _res, next) => {
  // A standalone production bundle must start its local queue on process boot.
  boot ||= getWorld().start?.() || Promise.resolve();
  try { await boot; next(); } catch (error) { next(error); }
});
app.post('/start', async (_req, res) => {
  const run = await start(recoveryProof, []);
  res.status(202).json({ runId: run.runId });
});
app.get('/status/:id', async (req, res) => {
  const run = getRun(req.params.id);
  res.json({ status: await run.status });
});
export default app;
