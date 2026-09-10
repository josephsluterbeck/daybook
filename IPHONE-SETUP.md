# Getting Jarvis onto your iPhone, securely

A one-time setup. After this, your data lives only on your phone, and the
page itself is behind a real login — not just an unlisted URL.

## 1. Build it

```bash
npm run build
```

This produces `dist/` — a static site, no server required.

## 2. Deploy to Cloudflare Pages

Cloudflare Access (step 3) only gates traffic on Cloudflare's own network, so
the site needs to live there rather than Netlify/Vercel/GitHub Pages.

1. Go to **[dash.cloudflare.com](https://dash.cloudflare.com)** and sign up
   — free, no card required for this.
2. Left sidebar → **Workers & Pages** → **Create** → **Pages** tab →
   **Upload assets**.
3. Name the project (e.g. `jarvis`) → drag your `dist/` folder in →
   **Deploy**.
4. You'll get a URL like `jarvis-xyz.pages.dev`. Keep it — you'll need it in
   the next two steps.

## 3. Put a real login in front of it — Cloudflare Access

Without this, the URL is unlisted but not private: anyone who ends up with
the link can open the page. Access closes that.

1. Left sidebar → **Zero Trust**. First time in, it asks for a team name
   (anything) — the free plan covers up to 50 users at no cost.
2. **Access → Applications → Add an application → Self-hosted**.
3. Set the application domain to your `pages.dev` URL from step 2.
4. Under policies: **Allow** → **Include → Emails** → your own email
   address.
5. Save.

From now on, opening that URL shows a Cloudflare login page first — enter
your email, get a one-time code sent to it, enter that — *then* the app
loads. Nobody without access to that email inbox can reach the page at all,
not even the static files; it's gated before your app ever runs.

## 4. Add it to your iPhone

1. Open the `pages.dev` URL **in Safari** — this only works from Safari, not
   Chrome or another browser.
2. Pass the Cloudflare Access check (email + one-time code) the first time.
3. Tap the **Share** icon → scroll down → **Add to Home Screen** → **Add**.

An icon appears on your home screen. Opening it launches full-screen with no
browser chrome and works offline after the first load.

## 5. Turn on the in-app lock

This is separate from Cloudflare Access, and matters even after it — Access
protects the *page*; this protects the *data* if someone ever has your phone
unlocked in hand.

1. In the app: **Settings → App lock → Turn on lock**.
2. Set a passphrase (6+ characters, the longer the better) and confirm it.

From then on, opening the app asks for that passphrase, and your data is
encrypted at rest (AES-256-GCM) instead of sitting as plain text on the
device. **There is no password reset** — the passphrase *is* the encryption
key, never stored anywhere, so losing it means the on-device data is gone
for good. Keep a backup (Settings → Backup → Export encrypted backup) with
its own separate passphrase, written down somewhere safe.

## What "local only" actually means, verified

Before writing this guide, I audited the actual code and the production
build for anything that would contradict "local only":

| Checked | Result |
|---|---|
| Network calls (`fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`) in the app | None found |
| Hardcoded external URLs in the app's source | None found |
| External hosts in the built production bundle | Only `fonts.googleapis.com` / `fonts.gstatic.com` (fonts, no user data) |
| Analytics / telemetry / crash-reporting libraries | None — the only runtime dependencies are `react` and `react-dom` |
| Where data is stored | Two `localStorage` keys, nothing else — no cookies, no IndexedDB |
| Service worker behavior | Caches same-origin files for offline use only; never sends data anywhere |

Nothing you enter — your budget, your goals, your notes — leaves the device
at any point, with or without the app lock on. The lock protects that data
from someone else picking up your unlocked phone; Cloudflare Access protects
the page itself from being reachable by anyone who isn't you.

## Updating it later

```bash
npm run build
npx wrangler pages deploy dist
```

(One-time `npx wrangler login` first.) This redeploys to the same project
and URL — the Access policy stays attached automatically, and your data on
the phone is untouched, since it lives in the browser's storage, not in the
deployed code. If a change ever reshapes the data itself, `CLAUDE.md`
documents the migration step that keeps existing data opening under the new
build.
