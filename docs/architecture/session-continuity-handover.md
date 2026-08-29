# Session continuity and handover

Status: isolated refinement on the Study draft branch. This contract does not
change model routing, production configuration, provider limits, or durable PCL
memory consent.

## Current user-journey constraints

| Surface | Current behavior / hard boundary | Journey consequence |
|---|---|---|
| Composer attachments | File picker permits multiple files and does not declare an `accept` filter. Only browser-recognized images at or below 3 MB are read into a data URL. Other files remain display-only metadata. | PDF, Word, PowerPoint, Excel, text, and unknown files can appear attached even though chat cannot read their contents. |
| Vision request | At most 4 images and 3,500,000 encoded characters total. The server independently takes at most 4 `data:image/*` values. | A file accepted by the 3 MB picker can still exceed the encoded request budget; exclusions are reported. There is no pixel-dimension or image-count guard at selection time. |
| PDF / document ingestion | No PDF parser or general document-ingestion route is wired to ordinary chat. Office generation creates or refines `.pptx`, `.docx`, and `.xlsx`; it does not ingest uploaded Office files. | A visible document attachment is not evidence that the model read it. |
| Office generation | Prompt: 100,000 characters. Supplied/base specification: 3,000,000 serialized bytes. Verified binary transfer budget: 2,800,000 bytes. Office history: last 12 messages, each text clipped to 6,000 characters; prior spec clipped to 22,000 characters. | Large revisions can be rejected or receive bounded prior context. Word and PowerPoint may receive readable image attachments; Excel does not embed them. |
| Chat message | 200,000 characters server-side. Moderation accepts 50,000 characters. | In practice the moderation boundary is reached before the chat boundary for an ordinary typed turn. |
| Conversation history | Client send budget: 1,200,000 serialized characters. Server count budget: last 100 items. Old bulk is shortened first, then oldest messages are dropped; the recent exchange is protected where possible. | A long session previously became sendable by losing context reactively. It had no structured route into a fresh session. |
| Model context and tokens | Live model context windows are catalog metadata, but chat does not currently reserve or enforce a provider-specific input/output token budget. Usage telemetry estimates tokens from text length when exact usage is unavailable. | Quantora cannot truthfully promise a turn count or exact remaining-token number. Session pressure must be based on platform-observable limits until provider-aware accounting is wired. |
| Long-running turn | Chat server budget: 165 seconds under a 180-second host boundary; client deadline: 175 seconds. Provider stream idle boundary: 20 seconds. Maximum agent steps: 5. | A single turn is bounded, while a follow-up loop can continue indefinitely until history/storage pressure appears. |
| Browser persistence | Chats are stored in local storage. Desk snapshots are capped at 800,000 characters; quota recovery drops regenerable desk snapshots oldest-first. Typical browser origin quota is treated as roughly 5 MB, not a guaranteed standard. | Conversation history is prioritized, but device/browser storage can still degrade and is not the durable project authority. |
| Existing cross-chat mechanisms | `@LastSession` copies up to 5,000 characters from another transcript into the current prompt. Session Context keeps a goal, an understanding field, and up to 16 short facts. PCL Outcome State is durable only with explicit memory consent. Project Outcome Graph carries bounded cross-chat project context. | `@LastSession` is manual and transcript-shaped; PCL/project continuity exists, but there was no pressure-triggered, reversible session handover. |

`advisor-thread.js` also contains a fixed warning at 20 user turns for Travel and
Study. It is not wired into the runtime UI, has no summary or handover action,
and therefore is not treated as an existing continuity mechanism.

## Contract

`src/lib/session-continuity.js` owns the new boundary.

```text
OBSERVE raw transcript before trimming
  → ASSESS bytes + item count + actual trim/drop evidence
  → stable | watch | handover_recommended
  → BUILD bounded handover state
  → PRESENT one dismissible chip
  → HUMAN accepts or dismisses
  → CREATE child chat in the same project/domain
  → preserve source chat and parent lineage
```

The handover contains only:

- source, project, domain and version identity;
- machine reason codes and observed metrics;
- normalized goal and current understanding;
- at most 8 established facts;
- at most 3 recent user intents, 280 characters each;
- the normalized Session Context used to seed the child chat.

It deliberately contains no copied assistant transcript, generated artifact
payload, credential, fixed assistant speech, or implicit durable-memory consent.

## Trigger policy

- `watch`: at least 70% of either the 1.2 MB history-send budget or the 100-item server budget.
- `handover_recommended`: at least 85% of either budget, or any actual history trim/drop.
- One unresolved handover offer per session. After dismissal, another offer is
  permitted only when pressure rises by at least 10 percentage points or
  additional transcript trimming/dropping occurs.

The thresholds are policy constants and can be tuned independently of the UI.
They are not claims about a selected provider's context window.

## Rollback boundary

The refinement is additive and reversible:

1. remove the continuity chip wiring from `AiStudio`;
2. remove handover creation from `useStudioSession`;
3. remove the pressure contract from `useChatStream`.

Existing sessions, source transcripts, project state, PCL memory, Study evidence,
and model routing remain valid. Accepting a handover creates a child; it never
renames, truncates, migrates, or deletes the source session.
