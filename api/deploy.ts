import { fetchApiGatewayKey } from './autocomplete';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { code, projectName = 'quantora-app' } = req.body;
    if (!code) return res.status(400).json({ error: "No code provided for deployment" });

    // Fetch Vercel token from Supabase vault
    const vercelToken = await fetchApiGatewayKey('VERCEL');
    if (!vercelToken) {
      return res.status(401).json({ error: "Missing VERCEL_ACCESS_TOKEN in API Gateway." });
    }

    /*
     * Quantora builds self-contained HTML documents, so we publish them as a
     * STATIC site (a single index.html) rather than wrapping the code in a
     * Create-React-App project. Static deploys need no build step, are on
     * Vercel's free tier, and — critically — actually render what the user saw
     * in the preview. (The old CRA payload dropped an HTML document into
     * src/App.js, which cannot compile as a React component.)
     */
    const safeName = String(projectName).substring(0, 50).replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase() || 'quantora-app';
    const payload = {
      name: safeName,
      files: [
        {
          file: "index.html",
          data: code,
        },
      ],
      projectSettings: {
        framework: null,
      },
    };

    // Make the Vercel API Request
    const response = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error("Vercel Deploy Error:", data);
      return res.status(response.status).json({ error: data.error?.message || "Deployment failed" });
    }

    return res.status(200).json({
      url: `https://${data.url}`,
      deploymentId: data.id,
      readyState: data.readyState,
      // The Vercel project the deployment landed in — needed to attach a
      // custom domain to it later (see the "connect" action in api/domains).
      projectName: safeName
    });

  } catch (error: any) {
    console.error("Deploy API Error:", error);
    return res.status(500).json({ error: error.message || "Failed to trigger deployment." });
  }
}
