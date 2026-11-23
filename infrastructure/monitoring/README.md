# Monitoring

Small site, small stack: an external uptime check plus alerts derived from the JSON logs cover it. No agent is shipped; pick a hosted uptime service (UptimeRobot, Better Stack, Checkly, Grafana Cloud synthetic monitoring, …) and any log backend that can query JSON.

## What to monitor

| Signal | Source | Alert when |
|---|---|---|
| Site up | `GET https://<domain>/` → 200, body contains `Islam Badran` | 2 consecutive failures from 2+ regions |
| API alive | `GET /api/health` → 200 `{"data":{"status":"ok"}}` | 2 consecutive failures |
| API ready (DB) | `GET /api/health/ready` → 200 (503 = DB unreachable) | any 503 for > 2 min |
| TLS certificate | expiry of the served cert | < 14 days |
| 5xx rate | nginx access log `status >= 500` (and `upstream_status`) | > 1 % of requests over 5 min, or any 502/503 burst |
| 429 rate | nginx `status = 429` + API `RATE_LIMITED` errors | sudden spike (abuse) or steady 429s on `/api/v1/admin/*` (limit too tight) |
| Login failures | API logs for `POST /api/v1/admin/auth/login` with 401 | > 20 / 15 min (credential stuffing); any account lockout |
| Inquiry volume | `POST /api/v1/inquiries` 201 count | drop to zero for days (form broken) or spike (spam) |
| Latency | nginx `request_time` / `upstream_time` p95 | p95 > 1 s for 10 min |
| DB connections | `SELECT count(*) FROM pg_stat_activity WHERE datname = 'portfolio'` | > 80 % of `max_connections` (pool max is 10 per API instance) |
| DB size / disk | `pg_database_size('portfolio')`, host disk | disk > 80 % |
| Backups | presence + age of newest `portfolio-*.dump` | none newer than 26 h |
| Containers | `docker compose ps` health / restart count | any `unhealthy` or restart loop |

## Example uptime checks

```bash
# cron-able shell check (exit != 0 => alert)
curl -fsS --max-time 10 https://islambadran.com/api/health | grep -q '"status":"ok"'
curl -fsS --max-time 10 -o /dev/null https://islambadran.com/api/health/ready
# full post-deploy check incl. security headers
infrastructure/deployment/smoke-test.sh https://islambadran.com
```

Checkly / Better Stack style assertion: `GET /api/health/ready`, expect status 200, response time < 2000 ms, interval 1–5 min. Do **not** point uptime checks at `POST` endpoints (they would create inquiries and trip rate limits).

## Log fields

nginx (one JSON object per line on stdout, `infrastructure/nginx/nginx.conf`):

```json
{"time":"2026-11-23T17:38:00+00:00","remote_addr":"203.0.113.7","request_id":"27589d22…","method":"POST",
 "uri":"/api/v1/inquiries","status":201,"bytes":93,"request_time":0.012,"upstream_status":"201",
 "upstream_time":"0.011","referer":"https://islambadran.com/contact/","user_agent":"…"}
```

API (pino JSON): `level`, `time`, `msg`, `reqId` / `requestId` (same value as nginx `request_id` and the `X-Request-Id` response header), `req.method`, `req.url`, `res.statusCode`, `responseTime`, error `code`. The API never logs request bodies, passwords, session tokens or raw IPs (IPs are stored only as HMAC).

Useful queries (any JSON log tool, shown as `jq`):

```bash
docker compose logs --no-log-prefix web | jq -c 'select(.status>=500)'
docker compose logs --no-log-prefix web | jq -r 'select(.status==429) | .remote_addr' | sort | uniq -c | sort -rn | head
docker compose logs --no-log-prefix web | jq -r 'select(.request_id=="<id from a user report>")'
```

## DB connection check

```bash
docker compose exec -T db psql -U portfolio -d portfolio -Atc \
  "select count(*) filter (where state='active'), count(*) from pg_stat_activity where datname='portfolio';"
```
