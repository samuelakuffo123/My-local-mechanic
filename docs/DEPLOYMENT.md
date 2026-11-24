# Deploying MechNow

MechNow is a Vite/React client plus a long-running Node API. In production the
API uses **Neon Postgres** (`pg`, pooled connection for traffic, direct
connection for migrations). One **Render free Web Service** serves the built
client and `/api` from the same HTTPS origin, so no disk or paid plan is needed.
`render.yaml` describes the service.

## Why one service

- `/api` requests use the client's default relative base URL, so no
  `VITE_API_URL`, CORS split or proxy configuration is needed.
- The PWA manifest and service worker live at `/`, which only works when the
  client is served from the site root.
- Render provides HTTPS, which browsers require for service-worker install and
  geolocation.
- Neon provides the durable database, autoscaling and scale-to-zero on the free
  tier. Writes still work after a Render cold start because data is not on the
  web service's filesystem.

The API must run on **Node 24+** for direct `.ts` execution (and for the local
`node:sqlite` test driver). The repo pins `24.18.0` in `.node-version` and
`package.json`.

## Database

The API picks its driver at startup:

| Condition | Driver |
|---|---|
| `DATABASE_PATH` explicitly set | `node:sqlite` (override, even if `DATABASE_URL` exists) |
| `DATABASE_URL` set | Postgres via `pg` (production) |
| No database environment variables | `node:sqlite` at `.data/mechnow.sqlite` (local) |

Migrations are append-only and stored in `schema_migrations`. They run at boot
over `DATABASE_URL_UNPOOLED` (falling back to `DATABASE_URL`), because PgBouncer
transaction mode does not preserve session state. Application queries use the
pooled URL. The repositories use portable `?` placeholders and the data layer
rewrites them to `$1, $2, ...` for `pg`.

Create a free Neon project, then copy both connection strings from **Connect →
Connection string** (pooled and direct) into Render's `DATABASE_URL` and
`DATABASE_URL_UNPOOLED`.

### Neon services declared in `neon.ts`

`neon.ts` is the branch policy applied by `neon deploy`. It declares:

| Service | What was provisioned |
|---|---|
| Postgres | The `production` branch database (the app's only datastore today) |
| Neon Auth | Managed Better Auth at `NEON_AUTH_BASE_URL` with JWKS at `NEON_AUTH_JWKS_URL` |
| Functions | `hello` function at `https://<branch>-hello.<suffix>/` |
| Object Storage | Private buckets `assets` and `uploads` |
| AI Gateway | Branch-scoped endpoint and credential (needs credits to serve models) |
| Realtime | `NEON_REALTIME_URL` and `NEON_REALTIME_SECRET` |

`neon deploy` writes these values into `.env`. The app currently uses only
Postgres; the other variables are declared in `render.yaml` so they are present
in the deployed runtime and ready to wire in without another provisioning step.
Neon Auth is **not** used for sign-in — MechNow keeps its own phone/OTP, Google
and session system; enabling it does not change the app's auth flow.

## Deploy on Render

1. Push the repository to GitHub (never commit `.env`).
2. In Render, choose **New → Blueprint** and select the repo. Render reads
   `render.yaml` (free plan, no disk).
3. Fill the `sync: false` secrets:
   - `DATABASE_URL` and `DATABASE_URL_UNPOOLED` — Neon's pooled and direct URLs
   - `VITE_MAPBOX_ACCESS_TOKEN` — public `pk.` token
   - `GOOGLE_CLIENT_ID` — Google Web client ID
   - `ADMIN_PHONE`, `ADMIN_PASSWORD` — first admin (password 12+ characters)
   - `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET` — only for live payments
4. Apply the Blueprint. The first deploy runs `npm ci --include=dev && npm run build`,
   then `npm start`. Dev dependencies are included explicitly because
   `NODE_ENV=production` is set during the build as well as at runtime.
5. Open `https://<service>.onrender.com/api/health`. It should return
   `{"ok":true,...}`, and the server log should print
   `[api] database driver: postgres`.
6. Open the site root and install it from Chrome/Safari.

Render's free instance sleeps after inactivity, so the first request can take
about a minute. A free uptime monitor can ping `/api/health` every 10 minutes;
that endpoint does not touch the database, so Neon can still scale to zero.

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
| `DATABASE_URL` | production | Neon **pooled** connection string |
| `DATABASE_URL_UNPOOLED` | production | Neon **direct** connection string for migrations |
| `PUBLIC_ORIGIN` | custom domains | Public HTTPS origin for CORS and domain-bound OTP autofill |
| `CORS_ORIGINS` | optional | Extra comma-separated origins |
| `TRUST_PROXY=true` | behind a proxy | Trust `X-Forwarded-For` for rate limiting |
| `VITE_MAPBOX_ACCESS_TOKEN` | build time | Public Mapbox token |
| `VITE_API_MODE=server` | production build | Surface real backend failures instead of local mock fallbacks |
| `GOOGLE_CLIENT_ID` | yes for Google sign-in | Web client ID |
| `ADMIN_PHONE` / `ADMIN_PASSWORD` | first boot | Admin bootstrap (12+ chars) |
| `PAYMENTS_PROVIDER=paystack` | live payments | Enables the Paystack adapter |
| `PAYSTACK_SECRET_KEY` | live payments | Charge/refund API |
| `PAYSTACK_WEBHOOK_SECRET` | live payments | Webhook HMAC verification |
| `SMS_PROVIDER=arkesel` | phone signup in production | Enables the Arkesel OTP adapter |
| `ARKESEL_API_KEY` | with Arkesel | **Main SMS API Key**; OTP does not work with Multiple API Keys |
| `SMS_SENDER_ID` | optional | Sender name shown to users; max 11 characters; register it with Arkesel |
| `OTP_TTL_MINUTES` | optional, default 10 | How long a code stays valid; Arkesel caps OTP expiry at 10 minutes |

Set the Paystack webhook URL to
`https://<service>.onrender.com/api/payments/webhook/paystack`.

## Production gaps to know about

These fail loudly rather than pretending to work:

1. **Phone OTP/signup.** Production now uses Arkesel's OTP API in
   `server/sms.ts`: `/api/otp/generate` sends a code with a `%otp_code%` slot,
   and `/api/otp/verify` checks it server-side. Use the **Main SMS API Key**
   from your Arkesel dashboard — OTP will not work with a Multiple API Key.
   Register the `MechNow` sender ID, set `SMS_PROVIDER=arkesel` plus
   `ARKESEL_API_KEY`, and keep the **Main Balance** topped up. OTP errors `1007`
   and `1008` mean the Main Balance is too low and are surfaced as a safe
   `sms_insufficient_balance` response instead of being mistaken for a sent
   code. If the OTP API rejects the key, MechNow automatically falls back to
   Arkesel's legacy `/sms/api` plain-SMS endpoint and verifies its own locally
   generated code; low-balance text from that endpoint is detected too. The
   recipient sees the registered `SMS_SENDER_ID` (`MechNow`) when it is approved,
   and every code message also starts with "MechNow". Google sign-in also works
   without SMS when `GOOGLE_CLIENT_ID` and the authorized origin are configured.
   Codes stay valid for 10 minutes by default so a delayed SMS is still usable,
   and a still-valid earlier code works even after requesting a new one. Render
   logs include `[sms] Arkesel ... responded in Nms`; a fast response here means
   any remaining delay is in Arkesel's carrier delivery. Slow or queued delivery
   is usually caused by a low Main Balance or an unapproved sender ID.
   Each SMS ends with `@domain #code` (using `PUBLIC_ORIGIN` or Render's
   `RENDER_EXTERNAL_URL`), so iOS Safari's `autocomplete="one-time-code"` can
   suggest the code and Chromium's WebOTP API can fill it automatically on
   HTTPS. The verification screen shows “Code filled from your messages” with
   an “Enter manually” link when that happens; browsers without support keep
   the normal manual entry path.
2. **Payments.** The development adapter is hard-disabled in production. Live
   payments need Paystack keys and a verified webhook.
3. **Demo map data.** `SEED_DEMO_DATA` is refused in production, so the nearby
   map is empty until verified providers have coordinates. Onboard real
   providers through the provider application (which accepts `lat`, `lng` and
   `address`), or add a separate production-safe demo flag if you need a
   showcase.
4. **Avatars in Postgres.** Profile photos are stored as data URLs in
   `users.avatar_data_url`. Neon's free tier includes 1 GB of storage; move
   large uploads to object storage if avatars grow.

## Backups

Neon keeps point-in-time restore (plan-dependent). You can also export with
`pg_dump` using `DATABASE_URL_UNPOOLED`:

```sh
pg_dump "$DATABASE_URL_UNPOOLED" > mechnow-backup.sql
```

Test restoring a copy before you need it.

## Verify locally

SQLite suite (never touches Neon):

```powershell
npm run test:api
```

Production-style client + API against Neon:

```powershell
npm ci
npm run build
$env:NODE_ENV = "production"
$env:DATABASE_URL = "<neon pooled url>"
$env:DATABASE_URL_UNPOOLED = "<neon direct url>"
$env:ADMIN_PHONE = "+233200000000"
$env:ADMIN_PASSWORD = "replace-with-12-plus-chars"
npm start
```

Open `http://127.0.0.1:10000` (or the `PORT` you set). `/api/health` comes from
the same process, and deep links such as `/app/track/<id>` return the SPA shell.

### Check the Neon services

With the linked branch in `.neon`, these commands verify the provisioned
services (they do not need app code):

```powershell
neon config status          # Auth/Realtime enabled, function and buckets listed
neon neon-auth status       # Auth base URL and JWKS URL
neon buckets list           # assets + uploads
neon bucket object list assets/
```

The `hello` function URL printed by `neon deploy` should return
`Hello from Neon Functions`. `NEON_AUTH_JWKS_URL` should return a JSON web key
set. `NEON_AI_GATEWAY_BASE_URL/v1/models` responds with the model catalog but
models are disabled until AI Gateway credits are purchased.

## Other hosts

- **Railway / Fly.io / VPS:** same single-service setup; no volume is needed
  because data is in Neon. Provide Node 24, the variables above, and TLS.
- **Vercel / Netlify / Cloudflare Pages:** suitable only for the static client.
  The API needs a long-running Node host and a real database.
