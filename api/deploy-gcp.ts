import { createHash } from 'node:crypto';
import { applyCors, clientIp, isRateLimited } from './_lib/rate-limit.js';
import { requireActiveSession } from "./_lib/authz.js";
import { ownedProjectName } from './_lib/publish-policy.js';
import { guardPclSideEffect, pclHumanConfirmation, recordPclExecutionEvidence } from './_lib/pcl-side-effect-guard.js';
import deployStatus from './_lib/handlers/deploy-status.js';
import { GoogleAuth } from 'google-auth-library';
import archiver from 'archiver';
import { Writable } from 'stream';

const zipVFS = async (vfs: Record<string, { content: string }>): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    const stream = new Writable({
      write(chunk, encoding, next) {
        chunks.push(Buffer.from(chunk));
        next();
      }
    });
    archive.pipe(stream);
    for (const [path, file] of Object.entries(vfs)) {
      archive.append(file.content, { name: path });
    }
    archive.on('error', err => reject(err));
    stream.on('finish', () => resolve(Buffer.concat(chunks)));
    archive.finalize();
  });
};

function vfsFingerprint(vfs: Record<string, { content: string }>): string {
  const hash = createHash('sha256');
  for (const path of Object.keys(vfs).sort()) {
    hash.update(path);
    hash.update('\0');
    hash.update(String(vfs[path]?.content || ''));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export default async function handler(req: any, res: any) {
  // Folded /api/deploy-status rewrite lands here (GET) without a second function.
  if (req.query?.action === 'status') {
    return deployStatus(req, res);
  }

  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (isRateLimited(`deploy-gcp:${clientIp(req)}`, 5, 60_000)) {
    return res.status(429).json({ error: 'Too many GCP deploy attempts. Please wait a minute and try again.' });
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const { sessionUser } = auth.value;

  try {
    const { vfs, projectName = 'quantora-app', sessionId } = req.body || {};
    if (!vfs || typeof vfs !== 'object') return res.status(400).json({ error: "No VFS provided for deployment" });

    const projectId = process.env.GCP_PROJECT_ID;
    const clientEmail = process.env.GCP_CLIENT_EMAIL;
    const privateKey = process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      return res.status(503).json({ error: "GCP deployment is not configured. Add GCP_PROJECT_ID, GCP_CLIENT_EMAIL, and GCP_PRIVATE_KEY to your environment variables." });
    }

    const safeName = ownedProjectName(projectName, sessionUser.sub).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const confirmation = pclHumanConfirmation(req, ['gcp-deploy-button']);
    const pcl = await guardPclSideEffect({
      userSub: sessionUser.sub,
      sessionId,
      humanConfirmed: confirmation.confirmed,
      confirmationSource: confirmation.source,
      description: `Deploy ${safeName} to GCP Cloud Run`,
      tool: 'gcp.cloud-run.deploy',
      args: { projectName: safeName, contentHash: vfsFingerprint(vfs) },
      scope: `gcp:${projectId}:${safeName}`,
      risk: 'high',
      reversibility: 'hard',
      sideEffect: 'external',
      requiresApproval: true,
    });
    if (!pcl.canExecute) {
      return res.status(pcl.status === 'require_approval' ? 428 : 409).json({
        error: pcl.status === 'require_approval'
          ? 'GCP deployment requires explicit confirmation immediately before execution.'
          : 'PCL blocked this deployment because the exact side effect is not currently authorized.',
        pcl: { status: pcl.status, actionRef: pcl.actionRef, reasonCode: pcl.reasonCode },
      });
    }
    
    // Auth
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

    // 1. Create Zip
    const zipBuffer = await zipVFS(vfs);
    
    // 2. Upload to Cloud Storage
    const bucketName = `${projectId}_cloudbuild`;
    
    // Check if bucket exists, if not create it (best effort)
    try {
      await fetch(`https://storage.googleapis.com/storage/v1/b`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: bucketName, location: 'US' })
      });
    } catch (e) {
      // Ignore if exists
    }

    const objectName = `source-${safeName}-${Date.now()}.zip`;
    const uploadRes = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${bucketName}/o?uploadType=media&name=${objectName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.token}`,
        'Content-Type': 'application/zip',
        'Content-Length': zipBuffer.length.toString()
      },
      body: zipBuffer
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.error("GCS Upload Error:", err);
      return res.status(500).json({ error: "Failed to upload source to Cloud Storage." });
    }

    // 3. Trigger Cloud Build using Google Cloud Buildpacks for Cloud Run
    const buildPayload = {
      steps: [
        {
          name: 'gcr.io/k8s-skaffold/pack',
          entrypoint: 'pack',
          args: [
            'build',
            `gcr.io/${projectId}/${safeName}`,
            '--builder',
            'gcr.io/buildpacks/builder:v1',
            '--publish'
          ]
        },
        {
          name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
          entrypoint: 'gcloud',
          args: [
            'run',
            'deploy',
            safeName,
            '--image',
            `gcr.io/${projectId}/${safeName}`,
            '--region',
            'us-central1',
            '--platform',
            'managed',
            '--allow-unauthenticated',
            '--port', '5173'
          ]
        }
      ],
      source: {
        storageSource: {
          bucket: bucketName,
          object: objectName
        }
      }
    };

    const buildRes = await fetch(`https://cloudbuild.googleapis.com/v1/projects/${projectId}/locations/us-central1/builds`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildPayload)
    });

    const buildData = await buildRes.json();
    if (!buildRes.ok) {
      console.error("Cloud Build Error:", buildData);
      return res.status(500).json({ error: buildData.error?.message || "Failed to trigger Cloud Build." });
    }

    const buildId = buildData.metadata.build.id;
    const pclEvidenceRecorded = await recordPclExecutionEvidence({
      userSub: sessionUser.sub,
      sessionId,
      actionRef: pcl.actionRef,
      statement: 'GCP Cloud Run deployment build triggered',
      evidenceRef: buildId,
      sourceTurn: 'gcp-deploy-result',
    });

    return res.status(200).json({
      buildId,
      projectName: safeName,
      status: buildData.metadata.build.status,
      pcl: {
        actionRef: pcl.actionRef,
        authorization: pcl.status,
        evidenceRecorded: pclEvidenceRecorded,
      },
    });

  } catch (error: any) {
    console.error("Deploy API Error:", error);
    return res.status(500).json({ error: error.message || "Failed to trigger deployment." });
  }
}
