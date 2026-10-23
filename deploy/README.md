# Deploy notes — picolah.com on 47.84.25.19

Production stack: Docker + Node 24, served over HTTPS by the shared
`diy-nginx-lb` container (the only process on this host that owns port 443).

## Host layout

| Path | Purpose |
| --- | --- |
| `/opt/picolah/` | app source, Dockerfile, compose file |
| `/opt/picolah/.env` | production env (600, contains LLM + ingest keys) |
| `/opt/picolah/data/` | SQLite database (mounted at `/app/data`) |
| `/opt/picolah/mock-state/` | mock crawler price state (safe to delete; it re-seeds) |
| `/opt/picolah/deploy/` | nginx block + `apply-nginx.sh` |
| `/opt/diy/docker/nginx/nginx.conf` | shared 443 vhost config (picolah block appended) |
| `/opt/diy/docker/nginx/certs/` | TLS certs, including `picolah.com.pem/.key` |

The container listens on `172.20.0.1:8787` — the `docker_default` bridge
gateway, which the nginx-lb container can reach. It is not published publicly.

## Hidden entry

The public homepage is a decoy research page (`public/landing.html`), so the
workspace is not discoverable from `/`.

| Route | Behaviour |
| --- | --- |
| `/` | Picolah Research landing page, no link to the app |
| `/7hk9ho` | the workspace (set by `PICOLAH_ENTRY_PATH`) |
| `/api/*` | requires the `pcl_entry` cookie set by the entry page |
| `/api/health`, `/api/v1/ingest/*` | open (Docker healthcheck + crawler Bearer auth) |
| everything else | 404 |

Change the path in `/opt/picolah/.env` and recreate the container:

```bash
# PICOLAH_ENTRY_PATH=/7hk9ho
docker compose up -d
```

The cookie is set with `HttpOnly; SameSite=Lax; Secure` on HTTPS and lasts 30
days. The workspace HTML also carries `X-Robots-Tag: noindex` and
`public/robots.txt` disallows the entry and API paths.

Verify the gate:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://picolah.com/                 # 200 (decoy)
curl -s -o /dev/null -w '%{http_code}\n' https://picolah.com/7hk9ho           # 200 + Set-Cookie
curl -s -o /dev/null -w '%{http_code}\n' https://picolah.com/api/config       # 404
curl -s -c /tmp/jar -o /dev/null https://picolah.com/7hk9ho
curl -s -b /tmp/jar -o /dev/null -w '%{http_code}\n' https://picolah.com/api/config  # 200
```

## Common commands

```bash
cd /opt/picolah

docker compose up -d --build     # deploy / redeploy both services
docker compose logs -f --tail 100
docker compose restart
docker compose ps

# mock crawler (price movement)
docker compose logs -f mock-crawler
docker compose stop mock-crawler   # freeze demo prices
docker compose start mock-crawler

# health
curl -s http://172.20.0.1:8787/api/health
curl -sI https://picolah.com/
```

## Mock crawler

`picolah-mock` runs `mock/crawler.ts` inside the same image. Every
`MOCK_INTERVAL_MS` (default 120s) it nudges ~8 demo offers and POSTs a normal
ingest batch, so "最近入库", "今日更新", stock flags and the 30-day chart move.
It writes the same `(source, external_id)` rows the seed created, so offers are
updated in place — no duplicate platforms.

```bash
# one manual batch (also proves the ingest key works)
docker compose exec mock-crawler ./node_modules/.bin/tsx mock/crawler.ts --once

# reset the local price walk
docker compose stop mock-crawler
rm -rf /opt/picolah/mock-state
docker compose start mock-crawler
```

Set `MOCK_INTERVAL_MS` in `.env` to change the pace; to freeze prices entirely,
stop the service rather than setting a zero interval.

## Data upgrades

On start the API syncs `shared/catalog.ts` into SQLite: missing products and
offers are inserted, and legacy rows with `source='seed'` are rewritten to the
crawler's `picolah-mock` identity so they keep being updated instead of
duplicated. Existing conversations are preserved.

To rebuild from scratch (wipes conversations too):

```bash
docker compose stop mock-crawler
rm -rf /opt/picolah/data
docker compose up -d
```

## Switching from mock to a real crawler

The demo rows are owned by `source='picolah-mock'`. When a real crawler starts
pushing, stop the mock first and remove its rows, otherwise each platform will
show twice (mock + real):

```bash
docker compose stop mock-crawler
docker exec picolah node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/app/data/picolah.db');
db.exec(\"DELETE FROM offers WHERE source = 'picolah-mock'\");
console.log('mock offers removed');
"
```

Then point the real crawler at `POST /api/v1/ingest/offers` with its own
`source` (e.g. `shopee-sg-crawler`); the catalog products stay in place.

## TLS

Certificates are issued by the host's acme.sh (HTTP-01, standalone on port
8099, proxied by the `web-gateway` container on port 80):

```bash
/root/.acme.sh/acme.sh --issue -d picolah.com -d www.picolah.com \
  --standalone --httpport 8099 --keylength ec-256 --server letsencrypt

/root/.acme.sh/acme.sh --install-cert -d picolah.com --ecc \
  --fullchain-file /opt/diy/docker/nginx/certs/picolah.com.pem \
  --key-file       /opt/diy/docker/nginx/certs/picolah.com.key \
  --reloadcmd      "docker exec diy-nginx-lb nginx -s reload"
```

Renewal is handled by the existing root cron (`acme.sh --cron` every 6 hours);
the stored reload command reloads nginx-lb, so renewal needs no manual step.
Test renewal with `acme.sh --renew -d picolah.com --ecc --force`.

## Shared 443 caveat

Port 443 belongs to the diy stack's `diy-nginx-lb`, which already terminates
TLS for `diy.medical-sg.com`, `idol-sg.com`, `medical-sg.com` and
`oms.medical-sg.com`. picolah.com was added as an extra vhost in its
`nginx.conf` rather than by replacing the listener, so other sites are
untouched.

If the diy repo is redeployed, `nginx.conf` may be regenerated without the
picolah block. `deploy/apply-nginx.sh` is idempotent and restores it:

```bash
/opt/picolah/deploy/apply-nginx.sh        # safe to run any time
```

It is also installed in root's crontab every 10 minutes as a self-heal.
