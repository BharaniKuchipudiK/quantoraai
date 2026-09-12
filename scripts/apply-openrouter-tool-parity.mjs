import { readFileSync, writeFileSync } from 'node:fs';

const path = 'api/_lib/chat-handler.ts';
let source = readFileSync(path, 'utf8');

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`provider parity patch: missing ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`provider parity patch: ${label} is ambiguous`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

if (source.includes("import { runOpenRouterToolAgent } from './openrouter-tool-agent.js';")) {
  console.log('provider parity patch already applied');
  process.exit(0);
}

replaceOnce(
  "import { appendFunctionResponse, extractSignedFunctionTurn } from './gemini-tool-turn.js';\n",
  "import { appendFunctionResponse, extractSignedFunctionTurn } from './gemini-tool-turn.js';\nimport { runOpenRouterToolAgent } from './openrouter-tool-agent.js';\n",
  'OpenRouter tool-agent import',
);

replaceOnce(
  "    const githubToolsEnabled = shouldEnableGithubTools({ hasGithubConnection: Boolean(githubPrincipal) })\n      && Boolean(effectiveGeminiKey);",
  "    const githubToolsEnabled = shouldEnableGithubTools({ hasGithubConnection: Boolean(githubPrincipal) })\n      && Boolean(effectiveGeminiKey || effectiveOpenRouterKey);",
  'GitHub provider gate',
);
replaceOnce(
  "    }) && Boolean(effectiveGeminiKey);\n    /*\n     * The platform's shared Vercel token",
  "    }) && Boolean(effectiveGeminiKey || effectiveOpenRouterKey);\n    /*\n     * The platform's shared Vercel token",
  'GitHub write provider gate',
);
replaceOnce(
  "    const vercelToolsEnabled = shouldEnableVercelTools({ vercelConfigured: Boolean(vercelToken) })\n      && Boolean(effectiveGeminiKey);",
  "    const vercelToolsEnabled = shouldEnableVercelTools({ vercelConfigured: Boolean(vercelToken) })\n      && Boolean(effectiveGeminiKey || effectiveOpenRouterKey);",
  'Vercel provider gate',
);
replaceOnce(
  "      sandboxConfigured: Boolean(sandboxCredentials),\n    }) && Boolean(effectiveGeminiKey);",
  "      sandboxConfigured: Boolean(sandboxCredentials),\n    }) && Boolean(effectiveGeminiKey || effectiveOpenRouterKey);",
  'Sandbox provider gate',
);

replaceOnce(
  "      toolDeadlineAt: startTime + TOOL_TIME_BUDGET_MS,\n    };\n    const textCapabilities = visionImages.length",
  "      toolDeadlineAt: startTime + TOOL_TIME_BUDGET_MS,\n    };\n    const repositoryAgentToolsEnabled = githubToolsEnabled\n      || githubWriteToolsEnabled\n      || vercelToolsEnabled\n      || sandboxToolsEnabled;\n    const textCapabilities = visionImages.length",
  'repository agent tool enablement',
);

replaceOnce(
  "    if (!travelToolsEnabled) {",
  "    if (!travelToolsEnabled && !repositoryAgentToolsEnabled) {",
  'provider-neutral text-only branch gate',
);

const openRouterToolBranch = `    if (repositoryAgentToolsEnabled) {
      /*
       * #712: OpenRouter/Nemotron uses the SAME registry and dispatcher as
       * Gemini. This branch is only a provider protocol adapter: declarations,
       * enablement, permission and execution authority stay in tool-registry.
       * Travel remains on its existing Gemini-specific path for now because its
       * live capability is explicitly routed as travel-tools.
       */
      const toolMessages = [
        { role: 'system', content: finalSystemPrompt },
        ...(boundedHistory || []).map((item: any) => ({
          role: item.role === 'model' || item.role === 'assistant' || item.sender === 'ai' ? 'assistant' : 'user',
          content: item.text || item.content || '',
        })),
      ];
      toolMessages.push({
        role: 'user',
        content: visionImages.length
          ? [
              ...visionImages.map((url: string) => ({ type: 'image_url', image_url: { url } })),
              { type: 'text', text: refineUserMessage },
            ]
          : refineUserMessage,
      });

      const openRouterToolAttempts = attempts.filter((attempt) => attempt.provider === 'openrouter');
      let toolAgentResult: Awaited<ReturnType<typeof runOpenRouterToolAgent>> | null = null;
      let toolAgentModel = '';
      let toolAgentFallbackUsed = false;
      let toolAgentLastError: any = null;
      const hasTurnAttempt = Object.prototype.hasOwnProperty.call(req.body || {}, 'turnAttempt');
      const toolContext: QuantoraToolContext = {
        ...activeToolContext,
        recentUserTexts: recentUserTextsFromChat(boundedHistory, message),
        ...(hasTurnAttempt ? { turnAttempt: Math.max(1, Number(req.body?.turnAttempt) || 1) } : {}),
      };

      for (let index = 0; index < openRouterToolAttempts.length; index += 1) {
        assertBudget(startTime, turnBudgetMs, 'chat turn');
        const attempt = openRouterToolAttempts[index];
        const resolved = resolveOpenRouterModelId(attempt.id);
        if (resolved.error) {
          toolAgentLastError = new Error(resolved.error);
          continue;
        }
        try {
          toolAgentResult = await runOpenRouterToolAgent({
            key: effectiveOpenRouterKey,
            modelId: resolved.slug as string,
            messages: toolMessages,
            temperature: dynamicTemperature,
            grounding,
            toolContext,
            maxSteps: MAX_AGENT_STEPS,
            modelDeadlineAt: startTime + turnBudgetMs,
            streamCommitted: () => sse.isCommitted,
            onToolState: ({ tool, state }) => sse.status({ phase: 'tool', state, tool }),
          });
          toolAgentModel = resolved.slug as string;
          toolAgentFallbackUsed = index > 0;
          await recordInferenceRouteSuccess(providerCircuitStore, attempt);
          break;
        } catch (error: any) {
          toolAgentLastError = error;
          if (error && typeof error === 'object' && !error.gateway) error.gateway = 'openrouter';
          spentEngineIds.add(attempt.id);
          const status = Number(error?.status || 500);
          await recordInferenceRouteFailure(providerCircuitStore, attempt, status, Date.now(), { billing: isBillingRefusal(error) });
          const next = openRouterToolAttempts[index + 1];
          if (
            index >= openRouterToolAttempts.length - 1
            || !shouldFallbackBeforeStreaming(error, {
              currentGateway: 'openrouter',
              nextGateway: next ? 'openrouter' : undefined,
            })
          ) throw error;
        }
      }

      if (!toolAgentResult || !toolAgentModel) {
        throw toolAgentLastError || new Error('OpenRouter did not return a tool-capable response.');
      }

      let fullReply = toolAgentResult.text;
      if (toolAgentResult.status === 'paused' && toolAgentResult.toolResult?.status !== 'unavailable') {
        fullReply = \`**Clarifying Question:** \${fullReply}\`;
      }
      if (!fullReply.trim()) {
        throw Object.assign(new Error('OpenRouter tool agent returned an empty final response.'), { status: 502, gateway: 'openrouter' });
      }
      sse.text(fullReply);

      const latencyMs = Date.now() - startTime;
      logTelemetry(toolAgentModel, latencyMs, fullReply.length, 'OpenRouter', activeSessionUser?.sub ?? null, !openRouterKey && mayUseServerKeys, telemetryContext, req);
      const finish = classifyFinish(toolAgentResult.finishReason);
      const outcome = ledgerOutcomeFor(finish);
      if (outcome) {
        recordModelQualityEvent({
          requestId,
          modelId: toolAgentModel,
          taskCategory,
          outcome,
          latencyMs,
          fallbackFrom: toolAgentFallbackUsed ? modelId : fallbackFrom,
        });
      }
      sse.done({
        provider: \`OpenRouter (\${modelName || toolAgentModel})\`,
        latencyMs,
        modelId: toolAgentModel,
        requestId,
        correlationId,
        finish,
        attachments: attachmentSummary,
        liveConnected: true,
        fallbackUsed: toolAgentFallbackUsed,
        conversation: conversationMetadata(fullReply, finish),
        toolCalls: toolAgentResult.toolCalls,
        ...(travelDegraded ? { travelDegraded: true } : {}),
      });
      return;
    }

`;

replaceOnce(
  "    if (!effectiveOpenRouterKey) {\n      return res.status(401).json({ error: `No OpenRouter API key configured.`, requiresKey: \"openrouter\" });\n    }\n\n    const formattedHistory = [",
  "    if (!effectiveOpenRouterKey) {\n      return res.status(401).json({ error: `No OpenRouter API key configured.`, requiresKey: \"openrouter\" });\n    }\n\n" + openRouterToolBranch + "    const formattedHistory = [",
  'OpenRouter agent branch',
);

writeFileSync(path, source);
console.log('provider parity patch applied');
