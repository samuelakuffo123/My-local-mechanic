# My Local Mechanic

My Local Mechanic is a vehicle-care app for drivers in Ghana. The repository includes a React/Vite client and a Node.js HTTP API backed by SQLite.

## Run locally

Use Node.js 22.13 or newer. In separate terminals, run:

```sh
npm run api
npm run dev
```

The API listens on `127.0.0.1:8787`; Vite proxies `/api` requests to it. SQLite data is stored in `.data/mechnow.sqlite` by default. Override `DATABASE_PATH` or `API_PORT` as needed.

The discovery map only shows verified providers that have coordinates. For a populated local map, start the API with demo data: `SEED_DEMO_DATA=true npm run api` on macOS/Linux, or `$env:SEED_DEMO_DATA="true"; npm run api` in PowerShell. Demo data is refused when `NODE_ENV=production`.

## Install on a phone

To install the app while this laptop acts as the server:

```sh
npm run build
npm run api      # terminal 1: API on 127.0.0.1:8787
npm run preview  # terminal 2: production client on :8443, proxying /api
```

Opening `http://<laptop-ip>:8443` on the phone works in a browser, but Chrome only offers **Install app** and only allows geolocation on HTTPS. To get a real install, expose the preview over HTTPS with a tunnel, for example:

```sh
cloudflared tunnel --url http://localhost:8443
```

Open the printed `https://….trycloudflare.com` address on the phone, then choose **Install app** (Android) or **Share → Add to Home Screen** (iPhone). The quick-tunnel address changes whenever the tunnel restarts, and the installed app only works while the laptop, the API and the tunnel stay running.

For a permanent public deployment, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The repository includes a Render Blueprint that serves the built client and `/api` from one HTTPS origin with a persistent disk for SQLite. The frontend must be served from the site root because its manifest and service worker use `/` paths, and the database must stay on persistent storage. The development OTP/SMS and payment adapters are not production-ready by themselves; the deployment guide lists the required providers and remaining gaps.

## Mapbox pickup maps

Copy `env.example` to `.env.local` and set `VITE_MAPBOX_ACCESS_TOKEN` to a Mapbox **public** access token beginning with `pk.`. Restart Vite after changing the file. The pickup step uses Mapbox GL JS for an interactive map, forward address search, reverse geocoding, and a movable pickup pin. Search is limited to Ghana.

The Mapbox public token is sent to browsers by design. Restrict it to the app's allowed URLs and only the public scopes needed for map styles and geocoding. Never put a secret `sk.` token in a `VITE_` variable. Map and geocoding requests are made directly from the browser and count against your Mapbox account. Without a valid public token, users can still type a landmark or use device location, but the interactive map and address search are unavailable.

Emergency requests, including their optional latitude and longitude, are already saved to the signed-in user's SQLite record by the API; no separate map database is required. Coordinates are stored in the app only when the user saves the request; using Mapbox features sends address searches or selected coordinates to Mapbox for lookup.

## Google sign-in

Google sign-in uses the Google Identity Services token model. Create a **Web application** OAuth client in Google Cloud, configure the OAuth consent screen, and add the app's origins to **Authorized JavaScript origins** (`http://localhost:8443` locally, plus the current `https://….trycloudflare.com` origin when testing on a phone). Add `GOOGLE_CLIENT_ID=<your web client ID>` to the gitignored `.env` file and restart the API. The API loads `.env` at startup; explicitly exported environment variables take precedence. No client secret is required: the browser receives a short-lived Google access token, and the API verifies it against Google's `tokeninfo` endpoint before issuing the normal MechNow session.

A verified Google email is linked to an existing account with that email, or used to create a new driver account. Users can still sign in with their phone number. If `GOOGLE_CLIENT_ID` is unset, the Google button explains that sign-in is not configured. Because a quick-tunnel origin changes on every restart, update the authorized origin in Google Cloud whenever the tunnel URL changes.

For deployment, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The included Render Blueprint runs the API and serves the built client from the same HTTPS origin, keeps SQLite on a persistent disk, and sets `NODE_ENV=production`, `API_HOST=0.0.0.0` and `TRUST_PROXY=true`. If you split the client and API across origins instead, set `CORS_ORIGINS` (or `PUBLIC_ORIGIN`) to the exact HTTPS origin serving the client and configure the client's `/api` path to reach this server. Keep the database file and its backups private, use HTTPS, and apply normal backup/retention controls. API responses include an `X-Request-Id` header and the same `requestId` in error bodies for support diagnostics.

## API

Requests with a body must send `Content-Type: application/json`, and browser mutation requests must come from an allowed origin: `CORS_ORIGINS`, `PUBLIC_ORIGIN`, or the platform's own public URL (`RENDER_EXTERNAL_URL` / `RAILWAY_PUBLIC_DOMAIN`). Authenticated endpoints use a bearer token stored by the client; account data and records are scoped to that session. The local Vite proxy rewrites tunnel origins to the first configured `CORS_ORIGINS` value so the phone-install flow keeps working.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/auth/register` | Create a driver account |
| POST | `/api/auth/login` | Start a session |
| GET | `/api/auth/google/config` | Check whether Google sign-in is configured |
| POST | `/api/auth/google` | Verify a Google access token and start a session |
| POST | `/api/auth/logout` | Revoke the current session |
| GET | `/api/auth/me` | Restore the current session |
| GET, POST | `/api/bookings` | List or create bookings for an owned vehicle |
| GET, POST, PUT, DELETE | `/api/vehicles` | Manage the signed-in user's vehicles |
| GET, PUT | `/api/emergency` | Resume or save an emergency request |
| POST | `/api/emergency/cancel` | Cancel an owned emergency request |
| GET, POST | `/api/payments` | List or create idempotent pending payment intents |
| GET | `/api/providers`, `/api/providers/:id` | Search the current sample provider catalog |
| GET | `/api/providers/nearby` | Verified mechanics, tow operators and shops near `lat`/`lng` |
| POST | `/api/service-requests/:id/provider-location` | Assigned provider publishes their live position |
| GET | `/api/parts?q=...` | Search the current parts catalog |
| GET, PUT | `/api/cart` | Read or save the signed-in user's cart |
| POST | `/api/tow/estimate` | Calculate a tow estimate |
| POST | `/api/chat/threads` | Create or retrieve a thread for an owned booking |
| GET, POST | `/api/chat/threads/:id/messages` | Read or send messages in an owned thread |

Run API integration tests with `npm run test:api`; create a production client bundle with `npm run build`.

## Current integration limits

The provider catalog is sample data and the parts catalog starts empty; provider onboarding, driver phone/SMS verification, email delivery, realtime messaging, and a real payment processor are not configured. Payment intents remain `pending` and do not charge anyone. Do not treat demo provider availability, ratings, prices, or contact details as verified.
