# My Local Mechanic

My Local Mechanic is a vehicle-care app for drivers in Ghana. The repository includes a React/Vite client and a Node.js HTTP API backed by SQLite.

## Run locally

Use Node.js 22.13 or newer. In separate terminals, run:

```sh
npm run api
npm run dev
```

The API listens on `127.0.0.1:3001`; Vite proxies `/api` requests to it. SQLite data is stored in `data/mechnow.sqlite` by default. Override `DATABASE_PATH` or `API_PORT` as needed.

## Install on a phone

The production client is an installable Progressive Web App (PWA). Deploy it to a public HTTPS origin, then open the site on your phone. On Android, use the browser's **Install app** or **Add to Home screen** option. On iPhone, open the site in Safari and choose **Share → Add to Home Screen**. The app shell and static assets are cached for launching the interface offline; API-backed actions still need the API and an internet connection. Service-worker updates are applied by the browser.

The frontend must be served from the site root because its manifest and service worker use `/` paths. Configure the production `/api` route to proxy to the Node API, and keep the API database on persistent storage. The current SQLite API and development OTP/SMS setup are not a production hosting/auth solution by themselves.

## Mapbox pickup maps

Copy `env.example` to `.env.local` and set `VITE_MAPBOX_ACCESS_TOKEN` to a Mapbox **public** access token beginning with `pk.`. Restart Vite after changing the file. The pickup step uses Mapbox GL JS for an interactive map, forward address search, reverse geocoding, and a movable pickup pin. Search is limited to Ghana.

The Mapbox public token is sent to browsers by design. Restrict it to the app's allowed URLs and only the public scopes needed for map styles and geocoding. Never put a secret `sk.` token in a `VITE_` variable. Map and geocoding requests are made directly from the browser and count against your Mapbox account. Without a valid public token, users can still type a landmark or use device location, but the interactive map and address search are unavailable.

Emergency requests, including their optional latitude and longitude, are already saved to the signed-in user's SQLite record by the API; no separate map database is required. Coordinates are stored in the app only when the user saves the request; using Mapbox features sends address searches or selected coordinates to Mapbox for lookup.

For deployment, set `NODE_ENV=production` and configure `APP_ORIGIN` (or comma-separated `APP_ORIGINS`) to the exact HTTPS origin serving the client. Route that origin's `/api` path to this server with a reverse proxy; production session cookies are marked `Secure`. Keep the database file and its backups private, use HTTPS, and apply normal database backup/retention controls.

## API

All mutation requests require an allowed `Origin` and JSON bodies. Authenticated endpoints use an HttpOnly, SameSite=Lax session cookie; account data and records are scoped to that session.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/auth/register` | Create a driver account |
| POST | `/api/auth/login` | Start a session |
| POST | `/api/auth/logout` | Revoke the current session |
| GET | `/api/auth/me` | Restore the current session |
| GET, POST | `/api/bookings` | List or create bookings for an owned vehicle |
| GET, POST, PUT, DELETE | `/api/vehicles` | Manage the signed-in user's vehicles |
| GET, PUT | `/api/emergency` | Resume or save an emergency request |
| POST | `/api/emergency/cancel` | Cancel an owned emergency request |
| GET, POST | `/api/payments` | List or create idempotent pending payment intents |
| GET | `/api/providers`, `/api/providers/:id` | Search the current sample provider catalog |
| GET | `/api/parts?q=...` | Search the current parts catalog |
| GET, PUT | `/api/cart` | Read or save the signed-in user's cart |
| POST | `/api/tow/estimate` | Calculate a tow estimate |
| POST | `/api/chat/threads` | Create or retrieve a thread for an owned booking |
| GET, POST | `/api/chat/threads/:id/messages` | Read or send messages in an owned thread |

Run API integration tests with `npm run test:api`; create a production client bundle with `npm run build`.

## Current integration limits

The provider catalog is sample data and the parts catalog starts empty; provider onboarding, driver phone/SMS verification, email delivery, realtime messaging, and a real payment processor are not configured. Payment intents remain `pending` and do not charge anyone. Do not treat demo provider availability, ratings, prices, or contact details as verified.
