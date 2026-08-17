# Production release guardrails

- Never push directly to `main` for production fixes.
- Use a branch + PR + CI + Vercel preview + human acceptance.
- A successful Vercel deployment does not override a failed GitHub CI run.
- Do not merge while required tests are red.
- Transactional features must fail closed: no fabricated external-action success.
