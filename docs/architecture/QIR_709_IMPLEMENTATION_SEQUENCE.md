# PR #709 implementation sequence

1. Server worker service is enabled by default in production service mode, with explicit opt-out only.
2. Add a server-owned browser submission path that binds Coding Desk context before making the Run runnable.
3. Add durable Run observation/polling and verified workspace reload after worker completion.
4. Cut Coding turns away from browser `/api/chat` execution when server ownership is selected.
5. Feed build/test/runtime failures into durable repair actions until verified or truly exhausted.
6. Unify Git delivery state: branch -> diff -> commit -> push -> pull request.
7. Add end-to-end and soak gates for browser loss, worker crash/reclaim, provider failure/fallback, verification repair and real external repository delivery.
