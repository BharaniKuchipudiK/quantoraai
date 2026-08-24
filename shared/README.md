# Shared FE/BE modules
#
# Pure TypeScript/JavaScript used by both Vite (client) and the API/server.
# Prefer relative imports from `api/` (`../../shared/...`) so Vercel serverless
# resolution stays simple. Vite also aliases `@shared` → `shared/`.
#
# Keep browser-only (`localStorage`, DOM) and Node-only (`node:crypto`, DB)
# code out of this tree. Old paths under `src/lib/` and `api/_lib/` re-export
# these modules as shims during the migration.
