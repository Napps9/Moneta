# Moneta

A small web page that shows the current balance of every bank account connected to your [Lunch Flow](https://lunchflow.app) account.

- One screen: totals per currency at the top, then each institution with its accounts and balances.
- Three ways to run it: deployed on Vercel, hosted on Claude, or self-hosted. None of them needs a build step or any dependencies.

## Option 1: deploy on Vercel

The repo is ready for Vercel as-is: the page is served from `public/` and the API runs as serverless functions in `api/`.

Before you start, get a Lunch Flow API key: in Lunch Flow, open **Destinations** and create an **API** destination. The key is shown in that destination's settings.

1. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub, and import this repository. Leave the framework preset on **Other** and the build settings untouched.
2. Under **Environment Variables**, add `LUNCHFLOW_API_KEY` with your Lunch Flow API key.
3. Click **Deploy** and open the URL Vercel gives you.

Vercel builds every push to `main` as the production deployment. To try the layout with sample data first, set `LUNCHFLOW_MOCK=1` instead of an API key.

Notes:

- The URL is public: anyone who has it can see the balances. If you ever want to lock it, add a `MONETA_PASSWORD` environment variable and redeploy; the page will then ask for it once per device.
- Balances are never stored on Vercel and never cached by its CDN; each function instance keeps a short in-memory cache (`CACHE_TTL_SECONDS`, default 5 minutes) and the Refresh button bypasses it.

## Option 2: hosted on Claude, nothing to run

`artifact/moneta.html` is a version of the page built to be published as a Claude Artifact. It reads balances through the **Lunch Flow connector** on your Claude account, using your own Lunch Flow login. No API key, no server, and it works from any device that can open Claude.

One-time setup:

1. In Lunch Flow, open **Destinations** and add an **MCP** destination. Copy the server URL it shows.
2. In Claude, open **Settings**, then **Connectors**, and add a custom connector. Name it exactly `Lunch Flow`, paste the URL, and sign in when asked.
3. Open the published page. Allow it to use Lunch Flow when Claude asks.

The page refreshes every five minutes while open, and the Refresh button fetches immediately. It only works inside claude.ai or the Claude app, since that is where your connectors live.

## Two screens

- **Balances** (`#/balances`): every account with its current balance, grouped by type or by bank, with totals.
- **Accounts** (`#/accounts`): one account and one calendar month at a time. Pick the account and step through months to see money in, money out, the net, and the opening and month-end balance, with the month's transactions underneath. Account names on the Balances screen link straight to it.

For a finished month the month-end balance is derived: the current balance minus everything that happened after that month (which is why transactions are fetched up to today). For the current month it is simply the balance now, labelled as month in progress. Positive transaction amounts count as money in, negative as money out, pending ones included.

## Grouping accounts

The page groups accounts into **Savings**, **Spending** and **Credit**, with a subtotal per group, and a "By bank" toggle to see them per institution instead. Lunch Flow does not say what kind of account something is, so the group is worked out from the account name: words like *saver*, *savings*, *ISA* or *pot* mean savings; *credit*, *card*, *flex* or *loan* mean credit; accounts from card issuers such as American Express are credit; everything else is spending.

### Adjusting an account in the app

Every account row has a pencil button. It opens a small editor with two settings:

- **Group**: leave it on Automatic, or pick a group.
- **Balance**: how to read the number Lunch Flow reports.
  - *As reported*: the default.
  - *Amount owed, shown as negative*: for cards where the bank reports what you owe as a positive number.
  - *Amount left to spend on a card*: for cards where the bank reports the remaining credit. Enter the card's credit limit, and the page shows what you owe (limit minus remaining) as a negative amount, with the remaining credit underneath.

Where those settings are kept depends on the deployment:

- **Vercel, out of the box**: in the browser you made them in. Each device has its own.
- **Vercel with Upstash Redis**: shared across every device. In your Vercel project open **Storage**, create an **Upstash Redis** store (free tier is plenty), connect it to the project, and redeploy. The store adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` to the project; the app picks them up and, on the next visit, moves any settings from that browser into the store.
- **Self-hosted**: in `data/settings.json` next to the server (`MONETA_DATA_DIR` to change it).

### Defaults in a file

`groups.config.js` sets the group names and order, the words that put an account in a group, and can hold fixed assignments too. Settings made in the app take precedence over it. Edit the file and push (Vercel redeploys); on GitHub you can do that from the file's page with the pencil icon.

```js
export default {
  groups: [
    { id: 'savings', label: 'Savings' },
    { id: 'spending', label: 'Spending' },
    { id: 'credit', label: 'Credit' },
  ],
  accounts: {
    'Account 1': 'savings',                 // by account name
    'Monzo · Personal Account': 'spending', // by "Institution · Account name"
    '12345': 'credit',                      // by account id
  },
  keywords: { savings: ['rainy day'] },     // extra words, added to the built-in ones
  defaultGroup: 'spending',
};
```

You can rename groups, reorder them, or add your own (for example a `business` group with `keywords: { business: ['ltd'] }`). Keywords are checked in the order the groups are listed. Setting a `MONETA_GROUPS` environment variable to the same structure as JSON replaces the file entirely.

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
| `MONETA_PASSWORD` | unset | Optional. If set, the page asks for this password before showing balances. |
| `MONETA_REQUIRE_PASSWORD` | unset | Optional. Set to `1` to refuse to serve balances until a password is set. |
| `MONETA_GROUPS` | unset | Optional. JSON with the structure of `groups.config.js`; replaces that file when set. |
| `MONETA_DATA_DIR` | `data` | Self-hosted only. Where settings made in the app are stored. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | unset | Upstash Redis over REST, for settings shared across devices. `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` work too. |

### How it works

```
browser  ──GET /api/balances──▶  server.js  ──GET /accounts──────────────▶  Lunch Flow API
                                            ──GET /accounts/:id/balance──▶  (x-api-key header)
```

1. The server calls `GET /accounts` to list every connected account.
2. It calls `GET /accounts/:id/balance` for each account, a few at a time.
3. The results are joined, sorted by institution, grouped, summed per currency and cached.
4. The page renders the snapshot. An account whose balance could not be fetched is still listed, with the error next to it, and is left out of the totals.
5. The Accounts screen calls `GET /accounts/:id/transactions` for the chosen account and period, cached per account and period.

Routes served by the app:

| Route | Description |
| --- | --- |
| `GET /` | The page. |
| `GET /api/balances` | JSON snapshot of accounts, balances, groups and totals. Add `?refresh=1` to bypass the cache. When the server has no settings store, the page sends its settings in an `x-moneta-settings` header. |
| `GET`, `PUT /api/settings` | Read or replace the per-account settings made in the app. |
| `GET /api/activity?account=&from=&to=` | One account's transactions and totals for a period (dates as `YYYY-MM-DD`, at most 400 days; defaults to the current calendar month). |
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
src/balances.js    snapshot builder: fan-out, totals, grouping, caching
src/activity.js    per-account transactions and totals for a period
src/groups.js      puts accounts into groups from names and the config
src/settings.js    per-account settings made in the app, and where they are stored
groups.config.js   group names, keywords and fixed assignments
api/               Vercel serverless functions (balances, activity, settings, health)
src/auth.js        password gate for the API
src/app.js         HTTP handlers: JSON API and static files
src/mock.js        sample data used by `npm run mock`
public/            the page (index.html, app.js, style.css)
artifact/          the Claude-hosted version of the page (option 2)
test/              tests
```

### Security notes

- The self-hosted server binds to `127.0.0.1` by default, so only your machine can reach it. Anywhere else, whoever can reach the URL can see the balances unless `MONETA_PASSWORD` is set. The password check is timing-safe and slows down wrong guesses, but it is a single shared password, not an account system.
- The `.env` file is git-ignored. Never commit your API key.
- The API key is only ever sent to the Lunch Flow API host, in the `x-api-key` header.
