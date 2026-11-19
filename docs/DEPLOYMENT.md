# Deploying MechNow

MechNow is a Vite/React client plus a long-running Node API with a SQLite
database. The simplest permanent home is **one Render Web Service** that serves
both the built client and `/api` from the same HTTPS origin. `render.yaml`
already describes that service.

## Why one service

- `/api` requests use the client's default relative base URL, so no
  `VITE_API_URL`, CORS split or proxy configuration is needed.
- The PWA manifest and service worker live at `/`, which only works when the
  client is served from the site root.
- Render provides HTTPS, which the browser requires for service-worker install
  and geolocation.
- The SQLite file lives on a persistent disk, so data survives deploys.

The API must run on **Node 24+**. `node:sqlite` and direct `.ts` execution are
not reliable on older runtimes. The repo pins `24.18.0` in `.node-version` and
`package.json`.

## Deploy on Render

1. Push the repository to GitHub (never commit `.env`).
2. In Render, choose **New → Blueprint** and select the repo. Render reads
   `render.yaml`.
3. Fill the `sync: false` secrets:
   - `VITE_MAPBOX_ACCESS_TOKEN` — public `pk.` token
   - `GOOGLE_CLIENT_ID` — Google Web client ID
   - `ADMIN_PHONE`, `ADMIN_PASSWORD` — first admin (password 12+ characters)
   - `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET` — only for live payments
4. Apply the Blueprint. The first deploy runs `npm ci --include=dev && npm run build`, then
   `npm start`. Dev dependencies are included explicitly because
   `NODE_ENV=production` is set during the build as well as at runtime.
5. Open `https://<service>.onrender.com/api/health`. It should return
   `{"ok":true,...}`.
6. Open the site root and install it from Chrome/Safari.

The disk is mounted at `/var/data`, and `DATABASE_PATH` points at
`/var/data/mechnow.sqlite`. Persistent disks require a paid instance; the
Blueprint uses `starter`. Keep the service at **one instance** while it uses
SQLite.

### Add the deployed origins

- **Google Cloud → APIs & Services → Credentials → OAuth client (Web):** add
  `https://<service>.onrender.com` to **Authorized JavaScript origins**. No
  client secret is needed.
- **Mapbox → Tokens:** restrict the public token to
  `https://<service>.onrender.com/*` (and `http://localhost:8443/*` for local
  work). This is a build-time variable, so changing it requires a redeploy.
- **CORS:** Render exposes `RENDER_EXTERNAL_URL`, and the API adds it to the
  allowlist automatically. For a custom domain, set
  `PUBLIC_ORIGIN=https://your.domain` (and optionally `CORS_ORIGINS`), then
  redeploy.

### Custom domain

Add the domain in Render, then set `PUBLIC_ORIGIN` to the final `https://` URL.
Add the same URL to Google's authorized origins and Mapbox's URL restrictions.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV=production` | yes | Production behavior and secure defaults |
| `API_HOST=0.0.0.0` | yes | Containers must listen on all interfaces |
| `API_PORT` or `PORT` | yes | Render injects `PORT`; the API prefers `API_PORT` |
| `DATABASE_PATH` | yes | SQLite file on the persistent disk |
| `PUBLIC_ORIGIN` | custom domains | Public HTTPS origin allowed by CORS |
| `CORS_ORIGINS` | optional | Extra comma-separated origins |
| `TRUST_PROXY=true` | behind a proxy | Trust `X-Forwarded-For` for rate limiting |
| `VITE_MAPBOX_ACCESS_TOKEN` | build time | Public Mapbox token |
| `GOOGLE_CLIENT_ID` | yes for Google sign-in | Web client ID |
| `ADMIN_PHONE` / `ADMIN_PASSWORD` | first boot | Admin bootstrap (12+ chars) |
| `PAYMENTS_PROVIDER=paystack` | live payments | Enables the Paystack adapter |
| `PAYSTACK_SECRET_KEY` | live payments | Charge/refund API |
| `PAYSTACK_WEBHOOK_SECRET` | live payments | Webhook HMAC verification |
| `SMS_PROVIDER` | phone signup in production | **No real adapter exists yet** |

Set the Paystack webhook URL to
`https://<service>.onrender.com/api/payments/webhook/paystack`.

## Production gaps to know about

These fail loudly rather than pretending to work:

1. **Phone OTP/signup.** `server/sms.ts` only ships a console adapter and throws
   in production. Google sign-in works without it. To enable phone accounts,
   add an adapter (Arkesel, Hubtel, Twilio, or WhatsApp Cloud API) and set
   `SMS_PROVIDER`.
2. **Payments.** The development adapter is hard-disabled in production. Live
   payments need Paystack keys and a verified webhook.
3. **Demo map data.** `SEED_DEMO_DATA` is refused in production, so the nearby
   map is empty until verified providers have coordinates. Onboard real
   providers through the provider application (which accepts `lat`, `lng` and
   `address`), or add a separate production-safe demo flag if you need a
   showcase.
4. **Single instance.** SQLite on a disk does not support horizontal scaling.
   Move to Postgres/Turso before adding replicas.

## Backups

The disk protects data across deploys, not against mistakes. Take regular
backups, for example from a Render shell or scheduled job:

```sh
sqlite3 /var/data/mechnow.sqlite ".backup '/var/data/mechnow-$(date +%F).sqlite'"
```

Download the copy off-platform, and test restoring it before you need it.

## Rehearse production locally

PowerShell:

```powershell
npm ci
npm run build
$env:NODE_ENV = "production"
$env:API_HOST = "127.0.0.1"
$env:API_PORT = "8799"
$env:DATABASE_PATH = "$env:TEMP\mechnow-prod.sqlite"
$env:ADMIN_PHONE = "+233200000000"
$env:ADMIN_PASSWORD = "replace-with-12-plus-chars"
npm start
```

Open `http://127.0.0.1:8799`. The client is served from `dist/`, `/api` comes
from the same process, and deep links such as `/app/track/<id>` return the SPA
shell. Stop with `Ctrl+C` and delete the temporary database when finished.

## Other hosts

- **Railway:** same single-service setup; attach a volume at `/var/data`, set
  the variables above, and let Railway provide `PORT`. The API also accepts
  `RAILWAY_PUBLIC_DOMAIN` automatically for CORS.
- **Fly.io / VPS:** use a Dockerfile or systemd unit, a volume or disk for
  `/var/data`, Node 24, and a reverse proxy with TLS (Caddy or nginx).
- **Vercel / Netlify / Cloudflare Pages:** suitable only for the static client.
  They do not provide a durable local disk for `node:sqlite`, so the API needs
  a different host and a real database.
