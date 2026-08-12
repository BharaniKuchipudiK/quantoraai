import { fetchApiGatewayKey } from './autocomplete';
import { applyCors, clientIp, isRateLimited } from './_lib/rate-limit.js';
import { getSessionUser } from './_lib/session.js';
import { recordProductEvent } from './_lib/store.js';

export default async function handler(req: any, res: any) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (isRateLimited(`deploy:${clientIp(req)}`, 20, 60_000)) {
    return res.status(429).json({ error: 'Too many deploy attempts. Please wait a minute and try again.' });
  }

  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    return res.status(401).json({ error: 'Sign in to publish your site to Vercel.' });
  }

  try {
    const { code, projectName = 'quantora-app' } = req.body;
    if (!code) return res.status(400).json({ error: "No code provided for deployment" });

    const vercelToken = await fetchApiGatewayKey('VERCEL');
    if (!vercelToken) {
      return res.status(503).json({ error: "Publishing is not configured yet. Add VERCEL_ACCESS_TOKEN to the API Gateway." });
    }

    const safeName = String(projectName).substring(0, 50).replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase().replace(/^-+|-+$/g, '') || 'quantora-app';
    const payload = {
      name: safeName,
      files: [{ file: "index.html", data: code }],
      projectSettings: { framework: null },
    };

    const response = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Vercel Deploy Error:", data);
      return res.status(response.status).json({ error: data.error?.message || "Deployment failed" });
    }

    const url = `https://${data.url}`;
    recordProductEvent({
      userSub: sessionUser.sub,
      eventType: 'publish_completed',
      metadata: {
        url,
        projectName: safeName,
        deploymentId: data.id,
        readyState: data.readyState,
      },
    });

    return res.status(200).json({
      url,
      deploymentId: data.id,
      readyState: data.readyState,
      projectName: safeName,
    });

  } catch (error: any) {
    console.error("Deploy API Error:", error);
    return res.status(500).json({ error: error.message || "Failed to trigger deployment." });
  }
}
