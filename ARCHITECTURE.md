# Architecture — CateCollect

Date: 2025-10-09

## Overview
CateCollect is a claims workflow tool designed for auto-body shop use, tailored to insurance carrier requirements.  
The system has three main parts: **Backend API**, **Frontend (AngularJS)**, and a **Worker (automation agent)**.

---

## Backend (Node.js / Express / Knex / PostgreSQL)
- **Framework:** Express (ESM)
- **Database:** PostgreSQL (via Knex.js)
- **Structure:**
  - `src/app.js`: Express app, Helmet CSP, routes, static serving
  - `src/server.js`: boots the app
  - `src/routes/`: API endpoints (`carriers`, `claims`, `documents`, `uploads`)
  - `db/migrations/`: schema definitions (claims, carriers, documents, users, workflow_events)
  - `db/seeds/`: initial seed data (carriers, sample users)
  - `middleware/error.js`: central error handler
  - `scripts/db-doctor.js`: sanity check for DB version, user, tables
- **Features:**
  - `/api/health`: health check
  - `/api/carriers`: seeded insurance carriers with rules/config
  - `/api/claims`: CRUD for claims
  - `/api/documents`: register documents (single/bulk) tied to claims
  - `/api/uploads`: upload files (multer), auto-register as document
  - `/api/claims/:id/checklist`: compute required vs present docs per carrier
- **Error handling:** central middleware + Postgres error mapping (unique, foreign key)
- **Static serving:** serves AngularJS frontend in dev; `/node_modules` exposed only in development

---

## Frontend (AngularJS 1.8.3)
- **Framework:** AngularJS with ngRoute
- **Location:** `/web`
- **Entry:** `web/index.html`
- **Modules:**
  - `app.module.js`: defines `iwApp`
  - `app.routes.js`: routes: claims list, new claim, claim detail
  - `services/`: `api.service.js` (wrapper around $http), `upload.service.js` (XHR with progress)
  - `features/claims/`:
    - `claims-list.controller.js`
    - `new-claim.controller.js`
    - `claim-detail.controller.js`
    - `*.html` templates
- **Security:** Angular loaded locally from `/node_modules` (CSP-safe)
- **UI Features:**
  - Claims list, create new claim, claim detail with checklist and documents
  - Upload form with type selector and file input
  - Progress feedback during uploads

---

## Worker (Automation Agent)
- **Location:** `packages/worker`
- **Language:** Node.js (ESM)
- **Dependencies:** chokidar (FS watching), axios (HTTP), form-data, dotenv
- **Config:** `.env` defines `WATCH_DIR`, `API_BASE`, `CLAIM_REGEX`
- **Logic:**
  - Watches `WATCH_DIR` for new files
  - Extracts claim number via regex (default `CLM####`)
  - Detects doc type via rules (`estimate`, `photos`, `invoices`, etc.)
  - Uploads via `/api/uploads` with FormData
  - Moves files:
    - `_Processed/<claim>/<type>/` if successful
    - `_Failed/` if upload error
- **Extensible:** EMS/BMS files can be added to auto-create claims

---

## Database Schema (Current)
- **carriers**: id, name, config (JSON rules), timestamps
- **claims**: id, claim_number, customer_name, carrier_id, status, timestamps
- **documents**: id, claim_id, type, filename, filepath, status, uploaded_at
- **users**: id, username, password_hash, role, timestamps
- **workflow_events**: id, claim_id, type, detail, created_at
- **knex_migrations / knex_migrations_lock**: for schema tracking

---

## Deployment / Dev
- **Dev:** nodemon, npm scripts (`migrate`, `seed`, `db:doctor`)
- **Prod:** docker-compose planned with Postgres + backend + worker
- **Storage:** Filesystem storage under `/Claims/<claim_number>/`

---

## Planned Extensions
- Add JWT-based authentication and roles
- Worker retry logic, error logging to DB
- EMS/BMS parsing → auto-create claims
- Use `workflow_events` to track activity feed
- Drag/drop multi-file upload in UI
- Production hardening: disable `/node_modules`, backups

