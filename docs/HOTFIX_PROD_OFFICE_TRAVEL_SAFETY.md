# Production Office + Travel Safety Hotfix

This hotfix is intentionally isolated from `main` until CI and human review are complete.

## Office image contract

- Support the installed Jimp 0.16.x API and remain forward-compatible with the Jimp 1.x export shape.
- Exercise the real raster decode/resize/re-encode path in CI.
- A failed resize may fall back to original bytes with honest MIME/dimensions, but must never silently claim that resizing succeeded.

## Travel tool contract

- Travel tools are injected only when the PCL/Studio domain is explicitly `travel`.
- Read-only provider calls may return `unavailable`; they must never substitute hard-coded/mock results as live data.
- Booking, ticketing, purchase, and background price-alert tools are not exposed to the model in this build.
- Defensive execution of a transactional tool must return `executed: false` and must never fabricate confirmation codes, PNRs, tickets, alerts, or success messages.
- Any future transaction flow must require explicit human confirmation immediately before provider execution and provider-confirmed success afterward.

## Release gate

Do not merge this branch unless typecheck, lint, full tests, production build, dependency audit, Vercel preview deployment, and a human Office/travel smoke test are green.
