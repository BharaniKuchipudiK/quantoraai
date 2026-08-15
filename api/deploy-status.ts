import { applyCors, clientIp, isRateLimited } from './_lib/rate-limit.js';
import { requireActiveSession } from "./_lib/authz.js";
import { GoogleAuth } from 'google-auth-library';

export default async function handler(req: any, res: any) {
  applyCors(req, res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (isRateLimited(`deploy-status:${clientIp(req)}`, 60, 60_000)) {
    return res.status(429).json({ error: 'Too many status checks.' });
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;

  const { buildId } = req.query;
  if (!buildId) return res.status(400).json({ error: "Missing buildId" });

  const projectId = process.env.GCP_PROJECT_ID;
  const clientEmail = process.env.GCP_CLIENT_EMAIL;
  const privateKey = process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    return res.status(503).json({ error: "GCP deployment is not configured." });
  }

  try {
    const googleAuth = new GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
        project_id: projectId
      },
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    const client = await googleAuth.getClient();
    const token = await client.getAccessToken();

    const buildRes = await fetch(`https://cloudbuild.googleapis.com/v1/projects/${projectId}/locations/us-central1/builds/${buildId}`, {
      headers: {
        'Authorization': `Bearer ${token.token}`
      }
    });

    const buildData = await buildRes.json();
    if (!buildRes.ok) {
      return res.status(500).json({ error: buildData.error?.message || "Failed to fetch build status." });
    }

    // Cloud Build statuses: QUEUED, WORKING, SUCCESS, FAILURE, INTERNAL_ERROR, TIMEOUT, CANCELLED
    const status = buildData.status;
    let url = null;

    if (status === 'SUCCESS') {
      // If it succeeded, Cloud Run deployment is done. We can fetch the Cloud Run URL.
      // We need to parse the service name from the build tags or args. Let's assume the service name is in buildData.substitutions or similar.
      // But we can just query the Cloud Run API if we passed the service name, or just let the client try to hit `https://[service-name]-[hash]-uc.a.run.app`.
      // Actually, we can fetch the Cloud Run service URL directly:
      const safeName = buildData.steps[1]?.args[2]; // The service name was the 3rd arg in the gcloud run deploy step
      
      if (safeName) {
         const runRes = await fetch(`https://us-central1-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/${projectId}/services/${safeName}`, {
           headers: { 'Authorization': `Bearer ${token.token}` }
         });
         const runData = await runRes.json();
         if (runRes.ok && runData.status?.url) {
           url = runData.status.url;
         }
      }
    }

    return res.status(200).json({
      status,
      url,
      logUrl: buildData.logUrl
    });

  } catch (error: any) {
    console.error("Deploy Status API Error:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch status." });
  }
}
