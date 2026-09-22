# Moneta

A small web page that shows the current balance of every bank account connected to your [Lunch Flow](https://lunchflow.app) account.

- One screen: totals per currency at the top, then each institution with its accounts and balances.
- Three ways to run it: deployed on Vercel, hosted on Claude, or self-hosted. None of them needs a build step or any dependencies.

## Option 1: deploy on Vercel

The repo is ready for Vercel as-is: the page is served from `public/` and the API runs as serverless functions in `api/`. The Vercel URL is public, so the page is protected by a password you choose.

Before you start, get a Lunch Flow API key: in Lunch Flow, open **Destinations** and create an **API** destination. The key is shown in that destination's settings.

1. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub, and import this repository. Leave the framework preset on **Other** and the build settings untouched.
2. Under **Environment Variables**, add:
   - `LUNCHFLOW_API_KEY`: your Lunch Flow API key.
   - `MONETA_PASSWORD`: any password you like. The page asks for it once per device.
3. Click **Deploy**. Open the URL Vercel gives you and enter the password.

Every push to the repository's default branch redeploys automatically. To try the layout with sample data first, set `LUNCHFLOW_MOCK=1` instead of an API key.

Notes:

- Balances are never stored on Vercel and never cached by its CDN; each function instance keeps a short in-memory cache (`CACHE_TTL_SECONDS`, default 5 minutes) and the Refresh button bypasses it.
- Without `MONETA_PASSWORD`, the deployment refuses to serve balances and the page says why. On your own machine the password is optional.

## Option 2: hosted on Claude, nothing to run

`artifact/moneta.html` is a version of the page built to be published as a Claude Artifact. It reads balances through the **Lunch Flow connector** on your Claude account, using your own Lunch Flow login. No API key, no server, and it works from any device that can open Claude.

One-time setup:

1. In Lunch Flow, open **Destinations** and add an **MCP** destination. Copy the server URL it shows.
2. In Claude, open **Settings**, then **Connectors**, and add a custom connector. Name it exactly `Lunch Flow`, paste the URL, and sign in when asked.
3. Open the published page. Allow it to use Lunch Flow when Claude asks.

The page refreshes every five minutes while open, and the Refresh button fetches immediately. It only works inside claude.ai or the Claude app, since that is where your connectors live.

## Option 3: self-hosted

A single Node.js process serves the page and talks to the Lunch Flow API with your API key. The key stays on the server; the browser only talks to this app. Balances are cached for a few minutes so reloading the page does not hammer the API, and the Refresh button forces a new fetch.

### Requirements

- Node.js 20 or newer.
- A Lunch Flow account with at least one bank connected.
- A Lunch Flow API key. In Lunch Flow, open **Destinations** and create an **API** destination. The key is shown in that destination's settings.

### Quick start

```bash
git clone https://github.com/Napps9/moneta.git
cd moneta
cp .env.example .env      # then paste your key into LUNCHFLOW_API_KEY
npm start
```

Open <http://127.0.0.1:3000>.

Want to see it before creating a key? Run it with sample data:

```bash
npm run mock
```

### Configuration

Settings are read from environment variables, or from a `.env` file next to `server.js` (see `.env.example`).

| Variable | Default | Purpose |
| --- | --- | --- |
| `LUNCHFLOW_API_KEY` | required | Your Lunch Flow API key. |
| `LUNCHFLOW_BASE_URL` | `https://www.lunchflow.app/api/v1` | Lunch Flow API base URL. |
| `LUNCHFLOW_MOCK` | unset | Set to `1` to serve sample data without calling Lunch Flow. Same as `npm run mock`. |
| `HOST` | `127.0.0.1` | Address to bind. Set to `0.0.0.0` to reach it from other devices on your network. |
| `PORT` | `3000` | Port to listen on. |
| `CACHE_TTL_SECONDS` | `300` | How long fetched balances are reused before Lunch Flow is called again. |
| `MONETA_PASSWORD` | unset | Password the page must present before balances are served. Optional locally, required on Vercel. |
| `MONETA_REQUIRE_PASSWORD` | unset | Set to `1` to refuse to serve balances without a password on other public hosts. |

### How it works

```
browser  ──GET /api/balances──▶  server.js  ──GET /accounts──────────────▶  Lunch Flow API
                                            ──GET /accounts/:id/balance──▶  (x-api-key header)
```

1. The server calls `GET /accounts` to list every connected account.
2. It calls `GET /accounts/:id/balance` for each account, a few at a time.
3. The results are joined, sorted by institution, summed per currency and cached.
4. The page renders the snapshot. An account whose balance could not be fetched is still listed, with the error next to it, and is left out of the totals.

Routes served by the app:

| Route | Description |
| --- | --- |
| `GET /` | The page. |
| `GET /api/balances` | JSON snapshot of accounts, balances and totals. Add `?refresh=1` to bypass the cache. |
| `GET /api/health` | Returns `{ "ok": true, "passwordRequired": false }`. |

When a password is set, `GET /api/balances` expects an `Authorization: Bearer <password>` header and answers `401` without it. The page handles this by asking for the password and remembering it in that browser.

### Development

```bash
npm run dev     # restarts on file changes
npm test        # runs the test suite (node --test)
```

Project layout:

```
server.js          entry point for self-hosting: reads config, starts the HTTP server
api/               Vercel serverless functions (balances, health)
vercel.json        Vercel settings: static output from public/, security headers
src/runtime.js     builds the client, snapshot service and password gate from the environment
src/lunchflow.js   Lunch Flow API client and response normalization
src/balances.js    snapshot builder: fan-out, totals, caching
src/auth.js        password gate for the API
src/app.js         HTTP handlers: JSON API and static files
src/mock.js        sample data used by `npm run mock`
public/            the page (index.html, app.js, style.css)
artifact/          the Claude-hosted version of the page (option 2)
test/              tests
```

### Security notes

- The self-hosted server binds to `127.0.0.1` by default, so only your machine can reach it. If you expose it anywhere else, set `MONETA_PASSWORD` (and `MONETA_REQUIRE_PASSWORD=1`), as the Vercel deployment does. The password check is timing-safe and slows down wrong guesses, but it is a single shared password, not an account system: pick a long one.
- The `.env` file is git-ignored. Never commit your API key.
- The API key is only ever sent to the Lunch Flow API host, in the `x-api-key` header.
