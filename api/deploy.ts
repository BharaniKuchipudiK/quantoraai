import { fetchApiGatewayKey } from './autocomplete';
import { applyCors, clientIp, isRateLimited } from './_lib/rate-limit.js';
import { requireActiveSession } from "./_lib/authz.js";
import { fetchWithTimeout } from "./_lib/fetch-timeout.js";
import { recordProductEvent, recordPublishedSite } from './_lib/store.js';
import { getRequestGeo } from './_lib/geo.js';
import { ownedProjectName } from './_lib/publish-policy.js';

const MAX_DEPLOYMENT_CHARS = 1_000_000;

export default async function handler(req: any, res: any) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (isRateLimited(`deploy:${clientIp(req)}`, 20, 60_000)) {
    return res.status(429).json({ error: 'Too many deploy attempts. Please wait a minute and try again.' });
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const { sessionUser } = auth.value;

  try {
    const { code, projectName = 'quantora-app' } = req.body || {};
    if (!code || typeof code !== 'string') return res.status(400).json({ error: "No code provided for deployment" });
    if (code.length > MAX_DEPLOYMENT_CHARS) {
      return res.status(413).json({ error: "The site is too large to publish in one file." });
    }

    const vercelToken = await fetchApiGatewayKey('VERCEL');
    if (!vercelToken) {
      return res.status(503).json({ error: "Publishing is not configured yet. Add VERCEL_ACCESS_TOKEN to the API Gateway." });
    }

    const safeName = ownedProjectName(projectName, sessionUser.sub);
    const payload = {
      name: safeName,
      files: [{ file: "index.html", data: code }],
      projectSettings: { framework: null },
    };

    const response = await fetchWithTimeout("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }, 8_000);

    const data = await response.json();

    if (!response.ok) {
      console.error("Vercel Deploy Error:", data);
      return res.status(response.status).json({ error: data.error?.message || "Deployment failed" });
    }

    const url = `https://${data.url}`;
    const ownershipRecorded = await recordPublishedSite({
      userSub: sessionUser.sub,
      projectName: safeName,
      deploymentId: data.id,
      deploymentUrl: url,
    });
    const geo = getRequestGeo(req);
    recordProductEvent({
      userSub: sessionUser.sub,
      eventType: 'publish_completed',
      metadata: {
        url,
        projectName: safeName,
        deploymentId: data.id,
        readyState: data.readyState,
        ...(geo ? { country_code: geo.countryCode, region: geo.region, city: geo.city } : {}),
      },
    });

    return res.status(200).json({
      url,
      deploymentId: data.id,
      readyState: data.readyState,
      projectName: safeName,
      domainConnectionAvailable: ownershipRecorded,
    });

  } catch (error: any) {
    console.error("Deploy API Error:", error);
    return res.status(500).json({ error: error.message || "Failed to trigger deployment." });
  }
}
