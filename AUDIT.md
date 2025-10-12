# Project Audit — CateCollect (Comprehensive, 2025-10-12)

## Overview
- **Backend:** Express + Knex (PostgreSQL), Node ESM
- **Frontend:** AngularJS 1.x, served by Express (CSP-safe; local assets)
- **Current Features:** Carriers, Claims CRUD, Documents, Uploads (single/bulk), health check
- **Env/Config:** `.env` with PG settings; `knexfile.cjs` plain config
- **Dev:** nodemon workflow; seeds & migrations present
- **Infra:** `docker-compose.yml` (baseline), `infra/` placeholder

## Strengths
- Clear modular routes (`/api/carriers`, `/api/claims`, `/api/documents`, `/api/uploads`)
- Central error middleware with DB conflict mapping
- Frontend scaffold with claims list/detail/new; API service abstraction
- Seeds for carriers; helpful `scripts/db-doctor.js`
- Monorepo-friendly static serving with auto detection of `web/`

## Gaps / Risks (prioritized)
1. **Documents deduplication:** `documents` lacks file hash/size; risk of duplicates.
2. **Workflow events:** Routes reference `workflow_events` but migration/table is missing -> runtime errors if used.
3. **Uploads:** No antivirus or MIME validation; allowlist/size caps advisable.
4. **Auth:** No auth/roles; all routes open (OK for pilot, not prod).
5. **Logs/Observability:** No structured logging or request ID; limited audit trails.
6. **Backups:** No codified DB/claims-folder backup plan.
7. **EMS/CCC ingest:** Not yet integrated in this zip (we have code ready to add).

## Database (observed from migrations)
- `carriers` (unique name index added)
- `claims` (ref_code, archive flags; later migration adds notes/archive/logical fields)
- `documents` (unique index improvements)
- **Missing:** `workflow_events`; `ccc_files`/`ccc_metadata` (for ingest)

## Frontend
- Angular routes: Dashboard, Claims list/detail/new; Upload service & API service present.
- Nice: CSP-safe (helmet defaults); dev exposes `/node_modules` for local scripts only.

## Security posture
- Helmet default headers; CORS `'*'` (OK for dev; restrict in prod).
- No auth; suggest JWT + roles for shop staff.
- Consider rate-limiting on uploads and API.

## What changed recently (based on timestamps)
- Migrations Oct 6–8 (carriers unique, documents unique, claims extra fields).
- README/ROADMAP present but need alignment with CCC ingest path.

## Recommended Fixes / Enhancements
### P0 (today)
- Add `workflow_events` migration + minimal logging APIs.
- Add `ccc_files` & `ccc_metadata` tables and plug in CCC ingest worker + routes.
- Add file hash (sha256) + size columns to `documents`, enforce dedupe in insert.

### P1 (this week)
- JWT auth (roles: estimator, admin).
- Upload validation (size cap, ext/MIME allowlist).
- Basic activity feed (consume `workflow_events`).

### P2 (next)
- Structured logging (pino), request-id middleware, error code taxonomy.
- Backups: nightly `pg_dump` + tar of `Claims/` to DO Spaces or S3.

## Action Items Snapshot
- [ ] Create migrations: `workflow_events`, `ccc_files`, `ccc_metadata`, `documents` add (`sha256`, `size_bytes`).
- [ ] Add ingest files under `packages/backend/src/ingest/...` and routes `/ingest` & `/api/ingest`.
- [ ] Add `scripts/windows/push_ems.txt.template` and docs for WinSCP Task Scheduler.
- [ ] Lock down CORS in prod; add `FRONTEND_DIR` note in README.
- [ ] Write DEPLOY.md for GitHub → DigitalOcean droplet flow.

