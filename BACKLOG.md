# Backlog

The second wave. `ROADMAP.md` covers features 1–33; this file continues at 34
so a number always means one thing across both documents.

**The rules in [`ROADMAP.md` → Implementation rules](./ROADMAP.md#implementation-rules)
apply to everything here** — the migration checklist, the theming pattern, the
date and store rules, the definition of done. They are not repeated below.
Read them first.

| Part | What it covers | Items |
|---|---|---|
| [Six](#part-six--the-insight-engine) | The app noticing things you didn't | 34–38 |
| [Seven](#part-seven--control-and-safety) | Sandboxing, closing the month, protecting the data | 39–42 |
| [Eight](#part-eight--friction) | Small removals of daily annoyance | 43–44 |

Numbers 45 onward are reserved for a set of non-finance sections still under
review. Don't reuse them.

---

# Part six — the insight engine

## Build this first: one engine, not four features

Items 35–38 all do the same thing in different clothes: read expense history,
notice something, and tell you. Built separately they become four independent
banners competing for the top of your screen, and an app that nags four times
on open is an app you stop opening.

So build the engine once.

### `src/core/insights.ts`

```ts
export type InsightKind = 'budget-drift' | 'burn-rate' | 'recurring-found' | 'anomaly'

export interface Insight {
  id: string                  // stable per kind+subject, so dismissals stick
  kind: InsightKind
  severity: 'info' | 'warn' | 'urgent'
  title: string               // one line, specific, with the number in it
  detail: string              // one sentence of why
  action?: { label: string; route: RouteKey; targetId?: ID }
  computedAt: string
}

export function allInsights(data: AppData, today?: string): Insight[]
```

Each detector below is a separate pure function in this file, all returning
`Insight[]`, and `allInsights` concatenates, ranks, and caps.

### Ranking and the cap

- Sort by severity, then by how recently the underlying thing changed.
- **Show at most two on the Today screen.** Ever. The rest live behind a
  "More insights" row.
- Dismissed insights go in `Settings.dismissedInsights: string[]` keyed by
  `Insight.id`, with the id stable across recomputes — a dismissal that doesn't
  stick is worse than no dismissal.
- An insight that recurs after being dismissed should not reappear for at least
  30 days. Store `{ id, until }` rather than a bare string list.

### The rules that keep it trustworthy

- **Never fire without enough data.** Every detector needs a minimum history —
  stated per item below. A confident claim from six weeks of data is how the
  user learns to ignore the whole feature.
- **Always name the number.** "Groceries is running 9% over" — never "you may
  be overspending."
- **Describe, don't advise.** The app knows what you spent. It does not know
  what you should do about it, and pretending otherwise is where personal
  finance apps get obnoxious.
- **Pure and testable.** These are the first functions in the project that
  really deserve unit tests. Fixtures of `AppData` in, `Insight[]` out.

---

## 34. Batch entry mode

**Why.** Catching up on a week of expenses currently means opening and closing
the sheet fifteen times. That's the moment people give up and stop logging.

**Data model.** None.

**Where.** A "Batch" toggle on the Money → Spending tab. It replaces the list
with a rapid-entry row:

```
[ amount ]  [ envelope ▾ ]  [ note ]  [ date ▾ ]   → Enter adds and resets
```

Behaviour that makes or breaks it:

- **Focus returns to the amount field** after each add. This is the entire
  feature; without it you're back to tapping around.
- **Envelope, note-blank and date persist** between entries — most of a catch-up
  session is the same envelope on consecutive days.
- **A running list of what you just added**, above the input, newest first,
  each with a delete. You will fat-finger one.
- **Running total** for the session.
- `Escape` or the toggle exits back to the normal view.

**Careful.** Do not reuse `Sheet` for this — a modal defeats the purpose. It is
an inline mode on the existing screen.

**Done when.** Fifteen expenses can be entered in under two minutes without the
hands leaving the keyboard on desktop, or without a modal opening on phone.

---

## 35. Budget vs. reality

**Why.** The most useful thing the app will ever know about you is the gap
between what you planned and what you did. Right now nothing surfaces it, so
envelope amounts stay at whatever you guessed on day one forever.

**Minimum data.** Three complete months for that envelope. Do not fire before.

**Core.**

```ts
export interface Drift { envelopeId: ID; budgeted: number; median: number; months: number; pct: number }
export function envelopeDrift(data: AppData, minMonths = 3): Drift[]
export function driftInsights(data: AppData): Insight[]
```

Use the **median** of complete months, not the mean — one Costco run shouldn't
redefine your grocery budget. Exclude the current month; it's partial and will
always read low.

Fire when `|pct| >= 15`. Below that it's noise.

**Where (UI).** An insight: *"Groceries: you budget $400, you typically spend
$437."* The action opens the envelope sheet with the suggested figure
pre-filled — but never writes it. A budget the app changed behind your back is
one you stop trusting.

Also worth a permanent home: a "Plan vs. actual" row in the envelope list
showing budgeted, median, and this month, once the data exists.

**Careful.** Under-spending is as interesting as over-spending and is currently
invisible. A $150 envelope you consistently spend $60 from is $90/month that
could have a job.

---

## 36. Envelope burn rate

**Why.** Distinct from the cashflow projection in
[ROADMAP #10](./ROADMAP.md#10-cashflow-projection): that one forecasts your
*account balance*; this one forecasts *one envelope* against the end of the
month. It warns you on the 12th, while you can still do something, instead of
on the 30th when you're already over.

**Minimum data.** At least 5 days into the month and 3 expenses in that
envelope this month. Extrapolating from one purchase on the 2nd is astrology.

**Core.**

```ts
export interface BurnRate { envelopeId: ID; spent: number; perDay: number; runsOutOn?: string; projectedTotal: number }
export function burnRates(data: AppData, mk?: string): BurnRate[]
export function burnRateInsights(data: AppData): Insight[]
```

`perDay = spent / daysElapsed`. `projectedTotal = perDay * daysInMonth`.
`runsOutOn` is only set when the projection exceeds the budget.

Fire when `projectedTotal > monthly * 1.1` **and** there are more than 5 days
left. An alert on the 28th is useless.

**Where (UI).** Inline on the envelope row — a second, dimmed marker on the
existing `Meter` at the projected position, with `runsOutOn` in the meta line.
Keep the projection visually subordinate to actual spend: one is a fact, the
other is a guess, and they must not look alike.

---

## 37. Recurring-charge detection

**Why.** This is how people find dead subscriptions. A charge that repeats
monthly and isn't in your bills list is either a bill you forgot to set up or
something you forgot to cancel — and both are worth knowing.

**Minimum data.** Three occurrences.

**Core.**

```ts
export interface RecurringCandidate {
  key: string                 // normalised note
  amount: number              // median
  occurrences: { date: string; expenseId: ID }[]
  cadenceDays: number         // median gap
  confidence: number          // 0-1
}
export function findRecurring(data: AppData): RecurringCandidate[]
export function recurringInsights(data: AppData): Insight[]
```

Matching:

- Normalise the note — lowercase, strip digits and punctuation, collapse
  whitespace. `"Netflix *1234"` and `"NETFLIX"` are the same thing.
- Group by normalised note **and** amount within ±5%. Subscriptions creep in
  price; identical-amount matching alone misses the renewal you most want to
  catch.
- Require gaps clustering around 28–31, 90–92, or 364–366 days.
- Confidence from occurrence count and gap variance. Only surface ≥ 0.7.

Exclude anything already matching a `Bill` label.

**Where (UI).** An insight with a two-button action: *"Make it a bill"*
(pre-fills the bill sheet from the detected amount and day) or *"Ignore"*
(permanent, stored by `key`).

**Careful.** Every expense you logged as a bare amount with no note is
invisible to this. That's fine — say so in the empty state rather than
silently detecting nothing, or it looks broken.

---

## 38. Spending anomalies

**Why.** The one detector where restraint matters most. Built badly it cries
wolf and teaches you to dismiss the whole insight system.

**Minimum data.** Eight weeks.

**Core.**

```ts
export function weeklyAnomalies(data: AppData, sigma = 2.5): Insight[]
```

Compare this week's per-envelope total against the median and median absolute
deviation of the prior eight weeks. MAD, not standard deviation — a single
holiday shouldn't inflate the threshold so far that nothing ever fires again.

**Tune it high.** Start at 2.5 MAD **and** an absolute floor (say $40) so a
$6 → $18 week on a small envelope doesn't trigger. Both conditions, not either.

**Cap: one anomaly insight at a time**, the largest. Three at once is a
dashboard nobody reads.

**Where (UI).** *"Eating out: $142 this week, usually around $55."* The action
opens the filtered expense list so you can see what it actually was — half the
time you'll remember immediately and dismiss it.

**Careful.** Do not fire on a *drop* in spending. Nobody needs an alert that
they spent less, and it's the fastest way to make the feature feel dumb.

---

# Part seven — control and safety

## 39. Scenario sandbox

**Why.** A safe place to think. "What if rent were $1,400?" "What if I dropped
$300/month of subscriptions into the Roth?" Right now the only way to ask is to
edit your real budget and remember to change it back.

**Data model.**

```ts
export interface Scenario {
  id: ID; label: string
  createdAt: string
  data: Pick<AppData, 'incomes' | 'bills' | 'envelopes' | 'goals'>   // a frozen copy
  note?: string
}
// AppData
scenarios: Scenario[]
```

Only the *plan* is copied — incomes, bills, envelopes, goals. Not expenses,
tasks, or notes. A scenario asks "what would my plan look like", not "what if
my history were different", and copying everything would multiply your storage
for no gain.

**Core.**

```ts
export function scenarioFrom(data: AppData, label: string): Scenario
export function planFor(s: Scenario): Plan          // reuse buildPlan's maths
export function comparePlans(a: Plan, b: Plan): { key: keyof Plan; from: number; to: number; delta: number }[]
export function commitScenario(data: AppData, id: ID): AppData
```

`planFor` must go through the **same** `buildPlan` used by the real screen —
construct a synthetic `AppData` from the scenario and call it. Two
implementations of the plan maths will diverge, and the divergence will be
silent.

**Where (UI).** A "Scenarios" entry in the drawer.

- "New from current plan" clones and opens it.
- Inside, the same editors as the real Plan tab, operating on the copy.
- A permanent comparison strip: real vs. scenario, deltas signed and coloured.
- Two exits: **Discard** and **Apply to my real plan** — the latter behind a
  confirm that names what changes, and it should push an undo entry.

**Careful.**

- Make it visually unmistakable that you're in a sandbox. A tinted header bar
  and a persistent "Scenario: cheaper apartment" label. Editing your real
  budget thinking you were in a sandbox is the failure mode, and it's a bad one.
- Scenarios go stale. Show the age, and warn past 60 days that the real plan
  has moved on.
- Cap at ~10 and prune oldest, or this is your largest storage consumer.

---

## 40. Month close-out

**Why.** Budgets rarely die from bad arithmetic. They die from drift — nobody
ever sits down and reconciles, so the numbers slowly stop meaning anything. A
deliberate ritual, once a month, is the fix.

**Data model.**

```ts
export interface MonthClose {
  month: string               // 'YYYY-MM'
  closedAt: string
  totals: { income: number; bills: number; spent: number; saved: number }
  perEnvelope: { envelopeId: ID; budgeted: number; spent: number }[]
  note?: string
}
// AppData
closes: MonthClose[]
```

This snapshot is the point. Envelopes get renamed and re-budgeted; without a
frozen record, last March becomes unreconstructable.

**Where (UI).** Offered on the Today screen from the 1st until it's done, then
gone. A guided sequence, one step per screen:

1. **What happened** — income, bills, spending, saving vs. plan.
2. **Envelopes** — over and under, each with "adjust for next month" using the
   [#35](#35-budget-vs-reality) suggestion where one exists.
3. **Unpaid bills** — anything still unticked. Paid and forgotten, or actually
   missed?
4. **Goals** — did the planned contributions happen? Log them.
5. **Roll over** — apply carry-over for envelopes with it enabled.
6. **A note** — one line on how the month went. Feeds
   [year in review](./ROADMAP.md#22-year-in-review).

**Careful.** Every step skippable, the whole thing dismissible, and it must
never block the app. A ritual you're forced through is a ritual you learn to
resent. Also make it re-openable from the drawer — it should be possible to
close out a month late.

---

## 41. Encryption at rest

**Why.** No server means no breach, but it also means your budget sits in
plaintext in localStorage on a device you carry around.

**Split this in two.** They have very different cost/benefit and should not be
one feature.

### 41a. Encrypted exports — build this

Low friction, real benefit. Your export file is the thing that ends up in
iCloud Drive, in an email to yourself, on a laptop.

```ts
// core/crypto.ts — WebCrypto only, no dependency
export async function encryptJson(plain: string, passphrase: string): Promise<string>
export async function decryptJson(payload: string, passphrase: string): Promise<string>
```

PBKDF2-SHA256, ≥ 250,000 iterations, random 16-byte salt, AES-GCM with a random
12-byte IV. Emit a self-describing envelope so a future version can change
parameters:

```json
{ "v": 1, "kdf": "PBKDF2-SHA256", "iter": 250000, "salt": "…", "iv": "…", "ct": "…" }
```

In Settings: an optional passphrase field on export, and detect-and-prompt on
import. **Never store the passphrase.** State plainly next to the field that a
forgotten passphrase means the file is gone — there is no recovery and there
cannot be.

### 41b. Encrypted local storage — think before building

Encrypting the localStorage blob means a passphrase on **every cold launch**,
because the key can't be persisted without defeating the purpose. That is
directly at odds with an app whose entire premise is three-second expense
logging.

If you build it:

- Keep the derived key in memory only; re-prompt after a background period.
- The [PIN lock](./ROADMAP.md#smaller-things) is *not* this. A PIN gates the
  UI; this gates the bytes. Don't let the UI imply otherwise.
- Make it opt-in, and make the trade-off explicit in the toggle's description.

**My read:** build 41a, and treat 41b as available rather than default. The
realistic threat to this data is a lost unlocked phone, which a device
passcode already covers.

---

## 42. Quiet mode

**Why.** You'll open this on a train, in a waiting room, at a desk with someone
behind you. Right now the first thing on screen is a large number describing
your finances.

**Data model.**

```ts
// Settings
quiet: boolean
```

Persisted, because if it resets on reload it's useless in exactly the moment
you wanted it.

**Where.** A toggle in the drawer, top-level, one tap from anywhere.

Implementation: a `[data-quiet='true']` attribute on the root and one CSS rule.

```css
:root[data-quiet='true'] .num,
:root[data-quiet='true'] .figure,
:root[data-quiet='true'] .stat .v { filter: blur(7px); transition: filter .15s; }
:root[data-quiet='true'] .num:focus-visible { filter: none; }
```

- **Blur, don't hide.** Layout must not shift, or toggling is jarring.
- Tap-and-hold any blurred figure to reveal it briefly.
- Do not blur envelope *names*, task titles, or film names — only figures.
  Blurring everything makes the app unusable rather than discreet.
- An unmissable indicator that it's on, or you'll wonder why nothing renders.

**Careful.** CSS blur is not redaction. Anyone with devtools reads it straight
off. This is for shoulders, not adversaries — say so if you ever describe it in
the UI.

---

# Part eight — friction

## 43. Backlog triage

**Why.** Wishlists that only grow stop being decision tools and become guilt.

**Data model.**

```ts
// Game and Movie
lastReviewed?: string
```

**Core.**

```ts
export function triageCandidates(data: AppData, olderThanDays = 120): (Movie | Game)[]
```

Oldest `lastReviewed ?? addedAt` first. Five at a time, never the whole list.

**Where (UI).** A card in Queue, offered at most monthly: "Five things you added
a while ago. Still want them?" Each gets three buttons — **Keep** (stamps
`lastReviewed`), **Drop** (archives), **Bump** (raises priority / moves to
backlog).

**Careful.** Never auto-remove anything. The value is the prompt, not the
pruning, and an app that deletes your list is an app you don't trust with a
list.

---

## 44. Task energy tags

**Why.** The reason tasks don't get done usually isn't lack of time. It's that
the fifteen minutes you have are low-energy minutes and everything on the list
needs focus.

**Data model.**

```ts
export type Energy = 'low' | 'medium' | 'high'
// Task
energy?: Energy
minutes?: number            // rough estimate
```

Both optional. A required field on quick-add would kill quick-add.

**Core.**

```ts
export function tasksFor(data: AppData, energy: Energy, maxMinutes?: number): Task[]
```

**Where (UI).** A filter row on Tasks — "Got 15 minutes?" / "Low energy" — and
optionally one suggestion on Today. Default the filter to off; it's a lens, not
the structure.

**Careful.** Two optional fields is already at the limit of what anyone will
fill in. Resist adding context, location, or project here — that's the road to
a task app with twelve fields per row and nothing in it.

---

## Order

If you build in this order, each step makes the next cheaper:

1. **[The insight engine skeleton](#build-this-first-one-engine-not-four-features)** —
   before any detector. Building a detector first means retrofitting it.
2. **[#35 budget vs. reality](#35-budget-vs-reality)** — the highest-value
   detector and the easiest to get right.
3. **[#34 batch entry](#34-batch-entry-mode)** — removes friction you feel
   every week, and independent of everything else here.
4. **[#42 quiet mode](#42-quiet-mode)** — an afternoon, one CSS rule.
5. **[#40 month close-out](#40-month-close-out)** — needs #35 to be worth doing,
   so it can't come earlier.
6. **[#37 recurring detection](#37-recurring-charge-detection)** and
   **[#36 burn rate](#36-envelope-burn-rate)** — once the engine has proved
   itself with one detector.
7. **[#39 scenario sandbox](#39-scenario-sandbox)** — the largest build in this
   file, and worth doing when the plan is stable enough to be worth branching.

**[#38 anomalies](#38-spending-anomalies)** last of the detectors — it needs the
most history and is the easiest to make annoying.
**[#41a encrypted exports](#41a-encrypted-exports--build-this)** whenever;
it touches nothing else.
**[#43](#43-backlog-triage)** and **[#44](#44-task-energy-tags)** are
opportunistic — do them in a gap.
