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

    // Prepare Vercel deployment payload
    const payload = {
      name: projectName.substring(0, 50).replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase(),
      files: [
        {
          file: "package.json",
          data: JSON.stringify({
            name: projectName,
            version: "1.0.0",
            scripts: {
              "start": "react-scripts start",
              "build": "react-scripts build",
            },
            dependencies: {
              "react": "^18.2.0",
              "react-dom": "^18.2.0",
              "react-scripts": "5.0.1"
            }
          })
        },
        {
          file: "public/index.html",
          data: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${projectName}</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>`
        },
        {
          file: "src/index.js",
          data: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`
        },
        {
          file: "src/App.js",
          data: code
        },
        {
          file: "src/styles.css",
          data: "body { font-family: sans-serif; margin: 0; padding: 20px; background: #f8fafc; }"
        }
      ],
      projectSettings: {
        framework: "create-react-app"
      }
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
      readyState: data.readyState
    });

  } catch (error: any) {
    console.error("Deploy API Error:", error);
    return res.status(500).json({ error: error.message || "Failed to trigger deployment." });
  }
}
