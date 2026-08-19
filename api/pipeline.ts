import { GoogleGenAI } from "@google/genai";
import { applyCors, clientIp, isRateLimited } from "./_lib/rate-limit.js";
import { getSessionUser } from "./_lib/session.js";
import { requireActiveSession } from "./_lib/authz.js";
import { fetchApiGatewayKey } from "./autocomplete.js";
import { buildRepositoryPreview } from "./_lib/repository-preview.js";
import { emptyOutcomeState, normalizeOutcomeSessionId, normalizeOutcomeState } from "./_lib/outcome-state.js";
import { appendExplicitHumanLedgerEvent, reconcileOutcomeCognitiveLedger } from "./_lib/cognitive-ledger-transitions.js";
import { deleteOutcomeState, isStoreConfigured, readOutcomeState, saveOutcomeState } from "./_lib/store.js";
import { DEFAULT_PROJECT_ID, normalizeProjectId, normalizeProjectInput, normalizeProjectResources, normalizeProjectSessionIds } from "./_lib/project-state.js";
import { deleteProject, isProjectStoreConfigured, listProjects, readProjectContext, saveProject, syncProjectSessions, upsertProjectResources } from "./_lib/project-store.js";

const RATE_LIMIT_PER_MINUTE = 15;

export default async function handler(req: any, res: any) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionUser = getSessionUser(req);
  const limitKey = sessionUser ? `pipeline:user:${sessionUser.sub}` : `pipeline:ip:${clientIp(req)}`;
  if (isRateLimited(limitKey, RATE_LIMIT_PER_MINUTE, 60_000)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  try {
    const { node, targetStage, repoUrl, task } = req.body || {};

    if (targetStage === 'project-state') {
      const auth = await requireActiveSession(req, res);
      if (!auth.ok) return;
      const { sessionUser: activeSessionUser } = auth.value;
      if (!isProjectStoreConfigured()) {
        return res.status(503).json({ error: 'Project sync is not configured on this deployment.' });
      }

      const action = String(req.body?.action || 'list');
      if (action === 'list') {
        const projects = await listProjects(activeSessionUser.sub);
        return projects === null
          ? res.status(503).json({ error: 'Projects are temporarily unavailable. Your local projects are unchanged.' })
          : res.status(200).json({ projects });
      }

      if (action === 'save') {
        const expectedVersion = req.body?.expectedVersion;
        if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
          return res.status(400).json({ error: 'expectedVersion must be a non-negative integer.' });
        }
        const project = normalizeProjectInput(req.body?.project);
        if (!project) return res.status(400).json({ error: 'A valid project is required.' });
        const result = await saveProject({
          userSub: activeSessionUser.sub,
          expectedVersion,
          project,
        });
        if (result.status === 'conflict') {
          return res.status(409).json({
            error: 'This Project changed in another session. Reload it before retrying.',
            conflict: true,
          });
        }
        if (result.status === 'unavailable') {
          return res.status(503).json({ error: 'Project sync is temporarily unavailable. Your local project is unchanged.' });
        }
        return res.status(200).json({ project: result.record });
      }

      if (action === 'delete') {
        const projectId = normalizeProjectId(req.body?.projectId);
        if (!projectId) return res.status(400).json({ error: 'A valid projectId is required.' });
        if (projectId === DEFAULT_PROJECT_ID) {
          return res.status(400).json({ error: 'The default Personal Workspace cannot be deleted.' });
        }
        const deleted = await deleteProject(activeSessionUser.sub, projectId);
        return deleted
          ? res.status(200).json({ deleted: true, projectId })
          : res.status(503).json({ error: 'Project could not be deleted. Please try again.' });
      }

      if (action === 'sync-resources') {
        const projectId = normalizeProjectId(req.body?.projectId);
        if (!projectId) return res.status(400).json({ error: 'A valid projectId is required.' });
        const resources = normalizeProjectResources(req.body?.resources);
        const synced = await upsertProjectResources({
          userSub: activeSessionUser.sub,
          projectId,
          resources,
        });
        return synced
          ? res.status(200).json({ synced: true, count: resources.length })
          : res.status(503).json({ error: 'Project resources could not be synchronized. Local artifacts are unchanged.' });
      }

      if (action === 'sync-sessions') {
        const projectId = normalizeProjectId(req.body?.projectId);
        if (!projectId) return res.status(400).json({ error: 'A valid projectId is required.' });
        const sessionIds = normalizeProjectSessionIds(req.body?.sessionIds);
        const synced = await syncProjectSessions({
          userSub: activeSessionUser.sub,
          projectId,
          sessionIds,
        });
        return synced
          ? res.status(200).json({ synced: true, count: sessionIds.length })
          : res.status(503).json({ error: 'Project conversations could not be synchronized. Your local chats are unchanged.' });
      }

      if (action === 'context') {
        const projectId = normalizeProjectId(req.body?.projectId);
        if (!projectId) return res.status(400).json({ error: 'A valid projectId is required.' });
        const context = await readProjectContext(activeSessionUser.sub, projectId);
        return context
          ? res.status(200).json({ context })
          : res.status(503).json({ error: 'Project context is temporarily unavailable. The current conversation is unchanged.' });
      }

      return res.status(400).json({ error: 'Invalid Project action.' });
    }

    if (targetStage === 'outcome-state') {
      const auth = await requireActiveSession(req, res);
      if (!auth.ok) return;
      const { sessionUser: activeSessionUser } = auth.value;
      if (!isStoreConfigured()) return res.status(503).json({ error: 'Outcome Memory is not configured on this deployment.' });

      const sessionId = normalizeOutcomeSessionId(req.body?.sessionId);
      if (!sessionId) return res.status(400).json({ error: 'A valid sessionId is required.' });
      const action = req.body?.action || 'get';

      if (action === 'get') {
        const record = await readOutcomeState(activeSessionUser.sub, sessionId);
        return res.status(200).json(record || { sessionId, version: 0, state: emptyOutcomeState() });
      }

      if (action === 'delete') {
        const deleted = await deleteOutcomeState(activeSessionUser.sub, sessionId);
        return deleted
          ? res.status(200).json({ deleted: true, sessionId })
          : res.status(503).json({ error: 'Outcome Memory could not be deleted. Please try again.' });
      }

      if (action === 'save') {
        const expectedVersion = req.body?.expectedVersion;
        if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
          return res.status(400).json({ error: 'expectedVersion must be a non-negative integer.' });
        }
        const incomingState = normalizeOutcomeState(req.body?.state);
        if (!incomingState.memory.consented) {
          return res.status(400).json({ error: 'Outcome Memory requires explicit consent before saving.' });
        }
        const sourceTurn = typeof req.body?.sourceTurn === 'string' ? req.body.sourceTurn.slice(0, 128) : null;
        const previousRecord = await readOutcomeState(activeSessionUser.sub, sessionId);
        const state = reconcileOutcomeCognitiveLedger(
          previousRecord?.state || emptyOutcomeState(),
          incomingState,
          { sourceTurn },
        );
        const result = await saveOutcomeState({
          userSub: activeSessionUser.sub,
          sessionId,
          expectedVersion,
          state,
          sourceTurn,
        });
        if (result.status === 'conflict') {
          return res.status(409).json({
            error: 'Outcome Memory changed in another session. Reload it before retrying.',
            conflict: true,
          });
        }
        if (result.status === 'unavailable') {
          return res.status(503).json({ error: 'Outcome Memory is temporarily unavailable. Your local conversation is unchanged.' });
        }
        return res.status(200).json(result.record);
      }

      if (action === 'append-ledger') {
        const expectedVersion = req.body?.expectedVersion;
        if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
          return res.status(400).json({ error: 'expectedVersion must be a non-negative integer.' });
        }
        const currentRecord = await readOutcomeState(activeSessionUser.sub, sessionId);
        if (!currentRecord || !currentRecord.state.memory.consented) {
          return res.status(400).json({ error: 'Outcome Memory consent is required before recording cognitive history.' });
        }
        const sourceTurn = typeof req.body?.sourceTurn === 'string' ? req.body.sourceTurn.slice(0, 128) : null;
        const state = appendExplicitHumanLedgerEvent(currentRecord.state, req.body?.entry, { sourceTurn });
        if (!state) {
          return res.status(400).json({ error: 'A valid decision, rejection, correction, or approval entry is required.' });
        }
        const result = await saveOutcomeState({
          userSub: activeSessionUser.sub,
          sessionId,
          expectedVersion,
          state,
          sourceTurn,
        });
        if (result.status === 'conflict') {
          return res.status(409).json({
            error: 'Outcome Memory changed in another session. Reload it before retrying.',
            conflict: true,
          });
        }
        if (result.status === 'unavailable') {
          return res.status(503).json({ error: 'Cognitive history is temporarily unavailable. No local state was changed.' });
        }
        return res.status(200).json(result.record);
      }

      return res.status(400).json({ error: 'Invalid Outcome Memory action.' });
    }

    /*
     * Keep this read-only workflow inside the existing pipeline function.
     * Vercel Hobby permits twelve serverless functions; a dedicated endpoint
     * would make thirteen. The URL is rewritten here in vercel.json, while the
     * local Express server keeps its friendly /api/github/preview route.
     */
    if (targetStage === 'repository-preview') {
      try {
        const preview = await buildRepositoryPreview(repoUrl, task);
        return res.status(200).json(preview);
      } catch (error: any) {
        return res.status(400).json({ error: error?.message || "Could not prepare the repository preview." });
      }
    }
    
    // Auth Check
    const mayUseServerKeys = Boolean(sessionUser);
    const effectiveGeminiKey = mayUseServerKeys ? await fetchApiGatewayKey('GEMINI') || process.env.GEMINI_API_KEY : undefined;

    if (!effectiveGeminiKey && !sessionUser) {
      return res.status(401).json({ error: "Please sign in to use Quantora's AI execution pipeline." });
    }

    if (!effectiveGeminiKey) {
      return res.status(500).json({ error: "Server is missing Gemini API Key configuration." });
    }

    let systemPrompt = "";
    let userPrompt = "";

    if (targetStage === 'idea') {
      systemPrompt = `You are an elite Solutions Architect. 
Your job is to take a raw user dream/prompt and output a strict JSON Architecture Spec.
You MUST output ONLY valid JSON, no markdown formatting blocks, no explanations.
Schema:
{
  "title": "App Name",
  "techStack": ["React", "Vite", "etc"],
  "keyFeatures": ["feature 1", "feature 2"],
  "dataModels": [{"name": "User", "fields": ["id", "name"]}]
}`;
      userPrompt = `Raw Dream: ${node.dreamText || node.sourceText}`;
    } else if (targetStage === 'thought') {
      systemPrompt = `You are an elite Senior React Developer. 
Your job is to take an Architecture Spec (JSON) and write the core React Component Code for it.
Do not write out setup instructions. Just write the raw, beautiful, glassmorphic React code. 
Return ONLY code inside a single \`\`\`jsx block.`;
      userPrompt = `Architecture Spec: ${JSON.stringify(node.ideaSpec)}`;
    } else if (targetStage === 'action') {
      systemPrompt = `You are a DevOps and Deployment Expert. 
Your job is to take a React Component Code block and output a deployment JSON spec.
You MUST output ONLY valid JSON, no markdown formatting blocks, no explanations.
Schema:
{
  "platform": "Vercel | Netlify | Cloudflare",
  "buildCmd": "Build command to use",
  "envVars": ["Array of required env var names"],
  "summary": "Short deployment summary"
}`;
      userPrompt = `React Code:\n${node.thoughtCode}`;
    } else {
      return res.status(400).json({ error: "Invalid target stage" });
    }

    const client = new GoogleGenAI({ apiKey: effectiveGeminiKey });
    
    // Use gemini-3.5-flash as the fast, reliable model for pipeline tasks
    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2,
      },
    });

    let reply = response.text || "";

    // Clean up output depending on stage
    if (targetStage === 'idea') {
      // Strip markdown if AI misbehaves
      reply = reply.replace(/```json/g, '').replace(/```/g, '').trim();
      let parsedJson;
      try {
        parsedJson = JSON.parse(reply);
      } catch(e) {
        // Fallback fake json if parsing fails
        parsedJson = { title: "Generated Idea", error: "Failed to parse AI output as JSON", raw: reply };
      }
      return res.status(200).json({ ideaSpec: parsedJson });
    } else if (targetStage === 'thought') {
      return res.status(200).json({ thoughtCode: reply });
    } else if (targetStage === 'action') {
      reply = reply.replace(/```json/g, '').replace(/```/g, '').trim();
      let parsedAction;
      try {
        parsedAction = JSON.parse(reply);
      } catch(e) {
        parsedAction = { platform: "Unknown", error: "Failed to parse action output as JSON", raw: reply };
      }
      return res.status(200).json({ actionSpec: parsedAction });
    }

  } catch (err: any) {
    console.error("Error in /api/pipeline:", err);
    return res.status(500).json({
      error: err.message || "Failed to execute pipeline step."
    });
  }
}