# Travel runtime latency fix

Production investigation on 2026-08-19 found ordinary Travel Advisor dialogue repeatedly cycling through dynamically listed Gemini models after Google returned quota/unavailable errors. This caused 20s+ waits and could leave a partially streamed answer when the upstream failed after SSE headers were committed.

## Change

- Ordinary Travel dialogue can prefer a configured OpenRouter conversational model (`openai/gpt-4o-mini`) while preserving the existing Quantora chat/context/conversation engine.
- The routing only activates when a real OpenRouter credential is available.
- User-owned Gemini keys are respected.
- Live flight/hotel/tool-intent turns remain on the tool-capable travel path; this change does not pretend OpenRouter has Duffel execution capabilities.
- Routing is provider-neutral at the Travel workspace boundary; the user never sees model plumbing.

## Why

The Travel Advisor should not inherit provider-specific quota stalls for simple conversational turns such as “I like beaches.” Model providers are replaceable infrastructure; travel context and outcome behavior remain Quantora-owned.
