# Roadmap

Features that survive three constraints: **no money, no server, no data from
outside localStorage.** Everything here is client-side arithmetic over data
already in `AppData`, or small additions to it.

Read `CLAUDE.md` first — the architecture rules there govern all of this. The
short version: logic goes in `src/core/`, screens call it, and `core/` stays
free of React and the DOM so it ports to React Native.

## Build order

Ordered by value per hour of work, not by ambition.

| # | Feature | Effort | Why this order |
|---|---------|--------|----------------|
| 1 | [Month navigation](#1-month-navigation) | ~1h | `buildPlan()` already accepts a month; the UI just never passes one |
| 2 | [Expense presets](#2-expense-presets) | ~2h | Logging friction is the thing that kills this app |
| 3 | [Backup nag](#3-backup-nag) | ~1h | Cheap insurance against losing everything |
| 4 | [Undo](#4-undo) | ~2h | Deletion is currently instant and permanent |
| 5 | [Can I afford this?](#5-can-i-afford-this) | ~3h | The question you actually have, standing in a shop |
| 6 | [Shortcut deep links](#6-shortcut-deep-links) | ~3h | Logging without opening the app |
| 7 | [Goal contribution log](#7-goal-contribution-log) | ~3h | Turns a hand-edited number into a real savings curve |
| 8 | [Bill payment history](#8-bill-payment-history) | ~2h | Planned outflow becomes actual outflow |
| 9 | [Envelope sparklines](#9-envelope-sparklines) | ~4h | Needs #8 and three months of data to mean anything |
| 10 | [Cashflow projection](#10-cashflow-projection) | ~8h | The hard one, and the one nothing else does |
| 11 | [Weekly review](#11-weekly-review) | ~4h | Makes the journal worth keeping |

Do 1–4 in an evening. They are all small and all remove daily friction.

**One exception to this order:** build
[#12 irregular bills](#12-irregular-bills-and-sinking-funds) right after #1. It
is not optional polish — without it the whole plan is quietly wrong, and it
gets more painful to migrate the longer you wait.

Part two ([#12–16](#part-two--more-money)) is the rest of the money work.
Part three ([#17–22](#part-three--everything-else)) is everything outside
finance. Part four ([#23–29](#part-four--new-sections)) is sections the app
doesn't have at all, starting with the navigation change they all depend on.
Part five ([#30–33](#part-five--look-and-feel)) is making it yours to look at.

**Before writing any code, read [Implementation rules](#implementation-rules)
at the bottom.** It's the checklist that keeps schema migrations, theming, and
the React Native port from breaking.

---

## 1. Month navigation

**Why.** Every "where did my money go last month" question is unanswerable
right now. The data is all there.

**Data model.** None. `buildPlan(data, mk)` and `spentByEnvelope(expenses, mk)`
already take a month key.

**Where.** `src/ui/screens/Money.tsx`.

- Lift a `const [mk, setMk] = useState(monthKey())` into the `Money` component
  and pass it down to all four tabs.
- Add a `‹ September 2026 ›` stepper above the segmented control. Use
  `addMonths` from `core/dates.ts` on the first of the month.
- Disable the forward arrow when `mk === monthKey()`; there is nothing to see
  in the future yet.
- `SpendingTab`'s quick-add must always write to `todayKey()` even when viewing
  an older month, or make the Log button read "Add to September" when the
  viewed month is not the current one. Silent misfiling is the failure mode.

**Careful.** `buildPlan` computes `daysLeft` from the real clock and only
special-cases the current month. For a past month it returns the full month
length, which makes `perDay` meaningless historically. Either hide the hero
figure for past months or return `daysLeft: 0` and render the total spent
instead.

**Done when.** You can step back to a month with expenses in it and see correct
per-envelope totals, and there is no way to accidentally log today's coffee
into August.

---

## 2. Expense presets

**Why.** Most spending is repetitive. Typing `82.40` + picking "Groceries" for
the fourth time this month is the friction that ends the habit.

**Data model.** None — derive presets from history rather than storing them.

```ts
// core/budget.ts
export interface Preset { amount: number; envelopeId?: ID; note?: string; count: number }
export function frequentExpenses(expenses: Expense[], limit = 4): Preset[]
```

Group the last ~90 days by `envelopeId` + rounded amount bucket, rank by
frequency, return the top few. Round amounts to something tappable (nearest £5
/ $5) — an exact preset of `$82.40` is never right twice.

**Where.** A row of chips at the top of `SpendingTab`, and the same row on the
Today screen so logging never needs a tab change.

**Alternative worth trying first.** Remember the last envelope used and
pre-select it. One line of state, and it removes half the taps. Do this
regardless.

**Done when.** Your three most common expenses are one tap each from the Today
screen.

---

## 3. Backup nag

**Why.** Everything lives in one browser on one device. The failure is silent
and total.

**Data model.**

```ts
// Settings
lastExportAt?: string   // ISO
```

Set it in `Settings.tsx` on a successful `exportJson()` or `copyJson()`.

**Where.** A `.notice` banner at the top of the Today screen when
`lastExportAt` is missing or more than 30 days old. One sentence, one button
that runs the export directly — do not send the user hunting through Settings.

Dismissing should snooze for a week, not forever. Store `exportNagSnoozedUntil`
in settings.

**Done when.** You cannot go two months without being offered a one-tap backup.

---

## 4. Undo

**Why.** Every `Delete` in every Sheet is immediate and unrecoverable. One
mis-tap loses a goal with a year of history in it.

**Where.** `core/store.ts` — this belongs in the store, not in components.

```ts
// Keep the previous serialised state in memory (not persisted).
private undoStack: string[] = []   // cap at ~10
undo(): boolean                    // restore + notify; false if nothing to undo
canUndo(): boolean
```

Push the pre-mutation snapshot inside `update()` before assigning `this.data`.
Do not persist the stack — undo across app restarts is not worth the storage.

**Where (UI).** A small toast component in `App.tsx`: "Deleted 'Emergency
fund'. Undo." for five seconds. Only show it for deletions, not every edit.

**Done when.** Deleting anything can be reversed within five seconds, and the
toast never covers the bottom tab bar.

---

## 5. Can I afford this?

**Why.** It is the actual question, and every number needed to answer it is
already in `AppData`.

**Data model.** None.

**Where.** New pure function in `core/budget.ts`:

```ts
export interface Affordability {
  amount: number
  envelopeId?: ID
  envelopeLeftAfter?: number   // undefined when no envelope chosen
  unassignedAfter: number
  perDayAfter: number
  verdict: 'yes' | 'tight' | 'no'
  reason: string               // one sentence, plain language
}
export function canIAfford(data: AppData, amount: number, envelopeId?: ID): Affordability
```

Verdict rules — keep them explicit and readable, not a scoring function:

- `no` — it puts the chosen envelope negative and there is not enough
  unassigned to cover the overage.
- `tight` — it fits, but drops `perDayAfter` below some floor (start at 10)
  or leaves the envelope under 10% remaining.
- `yes` — otherwise.

`reason` should name the constraint that decided it: *"That leaves $31 of
groceries for 12 days."* Never just "yes".

**Where (UI).** A small panel on the Money → Plan tab: amount field, optional
envelope picker, live verdict as you type. Reuse the `.hero` figure treatment
for the answer and the status tokens (`--good` / `--warn` / `--over`) for tone.
Always show the numbers next to the colour — never colour alone.

**Done when.** Typing `180` with "Fun money" selected gives an immediate,
specific answer naming the constraint.

---

## 6. Shortcut deep links

**Why.** Highest-leverage friction removal available without a server. Logging
an expense stops requiring you to open the app at all.

**Data model.** None.

**Where.** New file `src/core/intents.ts` (portable — a React Native build maps
the same shapes onto its own deep-link handler):

```ts
export type Intent =
  | { kind: 'expense'; amount: number; envelope?: string; note?: string }
  | { kind: 'task'; title: string; due?: string }
  | { kind: 'note'; text: string }

export function parseIntent(search: string): Intent | null
export function applyIntent(data: AppData, intent: Intent): AppData
```

Envelope matching is by case-insensitive label, not id — a Shortcut cannot know
your ids. Unmatched label means the expense lands unassigned rather than being
dropped.

**Where (UI).** In `main.tsx` or a `useEffect` in `App.tsx`, before first
paint: parse `location.search`, apply, then
`history.replaceState({}, '', location.pathname)` so a refresh doesn't log the
same expense twice. That replaceState is not optional — without it, one pull-
to-refresh doubles your groceries.

Show a confirmation toast naming what was added, so a mistyped Shortcut is
visible immediately.

**URL shapes.**

```
?add=expense&amount=12.50&envelope=groceries&note=coffee
?add=task&title=Renew%20registration&due=2026-10-01
?add=note&text=Idea%20for%20the%20app
```

**The Shortcut.** Shortcuts app → new shortcut → *Ask for Input* (number) →
*Open URLs* with the URL built from that input. Add it to the Lock Screen or
the Action Button. One per common envelope beats one generic one.

**Caveat.** Opening an in-scope URL should land in the installed web app rather
than Safari, but iOS is inconsistent about this across versions. Test it before
you build four Shortcuts. If it opens in Safari, the expense lands in Safari's
separate storage and will not appear in your installed app — which is exactly
the kind of silent divergence worth catching early.

---

## 7. Goal contribution log

**Why.** `Goal.saved` is a number you edit by hand, so there is no history and
no way to see whether you actually contributed what you planned.

**Data model.**

```ts
export interface Contribution { id: ID; goalId: ID; date: string; amount: number }
// AppData
contributions: Contribution[]
```

Bump `SCHEMA_VERSION` to 2 and add a migration in `storage.ts`:

```ts
const migrations = {
  1: (d) => ({ ...d, contributions: [] }),
}
```

Keep `Goal.saved` as the authoritative balance — it may include money banked
before you started using the app. Contributions are the ledger on top of it;
logging one increments `saved` and appends a row.

**Where.** A "Log contribution" button on each goal row in `GoalsTab`,
defaulting to that goal's `monthly`. Show contributed-this-month vs planned on
the goal row so a missed month is visible.

**Done when.** You can see that you actually put $200 into the emergency fund
in September, not just that you meant to.

---

## 8. Bill payment history

**Why.** `Bill.paid` is a list of month keys — you know *that* September was
paid, never *when* or *how much*. Without dates there is no real cashflow
history, and #9 and #10 both depend on it.

**Data model.** Replace the string array with records:

```ts
export interface BillPayment { month: string; date: string; amount: number }
// Bill
payments: BillPayment[]     // was: paid: string[]
```

Migration (schema 2 → 3):

```ts
2: (d) => ({
  ...d,
  bills: d.bills.map((b) => ({
    ...b,
    payments: (b.paid ?? []).map((m) => ({ month: m, date: `${m}-01`, amount: b.amount })),
    paid: undefined,
  })),
}),
```

The synthesised `-01` dates are a lie about history you never recorded — that is
fine, but do not later present them as if they were observed.

Amount-per-payment matters: bills that vary (utilities) are the ones you most
want a history of.

**Update.** `upcomingBills()` and `buildPlan()`'s `billsRemaining` both check
`b.paid.includes(mk)` today — switch to `b.payments.some(p => p.month === mk)`.

---

## 9. Envelope sparklines

**Why.** The payoff for all that logging. Six months of groceries in one glance
tells you something no monthly total does.

**Depends on.** #1 (month navigation) and enough history to be worth drawing —
three months minimum, six before it's interesting.

**Data model.** None.

```ts
// core/budget.ts
export function envelopeHistory(expenses: Expense[], envelopeId: ID, months: number): { month: string; total: number }[]
```

**Where.** Inline SVG in the envelope row, next to the existing `Meter`. Follow
the chart rules already in play in this app:

- One series, so no legend — the row label names it.
- Recessive line, emphasised endpoint dot, no axis furniture at this size.
- Colour from theme tokens so it works in both themes; never a hardcoded hex.
- The current month is partial — draw it dashed or dimmed, or the last point
  always looks like a collapse.
- Give the `viewBox` room for the endpoint dot or it clips.

**Done when.** Six months of groceries reads at a glance and the current
partial month is visibly distinguished.

---

## 10. Cashflow projection

**Why.** The one thing a spreadsheet can't do easily and paid apps charge for:
*"your low point is $43 on the 12th, and rent lands on the 1st."* Everything
else on this list looks backwards; this looks forwards.

**Data model.**

```ts
// Income — needs an anchor to generate pay dates from a cadence
anchorDate: string          // 'YYYY-MM-DD' — a known payday

// Settings — you type this; it is not synced from anywhere
balance?: number
balanceAsOf?: string        // 'YYYY-MM-DD'
```

Schema bump + migration: default `anchorDate` to the first of the current
month for existing incomes and let the user correct it. Prompt for balance
rather than assuming zero — a projection from a wrong balance is worse than no
projection.

**Where.** `core/cashflow.ts`, new file, pure:

```ts
export interface DayPoint { date: string; balance: number; events: CashEvent[] }
export interface CashEvent { kind: 'income' | 'bill' | 'spend'; label: string; amount: number }
export function project(data: AppData, days = 45): DayPoint[]
export function lowPoint(points: DayPoint[]): DayPoint
```

Model:

- Income events from `anchorDate` + cadence, stepping forward.
- Bill events from `dueDay`, skipping any already recorded paid in #8.
- Envelope spending as a flat daily burn (`envelopeLeft / daysLeft`) — crude,
  but honest and better than ignoring it. Do not try to predict irregular
  spending; you will be wrong and it will erode trust in the whole screen.

**Where (UI).** A line chart on the Money → Plan tab with the low point
labelled directly. Zero line always visible. If the projection dips below zero,
that is the headline of the entire app that day — surface it on Today.

**Careful.** `balanceAsOf` goes stale. If it is more than ~10 days old, say so
and ask for a fresh figure rather than projecting confidently from an old
number.

---

## 11. Weekly review

**Why.** The journal currently only accumulates. Nothing ever reads it back,
which is why journals die.

**Data model.** None, though a `reviewedAt` in settings avoids re-showing it.

**Where.** A screen reachable from Today on Sundays (or any day, on demand):

- Spent this week vs. the same week last month.
- Envelopes that went over.
- Tasks completed, and tasks that slipped from last week.
- Every journal note from the last seven days, in full.
- Films watched, games played.

No new maths — it is a different arrangement of what `buildPlan`,
`spentByEnvelope`, and the task/note arrays already give you.

**Done when.** Sunday evening, one screen, and you have actually read what you
wrote on Tuesday.

---

---

# Part two — more money

| # | Feature | Effort | Why |
|---|---------|--------|-----|
| 12 | [Irregular bills and sinking funds](#12-irregular-bills-and-sinking-funds) | ~4h | The plan is wrong without it |
| 13 | [Paycheck allocation](#13-paycheck-allocation) | ~5h | You're paid biweekly and budgeting monthly |
| 14 | [Debt payoff](#14-debt-payoff) | ~4h | Turns a car payment into a finish line |
| 15 | [Envelope rollover](#15-envelope-rollover) | ~2h | Changes how the whole thing feels |
| 16 | [Split expenses and refunds](#16-split-expenses-and-refunds) | ~3h | Without them you'll fudge numbers |

## 12. Irregular bills and sinking funds

**Why.** `Bill` has only a `dueDay`, so it assumes everything is monthly. But
insurance, registration, domain renewals, and Christmas are exactly the
expenses that break budgets — invisible for eleven months, then all at once. A
$768 semi-annual insurance payment entered as "$128/month" is wrong in both
directions: eleven months look tight, and the twelfth is a crisis.

**Data model.**

```ts
export type BillCadence = 'monthly' | 'quarterly' | 'semiannual' | 'annual'

// Bill
cadence: BillCadence
dueMonth?: number      // 1-12, the anchor month for non-monthly bills
```

Schema bump + migration: existing bills get `cadence: 'monthly'`. Straight
default, nothing to guess.

**Core.** In `budget.ts`:

```ts
/** What this bill costs per month, whatever its cadence. */
export function billMonthlyCost(b: Bill): number

/** Money that should already be set aside for a bill not due this month. */
export function sinkingBalance(b: Bill, today?: Date): number
```

`billsTotal()` becomes the sum of `billMonthlyCost` — so the Plan tab shows the
true monthly cost of being you, not just this month's invoices.
`billsRemaining` stays what's literally due this month; they are different
numbers and the UI must not conflate them.

**Where (UI).** In the Bill sheet, a cadence picker; when it's not monthly, a
month picker too. On the Bills tab, split into "Due this month" and "Building
up" — the second list showing each accruing bill's set-aside and next due date.
That second list is the feature. It's the thing you currently have no way to see.

**Careful.** `nextDueDate()` in `dates.ts` is monthly-only. It needs a cadence
argument, and every caller must be updated — `upcomingBills()` and the Today
screen both use it.

**Done when.** A $768 annual bill shows as $64/month accruing, the Plan tab
reflects it, and you can see in September how much of March's insurance you've
already covered.

## 13. Paycheck allocation

**Why.** You're paid every two weeks but budgeting by calendar month. Twice a
year that means three paychecks in a month; every other month rent lands before
the money does. Monthly planning describes the year correctly and describes any
given fortnight badly.

**Depends on.** `Income.anchorDate` from [#10](#10-cashflow-projection) — build
that field first even if you don't build the projection yet.

**Data model.**

```ts
export interface Allocation { id: ID; paycheckDate: string; targetKind: 'bill' | 'envelope' | 'goal'; targetId: ID; amount: number }
// AppData
allocations: Allocation[]
```

**Core.**

```ts
/** Pay events between two dates, from anchorDate + cadence. */
export function payDates(incomes: Income[], from: string, to: string): { date: string; incomeId: ID; amount: number }[]

/** What still needs funding before the next paycheck lands. */
export function fundingGap(data: AppData, until: string): { targetId: ID; label: string; needed: number }[]
```

**Where (UI).** A flow that appears on Today when a pay date has passed and
that paycheck has no allocations: "Your paycheck landed. $1,450 to assign."
Then a list of bills due before the *next* paycheck, plus envelopes, with
suggested amounts pre-filled and a running "left to assign" figure that must
reach zero.

**Careful.** This is a second budgeting model sitting beside the monthly one.
They must agree, or you'll trust neither. Make monthly the plan and
allocations the execution against it, and show the reconciliation explicitly
rather than hoping it lines up.

## 14. Debt payoff

**Why.** A car payment in the bills list is a fact. A payoff date is a finish
line, and "an extra $50/month saves you $310 and four months" is a decision.

**Data model.**

```ts
export interface Debt {
  id: ID; label: string
  balance: number; apr: number        // annual %, e.g. 6.9
  minimum: number; extra: number
  billId?: ID                          // link to the Bill it's paid through
}
// AppData
debts: Debt[]
```

**Core.** New file `core/debt.ts`, pure:

```ts
export interface AmortRow { month: number; date: string; interest: number; principal: number; balance: number }
export function amortise(d: Debt, monthlyPayment?: number): AmortRow[]
export function payoffDate(d: Debt): string
export function totalInterest(d: Debt): number
export function order(debts: Debt[], method: 'snowball' | 'avalanche'): Debt[]
```

Standard monthly amortisation: `interest = balance * apr / 1200`. Cap the loop
(600 months) so a payment below the interest charge returns "never" instead of
hanging.

**Where (UI).** A Debt sub-tab under Money. Per debt: balance, payoff date,
total interest remaining, and a slider for extra payment that updates both
live. That slider is the whole feature — seeing the date move is what makes
anyone actually pay extra.

**Careful.** This is arithmetic on numbers you typed, not advice. Don't have
the app tell you which debt to pay first in an authoritative voice; show both
orderings and what each costs.

## 15. Envelope rollover

**Why.** Leftover grocery money should carry forward — you underspent, the
money still exists. Leftover "fun money" arguably shouldn't. Both behaviours
are right, for different envelopes.

**Data model.**

```ts
// Envelope
rollover: boolean
```

Migration: default `false`, which preserves today's behaviour exactly.

**Core.** `spentByEnvelope` stays as-is; add:

```ts
/** Accumulated carry-over into `mk` for one envelope. */
export function rolloverBalance(data: AppData, envelopeId: ID, mk: string): number
```

Walk months from the envelope's first expense to `mk`, accumulating
`monthly - spent`, clamped so debt doesn't carry forever unless you want it to
(decide explicitly: negative rollover is the honest option, and the harsher one).

**Where (UI).** Envelope rows show `$400 + $37 carried = $437`. The `Meter`
max becomes the effective budget.

**Careful.** This makes envelope maths history-dependent, so it gets slower and
harder to reason about. Cache per month, and make sure `buildPlan` uses the
effective figure or the Plan tab and the envelope list will disagree.

## 16. Split expenses and refunds

**Why.** One shop is groceries *and* household. A return is money coming back.
Neither is expressible today, so you'll round, guess, or skip — and a budget
you've fudged is one you stop believing.

**Data model.** The clean version changes `Expense` to carry lines:

```ts
export interface ExpenseLine { envelopeId?: ID; amount: number }
// Expense
lines: ExpenseLine[]      // replaces the single envelopeId + amount
```

Migration: `lines: [{ envelopeId: e.envelopeId, amount: e.amount }]`. Keep a
derived `total` getter or a helper — most of the app only wants the sum.

Refunds need nothing new: a negative `amount`. But audit for
`Math.abs`/positive assumptions, and make sure `spentByEnvelope` sums signed
values.

**Where (UI).** Keep the fast path fast — the quick-add stays one amount, one
envelope. Splitting is a "Split" button inside the expense sheet that turns one
line into several with a running remainder. Never make the common case pay for
the rare one.

**Done when.** A $140 Target run can be $95 groceries and $45 household, and
returning a $30 shirt puts $30 back in the right envelope.

---

# Part three — everything else

The finance section is the most *built*; it isn't necessarily the most *used*.
Tasks and the queue are what you'll open on a Tuesday evening.

| # | Feature | Effort | Why |
|---|---------|--------|-----|
| 17 | [Quick-add parser](#17-quick-add-parser) | ~4h | Collapses five taps into one line |
| 18 | [Global search](#18-global-search) | ~2h | You'll use it more than you expect |
| 19 | [Calendar export](#19-calendar-export-ics) | ~3h | Your tasks in Apple Calendar, no server |
| 20 | [Routines](#20-routines) | ~4h | Repeating *groups*, not repeating tasks |
| 21 | [TV series](#21-tv-series) | ~4h | The queue is films-only, and you don't only watch films |
| 22 | [Year in review](#22-year-in-review) | ~5h | The reward for a year of logging |
| — | [Smaller things](#smaller-things) | <2h each | Worth an evening between the big ones |

## 17. Quick-add parser

**Why.** The most Jarvis-feeling thing you can build with no API key. One
field, and it works out what you meant.

```
coffee 4.50 #eatingout        -> expense, $4.50, Eating out envelope
buy milk tomorrow             -> task due tomorrow
call the dentist friday 2pm   -> task, dated and timed
idea: split the queue by mood -> journal note
```

**Where.** `core/parse.ts`, pure and heavily unit-tested — this is the one part
of the app where being wrong is worse than being absent, because it silently
files things in the wrong place.

```ts
export type Parsed =
  | { kind: 'expense'; amount: number; envelopeHint?: string; note: string }
  | { kind: 'task'; title: string; due?: string; time?: string }
  | { kind: 'note'; text: string }

export function parseQuickAdd(input: string, envelopes: Envelope[]): Parsed
```

Rules, in order — first match wins:

1. Contains a currency amount (`4.50`, `$4.50`, `12`) → expense. `#tag` or a
   fuzzy match against envelope labels picks the envelope; the rest is the note.
2. Contains a date word (`today`, `tomorrow`, a weekday, `next week`, `in 3
   days`, `oct 4`) → task. Strip the date phrase from the title.
3. Otherwise → note.

**Non-negotiable:** show what it parsed *before* committing — "Expense · $4.50
· Eating out" with the field still editable. A parser that guesses silently
will file something wrong, and you'll find it three weeks later.

**Reuse.** [#6 deep links](#6-shortcut-deep-links) and this should share the
same `applyIntent` layer. Parse differs; the write path shouldn't.

## 18. Global search

**Why.** "Where did I write that thing about the app?" and "did I already add
that film?" are constant, and currently answerable only by scrolling.

**Core.**

```ts
export interface Hit { kind: 'task' | 'note' | 'movie' | 'game' | 'expense'; id: ID; title: string; sub: string; score: number }
export function search(data: AppData, q: string, limit = 20): Hit[]
```

Case-insensitive substring is enough. Weight title matches over note/body
matches; don't reach for a fuzzy-search library for a few hundred rows.

**Where (UI).** A search field at the top of Today, or `/` on desktop. Results
grouped by kind, tapping one jumps to that section with the item highlighted.
The jump is the fiddly part — the tab shell will need to accept a target id.

## 19. Calendar export (.ics)

**Why.** The best way to get bill dates and tasks into your actual calendar
without a server, a sync engine, or an account. iCalendar is a plain-text
format you generate as a string and hand over as a file.

**Core.** `core/ics.ts`:

```ts
export function toIcs(data: AppData, opts?: { tasks?: boolean; bills?: boolean }): string
```

Emit `VEVENT` for dated tasks and for bill due dates. Stable `UID`s (use your
existing ids plus a suffix) so re-importing updates rather than duplicates.
`RRULE` for repeating tasks and non-monthly bills. Fold lines at 75 octets —
that's the spec detail people skip, and strict parsers reject the file for it.

**Where (UI).** Settings → "Export calendar", same download path as the JSON
export. On iOS, opening the `.ics` offers to add the events to Apple Calendar.

**Caveat.** This is a one-way snapshot, not sync. Re-export when things change,
and be honest about that in the button's helper text.

**Bonus.** Non-autopay bills are the natural first use — those are the ones
where forgetting has a cost.

## 20. Routines

**Why.** Different from a repeating task. A routine is a *group* that resets
together: morning routine, Sunday reset, gym-day checklist. Five repeating
tasks cluttering your Today list is not the same thing.

**Data model.**

```ts
export interface Routine {
  id: ID; label: string
  cadence: 'daily' | 'weekly' | 'monthly'
  weekday?: number            // 0-6, for weekly
  steps: { id: ID; label: string }[]
  completions: { date: string; stepIds: ID[] }[]   // partial credit is the point
}
// AppData
routines: Routine[]
```

**Core.**

```ts
export function routineDueToday(r: Routine, today?: string): boolean
export function routineProgress(r: Routine, date: string): { done: number; total: number }
```

**Where (UI).** One collapsed row on Today per due routine — "Morning · 2/5" —
expanding to the checklist. Collapsed by default, or it swamps the screen.

**Careful.** Keep completions bounded; prune anything older than a year on load
or the array grows forever in localStorage.

## 21. TV series

**Why.** `Movie` has no concept of episodes, so anything serialised either
doesn't get tracked or sits in the watchlist forever showing no progress.

**Data model.** A separate type, not a flag on `Movie` — the fields barely
overlap.

```ts
export interface Series {
  id: ID; title: string; service?: string
  season: number; episode: number       // where you're up to
  status: 'watching' | 'queued' | 'finished' | 'dropped'
  notes?: string; addedAt: string
}
// AppData
series: Series[]
```

**Where (UI).** A third segment in Queue: Films · Series · Games. Each watching
row gets a `+1` button that increments the episode — one tap after each
episode, which is the only interaction that will actually get used.

**Deliberately not doing.** Episode titles, air dates, season lengths. All of
that needs an external API, which is out of scope. `S3 E7` typed by you is
enough.

## 22. Year in review

**Why.** The reward for a year of logging, built from data nobody else has. And
unlike every commercial version of this, it's honest — it's your own numbers.

**Where.** `core/review.ts`, and a screen that's just a long scroll.

What it can say, all from local data:

- Total spent, biggest envelope, biggest single expense, the month you did best.
- Bills paid, and what the ones that varied actually cost across the year.
- Goals hit; total saved and invested.
- Films watched and your rating distribution; the best thing you saw.
- Games beaten, hours played, cost per hour across the year.
- Tasks completed; the one that sat undone longest.
- Word count in the journal, most-used tags, and one note resurfaced from
  January.

**Careful.** It should read as a summary, not a celebration. "You spent $2,400
eating out" is useful. A confetti animation over it is not. And it needs a
graceful partial-year version, or it's useless until next December.

## Smaller things

Each under an evening. Listed roughly by value.

| Feature | What it is |
|---|---|
| **Snooze a task** | One tap to push a task to tomorrow from the row itself. The single most-used button in every task app that has it. |
| **Rolling snapshots** | Keep the last three serialised states under rotating localStorage keys. A bad import or a fat-fingered "Start fresh" becomes recoverable. ~30 lines, and the highest safety-per-line on this page. |
| **What fits tonight** | Add a `runtime` field to `Movie`; filter the watchlist by time available. Plus a shuffle button — a 40-item watchlist is decision paralysis, and picking one at random is a real answer. |
| **Cost per hour** | `price / hours` on beaten games, and total backlog hours against your realistic hours per week. "340 hours; at six a week that's 2027" is both funny and a good argument against buying the next one. |
| **Play sessions** | Replace `Game.hours` with a list of `{ date, hours }`. Gives you a play history and makes cost-per-hour honest. |
| **On this day** | Surface a journal note from a year ago on the Today screen. Costs nothing, and it's the only thing that makes an old journal worth having written. |
| **Logging streak** | "12 days logged." The app dies if expense logging lapses, so this is the one bit of gamification that's actually load-bearing. |
| **Month calendar view** | A real month grid with bills and dated tasks on it. The bucket list answers "what's next"; a grid answers "what does this month look like". |
| **Archive instead of delete** | An `archived` flag on films, games and goals. You didn't want the record gone, you wanted it out of the list. |
| **Data health** | Expenses pointing at deleted envelopes, duplicate titles, total unassigned spend. One screen in Settings, run on demand. |
| **PIN lock** | A 4-digit gate before the UI renders. Be clear-eyed: with no server this is privacy from someone glancing at your phone, not security — the data sits in localStorage either way. Worth it for exactly that, not more. |
| **Reorder Today** | Let panels be hidden or reordered. Everyone's "today" is a different shape, and yours will change once the app has a year of data in it. |

---

# Part four — new sections

Everything above deepens what exists. This part adds things that aren't in the
app at all.

| # | Section | Effort | Why it earns a slot |
|---|---------|--------|---------------------|
| 23 | [Navigation: four tabs and a drawer](#23-navigation--four-tabs-and-a-drawer) | ~5h | **Build first.** Everything below needs somewhere to live |
| 24 | [Projects](#24-projects) | ~5h | You run several at once and lose track of the quiet ones |
| 25 | [Shopping list](#25-shopping-list) | ~4h | Highest-frequency feature here, and it feeds the groceries envelope |
| 26 | [People](#26-people) | ~4h | Birthdays, gifts, and the friend you keep meaning to text |
| 27 | [Maintenance](#27-maintenance) | ~3h | Recurring-but-rare, which is exactly what a to-do list is bad at |
| 28 | [Learning](#28-learning) | ~4h | Self-directed study with nothing tracking whether it stuck |
| 29 | [Inbox](#29-inbox) | ~4h | Not a section — a discipline. Read this one even if you build nothing else |

## 23. Navigation — four tabs and a drawer

**Why.** Five tabs is already the ceiling on a phone and every slot is taken.
Four daily tabs plus a drawer makes the cost of every future section
approximately zero, and it gets Journal — one screen with a text box — out of a
slot it doesn't earn.

**The decided shape.** Not a proposal; build this.

```
Bottom bar (4):   Home · Finance · Tasks · Queue
Drawer:           Journal, then every part-four section, then Settings
```

Route keys stay as they are so nothing else has to change —
`today` / `money` / `tasks` / `queue`. Only the visible labels move to Home and
Finance. Keeping keys stable means no migration and no broken deep links.

### Data model

None. Navigation state is ephemeral — do **not** persist the open tab, and do
not put drawer state in `AppData`. The app should always open on Home.

### `src/ui/nav.ts` — rewrite

```ts
export type TabKey = 'today' | 'money' | 'tasks' | 'queue'
export type DrawerKey = 'journal' | 'projects' | 'shopping' | 'people'
                      | 'maintenance' | 'learning' | 'inbox' | 'settings'
export type RouteKey = TabKey | DrawerKey

export const TABS: { key: TabKey; label: string; heading: string }[] = [
  { key: 'today', label: 'Home',    heading: 'Today' },
  { key: 'money', label: 'Finance', heading: 'Money' },
  { key: 'tasks', label: 'Tasks',   heading: 'Tasks' },
  { key: 'queue', label: 'Queue',   heading: 'Queue' },
]

/** Drawer entries. `group` renders as a divider label; keep groups short. */
export const DRAWER: { key: DrawerKey; label: string; group?: string }[] = [
  { key: 'journal',     label: 'Journal' },
  { key: 'inbox',       label: 'Inbox' },
  { key: 'projects',    label: 'Projects',    group: 'Life' },
  { key: 'shopping',    label: 'Shopping' },
  { key: 'people',      label: 'People' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'learning',    label: 'Learning' },
  { key: 'settings',    label: 'Settings',    group: 'App' },
]
```

Only list drawer entries for sections that exist. Adding a section later is one
line here plus one case in the router — that's the whole point of this refactor.

### `src/App.tsx` — changes

- `useState<RouteKey>('today')`, not `TabKey`. One router for both.
- The `ICON` map covers `RouteKey`, so add drawer icons to `Icons` in
  `kit.tsx`. Needed: `projects`, `shopping`, `people`, `maintenance`,
  `learning`, `inbox`, `menu`. Follow the existing 24×24 stroke set — same
  `strokeWidth="1.7"`, same round caps — or the new ones will look pasted in.
- Hamburger button goes in `.topbar`, **leading edge (left)**, with the
  existing settings gear removed from the topbar (Settings moves into the
  drawer). Title shifts right.
- When a drawer route is active, the bottom bar shows no `aria-current`. Don't
  fake-highlight a tab the user isn't on.

### `styles.css` — the drawer

```css
.drawer-scrim { position: fixed; inset: 0; z-index: 50; background: rgba(10,18,15,.45); }
.drawer {
  position: fixed; inset-block: 0; inset-inline-start: 0; z-index: 51;
  width: min(82vw, 320px);
  background: var(--surface);
  border-right: 1px solid var(--line);
  padding: calc(16px + env(safe-area-inset-top)) 12px
           calc(16px + env(safe-area-inset-bottom));
  display: flex; flex-direction: column; gap: 2px;
  transform: translateX(-100%);
  transition: transform .22s ease;
}
.drawer[data-open='true'] { transform: none; }
@media (prefers-reduced-motion: reduce) { .drawer { transition: none; } }
```

Requirements that are easy to miss and will be noticed immediately if skipped:

- **Safe areas on all four edges.** The drawer is full-height, so it runs under
  both the notch and the home indicator.
- **Focus trap while open**, `Escape` closes, focus returns to the hamburger
  button on close. Reuse the pattern already in `Sheet`.
- **`aria-expanded`** on the hamburger, `role="dialog"` + `aria-label` on the
  drawer, and `inert` (or `aria-hidden`) on the rest of the app while open.
- **Swipe-to-close** from a drag on the drawer — nice, optional, and do it with
  pointer events rather than a gesture library.
- **Body scroll lock** while open, released on close. Test this on iOS
  specifically; it's the classic bug.

### Desktop (≥900px)

There is no hamburger. The existing left rail simply grows: tabs at the top,
a hairline divider, then the drawer entries below, then Settings pinned to the
bottom. Hide `.drawer` and the hamburger entirely at that breakpoint — one
media query, no duplicated markup, and the rail becomes the drawer.

### Done when

- Four tabs at the bottom, correctly labelled, safe-area padded.
- Hamburger opens a drawer containing Journal and Settings at minimum.
- Keyboard alone can open the drawer, move through it, activate an item, and
  close it back to the button.
- At 1280px wide there is no hamburger and every destination is in the rail.
- Nothing about navigation is written to localStorage.

## 24. Projects

**Why.** You have several things going at once — this app, the music app, video
work. The failure mode isn't forgetting a task inside a project; it's a whole
project going quiet for six weeks without you noticing. Nothing you own
currently tracks that.

**Data model.**

```ts
export interface Project {
  id: ID; label: string
  status: 'active' | 'paused' | 'shipped' | 'abandoned'
  nextAction?: string           // the single next physical step
  lastTouched: string           // 'YYYY-MM-DD'
  why?: string                  // why you started — read this before abandoning
  notes?: string; createdAt: string
}
// AppData
projects: Project[]
```

**Core.**

```ts
export function staleProjects(projects: Project[], days = 14): Project[]
```

**Where (UI).** A list with days-since-touched on each row, plus a Today panel
that surfaces one stale active project: *"Music app — 23 days. Next: try the
Apple Music auth flow."* One nudge, not a nag list.

**The two fields that make it work:**

- **`nextAction` is mandatory for active projects.** A project without a
  written next step is where momentum actually dies. Prompt for it when
  something's been idle a week.
- **`why` gets read back to you** when you're about to abandon something. Half
  the time you stopped for a reason that no longer applies.

**Careful.** Don't build a task system inside this. Tasks already exist — link
to them by tag if you want, and keep Project to status, next action, and the
clock.

## 25. Shopping list

**Why.** Probably the highest-frequency thing on this entire page — you'd open
it weekly at minimum — and it closes the loop with the groceries envelope in a
way nothing else does.

**Data model.**

```ts
export interface ShopItem {
  id: ID; label: string
  qty?: string                  // "2 lb", "a bunch" — free text, not a number
  aisle?: string
  done: boolean
  recurring: boolean            // staples that return after checkout
  addedAt: string
}
// AppData
shopping: ShopItem[]
```

**Where (UI).** A tab or a Today panel. Add field at the top, checkable rows,
grouped by `aisle` when set. Big tap targets — you'll use this one-handed,
holding a basket.

**The payoff — checkout closes the loop:**

A "Done shopping" button that asks for the total, logs it as an expense against
the groceries envelope, clears checked non-recurring items, and un-checks
recurring ones for next time. That single button is why this is worth building:
it turns the one expense you're most likely to forget into a byproduct of
something you were doing anyway.

**Careful.** Keep it fast and dumb. No price tracking, no per-item costs — the
moment it needs data entry beyond a name, you'll go back to Notes.

## 26. People

**Why.** The most classically "personal assistant" thing missing here.
Birthdays you forget, gift ideas you think of in June and lose by December, and
the friend you keep meaning to text.

**Data model.**

```ts
export interface Person {
  id: ID; name: string
  birthday?: string             // 'MM-DD' or 'YYYY-MM-DD'
  lastContact?: string
  contactEvery?: number         // days; the cadence you'd like, not a rule
  giftIdeas: { id: ID; idea: string; price?: number; addedAt: string }[]
  notes?: string
}
// AppData
people: Person[]
```

**Core.**

```ts
export function upcomingBirthdays(people: Person[], withinDays = 30): { person: Person; date: string; turning?: number }[]
export function overdueContact(people: Person[]): Person[]
```

**Where (UI).** Mostly a Today panel — a birthday in the next two weeks, or one
person you're overdue with. The list view is for editing; the value is in the
surfacing.

**Two ties into what you already have:**

- Birthdays in the next 30 days pair with gift ideas *and* with
  [#12 sinking funds](#12-irregular-bills-and-sinking-funds) — December is a
  bill you can see coming.
- Birthdays should appear in [#19 the .ics export](#19-calendar-export-ics),
  as yearly recurring all-day events.

**Careful.** `contactEvery` should nudge gently and be easy to leave blank.
A friendship with a compliance dashboard is worse than one you occasionally
neglect.

## 27. Maintenance

**Why.** Oil changes, filters, registration, warranty expiries, backups. All
recurring, all rare, and a to-do list handles them badly — a task due in eight
months is either noise now or invisible until it's late.

**Data model.**

```ts
export interface MaintenanceItem {
  id: ID; label: string
  scope: 'car' | 'home' | 'tech' | 'other'
  everyDays?: number
  everyMiles?: number           // odometer-based, for the car
  lastDone?: string
  lastOdometer?: number
  cost?: number                 // feeds the sinking fund
  notes?: string
}
// AppData
maintenance: MaintenanceItem[]
```

**Core.**

```ts
export function dueMaintenance(items: MaintenanceItem[], odometer?: number): { item: MaintenanceItem; dueIn: string }[]
```

**Where (UI).** A list grouped by scope, plus a Today panel only when something
is actually due. This section should be silent 95% of the days you open the app
— that's the design goal, not a shortcoming.

**Ties in.** Items with a `cost` and a cadence are sinking funds by another
name. "Brakes, ~$400, every 2 years" is $17/month you should be setting aside,
and it should feed the same machinery as [#12](#12-irregular-bills-and-sinking-funds).

## 28. Learning

**Why.** Self-directed study has no external structure — no syllabus, no exam —
so the thing that fails is not starting but finishing, and knowing whether any
of it stuck.

**Data model.**

```ts
export interface Topic {
  id: ID; label: string
  status: 'learning' | 'shelved' | 'comfortable'
  resources: { id: ID; title: string; kind: 'book' | 'course' | 'docs' | 'video' | 'project'; done: boolean; url?: string }[]
  lastStudied?: string
  takeaways: { id: ID; at: string; text: string }[]
}
// AppData
topics: Topic[]
```

**Where (UI).** A list of topics; opening one shows resources and takeaways.

**The part that makes it more than a bookmark folder:** takeaways are things
*you wrote in your own words*, and the app resurfaces one on the Today screen
occasionally — a takeaway from three weeks ago, at random. That retrieval,
unprompted, is the difference between having watched a tutorial and knowing
something. It costs almost nothing to build and it's the entire point of the
section.

**Ties in.** A takeaway is nearly a journal `Note` with a topic attached —
consider making it exactly that rather than a parallel type.

## 29. Inbox

**Why.** Read this one even if you build no other section. It isn't really a
feature; it's the structural answer to the problem that kills this app.

Right now every capture requires a decision *before* you can record it: which
tab, which envelope, is it a task or a note. That decision, made a dozen times
a day, is the friction that ends the habit. An inbox removes it — capture now,
decide later, triage in one batch.

**Data model.**

```ts
export interface InboxItem {
  id: ID; at: string; text: string
  guess?: Parsed                // from core/parse.ts, shown as a suggestion
}
// AppData
inbox: InboxItem[]
```

**Where (UI).** One always-present capture field — top of Today, and the target
of every [Shortcut deep link](#6-shortcut-deep-links). Text goes in, nothing
else is asked.

Then a triage view: each item with its parsed guess pre-filled and three
buttons — accept, change type, delete. Fast enough to clear twenty items in a
minute.

**How it changes the others.** With an inbox, [#17 the parser](#17-quick-add-parser)
stops being risky: a wrong guess isn't a misfiled expense, it's a wrong
suggestion you correct during triage. The two features are much better
together than apart, and this is the one that should be built first.

**Careful.** An inbox that never gets emptied is a graveyard. Show the count on
the Today screen, and if it's over ~20 say so plainly.

---

## Order for part four

[#23 navigation](#23-navigation--four-tabs-and-a-drawer) first — it's a
prerequisite, and doing it after two new sections means retrofitting both.

Then **[#29 Inbox](#29-inbox)**, then
[#25 shopping list](#25-shopping-list).

The inbox because it changes the cost of every future capture in the app, which
compounds. The shopping list because it's the only section here you'd open
weekly without discipline, and its checkout button converts the expense you're
most likely to forget into something you get for free.

[#24 Projects](#24-projects) is the one most specific to how you actually work
— but it's a nudge system, and nudge systems only earn their keep once the
capture habit is solid. Build it fourth.

---

# Part five — look and feel

The app has one palette and follows your system theme with no say in the
matter. All of this is cosmetic, all of it is local, and it's the part you'll
notice every single day.

| # | Feature | Effort | Why |
|---|---------|--------|-----|
| 30 | [Theme control](#30-theme-control) | ~3h | Light/dark/system, plus a palette you picked |
| 31 | [Home screen identity](#31-home-screen-identity) | ~2h | Your icon, your name, on your phone |
| 32 | [Envelope and section colour](#32-envelope-and-section-colour) | ~3h | Makes lists scannable, not just prettier |
| 33 | [Motion and moments](#33-motion-and-moments) | ~4h | The difference between "works" and "feels built" |

**The one rule for all of part five:** every colour goes through a CSS custom
property. If a component ever hardcodes a hex value, theming is dead and both
dark mode and every palette below break silently in one theme only. See
[theming rules](#theming-rules) in the appendix.

## 30. Theme control

**Why.** Right now the app follows `prefers-color-scheme` and that's it. No way
to force dark at noon, and no palette other than verdigris.

**Data model.**

```ts
// Settings
theme: 'system' | 'light' | 'dark'
palette: PaletteId
```

Migration defaults: `theme: 'system'`, `palette: 'verdigris'` — exactly today's
behaviour, so existing users see no change.

**Core.** `src/core/theme.ts` — data only, no DOM, so it ports:

```ts
export type PaletteId = 'verdigris' | 'ember' | 'indigo' | 'moss' | 'slate' | 'plum'
export interface Palette { id: PaletteId; label: string; accent: string; accentDark: string; tintLight: string; tintDark: string }
export const PALETTES: Palette[]
```

Six is plenty. Each supplies only the accent family — grounds, ink and the
status colours stay shared, because `--good` / `--warn` / `--over` mean
something and must not drift with decoration.

**Where (UI).** In Settings: a three-way segmented control for theme (reuse
`Segmented`), and a row of colour swatches for palette. Apply live on tap — a
theme picker you have to save is a theme picker nobody uses.

**Applying it.** A `useEffect` in `App.tsx` that sets two attributes on
`document.documentElement`:

```ts
root.dataset.theme = settings.theme === 'system' ? '' : settings.theme
root.dataset.palette = settings.palette
```

`styles.css` already handles `[data-theme]`; add palette blocks that override
only the accent tokens:

```css
:root[data-palette='ember'] { --accent:#b4541f; --accent-soft:#f6e7dd; --accent-ink:#8c3f14; }
:root[data-palette='ember']:not([data-theme='light']) { /* under the dark media query too */ }
```

**Careful — the trap.** Each palette needs a light *and* a dark accent. A hue
that reads well on off-white is usually too dark on a near-black ground. Check
every palette in both themes before shipping it, and check the accent against
`--surface` for contrast — an accent that fails on buttons is worse than not
offering it.

**Also update** the `<meta name="theme-color">` tags and
`manifest.webmanifest`'s `theme_color`, or the iOS status bar keeps the old
colour and the seam is visible on every launch.

## 31. Home screen identity

**Why.** It's on your home screen next to real apps. It should look like one.

**What.**

- **Icon variants.** Generate one icon per palette from the existing python
  script in the repo history, and let Settings pick. On iOS the home-screen
  icon is baked in at install time, so changing it means removing and re-adding
  the app — say so in the UI rather than letting it look broken.
- **App name.** `apple-mobile-web-app-title` sets the label under the icon. Let
  it be set from Settings, written into the document head at runtime — again,
  only takes effect on re-install.
- **Launch appearance.** Set `apple-mobile-web-app-status-bar-style` to match
  the chosen theme so the status bar doesn't flash the wrong colour on open.
- **A real splash.** iOS shows a white flash on launch without
  `apple-touch-startup-image`. Generating those for every device size is
  tedious; a single dark-and-light pair covers most of the ugliness.

**Careful.** Everything here is install-time on iOS. Be honest in the UI —
"applies next time you add it to your home screen" — instead of letting it look
like a bug.

## 32. Envelope and section colour

**Why.** This is the one part of part five that isn't decoration. Once you have
eight envelopes, colour is how you find the one you want without reading.

**Data model.**

```ts
// Envelope
color?: string      // a token name, NOT a hex — e.g. 'sage' | 'clay' | 'sky'
icon?: string       // an Icons key
```

Storing a token name rather than a hex is what keeps it theme-aware. A hex
picked in light mode will be unreadable in dark mode, guaranteed.

**Core.** A fixed set of eight named hues in `theme.ts`, each with a light and
dark value, all validated for contrast against both surfaces. Not a colour
picker — a palette. Free choice here produces an ugly app and an accessibility
problem in about ten minutes.

**Where (UI).** A 3px leading stripe on the envelope row and a tinted dot in
the expense list. Keep the `Meter` itself on status colours — over-budget must
read as over-budget regardless of the envelope's decorative hue. Colour is
identity here; status stays status.

**Careful.** Never use colour alone for meaning. The label is always present.

## 33. Motion and moments

**Why.** Nothing in the app currently moves except a meter width. Considered
motion is most of the gap between "a website I made" and "an app".

**Worth doing:**

- **Count-up on hero figures.** The safe-to-spend number animating from the
  previous value over ~400ms, with `tabular-nums` already set so nothing
  shifts. Only on change, never on first paint — the page must be readable at
  rest.
- **Meters that animate from their old value**, not from zero, so a small
  expense reads as a small movement.
- **Row enter/exit.** New expenses slide in, deleted ones collapse. Pairs
  naturally with [#4 undo](#4-undo) — the collapse *is* the undo window.
- **Sheet spring.** The modal currently appears. A short spring from the bottom
  edge is one transition and reads far more native.
- **Pull-to-refresh as a no-op with feedback.** You'll do it instinctively;
  right now nothing happens. Recompute and flash the timestamp.
- **A single moment for a funded goal.** One, understated, once per goal.

**Non-negotiable:** every one of these sits behind
`@media (prefers-reduced-motion: reduce)`, and the app must be fully usable
and fully readable with all of it disabled.

**Skip:** page transitions between tabs (they make navigation feel slower after
the third use), and `navigator.vibrate` — iOS Safari doesn't support it, so
haptics aren't available to a web app at all.

## Deliberately excluded

Not because they are bad ideas — because they break one of the three
constraints, and it's worth writing down why so they don't get quietly
reconsidered at 1am.

| Idea | Breaks | Note |
|---|---|---|
| Push notifications for bills | Needs a server | iOS does support web push for installed PWAs, but scheduled sends require a backend. Use a repeating iOS Reminder pointed at the app instead. |
| Bank / card sync | Costs money, needs a server | Also: auto-categorisation is wrong often enough that correcting it costs more than typing the number did. |
| Film posters, episode data, ratings | External data | TMDB is free but it's a network call and an API key. Type the runtime and `S3 E7` yourself — those are the only fields you actually wanted. |
| Game price tracking | External data | Same. |
| Voice capture for the journal | External data | The Web Speech API routes through Apple's servers on iOS, so it isn't local and it isn't reliable offline. |
| Home screen widgets | Not possible | iOS doesn't expose widgets to web apps at all. A Lock Screen Shortcut ([#6](#6-shortcut-deep-links)) is the closest thing that exists. |
| Real biometric app lock | Needs a server | WebAuthn requires a relying party to verify against. A local PIN ([smaller things](#smaller-things)) is honest about what it does; a Face ID prompt that verifies nothing is not. |
| Cross-device sync | Needs a server | Export/import JSON is the sanctioned path. |
| An AI assistant layer | Costs money, external | Still the endgame — see `CLAUDE.md`. When you get there, `buildPlan()` plus the raw arrays are the context you hand a model, so nothing here needs redesigning for it. |

---

# Implementation rules

Read this before writing code for anything above. Every item on this page is
one of a small number of shapes, and each shape has a checklist. Following them
is what keeps the React Native port from becoming a rewrite.

## The prime directive

`src/core/` is platform-free. No React, no DOM, no `window`, no `document`, no
CSS, no `localStorage` calls outside the adapter. The single exception is
`useSyncExternalStore` at the bottom of `store.ts`, and it stays the only one.

**If you are writing arithmetic inside a `.tsx` file, it is in the wrong
place.** Move it to `core/` and call it from the screen. This is the rule that
everything else in this document exists to protect.

## Checklist: adding a field to an existing type

1. Add the field to the interface in `core/types.ts`. **Optional (`?`) unless
   you write a migration that backfills it.**
2. Bump `SCHEMA_VERSION` in `core/types.ts`.
3. Add a migration to `migrations` in `core/storage.ts`, keyed by the version
   you are migrating *from*:
   ```ts
   const migrations: Record<number, (d: any) => any> = {
     1: (d) => ({ ...d, contributions: [] }),
   }
   ```
4. Update `emptyData()` in `core/seed.ts` — omitting it here is the most common
   bug, and it only shows up when someone taps "Start fresh".
5. Update `seedData()` so the example data still demonstrates the feature.
6. Export a real file from Settings, hard-reload, and confirm it opens without
   loss. That round trip is the actual test.

## Checklist: adding a new array to `AppData`

Everything above, plus:

7. Add the array to `AppData` **and** to `emptyData()` — both, always.
8. The migration must create it as `[]` for existing users, or every `.map()`
   over it throws on first open.
9. Add it to the counts list in `Settings.tsx` so the data summary stays true.
10. `deserialise()` shallow-merges over `emptyData()`, so a missing array
    resolves to `[]`. Don't rely on that as your only defence — write the
    migration anyway.

## Checklist: adding a new section (part four)

1. Types in `core/types.ts` + migration, per above.
2. Pure logic in `core/<section>.ts`. No React.
3. Screen at `src/ui/screens/<Section>.tsx`, default export, no props except
   navigation callbacks.
4. Register in `core/nav.ts`: add to `DrawerKey` and the `DRAWER` array.
5. Add a case to the router in `App.tsx` and an entry to the `ICON` map.
6. Add the icon to `Icons` in `kit.tsx`, matching the existing 24×24 /
   `strokeWidth="1.7"` / round-cap set.
7. Reuse `Panel`, `Sheet`, `Field`, `Segmented`, `Meter`, `Empty`. Do not
   invent a second modal or a second list style.
8. Add a Today panel **only if** the section has something time-sensitive to
   surface. Most don't. A Today screen that shows everything shows nothing.

## Theming rules

Every colour is a CSS custom property declared in the bare `:root` block
first, then overridden in the dark blocks. Three blocks, in this order:

```css
:root { --token: <light value>; }                       /* complete light set */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) { --token: <dark>; }  /* system dark */
}
:root[data-theme='dark'] { --token: <dark>; }           /* explicit dark */
```

- A colour whose **only** definition lives inside a media query or a
  `[data-theme]` block does not apply in the default un-stamped state. This is
  the classic unreadable-app bug and it will not show up in your own browser if
  your OS is set to dark.
- Never hardcode a hex in a component or an inline style. `style={{ color:
  'var(--over)' }}` is fine; `style={{ color: '#ab3a2b' }}` is not.
- `--good` / `--warn` / `--over` are **status**, reserved. They never become
  decoration and never get reused as a palette colour.
- Status is never carried by colour alone. Every coloured figure has its number
  or label beside it.
- `body` must set an explicit `background` from a token. A transparent body
  borrows the host's ground and breaks in one theme.
- Test every change in three states: system-light, system-dark, and explicitly
  toggled. They are genuinely different code paths.

## Store rules

- All mutations go through `store.update(d => { ... })`. It clones, persists,
  and notifies.
- **Never mutate the object returned by `useData()`.** It is the live state.
- `update()` uses `structuredClone`, which throws on functions and preserves
  `Date` objects. Keep `AppData` to plain JSON-compatible values — that's also
  what keeps export/import honest.
- Prefer mutating the draft (`d.tasks.push(...)`) over returning a new object.
  Both work; mixing them in one callback is how you lose a write.
- Growing arrays (`contributions`, `completions`, `expenses`) need a pruning
  story before they need one. localStorage is finite and `save()` swallows
  quota errors silently — data loss with no error message is the failure mode.

## Date rules

- Dates are `'YYYY-MM-DD'` strings in **local** time. Months are `'YYYY-MM'`.
- Use `core/dates.ts`. Do not add dayjs, date-fns, or Temporal.
- `new Date('2026-09-08')` parses as **UTC** and will be the previous day for
  anyone west of Greenwich. Use `fromKey()`, which builds a local date.
- Anything comparing "now" must be tested near midnight and across a month
  boundary. `buildPlan`'s `daysLeft` and `nextDueDate`'s month rollover are
  both places this bites.

## Money rules

- Plain numbers of currency units. Format only at render, via `formatMoney`.
- Never store a formatted string.
- Floating-point drift is real but tolerable at this scale. Round at display,
  not in storage, and never compare two sums with `===` — compare within a cent.

## Testing expectation

There is no test runner in the project yet. Add Vitest when you build the first
thing in `core/` with real logic — `parseQuickAdd`, `amortise`, `project`, and
`rolloverBalance` are all pure functions with obvious edge cases, and all four
are places where being subtly wrong is worse than being absent.

`check.mjs` at the repo root is a Playwright smoke test over the built
single-file app. Run it after any navigation or layout change:

```bash
npm run build:single && CHROMIUM=$(which chromium || which chrome) node check.mjs
```

## Definition of done, for anything here

- `npx tsc --noEmit` passes.
- `npm run build` and `npm run build:single` both succeed.
- Works at 390px wide and at 1280px.
- Correct in system-light, system-dark, and explicitly toggled dark.
- Keyboard reachable; visible focus; no interactive element under 44px.
- Export → hard reload → import round-trips without loss.
- Nothing new hardcodes a colour, parses a date with `new Date(string)`, or
  puts arithmetic in a component.
