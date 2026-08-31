import { GoogleGenAI } from "@google/genai";
import { fetchApiGatewayKey } from './autocomplete';
import { applyCors, clientIp, isRateLimited, isRateLimitedDurable, applyDurableCostBearingGuard } from './_lib/rate-limit.js';
import { requireActiveSession } from "./_lib/authz.js";
import { fetchWithTimeout } from "./_lib/fetch-timeout.js";
import { isPublishedSiteOwner } from './_lib/store.js';
import { normalizeDomainName } from './_lib/publish-policy.js';
import { guardPclSideEffect, pclHumanConfirmation, recordPclExecutionEvidence } from './_lib/pcl-side-effect-guard.js';
import inferenceHealth from './_lib/handlers/inference-health.js';

/** Google-maintained alias for the current Flash model. A pinned id rots. */
const GEMINI_FLASH = "gemini-flash-latest";

const MAX_CONTEXT_CHARS = 10_000;
const REQUESTS_PER_MINUTE = 20;

export default async function handler(req: any, res: any) {
  /*
   * /api/inference-health rides on this function, NOT on pipeline: the health
   * probe must stay alive when the pipeline mega-function is the thing that is
   * down. This function is the lightest TS hub, so it is the shelter.
   * The handler does its own CORS, method check, and rate limit.
   */
  const routed = typeof req.query?.route === 'string' ? req.query.route : '';
  if (routed === 'inference-health') return inferenceHealth(req, res);

  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const { sessionUser } = auth.value;

  const limitKey = `domains:user:${sessionUser.sub}`;
  if (isRateLimited(limitKey, REQUESTS_PER_MINUTE, 60_000)) {
    return res.status(429).json({ error: 'Too many domain requests. Please wait a minute.' });
  }
  const durable = await isRateLimitedDurable(limitKey, REQUESTS_PER_MINUTE, 60);
  const durableGuard = applyDurableCostBearingGuard(limitKey, REQUESTS_PER_MINUTE, durable);
  if (durableGuard.limited) return res.status(429).json({ error: 'Too many domain requests. Please wait a minute.' });

  try {
    const { context, task, domain, projectName, sessionId } = req.body;

    /*
     * Connect a custom domain to a published site. Folded into this endpoint
     * (rather than a new serverless function) to stay within the platform's
     * function limit. Adds the domain to the deployment's Vercel project and
     * returns the DNS records the owner must set at their registrar.
     */
    if (task === 'connect') {
      const name = normalizeDomainName(domain);
      if (!name) {
        return res.status(400).json({ error: 'Please enter a valid domain, e.g. my-boutique.com' });
      }
      if (!projectName) return res.status(400).json({ error: 'Publish the site first, then connect a domain.' });

      const ownsProject = await isPublishedSiteOwner(sessionUser.sub, String(projectName));
      if (ownsProject !== true) {
        return res.status(403).json({ error: 'This Vercel project is not owned by your Quantora account.' });
      }

      const confirmation = pclHumanConfirmation(req, ['connect-domain-button']);
      const pcl = await guardPclSideEffect({
        userSub: sessionUser.sub,
        sessionId,
        humanConfirmed: confirmation.confirmed,
        confirmationSource: confirmation.source,
        description: `Attach ${name} to published project ${String(projectName)}`,
        tool: 'vercel.domain.connect',
        args: { domain: name, projectName: String(projectName) },
        scope: `vercel-domain:${String(projectName)}:${name}`,
        risk: 'high',
        reversibility: 'hard',
        sideEffect: 'external',
        requiresApproval: true,
      });
      if (!pcl.canExecute) {
        return res.status(pcl.status === 'require_approval' ? 428 : 409).json({
          error: pcl.status === 'require_approval'
            ? 'Connecting a custom domain requires explicit confirmation immediately before the change.'
            : 'PCL blocked this domain change because the exact side effect is not currently authorized.',
          pcl: { status: pcl.status, actionRef: pcl.actionRef, reasonCode: pcl.reasonCode },
        });
      }

      const vercelToken = await fetchApiGatewayKey('VERCEL') || process.env.VERCEL_ACCESS_TOKEN;
      if (!vercelToken) return res.status(401).json({ error: 'Missing VERCEL_ACCESS_TOKEN in the API Gateway.' });

      const addRes = await fetchWithTimeout(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectName)}/domains`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }, 8_000);
      const addData = await addRes.json().catch(() => ({}));
      // 409 = already attached to this project; treat as success.
      if (!addRes.ok && addRes.status !== 409) {
        return res.status(addRes.status).json({ error: addData?.error?.message || 'Could not attach the domain.' });
      }

      // Apex (example.com) points via an A record; a subdomain (www./shop.)
      // points via CNAME. Give the owner the exact record to add.
      const isApex = name.split('.').length === 2;
      const records = isApex
        ? [{ type: 'A', name: '@', value: '76.76.21.21' }]
        : [{ type: 'CNAME', name: name.split('.')[0], value: 'cname.vercel-dns.com' }];

      const pclEvidenceRecorded = await recordPclExecutionEvidence({
        userSub: sessionUser.sub,
        sessionId,
        actionRef: pcl.actionRef,
        statement: 'Custom domain attached to published Vercel project',
        evidenceRef: name,
        sourceTurn: 'domain-connect-result',
      });

      return res.status(200).json({
        connected: true,
        domain: name,
        verified: Boolean(addData?.verified),
        records,
        pcl: {
          actionRef: pcl.actionRef,
          authorization: pcl.status,
          evidenceRecorded: pclEvidenceRecorded,
        },
      });
    }

    if (typeof context !== 'undefined' && (typeof context !== 'string' || context.length > MAX_CONTEXT_CHARS)) {
      return res.status(400).json({ error: `Context must be text under ${MAX_CONTEXT_CHARS.toLocaleString()} characters.` });
    }

    const apiKey = await fetchApiGatewayKey('GEMINI') || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(401).json({ error: "No API key available for Domains." });
    
    const client = new GoogleGenAI({ apiKey });
    const prompt = `You are an expert branding and domain name generator. Based on the following app context, suggest 5 catchy, short, and highly brandable .com or .app domain names. 
Return ONLY a JSON array of strings, like ["sneakerhub.app", "solevault.com"]. No markdown, no explanation.

CONTEXT:
${context || 'A modern web application'}`;

    const response = await client.models.generateContent({
      /*
       * gemini-flash-latest, not a pinned version.
       *
       * This was pinned to Flash 1.5, a model Google no longer serves: the
       * production key's catalogue lists 53 Gemini models and that is not among
       * them, so every call from here has been a 404 dressed up as a generic
       * failure. The alias is the same one the rest of the codebase uses and
       * Google keeps it pointed at a current model, so it cannot rot the way a
       * pinned id does.
       */
      model: GEMINI_FLASH,
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    });
    
    const text = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
    let domains = [];
    try {
       domains = JSON.parse(text);
    } catch(e) {
       return res.status(502).json({ error: 'The model did not return valid domain suggestions. Please try again.' });
    }

    if (!Array.isArray(domains) || !domains.every((item) => typeof item === 'string')) {
      return res.status(502).json({ error: 'The model returned an invalid domain suggestion format.' });
    }

    return res.status(200).json({ domains });
  } catch (error: any) {
    console.error("Domains API Error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate domains." });
  }
}
