# ROADMAP — CateCollect Next Steps (Shop-Ready)

## Phase 0 — CCC Export Pilot (1 day)
- [ ] Add CCC ingest worker + routes (JSON + dashboard)
- [ ] Migrations: `ccc_files`, `ccc_metadata`
- [ ] WinSCP script & Task Scheduler guide for shop PC
- [ ] Minimal status page for ingest health

## Phase 1 — Stability & UX (2–3 days)
- [ ] `documents` table: add `sha256`, `size_bytes`; dedupe on insert
- [ ] Add `workflow_events` table + log create/update actions
- [ ] Claims list: show checklist summary; clearer API error texts
- [ ] Upload limits & allowlist; surface failed uploads in UI

## Phase 2 — Authentication (2 days)
- [ ] JWT login (roles: estimator, admin)
- [ ] Protect create/update routes; public read where appropriate
- [ ] Audit log (user, action, claim_id, doc_id)

## Phase 3 — Observability & Backups (1–2 days)
- [ ] pino logger + request-id middleware
- [ ] Health endpoints for DB + ingest worker
- [ ] Nightly pg_dump + Claims/ tar upload to DO Spaces (S3)

## Phase 4 — EMS Parsing & Automation (ongoing)
- [ ] Tune EMS/XML parser to your CCC format (map fields, claim auto-create)
- [ ] Auto-link exported photos/PDFs to matching claim
- [ ] Activity feed on claim detail

