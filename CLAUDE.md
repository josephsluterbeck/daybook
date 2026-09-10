# Jarvis — project context

A personal command centre for one user (Joseph). Runs today as an installable
PWA; the plan is to port it to React Native / Expo for the App Store without a
rewrite. Everything below exists to protect that port.

## Non-negotiable architecture rule

`src/core/` is **platform-free**. No React, no DOM, no `window`, no CSS.
It holds the types, the budget arithmetic, the date helpers, the storage
interface and the store. When this becomes a native app, `src/core/` moves over
byte-for-byte and only `src/ui/` gets rewritten.

The one React import in `core/` is `useSyncExternalStore` at the bottom of
`store.ts` — it is isolated there deliberately. Keep it that way.

If a new feature needs logic, the logic goes in `core/` and the screen calls it.
Do not put arithmetic inside a component.

## Layout

```
src/
  core/            portable — moves to React Native untouched
    types.ts       the whole data model + SCHEMA_VERSION
    dates.ts       'YYYY-MM-DD' local-date helpers (no date library)
    budget.ts      every money calculation; buildPlan() is the single source
                   of truth for "how am I doing this month"
    storage.ts     StorageAdapter interface (keyed, like AsyncStorage) + localStorage impl + migrations
    crypto.ts      AES-GCM/PBKDF2 primitives over Web Crypto (`crypto.subtle`), hand-rolled base64
    lock.ts        app-lock: encrypts AppData at rest under storage.LOCK_KEY, off by default
    backup.ts      encrypted export/import envelope, independent of the app-lock passphrase
    store.ts       ~60-line observable store; store.update(d => …) mutates a clone
    seed.ts        example data shown on first run
  ui/
    nav.ts         the five tabs
    styles.css     all styling; tokens at the top, light + dark
    components/kit.tsx   Icons, Sheet (the one modal), Field, Panel, Meter, Segmented
    screens/       Today, Money, Queue, Tasks, Journal
  App.tsx          tab shell
  main.tsx         mount + service-worker registration
```

## Conventions

- **Dates** are `'YYYY-MM-DD'` strings in local time, never `Date` objects in
  storage and never UTC. Use `dates.ts`; do not add dayjs/date-fns.
- **Money** is a plain number of currency units. Format only at render time via
  `formatMoney`.
- **Mutations** go through `store.update(d => { … })`. It clones, persists and
  notifies. Never mutate the object returned by `useData()`.
- **Every add/edit form** is a `<Sheet>`; there is one modal component on
  purpose. Follow the existing `*Sheet` pattern rather than inventing a new one.
- **Styling** is plain CSS with tokens in `:root`. No Tailwind, no CSS-in-JS.
  Define every colour in the bare `:root` block first, then override it in the
  dark blocks — a colour defined only inside a media query breaks the
  system-default theme.
- **Schema changes** bump `SCHEMA_VERSION` in `types.ts` and add a function to
  `migrations` in `storage.ts`. Existing users' data must keep opening.

## Security

- **App lock is opt-in, off by default.** Settings → App lock derives an
  AES-256-GCM key from a passphrase via PBKDF2 (210k iterations) and encrypts
  the whole `AppData` blob at rest under `jarvis.lock.v1`; the plaintext slot
  (`jarvis.data.v1`) is cleared while it's on. No passphrase is ever stored —
  losing it means the data is unrecoverable by design. See `core/lock.ts`.
- **Exports can be encrypted independently of the app lock** — `core/backup.ts`
  wraps the same primitives in a self-describing envelope (`looksEncrypted()`
  detects it on import) with its own passphrase, so a backup file is safe to
  put in iCloud Drive / email even with the app lock off.
- Both use `core/crypto.ts`, which only touches the global `crypto.subtle` /
  `crypto.getRandomValues` and hand-rolled base64 — no DOM, no `btoa`/`atob` —
  so it ports to React Native behind a `crypto` polyfill (e.g.
  `react-native-quick-crypto`) with no rewrite.
- There's still no server and no sync: nothing leaves the device either way.
  The lock protects against someone else picking up an unlocked phone; it
  does not protect against a compromised device (e.g. malware with
  filesystem access while the app is unlocked).

## Commands

```
npm run dev            dev server
npm run build          dist/        deployable PWA
npm run build:single   dist-single/ one self-contained HTML file
node check.mjs         headless smoke test (needs a local chromium path set)
```

## Deliberately not built yet

- **Assistant layer.** The intent is that it reads the same `AppData` the
  screens do — `buildPlan()` plus the raw arrays are the context you hand a
  model. No separate integration, no duplicate calculation.
- **Sync.** Local-first on purpose. Export/import JSON in Settings is the
  current backup and migration path.
- **Native build.** When it starts: new Expo app, copy `src/core/`, write a new
  `StorageAdapter` over AsyncStorage or expo-sqlite, rebuild the screens with
  React Native primitives.
