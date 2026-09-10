# Jarvis

A personal command centre — money, tasks, watchlist, journal — that lives on
your phone's home screen and keeps its data on your device.

Five sections: **Today** (the summary), **Money** (plan / bills / spending /
goals), **Queue** (movies and games), **Tasks**, **Journal**.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

## Put it on your iPhone

```bash
npm run build        # -> dist/
```

`dist/` is a static site. Host it anywhere with HTTPS — Netlify drop, Vercel,
GitHub Pages, Cloudflare Pages. Then on your phone: open the URL in Safari →
Share → **Add to Home Screen**. It launches full-screen with no browser chrome,
works offline, and keeps its own data.

iOS only offers "Add to Home Screen" from **Safari**, and only over HTTPS.

## Where your data lives

`localStorage`, in that one browser, on that one device. Nothing leaves your
phone; there is no server and no account.

The consequences are worth knowing:

- Clearing Safari's website data erases it.
- It does not sync between your phone and your laptop.
- Settings → **Export** is your backup. Do it before you switch phones,
  and keep the file — it is also how your data moves into the native build
  later.

## Locking the app

Settings → **App lock** is off by default. Turn it on to require a passphrase
on open — from then on your data is encrypted at rest (AES-256-GCM, key
derived from the passphrase via PBKDF2) instead of sitting as plain JSON.
There's no password reset: the passphrase *is* the key, and it's never
stored anywhere, so forgetting it means the on-device data is gone for good.
Keep a backup.

Exports can be encrypted too, with their own separate passphrase, independent
of whether the app lock is on — useful since the export file may end up in
iCloud Drive, email, or AirDrop, outside the device's own protection.

## Building the native app later

`src/core/` has no React and no DOM in it — types, budget maths, date helpers,
storage interface, store. That folder moves to an Expo project unchanged; you
write a new `StorageAdapter` over AsyncStorage and rebuild the screens with
React Native components. Expo's cloud builds produce the iOS binary, so a Mac
is not required.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Deployable PWA in `dist/` |
| `npm run build:single` | One self-contained HTML file in `dist-single/` |
| `npm run preview` | Serve the production build locally |
