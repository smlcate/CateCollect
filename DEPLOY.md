# Deploying CateCollect to DigitalOcean (Droplet + Docker Compose)

## 1) Prepare repository
```bash
# at repo root
cp .env.example .env
# fill PG vars to match your droplet Postgres or managed PG
```

## 2) Push to GitHub
```bash
git init
git remote add origin https://github.com/<you>/CateCollect.git
git add .
git commit -m "Initial commit with CCC ingest"
git push -u origin main
```

## 3) Create a Droplet
- Ubuntu 22.04 LTS
- Add SSH key
- Open firewall: TCP 22, 80/443 (if using reverse proxy), and app port (e.g., 4000), plus 2222 (SFTP sidecar if used)

## 4) Install Docker & Git on droplet
```bash
ssh root@<DROPLET_IP>
apt-get update
apt-get install -y docker.io docker-compose-plugin git
```

## 5) Clone & run
```bash
git clone https://github.com/<you>/CateCollect.git
cd CateCollect
cp .env.example .env
# edit .env (PG creds; CORS; PORT; FRONTEND_DIR optional)

# Bring up baseline stack
docker compose up -d --build
```

If you use the SFTP sidecar for CCC ingest:
```bash
# Layer an extra compose file that adds sftp and binds ./data/incoming
docker compose -f docker-compose.yml -f docker-compose.ccc.yml up -d --build
```

## 6) Verify
- API: `http://<DROPLET_IP>:4000/api/health`
- UI:  `http://<DROPLET_IP>:4000/` (if `web/index.html` exists)
- Ingest dashboard: `http://<DROPLET_IP>:4000/ingest` (after adding routes)

## 7) Shop PC (WinSCP)
- See `scripts/windows/push_ems.txt.template`
- Schedule with Task Scheduler every minute

## Notes
- For TLS, place nginx in front or use Caddy
- Backups: add a cron for `pg_dump` + tar `Claims/` to Spaces (S3)
