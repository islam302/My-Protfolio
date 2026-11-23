# Deployment — Hetzner Cloud VM

Production is **one Hetzner Cloud VM (Ubuntu 24.04)** running the docker compose stack. nginx terminates TLS (Let's Encrypt), serves the site and `/admin/`, and proxies `/api/` to the API — everything same-origin. CORS stays closed; the session cookie is `__Host-pf_session` (`Secure`, `HttpOnly`, `SameSite=Strict`).

```
internet ─> Hetzner Cloud Firewall (22 from your IPs, 80, 443)
        ─> VM: ufw ─> docker: web (nginx-unprivileged, host 80->8081, 443->8443)
                              └─/api/─> api (:3000, not published) ─> db (postgres) ─┐ backend network
                                                                     └─> redis ─────┘ (internal: true)
```

Files involved: `docker-compose.yml` (base), `docker-compose.prod.yml` (prod overlay: ports 80/443, certs, ACME webroot), `infrastructure/nginx/tls.example.conf` (TLS server, mounted by the overlay), `infrastructure/deployment/{remote-deploy,backup,restore,smoke-test,certbot-deploy-hook}.sh`, `.github/workflows/deploy.yml`.

## Environments

| | dev | staging (optional) | production |
|---|---|---|---|
| Where | laptop: `npm run dev` or `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` | a second small VM, same procedure | Hetzner VM |
| `NODE_ENV` | development | production | production |
| `PUBLIC_ORIGIN` | `http://localhost:8080` | `https://staging.<domain>` | `https://islambadran.com` |
| `API_DOCS` | true | false | **false** (forced by the prod overlay) |
| `SESSION_COOKIE_SECURE` | false | true | **true** (forced) |
| Secrets | throwaway | own values | own values, never reused |
| Data | disposable | synthetic only | real |

Every environment has its **own** `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `IP_HASH_SECRET`, admin accounts and SSH deploy key. Never copy a production dump into dev/staging (personal data).

## 1. Create the server

- Hetzner Cloud → new server: Ubuntu 24.04, a CX22/CAX11-class instance is plenty, **add your SSH public key** at creation (Hetzner then disables root password login), enable **backups** (Hetzner snapshot backups are a cheap extra layer, not a substitute for `pg_dump`).
- **Hetzner Cloud Firewall** (outer layer, applied before traffic reaches the VM, and — unlike ufw — not bypassed by Docker):
  - inbound TCP 22 from your own IP(s) only (and GitHub Actions? see "CI SSH access" below),
  - inbound TCP 80, 443 from anywhere (IPv4 + IPv6),
  - inbound ICMP optional; everything else denied.
- DNS: `A` (and `AAAA`) for `islambadran.com` and `www.islambadran.com` → the VM.

## 2. Harden the OS (as root, once)

```bash
apt update && apt -y full-upgrade
adduser --disabled-password --gecos "" admin          # your personal sudo user
usermod -aG sudo admin
install -d -m 700 -o admin -g admin /home/admin/.ssh
cp /root/.ssh/authorized_keys /home/admin/.ssh/ && chown admin:admin /home/admin/.ssh/authorized_keys
passwd admin                                           # sudo password (SSH stays key-only)
```

SSH — keys only, no root, no passwords (`/etc/ssh/sshd_config.d/10-hardening.conf`):

```
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
X11Forwarding no
AllowAgentForwarding no
AllowUsers admin deploy
MaxAuthTries 3
```
`sshd -t && systemctl reload ssh` — keep your current session open and test a new login before closing it.

Firewall (inner layer):
```bash
ufw default deny incoming && ufw default allow outgoing
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw enable
```
**Docker publishes bypass ufw**: Docker inserts its own iptables rules ahead of ufw's, so any `ports:` mapping is reachable from the internet regardless of ufw. That is why only the `web` service publishes anything, and only 80/443 in production (`docker-compose.prod.yml`, which overrides the base file's `127.0.0.1:8080` binding with `!override`). db/redis/api are on Docker networks only (`backend` is `internal: true`). The Hetzner Cloud Firewall is the layer that actually filters what Docker exposes.

Automatic security updates + fail2ban:
```bash
apt -y install unattended-upgrades fail2ban
dpkg-reconfigure -plow unattended-upgrades       # enable
# optional: Unattended-Upgrade::Automatic-Reboot "true"; ...-Time "04:00"; in /etc/apt/apt.conf.d/50unattended-upgrades
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
bantime = 1h
findtime = 10m
EOF
systemctl enable --now fail2ban
```

## 3. Install Docker Engine (Docker's apt repository)

```bash
apt -y install ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt update && apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

`/etc/docker/daemon.json` (log rotation for anything not set per service, no userland proxy, no inter-container traffic on the default bridge):
```json
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true, "userland-proxy": false, "icc": false, "no-new-privileges": true }
```
`systemctl restart docker`. (Unattended-upgrades also updates Docker from its repo; containers keep running thanks to `live-restore`.)

## 4. Deploy user and directory layout

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy        # NOTE: docker group == root on this host; the key is CI-only
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
# put the CI public key in /home/deploy/.ssh/authorized_keys, optionally restricted:
#   from="<GitHub runner egress or bastion>",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA… ci-deploy
install -d -m 750 -o deploy -g deploy /srv/portfolio /srv/portfolio/releases /srv/portfolio/shared
install -d -m 750 -o deploy -g deploy /srv/portfolio/shared/backups /srv/portfolio/shared/acme
install -d -m 750 -o 101 -g 101 /srv/portfolio/shared/certs
```

```
/srv/portfolio/
├── current -> releases/<git-sha>      live release (symlink)
├── releases/<git-sha>/                docker-compose*.yml, infrastructure/{nginx,deployment}
└── shared/
    ├── .env                           secrets (600, deploy:deploy) — never in a release
    ├── certs/{fullchain,privkey}.pem  uid 101 (nginx), written by the certbot hook
    ├── acme/                          ACME http-01 webroot
    ├── backups/                       pg_dump archives
    ├── deployed.env / previous.env    image digests of the live / previous release
```

`.env`:
```bash
sudo -u deploy cp /path/to/.env.example /srv/portfolio/shared/.env
sudo chmod 600 /srv/portfolio/shared/.env
# set: POSTGRES_PASSWORD, REDIS_PASSWORD  (openssl rand -hex 32)
#      IP_HASH_SECRET                     (openssl rand -base64 48)
#      PUBLIC_ORIGIN=https://islambadran.com   SITE_URL=https://islambadran.com
```
`remote-deploy.sh` refuses to run if `.env` is not mode 600.

**CI SSH access.** GitHub-hosted runners use changing IP ranges, so restricting port 22 to them in the Cloud Firewall is impractical. Options, best first: (a) a self-hosted runner / bastion with a fixed IP, allowed in the firewall; (b) keep 22 open to the world but key-only + fail2ban + a dedicated `deploy` key (as above); (c) temporarily open 22 from the runner IP via the Hetzner API inside the workflow (needs an API token secret). The workflow works with any of them.

## 5. TLS with Let's Encrypt (certbot, webroot through nginx)

nginx needs a certificate to start the 443 server, so the very first certificate is bootstrapped with a short-lived self-signed one:

```bash
sudo apt -y install certbot
# 0) placeholder cert so nginx can start
sudo openssl req -x509 -nodes -newkey rsa:2048 -days 2 -subj "/CN=islambadran.com" \
  -keyout /srv/portfolio/shared/certs/privkey.pem -out /srv/portfolio/shared/certs/fullchain.pem
sudo chown 101:101 /srv/portfolio/shared/certs/*.pem && sudo chmod 600 /srv/portfolio/shared/certs/privkey.pem
# 1) first deploy (section 6). EXPECTED: this first run reports a failed smoke test,
#    because curl rejects the self-signed cert. With no previous release there is
#    nothing to roll back to, so the stack stays up and nginx answers
#    /.well-known/acme-challenge/ on :80 — which is all step 2 needs.
# 2) real certificate via the webroot nginx serves
sudo install -m 0755 /srv/portfolio/current/infrastructure/deployment/certbot-deploy-hook.sh \
  /etc/letsencrypt/renewal-hooks/deploy/portfolio.sh
sudo certbot certonly --webroot -w /srv/portfolio/shared/acme \
  -d islambadran.com -d www.islambadran.com \
  --email you@example.com --agree-tos --no-eff-email --key-type ecdsa
#    -> the deploy hook copies the cert into shared/certs (uid 101) and reloads nginx
# 3) re-run the deploy workflow: now the smoke test passes and the release is recorded
```

Renewal: the `certbot` package installs a systemd timer (`systemctl list-timers | grep certbot`) that runs `certbot renew` twice a day; renewals reuse the webroot and the deploy hook reloads nginx. Test with `sudo certbot renew --dry-run`. `tls.example.conf` serves the ACME path on :80 (`/var/www/acme` ← `shared/acme`) and redirects everything else to `https://islambadran.com`. OCSP stapling is off on purpose (Let's Encrypt no longer runs OCSP).

HSTS (2 years, `includeSubDomains; preload`) and `upgrade-insecure-requests` are sent automatically on the HTTPS server. Submit to hstspreload.org only once every subdomain is HTTPS.

## 6. Deploying

### Normal path: GitHub Actions (`.github/workflows/deploy.yml`)

Manual only (`workflow_dispatch`), never on push. Setup once:

1. Settings → Environments → `production` → **Required reviewers**: the owner.
2. Environment secrets:

   | Secret | Value |
   |---|---|
   | `HETZNER_HOST` | VM IP or hostname |
   | `HETZNER_USER` | `deploy` |
   | `HETZNER_SSH_KEY` | private half of a dedicated ed25519 key (`ssh-keygen -t ed25519 -C ci-deploy -N ""`) |
   | `HETZNER_KNOWN_HOSTS` | pinned host key: `ssh-keyscan -t ed25519 <host>` **after** checking its fingerprint against the server console (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`). The workflow uses `StrictHostKeyChecking yes`. |

   Optional variables: `SITE_URL`, `DEPLOY_PATH` (default `/srv/portfolio`), `HETZNER_PORT` (default 22).
3. Run: Actions → *Deploy (manual, Hetzner)* → ref (a release tag) → approve.

What it does: builds both images, pushes them to GHCR tagged `sha-<commit>`, gates on Trivy, then (after approval) copies the release bundle to `releases/<sha>/`, logs the VM into GHCR with the job's short-lived token, and runs `remote-deploy.sh` with the images **pinned by digest** (immutable). `remote-deploy.sh`: `compose config` → `pull` → `backup.sh` (if a DB exists) → `run --rm migrate` → `up -d --no-build --wait` → `smoke-test.sh https://<domain>` → records `deployed.env`/`previous.env`, flips `current`. If `up --wait` or the smoke test fails it **automatically redeploys the previous digests** from the previous release dir and the job fails. A failed migration aborts before anything is restarted (each migration is transactional). The registry login is removed afterwards.

### Manual path (same script, on the VM as `deploy`)

```bash
cd /srv/portfolio && mkdir -p releases/<sha> && tar xzf release.tgz -C releases/<sha>
echo "$GHCR_READ_TOKEN" | docker login ghcr.io -u <user> --password-stdin
bash releases/<sha>/infrastructure/deployment/remote-deploy.sh releases/<sha> \
  ghcr.io/<owner>/portfolio-api@sha256:… ghcr.io/<owner>/portfolio-web@sha256:…
docker logout ghcr.io
```
(Or build on the VM: `docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file shared/.env build`, then `up -d --no-build --wait` — fine for a first try, but registry digests are what make rollback reliable.)

## 7. Creating the admin

```bash
cd /srv/portfolio/current
read -rs ADMIN_PASSWORD && export ADMIN_PASSWORD
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file ../shared/.env \
  run --rm -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD api node src/cli/create-admin.js
unset ADMIN_PASSWORD
```
(`API_IMAGE`/`WEB_IMAGE` must be exported, e.g. `set -a; . ../shared/deployed.env; set +a`.) Then sign in at `https://islambadran.com/admin/`.

## 8. Migrations

- SQL files `apps/api/migrations/NNNN_name.sql`, applied in order, each in a transaction under `pg_advisory_lock`. The `migrate` service runs them; it is a no-op when up to date.
- **Forward-only.** No down-migrations. Every migration must be backward compatible with the previous release (expand → deploy → contract in a later release), so rolling back the *app* never requires rolling back the *schema*.
- A backup is taken automatically right before every deploy's migration step.

## 9. Rollback

- **Automatic**: on a failed health check / smoke test during deploy (see above).
- **Manual, to the previous release** (on the VM as `deploy`):
  `bash /srv/portfolio/current/infrastructure/deployment/remote-deploy.sh --rollback` (swaps `deployed.env` ↔ `previous.env`; needs the previous images still present locally or a GHCR login).
- **To any older release**: re-run the workflow with the older tag/commit (rebuilds are reproducible) or run `remote-deploy.sh releases/<old-sha> <old digests>`; the last 5 release dirs are kept.
- **Data** (only for corruption): stop api + web, `restore.sh` the pre-deploy dump (below), then start the release that matches that schema.

## 10. Backups (pg_dump + off-server copy)

```bash
# /etc/cron.d/portfolio-backup   (as deploy, daily 03:15 UTC, keep 14 locally)
15 3 * * * deploy cd /srv/portfolio/current && set -a && . ../shared/deployed.env && set +a && COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file /srv/portfolio/shared/.env" KEEP=14 bash infrastructure/deployment/backup.sh /srv/portfolio/shared/backups >> /srv/portfolio/shared/backups/backup.log 2>&1
```

Off-server copy — **Hetzner Storage Box** (SSH on port 23), encrypted with restic so the provider never sees plaintext personal data:
```bash
sudo apt -y install restic
# once: create a Storage Box sub-account, add deploy's SSH key to it, then
export RESTIC_REPOSITORY="sftp:uXXXXX-sub1@uXXXXX.your-storagebox.de:23/portfolio"   # ssh config may set Port 23
export RESTIC_PASSWORD_FILE=/home/deploy/.restic-pass     # chmod 600, ALSO stored in your password manager
restic init
# /etc/cron.d/portfolio-offsite  (daily 03:45)
45 3 * * * deploy RESTIC_REPOSITORY=… RESTIC_PASSWORD_FILE=/home/deploy/.restic-pass restic backup /srv/portfolio/shared/backups /srv/portfolio/shared/.env --quiet && restic forget --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune --quiet
```
(rsync to the Storage Box works too, but then encrypt the dumps first, e.g. `age`/`gpg`.)

Restore (dry run first — it prints what it would do and exits 3; it refuses while the api runs):
```bash
cd /srv/portfolio/current && set -a && . ../shared/deployed.env && set +a
export COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file /srv/portfolio/shared/.env"
$COMPOSE stop api web
bash infrastructure/deployment/restore.sh ../shared/backups/portfolio-<stamp>.dump
bash infrastructure/deployment/restore.sh ../shared/backups/portfolio-<stamp>.dump --confirm-target=portfolio
$COMPOSE up -d --no-build --wait
```
Test a restore on a throwaway VM at least quarterly. Dumps contain personal data — same protection as production.

## 11. Health checks & monitoring

| Endpoint | Meaning |
|---|---|
| `GET /healthz` (nginx, container-internal :8080) | web container HEALTHCHECK |
| `GET /api/health` | API process alive (no DB) |
| `GET /api/health/ready` | API can reach Postgres (503 otherwise) |

`smoke-test.sh https://islambadran.com` checks both API endpoints, the site, admin, 404 handling, dotfile blocking, security headers and HSTS. See `infrastructure/monitoring/README.md` for uptime checks, alert thresholds and log queries.

## 12. Logging

- API: JSON (pino) with `requestId`; nginx: one JSON object per request with `request_id` — the same id is passed to the API and returned as `X-Request-Id`. `/api` query strings are redacted in nginx logs.
- Rotation: `json-file` driver, `max-size 10m`, `max-file 5` per container (compose `x-logging` + `daemon.json`). Read with `docker compose logs`, or ship them (Vector/Promtail → Loki/Grafana Cloud, or `journald`).

## Hardening summary (containers)

- Only `web` publishes ports (80/443 in prod); `backend` network is internal; db/redis unreachable from outside.
- Every container: `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, tmpfs for writable paths, CPU/memory/PID limits, non-root (postgres 70, redis 999, node 1000, nginx 101).
- API image without npm/yarn/corepack, tini PID 1, root-owned code; `apk upgrade` at build; images deployed by digest.
- Certs readable only by uid 101 and mounted read-only; `.env` mode 600 outside the release dirs.
