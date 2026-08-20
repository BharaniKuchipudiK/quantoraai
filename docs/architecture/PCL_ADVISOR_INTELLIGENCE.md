# PCL Advisor Intelligence v1

Quantora domains may look radically different, but they must share one agentic behavior contract.

## Platform loop

`Understand -> Diagnose -> Advise -> Act -> Verify -> Learn`

PCL owns the user-facing advisor relationship and governance. Domain adapters contribute structured evidence, gaps, dependencies and candidate interventions. Specialist agents/tools remain replaceable workers behind the Agent Execution Fabric.

## Advisor contract

Every participating domain can provide:

- target outcome
- bounded evidence
- current-state summary
- gaps and root-cause/dependency relationships
- candidate interventions
- expected benefit, urgency, dependency leverage, confidence and time cost
- verification criteria

The platform normalizes and ranks interventions through a configurable policy. The model does not choose a next action from intuition alone and does not invent unsupported state.

## Study as the first deep adopter

Study introduces a curriculum-neutral concept/prerequisite graph plus learner mastery evidence. The first adapter supports bottom-up diagnosis:

1. start from the target concept/exam outcome
2. traverse known prerequisites
3. identify weak concepts with evidence
4. mark the deepest confirmed weak prerequisite as a root cause
5. detect confident misconception signals separately from ordinary low mastery
6. treat missing prerequisite evidence as a diagnostic gap, not as a fabricated weakness
7. propose a repair/diagnostic intervention
8. rank the next-best intervention by expected benefit, urgency, dependency leverage, confidence and time efficiency
9. require fresh retrieval/application/transfer evidence before claiming improvement

Example:

`Projectile Motion -> Vector Decomposition -> Trigonometric Component Interpretation`

If all three are weak and the deepest confirmed gap is trigonometric component interpretation, the advisor recommends repairing that foundation before assigning more Projectile Motion practice.

## Agent Fabric integration

Education planning uses the existing Agent Execution Fabric. The plan adds provider-neutral `advisor_intelligence` and `learning_intelligence` capabilities under a `diagnostician` role, then synthesizes and verifies the recommendation. This is not a separate Tutor orchestrator.

External runtimes such as Quantora-native logic, Gemini/LearnLM, Claude Agent SDK, OpenAI Agents, Google ADK/A2A or future providers can implement these capabilities without changing PCL.

## Safety and truth boundaries

- scores are evidence, not advice
- no mastery percentage may be invented when evidence is missing
- gaps must retain evidence references
- consequential actions remain subject to existing PCL approval/evidence gates
- ranking policy is configurable; domain logic does not hardcode a provider
- no new persistence or hidden memory store is introduced in v1
- no autonomous student action or curriculum ingestion is activated in v1

## Next implementation sequence

1. persist versioned concept/curriculum graphs through the existing data architecture
2. define mastery-evidence events (correctness, difficulty, hints, response time, confidence, transfer, retention)
3. add deterministic/probabilistic mastery estimation (start interpretable: IRT/BKT style)
4. add source intelligence for YouTube/audio/PDF/notes with provenance
5. connect official Singapore/India curriculum overlays
6. register Study advisor runtime adapters under the Agent Fabric
7. benchmark tutor models on learning gain, not prose quality
8. add spaced-retrieval/retention scheduling and exam-readiness strategy

Core law:

**Evidence describes where you are. Gap intelligence explains what holds you back. PCL recommends what to do next. Agents help execute. Verification proves improvement.**
