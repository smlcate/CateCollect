# Insurance Workflow (Clean Monorepo)

This is a cleaned, working baseline with:
- **Backend**: Express + Knex + PostgreSQL
- **Frontend**: AngularJS 1.x served by Express
- **Worker**: Python scaffold (watchdog/OCR/PDF to be added later)

## Quick start

```bash
unzip iw-clean-monorepo.zip && cd iw-clean-monorepo
cp .env.example .env

# Postgres (Docker, optional)
docker run --name iw-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=insurance_workflow -e POSTGRES_USER=workflow_user -p 5432:5432 -d postgres:16

# Backend
cd packages/backend
npm i
npm run migrate
npm run seed
PORT=4000 npm run dev
# open http://localhost:4000/
```

If your frontend is not in `web/`, set `FRONTEND_DIR` to the absolute path where `index.html` lives.

## Scripts
- `npm run migrate` – apply Knex migrations
- `npm run seed` – seed carriers
- `npm run dev` – start Express

## Frontend
AngularJS scaffold lives in `web/`. You can replace it with your own app. The server will auto-detect a few common locations, or you can set `FRONTEND_DIR`.

## Worker (future)
`packages/worker` contains a placeholder with config. We'll expand it to watch CCC exports, route files, and register documents via the API.
