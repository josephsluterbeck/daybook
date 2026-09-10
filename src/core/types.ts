/**
 * Data model. Pure types — no React, no DOM.
 * This whole `core/` folder moves to React Native untouched.
 */

export type ID = string

export type Cadence = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

export interface Movie {
  id: ID
  title: string
  year?: number
  service?: string // where it streams / rents
  priority: 1 | 2 | 3 // 3 = next up
  watched: boolean
  rating?: number // 1-10, set after watching
  notes?: string
  addedAt: string // ISO
  runtime?: number // minutes — lets "what fits tonight" filter the watchlist by time available
  /** Off the active list but not deleted — the history (rating, notes) is kept. */
  archived?: boolean
  /** 'YYYY-MM-DD' — stamped by #43's triage ("Keep"), or left unset for anything never reviewed. Falls back to addedAt for ranking. */
  lastReviewed?: string
}

export type GameStatus = 'wishlist' | 'backlog' | 'playing' | 'beaten' | 'shelved'

/** One sitting — a play history, not just a running total, so cost-per-hour and "hours played" are both honest instead of a single hand-edited number. */
export interface PlaySession {
  id: ID
  date: string // 'YYYY-MM-DD'
  hours: number
}

export interface Game {
  id: ID
  title: string
  platform?: string
  price?: number // watching for a sale
  status: GameStatus
  sessions?: PlaySession[]
  notes?: string
  addedAt: string
  /** Off the active list but not deleted — the history (sessions, notes) is kept. */
  archived?: boolean
  /** 'YYYY-MM-DD' — stamped by #43's triage ("Keep"), or left unset for anything never reviewed. Falls back to addedAt for ranking. */
  lastReviewed?: string
}

export interface Income {
  id: ID
  label: string
  amount: number // take-home, per period
  cadence: Cadence
  /**
   * A known payday, 'YYYY-MM-DD' — only meaningful for 'weekly'/'biweekly',
   * where a fixed day-count period means one real date pins down every future
   * (and past) payday. Lets the app say "next payday is the 12th" instead of
   * just a monthly average.
   */
  anchorDate?: string
}

export type BillCadence = 'monthly' | 'quarterly' | 'semiannual' | 'annual'

export interface Bill {
  id: ID
  label: string
  amount: number
  dueDay: number // 1-31
  /** How often it actually recurs — insurance, registration, and Christmas are not monthly, and budgeting them as if they were is quietly wrong. */
  cadence: BillCadence
  /** 1-12, the anchor month a non-monthly bill is due in. Ignored for 'monthly'. */
  dueMonth?: number
  autopay: boolean
  /** months already paid, as 'YYYY-MM' */
  paid: string[]
  /** Recurring monthly amount someone else covers toward this bill — kept out of your own income math. */
  splitAmount?: number
  splitSource?: string // e.g. 'Wife'
  /** Accent color (hex) for quick visual scanning — optional, falls back to the app accent. */
  color?: string
  /** Per-month amount overrides, keyed 'YYYY-MM' — for a bill that varies, like a utility, without losing the usual/default amount. */
  amounts?: Record<string, number>
}

/** A spending category with a monthly allowance. */
export interface Envelope {
  id: ID
  label: string
  monthly: number
  /** Accent color (hex) for quick visual scanning — optional, falls back to the app accent. */
  color?: string
  /** A key from ui/components/kit.tsx's `Icons` (#32) — optional, falls back to no icon. Never the only signal for anything; the label is always shown beside it. */
  icon?: string
  /** Unspent budget carries into next month (and overspend carries as a debt against it) instead of resetting to `monthly` every month. Off by default — most envelopes are meant to reset. */
  rollover?: boolean
}

/** One portion of an expense's money going to one job — usually the only one. A refund is a line with a negative amount. */
export interface ExpenseLine {
  envelopeId?: ID
  amount: number
}

export interface Expense {
  id: ID
  date: string // 'YYYY-MM-DD'
  /** Almost always one line — quick-add only ever creates one. A "Split" turns a $140 Target run into $95 groceries + $45 household without losing the single-tap common case. */
  lines: ExpenseLine[]
  note?: string
}

/** A single deposit toward a goal. `source` is who put the money in — omitted means you. */
export interface Contribution {
  id: ID
  date: string // 'YYYY-MM-DD'
  amount: number
  source?: string // e.g. 'Wife' — a joint contribution, tracked but kept out of your own income math
}

export interface Goal {
  id: ID
  label: string
  kind: 'save' | 'invest'
  target: number
  /** Every deposit ever made toward this goal, from any source. Total saved = the sum of these. */
  contributions: Contribution[]
  monthly: number // what *you* plan to contribute from your own income — never adjusted by contributions
  targetDate?: string // 'YYYY-MM-DD'
  notes?: string
  /** Accent color (hex) for quick visual scanning — optional, falls back to the app accent. */
  color?: string
  /** Off the active list but not deleted — the history (contributions, progress) is kept. */
  archived?: boolean
  /** 'YYYY-MM-DD' the funded moment (#33) was shown — set once, the first time this goal reaches its target, so the moment plays exactly once ever, not once per session. */
  celebratedAt?: string
}

export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly'

/** A step within a task — its own checkbox, independent of the task's own `done`. */
export interface TaskStep {
  id: ID
  text: string
  done: boolean
}

export type Energy = 'low' | 'medium' | 'high'

export interface Task {
  id: ID
  title: string
  due?: string // 'YYYY-MM-DD'
  time?: string // 'HH:MM'
  done: boolean
  flagged: boolean
  repeat: Repeat
  notes?: string
  createdAt: string
  /** A checklist within the task — optional, for a task worth breaking into pieces. */
  steps?: TaskStep[]
  /** #44 — both optional on purpose: a required field on quick-add would kill quick-add. */
  energy?: Energy
  minutes?: number // rough estimate
}

export interface Note {
  id: ID
  at: string // ISO
  text: string
  tags: string[]
  /** Set when this note is a Learning takeaway (#28) — a takeaway is nearly a journal Note with a topic attached, so it's exactly that rather than a parallel type. */
  topicId?: ID
}

/**
 * One paycheck's worth of money, assigned to a job — a bill, an envelope, or
 * a goal. This is bookkeeping for *which paycheck* covered something, sitting
 * beside the monthly plan rather than replacing it: buildPlan() stays the
 * source of truth for "how am I doing this month," these just record how a
 * given deposit got spoken for.
 */
export interface Allocation {
  id: ID
  paycheckDate: string // 'YYYY-MM-DD' — the payday this money landed on
  targetKind: 'bill' | 'envelope' | 'goal'
  targetId: ID
  amount: number
}

export interface Debt {
  id: ID
  label: string
  balance: number
  apr: number // annual percentage rate, e.g. 6.9
  minimum: number
  extra: number
  billId?: ID // the Bill it's actually paid through, if any
}

/**
 * A group of steps that resets together — a morning routine, a Sunday reset,
 * a gym-day checklist. Different from a repeating Task: five of those
 * cluttering Today is not the same thing as one collapsed "Morning · 2/5" row.
 */
export interface RoutineStep {
  id: ID
  label: string
}

/** One day's progress on a routine — partial credit is the point, so this is which steps, not just a done/not-done bit. */
export interface RoutineCompletion {
  date: string // 'YYYY-MM-DD'
  stepIds: ID[]
}

export interface Routine {
  id: ID
  label: string
  cadence: 'daily' | 'weekly' | 'monthly'
  weekday?: number // 0-6 (Sunday-Saturday), only meaningful for 'weekly'
  steps: RoutineStep[]
  completions: RoutineCompletion[]
}

/** A serialised show — tracked separately from Movie since the fields (season/episode/status) barely overlap. */
export interface Series {
  id: ID
  title: string
  service?: string
  season: number
  episode: number
  status: 'watching' | 'queued' | 'finished' | 'dropped'
  notes?: string
  addedAt: string
}

/**
 * Several things going at once, and the failure mode isn't forgetting a task
 * inside one — it's a whole project going quiet for weeks without anyone
 * noticing. Deliberately not a task system: status, one next physical step,
 * and the clock. Link to real Tasks by tag if a project needs a checklist.
 */
export interface Project {
  id: ID
  label: string
  status: 'active' | 'paused' | 'shipped' | 'abandoned'
  /** The single next physical step — the field that keeps momentum from dying silently. */
  nextAction?: string
  lastTouched: string // 'YYYY-MM-DD'
  /** Why you started — read this back before abandoning; half the time the reason no longer applies. */
  why?: string
  notes?: string
  createdAt: string
}

/** Probably the highest-frequency thing in the whole app. Kept fast and dumb on purpose — no price tracking, no per-item cost; the moment it needs more than a name, that's what Notes is for. */
export interface ShopItem {
  id: ID
  label: string
  qty?: string // "2 lb", "a bunch" — free text, not a number
  aisle?: string
  done: boolean
  recurring: boolean // a staple that comes back after checkout instead of disappearing
  addedAt: string
}

export interface GiftIdea {
  id: ID
  idea: string
  price?: number
  addedAt: string
}

/**
 * Birthdays you forget, gift ideas you think of in June and lose by
 * December, the friend you keep meaning to text. `contactEvery` is a wish,
 * not a rule — leaving it blank is the normal case, not a gap to fill in.
 */
export interface Person {
  id: ID
  name: string
  birthday?: string // 'MM-DD' (no known birth year) or 'YYYY-MM-DD'
  lastContact?: string // 'YYYY-MM-DD'
  contactEvery?: number // days — the cadence you'd like, gently, not tracked as compliance
  giftIdeas: GiftIdea[]
  notes?: string
}

/**
 * Oil changes, filters, registration, warranty expiries — recurring but
 * rare, which is exactly what a to-do list handles badly (a task due in
 * eight months is either noise now or invisible until it's late). A cadence
 * can be by time, by odometer, or both; whichever is computable shows up.
 */
export interface MaintenanceItem {
  id: ID
  label: string
  scope: 'car' | 'home' | 'tech' | 'other'
  everyDays?: number
  everyMiles?: number // odometer-based, for the car
  lastDone?: string // 'YYYY-MM-DD'
  lastOdometer?: number
  /** Feeds the same sinking-fund math as an irregular bill — cost / (everyDays / 30) is a real monthly figure, just not one that's a Bill unless you make it one. */
  cost?: number
  notes?: string
}

export interface Resource {
  id: ID
  title: string
  kind: 'book' | 'course' | 'docs' | 'video' | 'project'
  done: boolean
  url?: string
}

/**
 * Self-directed study has no syllabus and no exam, so the thing that fails
 * is finishing, and knowing whether any of it stuck. Takeaways aren't
 * stored here — they're journal Notes with `topicId` set (see Note above);
 * Topic only holds status, resources, and the clock.
 */
export interface Topic {
  id: ID
  label: string
  status: 'learning' | 'shelved' | 'comfortable'
  resources: Resource[]
  lastStudied?: string // 'YYYY-MM-DD'
}

/** What core/parse.ts decided a piece of quick-add or inbox text meant — the type lives here (not in parse.ts) so InboxItem can reference it without a circular import. */
export type Parsed =
  | { kind: 'expense'; amount: number; envelopeHint?: string; note: string }
  | { kind: 'task'; title: string; due?: string; time?: string }
  | { kind: 'note'; text: string }

/**
 * The structural fix for the problem that kills this kind of app: every
 * capture used to require a decision *before* you could record it. An inbox
 * item asks nothing at capture time — `guess` is computed once, up front,
 * and shown as a suggestion during a later, batched triage, not acted on
 * immediately.
 */
export interface InboxItem {
  id: ID
  at: string // ISO
  text: string
  guess?: Parsed
}

export type Theme = 'system' | 'light' | 'dark'

/** The six accent hues in core/theme.ts — kept here, not there, so Settings can reference it without types.ts importing from anywhere else in core/ (same rule that moved `Parsed` here for InboxItem). */
export type PaletteId = 'cobalt' | 'ember' | 'indigo' | 'moss' | 'slate' | 'plum'

// Route keys stay exactly as they were before the four-tab-plus-drawer
// rewrite (#23) — 'today'/'money'/'tasks'/'queue' — so nothing that already
// points at them (deep links, the Today-layout keys above) has to change.
/** Kept here, not in ui/nav.ts, so core/insights.ts (#34-38's `Insight.action.route`) can reference it without core/ reaching into ui/ — ui/nav.ts imports and re-exports both for its own use. */
export type TabKey = 'today' | 'money' | 'tasks' | 'queue'
/** Every Part-four section has a real screen behind it — 'settings' is the only DrawerKey (see ui/nav.ts) that never becomes a route, since it opens a Sheet instead. */
export type RouteKey = TabKey | 'journal' | 'inbox' | 'projects' | 'shopping' | 'people' | 'maintenance' | 'learning' | 'scenarios'

export interface Settings {
  name: string
  currency: string
  /** Day of month the budget resets. 1 = calendar month. */
  cycleStartDay: number
  /** Appearance override — undefined means the default, which is 'dark' (see App.tsx/Settings.tsx). */
  theme?: Theme
  /** Accent-colour choice (#30) — undefined means 'ember', matching the app's logo. A token name from core/theme.ts, resolved via `paletteOf()`, never a raw hex — that's what keeps it theme-aware. */
  palette?: PaletteId
  /** The label under the home-screen icon (#31) — undefined means 'Jarvis'. Only takes effect the next time the app is added to a home screen; changing it here doesn't touch an already-installed icon. */
  homeScreenName?: string
  /** The envelope last used to log an expense — pre-selects itself next time, since most logging is repetitive. */
  lastExpenseEnvelopeId?: string
  /** ISO timestamp of the last successful export — everything lives in one browser on one device, so this is the only backup that exists. */
  lastExportAt?: string
  /** 'YYYY-MM-DD' — dismissing the backup nag snoozes it a week rather than forever. */
  exportNagSnoozedUntil?: string
  /** 'YYYY-MM-DD' — #43's backlog-triage card is offered at most monthly; set whenever it's shown or dismissed. */
  triageSnoozedUntil?: string
  /** You type this for the cashflow projection — it is not synced from anywhere, and a projection from a stale figure is worse than none. */
  balance?: number
  balanceAsOf?: string // 'YYYY-MM-DD'
  /** A realistic weekly play budget — turns the backlog's total hours into "at this pace, N weeks." */
  hoursPerWeek?: number
  /** Today's reorderable panels, by key — missing keys render after the ones listed, so a panel added in a later build still shows up. */
  todayOrder?: string[]
  /** Today panels hidden entirely — everyone's "today" is a different shape. */
  todayHidden?: string[]
  /** Current odometer reading, for mileage-based maintenance cadences — you type this, it's not synced from anywhere. */
  odometer?: number
  /** Insight ids dismissed from Today (#34-38's engine), each with the date it stops being suppressed — a dismissal that doesn't stick is worse than none, but one that hides a recurring problem forever is worse still. */
  dismissedInsights?: { id: string; until: string }[]
  /** Blurs figures app-wide (#42) — a train, a waiting room, a desk with someone behind you. CSS blur, not real redaction; says so in the UI. Persisted, since resetting on reload defeats the point. */
  quiet?: boolean
}

export interface AppData {
  schema: number
  settings: Settings
  movies: Movie[]
  games: Game[]
  incomes: Income[]
  bills: Bill[]
  envelopes: Envelope[]
  expenses: Expense[]
  goals: Goal[]
  tasks: Task[]
  notes: Note[]
  allocations: Allocation[]
  debts: Debt[]
  routines: Routine[]
  series: Series[]
  projects: Project[]
  shopping: ShopItem[]
  people: Person[]
  maintenance: MaintenanceItem[]
  topics: Topic[]
  inbox: InboxItem[]
  closes: MonthClose[]
  scenarios: Scenario[]
}

/**
 * A frozen "what if" copy of the plan-shaping arrays (#39) — deliberately
 * NOT expenses/tasks/notes: a scenario asks "what would my plan look like",
 * not "what if my history were different", and copying history would
 * multiply storage for no gain. `data` is a real, independent deep copy —
 * editing it never touches the live AppData until an explicit "Apply".
 */
export interface Scenario {
  id: ID
  label: string
  createdAt: string
  data: Pick<AppData, 'incomes' | 'bills' | 'envelopes' | 'goals'>
  note?: string
}

/**
 * A frozen snapshot from the month close-out ritual (#40) — the point of it.
 * Envelopes get renamed and re-budgeted over time; without this, last
 * March becomes unreconstructable from the live data.
 */
export interface MonthClose {
  month: string // 'YYYY-MM'
  closedAt: string // ISO
  totals: { income: number; bills: number; spent: number; saved: number }
  perEnvelope: { envelopeId: ID; budgeted: number; spent: number }[]
  note?: string
}

export const SCHEMA_VERSION = 5
