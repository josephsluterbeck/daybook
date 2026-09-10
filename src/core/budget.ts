/**
 * All budget arithmetic. Pure functions — no React, no storage, no DOM.
 * Keeping the math here means it can be unit-tested and reused by the
 * React Native app, a CLI, or an assistant layer without change.
 */
import type { Allocation, AppData, Bill, BillCadence, Cadence, Envelope, Expense, Goal, ID, Income, RecurringContribution } from './types'
import { addDays, addMonthsToKey, daysInMonth, fromKey, monthKey, monthsUntil, nextDueDate, nextPayday, pad, toKey, todayKey } from './dates'

/** Periods per year, used to normalise every pay cadence to a monthly figure. */
const PERIODS_PER_YEAR: Record<Cadence, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
}

/** Cadences with a fixed day-count period — the only ones a single anchor date can project forward. */
const PAYDAY_PERIOD_DAYS: Partial<Record<Cadence, number>> = { weekly: 7, biweekly: 14 }

/** Anything with a pay-style cadence and (optionally) an anchor date — an `Income` or a goal's `RecurringContribution` ask the identical "which occurrences have landed" question, so the scheduling functions below take just this rather than a full `Income`. */
type Cadenced = { cadence: Cadence; anchorDate?: string }

export function monthlyFrom(amount: number, cadence: Cadence): number {
  return (amount * PERIODS_PER_YEAR[cadence]) / 12
}

export const monthlyIncome = (incomes: Income[]) =>
  incomes.reduce((s, i) => s + monthlyFrom(i.amount, i.cadence), 0)

/** Next payday for an income with a known anchor date — null when the cadence has no fixed day-count period, or no anchor is set. */
export function nextPaydayFor(income: Cadenced, from = new Date()): string | null {
  const period = PAYDAY_PERIOD_DAYS[income.cadence]
  if (!period || !income.anchorDate) return null
  return nextPayday(income.anchorDate, period, from)
}

/** The most recent payday for an income that's already landed, on or before `from` — null under the same conditions as nextPaydayFor. */
export function lastPayDate(income: Cadenced, from = new Date()): string | null {
  const period = PAYDAY_PERIOD_DAYS[income.cadence]
  const next = nextPaydayFor(income, from)
  if (!period || !next) return null
  return next === toKey(from) ? next : addDays(next, -period)
}

/** Every occurrence of `day` (clamped to each month's real length) between two date keys, inclusive. */
function monthlyOccurrences(startKey: string, endKey: string, day: number): string[] {
  const out: string[] = []
  let mk = startKey.slice(0, 7)
  const endMk = endKey.slice(0, 7)
  while (mk <= endMk) {
    const dim = daysInMonth(fromKey(`${mk}-01`))
    const dateKey = `${mk}-${pad(Math.min(day, dim))}`
    if (dateKey >= startKey && dateKey <= endKey) out.push(dateKey)
    mk = addMonthsToKey(mk, 1)
  }
  return out
}

/**
 * Every payday for one income within a range. Weekly/biweekly step from a
 * real anchor date, so they're exact. Semimonthly/monthly have no anchor
 * mechanism (only a fixed day-count cadence can project forward from one
 * date) — approximated as the 1st/15th and the 1st respectively, close
 * enough for "roughly when does money land," not precise to the day.
 */
export function incomeDates(income: Cadenced, startKey: string, endKey: string): string[] {
  if (income.cadence === 'weekly' || income.cadence === 'biweekly') {
    if (!income.anchorDate) return []
    const period = PAYDAY_PERIOD_DAYS[income.cadence]!
    const dates: string[] = []
    let d = nextPaydayFor(income, fromKey(startKey)) ?? income.anchorDate
    let guard = 0
    while (d <= endKey && guard++ < 400) {
      if (d >= startKey) dates.push(d)
      d = addDays(d, period)
    }
    return dates
  }
  if (income.cadence === 'monthly') return monthlyOccurrences(startKey, endKey, 1)
  // semimonthly
  return [...monthlyOccurrences(startKey, endKey, 1), ...monthlyOccurrences(startKey, endKey, 15)].sort()
}

export interface PayEvent {
  date: string
  incomeId: ID
  amount: number
}

/** Every paycheck landing between two dates (inclusive), across every income. */
export function payDates(incomes: Income[], from: string, to: string): PayEvent[] {
  return incomes
    .flatMap((i) => incomeDates(i, from, to).map((date) => ({ date, incomeId: i.id, amount: i.amount })))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export interface FundingNeed {
  targetKind: Allocation['targetKind']
  targetId: ID
  label: string
  needed: number
}

/**
 * What's still unfunded before `until` — bills due before then (net of
 * whatever's already been allocated toward them), plus this month's envelope
 * budgets and goal contributions not yet covered by any paycheck. This is a
 * second ledger sitting beside buildPlan(), not a replacement for it: the
 * monthly plan still says what *should* happen, this says what's left to
 * actually assign from paychecks that have landed. Only positive gaps
 * (something still owed) are returned.
 */
export function fundingGap(data: AppData, until: string, mk = monthKey()): FundingNeed[] {
  const allocatedTo = (kind: Allocation['targetKind'], id: ID) =>
    data.allocations.filter((a) => a.targetKind === kind && a.targetId === id).reduce((s, a) => s + a.amount, 0)

  const out: FundingNeed[] = []

  for (const b of data.bills) {
    if (b.paid.includes(mk)) continue
    if (billNextDue(b) > until) continue
    const owed = billAmountFor(b, mk) - allocatedTo('bill', b.id)
    if (owed > 0.005) out.push({ targetKind: 'bill', targetId: b.id, label: b.label, needed: owed })
  }

  for (const e of data.envelopes) {
    const budget = effectiveEnvelopeBudget(data, e.id, mk)
    const owed = budget - allocatedTo('envelope', e.id)
    if (owed > 0.005) out.push({ targetKind: 'envelope', targetId: e.id, label: e.label, needed: owed })
  }

  for (const g of data.goals) {
    const owed = g.monthly - allocatedTo('goal', g.id)
    if (owed > 0.005) out.push({ targetKind: 'goal', targetId: g.id, label: g.label, needed: owed })
  }

  return out
}

/** Months per cycle for each bill cadence. */
const BILL_CADENCE_MONTHS: Record<BillCadence, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }

/** What a bill actually costs in a given month — its override for that month if one's set, else the usual amount. Only meaningful for monthly bills; a longer cadence doesn't have a per-occurrence override (yet). */
export const billAmountFor = (b: Bill, mk: string) => b.amounts?.[mk] ?? b.amount

/** What this bill costs per month, whatever its cadence — the true monthly cost of it, not just what's due in whichever month it happens to land in. */
export const billMonthlyCost = (b: Bill) => b.amount / BILL_CADENCE_MONTHS[b.cadence]

/** Bills total as normalised monthly cost — a $768 annual bill counts as $64/month every month, not $768 in the one month it's due and $0 the other eleven. */
export const billsTotal = (bills: Bill[]) => bills.reduce((s, b) => s + billMonthlyCost(b), 0)

/** What a bill costs *you* per month — its monthly cost minus whatever a joint split covers. */
export const yourShare = (b: Bill) => Math.max(0, billMonthlyCost(b) - (b.splitAmount ?? 0))

/** Bills total, counting only your share of any that are split with someone else — same monthly-cost basis as billsTotal. */
export const billsYourShare = (bills: Bill[]) => bills.reduce((s, b) => s + yourShare(b), 0)

/** Whether a bill's cycle actually lands in a given month: every month for a monthly bill, only its anchor month (and every cadence-months after it) for a longer one. */
export function isBillDueInMonth(b: Bill, mk: string): boolean {
  if (b.cadence === 'monthly') return true
  const months = BILL_CADENCE_MONTHS[b.cadence]
  const m = Number(mk.slice(5, 7))
  const anchor = b.dueMonth ?? 1
  return (((m - anchor) % months) + months) % months === 0
}

/**
 * Next due date for a bill of any cadence. Monthly delegates straight to
 * nextDueDate; a longer cadence anchors on dueMonth and repeats every
 * `cadence`-months from there — this walks forward from `from` to the first
 * occurrence on or after it.
 */
export function billNextDue(b: Bill, from = new Date()): string {
  const months = BILL_CADENCE_MONTHS[b.cadence]
  if (months <= 1) return nextDueDate(b.dueDay, from)

  const anchorMonth0 = ((b.dueMonth ?? 1) - 1) % 12
  const fromIdx = from.getFullYear() * 12 + from.getMonth()
  const anchorIdxThisYear = from.getFullYear() * 12 + anchorMonth0
  const k = Math.floor((fromIdx - anchorIdxThisYear) / months)
  const fromTime = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()

  // k and k+1 always bracket `from` — the cycle at-or-before it, then the one
  // after — so the first of those two whose actual date hasn't passed yet is
  // the answer.
  for (let step = k; step <= k + 1; step++) {
    const idx = anchorIdxThisYear + step * months
    const y = Math.floor(idx / 12)
    const m = ((idx % 12) + 12) % 12
    const day = Math.min(b.dueDay, daysInMonth(new Date(y, m, 1)))
    if (new Date(y, m, day).getTime() >= fromTime) return `${y}-${pad(m + 1)}-${pad(day)}`
  }
  const idx = anchorIdxThisYear + (k + 2) * months
  const y = Math.floor(idx / 12)
  const m = ((idx % 12) + 12) % 12
  const day = Math.min(b.dueDay, daysInMonth(new Date(y, m, 1)))
  return `${y}-${pad(m + 1)}-${pad(day)}`
}

/**
 * How much of a non-monthly bill's next hit should already be set aside,
 * based on whole months elapsed since its last occurrence — resets to ~0
 * right after the bill comes due and climbs back to the full amount by the
 * next one.
 */
export function sinkingBalance(b: Bill, today = new Date()): number {
  if (b.cadence === 'monthly') return 0
  const months = BILL_CADENCE_MONTHS[b.cadence]
  const remaining = monthsUntil(billNextDue(b, today), today)
  const accruedMonths = Math.max(0, months - remaining)
  return Math.min(b.amount, accruedMonths * billMonthlyCost(b))
}

export const envelopesTotal = (envs: Envelope[]) => envs.reduce((s, e) => s + e.monthly, 0)

/**
 * What a rollover envelope has carried in from every prior month: unspent
 * budget adds to next month's room, overspend subtracts from it — the honest
 * version, where blowing a category actually costs you later instead of
 * quietly resetting. Non-rollover envelopes always carry 0.
 *
 * Walks every month from the envelope's first-ever expense up to (not
 * including) `mk`, summing `monthly - spent` each month. One pass over the
 * envelope's own expenses bucketed by month, not a call per month, so a long
 * history doesn't mean a slow screen.
 */
export function rolloverBalance(data: AppData, envelopeId: string, mk = monthKey()): number {
  const env = data.envelopes.find((e) => e.id === envelopeId)
  if (!env?.rollover) return 0
  const spentByMonth = new Map<string, number>()
  for (const e of data.expenses) {
    const m = e.date.slice(0, 7)
    for (const l of e.lines) {
      if (l.envelopeId !== envelopeId) continue
      spentByMonth.set(m, (spentByMonth.get(m) ?? 0) + l.amount)
    }
  }
  if (spentByMonth.size === 0) return 0
  let cursor = [...spentByMonth.keys()].sort()[0]
  let carry = 0
  while (cursor < mk) {
    carry += env.monthly - (spentByMonth.get(cursor) ?? 0)
    cursor = monthKey(new Date(Number(cursor.slice(0, 4)), Number(cursor.slice(5, 7)), 1))
  }
  return carry
}

/** An envelope's actual room this month: its limit plus whatever it's carrying in. Equals `.monthly` when rollover is off. */
export function effectiveEnvelopeBudget(data: AppData, envelopeId: string, mk = monthKey()): number {
  const env = data.envelopes.find((e) => e.id === envelopeId)
  if (!env) return 0
  return env.monthly + rolloverBalance(data, envelopeId, mk)
}

/** envelopesTotal, but honouring rollover carry-in — the figure buildPlan actually uses. */
export function effectiveEnvelopesTotal(data: AppData, mk = monthKey()): number {
  return data.envelopes.reduce((s, e) => s + effectiveEnvelopeBudget(data, e.id, mk), 0)
}

export const goalsTotal = (goals: Goal[]) => goals.reduce((s, g) => s + g.monthly, 0)

export function expensesInMonth(expenses: Expense[], mk = monthKey()): Expense[] {
  return expenses.filter((e) => e.date.startsWith(mk))
}

/** An expense's actual total — the sum of its lines. Almost always one line; a refund line is negative. */
export const expenseTotal = (e: Expense) => e.lines.reduce((s, l) => s + l.amount, 0)

/** Every month with at least one expense, newest first — including the current month even if it's still empty. */
export function monthsWithExpenses(expenses: Expense[], from = new Date()): string[] {
  const months = new Set(expenses.map((e) => e.date.slice(0, 7)))
  months.add(monthKey(from))
  return [...months].sort((a, b) => b.localeCompare(a))
}

/**
 * Consecutive days with at least one expense logged, counting back from
 * today (or yesterday, if today just hasn't happened yet — logging nothing
 * *yet* today shouldn't read as the streak already being broken). The one
 * bit of gamification that's actually load-bearing: the app is only useful
 * while the logging habit holds.
 */
export function loggingStreak(expenses: Expense[], today = todayKey()): number {
  const days = new Set(expenses.map((e) => e.date))
  let cursor = days.has(today) ? today : addDays(today, -1)
  let streak = 0
  while (days.has(cursor)) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

/** Sums by line, not by expense — a split expense's amount is attributed to each envelope it actually touched, not just one of them. Signed, so a refund line correctly reduces what it's attributed to. */
export function spentByEnvelope(expenses: Expense[], mk = monthKey()): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of expensesInMonth(expenses, mk)) {
    for (const l of e.lines) {
      const k = l.envelopeId ?? '__unassigned'
      out[k] = (out[k] ?? 0) + l.amount
    }
  }
  return out
}

/** One envelope's spend across `months` consecutive months, oldest first — the current (partial) month is the last point. */
export function envelopeHistory(expenses: Expense[], envelopeId: string, months: number, from = new Date()): { month: string; total: number }[] {
  const out: { month: string; total: number }[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(from.getFullYear(), from.getMonth() - i, 1)
    const mk = monthKey(d)
    const total = expenses
      .filter((e) => e.date.startsWith(mk))
      .flatMap((e) => e.lines)
      .filter((l) => l.envelopeId === envelopeId)
      .reduce((s, l) => s + l.amount, 0)
    out.push({ month: mk, total })
  }
  return out
}

export interface Preset {
  amount: number
  envelopeId?: string
  count: number
}

/**
 * The handful of expenses you actually log most often, from the last ~90
 * days. Amounts are rounded to the nearest $5 — an exact preset of $82.40 is
 * never right twice, but "$80 · Groceries" is a real one-tap answer most weeks.
 * Only single-line expenses count — a split doesn't have one amount/envelope
 * to offer back as a one-tap preset.
 */
export function frequentExpenses(expenses: Expense[], limit = 4, from = new Date()): Preset[] {
  const cutoff = addDays(toKey(from), -90)
  const buckets = new Map<string, Preset>()
  for (const e of expenses) {
    if (e.date < cutoff || e.lines.length !== 1) continue
    const line = e.lines[0]
    if (line.amount <= 0) continue
    const rounded = Math.round(line.amount / 5) * 5
    if (rounded <= 0) continue
    const key = `${line.envelopeId ?? ''}|${rounded}`
    const existing = buckets.get(key)
    if (existing) existing.count += 1
    else buckets.set(key, { amount: rounded, envelopeId: line.envelopeId, count: 1 })
  }
  return [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, limit)
}

export interface Plan {
  income: number
  bills: number
  /** Bills total counting only your share — what a joint split with someone else covers is excluded. */
  billsYourShare: number
  billsRemaining: number
  /** Sum of envelope limits — a planning ceiling, not money set aside. */
  envelopes: number
  goals: number
  /**
   * Income not yet given a job. Envelopes are limits, not reservations: this
   * is only reduced by what's actually spent (`spent`), never by unused
   * envelope headroom — so "Unassigned" only drops when money actually leaves
   * your account, not the moment you cap a category.
   */
  unallocated: number
  spent: number
  /** Envelope money still available this month, against the limits. */
  envelopeLeft: number
  daysLeft: number
  perDay: number
}

/**
 * The single source of truth for "how am I doing this month".
 * Every number on the Money screen comes from here.
 */
export function buildPlan(data: AppData, mk = monthKey()): Plan {
  const income = monthlyIncome(data.incomes)
  // True monthly cost, not just this month's invoices — an annual bill counts
  // the same fraction every month rather than spiking once a year.
  const bills = billsTotal(data.bills)
  const billsShare = billsYourShare(data.bills)
  // billsRemaining is the other number: what's literally due *this* month.
  // Only bills whose cycle actually lands here count, or a quarterly bill
  // would look "still to pay" in the eight months it was never due in.
  const billsRemaining = data.bills
    .filter((b) => isBillDueInMonth(b, mk) && !b.paid.includes(mk))
    .reduce((s, b) => s + billAmountFor(b, mk), 0)
  // Effective, not raw: a rollover envelope's carried balance is real room
  // (or a real hole), and Plan/Bills/envelope-list would quietly disagree
  // with each other if this used the plain per-envelope limit instead.
  const envelopes = effectiveEnvelopesTotal(data, mk)
  // Archived goals are off the active list on purpose — they shouldn't still
  // be quietly reserving money out of Unassigned.
  const goals = goalsTotal(data.goals.filter((g) => !g.archived))
  const spent = expensesInMonth(data.expenses, mk).reduce((s, e) => s + expenseTotal(e), 0)

  const now = new Date()
  const isCurrentMonth = mk === monthKey(now)
  const dim = daysInMonth(now)
  const daysLeft = isCurrentMonth ? Math.max(1, dim - now.getDate() + 1) : dim

  const envelopeLeft = envelopes - spent

  return {
    income,
    bills,
    billsYourShare: billsShare,
    billsRemaining,
    envelopes,
    goals,
    unallocated: income - billsShare - goals - spent,
    spent,
    envelopeLeft,
    daysLeft,
    perDay: envelopeLeft / daysLeft,
  }
}

const AFFORD_PERDAY_FLOOR = 10

export interface Affordability {
  amount: number
  envelopeId?: string
  /** undefined when no envelope was chosen. */
  envelopeLeftAfter?: number
  unassignedAfter: number
  perDayAfter: number
  verdict: 'yes' | 'tight' | 'no'
  /** One plain-language sentence naming the actual constraint — never just "yes". */
  reason: string
}

/**
 * The question you actually have, standing in a shop. Every number here
 * already exists in AppData; this just asks "what happens if" without
 * committing anything.
 */
export function canIAfford(data: AppData, amount: number, envelopeId?: string, mk = monthKey()): Affordability {
  const plan = buildPlan(data, mk)
  const currency = data.settings.currency
  const env = envelopeId ? data.envelopes.find((e) => e.id === envelopeId) : undefined
  const envBudget = envelopeId ? effectiveEnvelopeBudget(data, envelopeId, mk) : 0
  const spentInEnv = envelopeId ? (spentByEnvelope(data.expenses, mk)[envelopeId] ?? 0) : 0
  const envelopeLeftAfter = env ? envBudget - spentInEnv - amount : undefined
  const unassignedAfter = plan.unallocated - amount
  const perDayAfter = plan.daysLeft > 0 ? (plan.envelopeLeft - amount) / plan.daysLeft : 0

  let verdict: Affordability['verdict']
  let reason: string

  if (unassignedAfter < 0 && (envelopeLeftAfter === undefined || envelopeLeftAfter < 0)) {
    verdict = 'no'
    reason = `That's ${formatMoney(-unassignedAfter, currency)} more than you actually have this month.`
  } else if (perDayAfter < AFFORD_PERDAY_FLOOR) {
    verdict = 'tight'
    reason = `That leaves ${formatMoney(Math.max(0, perDayAfter), currency)}/day for the rest of the month.`
  } else if (env && envBudget > 0 && envelopeLeftAfter !== undefined && envelopeLeftAfter / envBudget < 0.1) {
    verdict = 'tight'
    reason =
      envelopeLeftAfter < 0
        ? `That puts ${env.label} ${formatMoney(-envelopeLeftAfter, currency)} over for the month.`
        : `That leaves ${formatMoney(envelopeLeftAfter, currency)} of ${env.label} for ${plan.daysLeft} days.`
  } else {
    verdict = 'yes'
    reason = env
      ? `That leaves ${formatMoney(envelopeLeftAfter ?? 0, currency)} of ${env.label} for ${plan.daysLeft} days.`
      : `That leaves ${formatMoney(unassignedAfter, currency)} unassigned.`
  }

  return { amount, envelopeId, envelopeLeftAfter, unassignedAfter, perDayAfter, verdict, reason }
}

export interface UpcomingBill extends Bill {
  due: string
  paid_: boolean
}

/**
 * `from` decides what "due" means: real-now (the default) rolls a passed due
 * day to next month, which is right for "what's coming up." Viewing a past
 * month wants that month's due date instead, whether or not it's already
 * gone by — pass `firstOfMonth(mk)` for that (see Money.tsx's month nav).
 */
/** Bills due on each day-of-month within `mk`, keyed by day number — only bills whose cycle actually lands in this month, clamped to the month's real length (for the month calendar view). */
export function billsDueOn(bills: Bill[], mk: string): Map<number, Bill[]> {
  const dim = daysInMonth(fromKey(`${mk}-01`))
  const out = new Map<number, Bill[]>()
  for (const b of bills) {
    if (!isBillDueInMonth(b, mk)) continue
    const day = Math.min(b.dueDay, dim)
    const list = out.get(day) ?? []
    list.push(b)
    out.set(day, list)
  }
  return out
}

export function upcomingBills(bills: Bill[], mk = monthKey(), from = new Date()): UpcomingBill[] {
  return bills
    .map((b) => ({ ...b, amount: billAmountFor(b, mk), due: billNextDue(b, from), paid_: b.paid.includes(mk) }))
    .sort((a, b) => (a.paid_ === b.paid_ ? a.due.localeCompare(b.due) : a.paid_ ? 1 : -1))
}

export interface MonthOfBills {
  monthKey: string
  bills: UpcomingBill[]
  total: number
}

/**
 * Bills projected across `count` months starting at `from`, so a heavy month
 * coming up (renewal, an annual-feeling bill landing awkwardly) is visible
 * before it arrives instead of at the moment it's due.
 */
export function billsForMonths(bills: Bill[], count = 3, from = new Date()): MonthOfBills[] {
  const months: MonthOfBills[] = []
  for (let i = 0; i < count; i++) {
    const first = new Date(from.getFullYear(), from.getMonth() + i, 1)
    const mk = monthKey(first)
    const list = bills
      // Only bills whose cycle actually lands in this projected month — an
      // annual bill shouldn't show up as "coming up" in eleven months it
      // isn't due in, just because it hasn't happened yet.
      .filter((b) => isBillDueInMonth(b, mk))
      .map((b) => ({ ...b, amount: billAmountFor(b, mk), due: billNextDue(b, first), paid_: b.paid.includes(mk) }))
      .sort((a, b) => a.due.localeCompare(b.due))
    months.push({ monthKey: mk, bills: list, total: list.reduce((s, b) => s + b.amount, 0) })
  }
  return months
}

/** Total ever put toward a goal, from any source — you, a spouse, whoever's tagged on a contribution. */
export const goalSaved = (g: Goal) => g.contributions.reduce((s, c) => s + c.amount, 0)

/** What's been put toward a goal within a given month, from any source. */
export function goalContributedInMonth(g: Goal, mk = monthKey()): number {
  return g.contributions.filter((c) => c.date.startsWith(mk)).reduce((s, c) => s + c.amount, 0)
}

/**
 * The most recent occurrence of a standing recurring contribution that's
 * already happened but hasn't been turned into a logged Contribution yet —
 * null when nothing new is due. Reuses `incomeDates()` (built for "which
 * paychecks landed") for every cadence, walking forward from the day after
 * whatever was last logged, or from the rule's own anchor if nothing has
 * been logged yet — so a goal archived or paused for months doesn't dump a
 * backlog of individual occurrences on reopening it, just the latest one,
 * the same "did this land yet" question the paycheck prompt asks.
 */
export function dueContribution(r: RecurringContribution, today = todayKey()): string | null {
  const startKey = r.lastLogged ? addDays(r.lastLogged, 1) : r.anchorDate
  if (startKey > today) return null
  const occurrences = incomeDates(r, startKey, today)
  return occurrences.length > 0 ? occurrences[occurrences.length - 1] : null
}

export interface DueGoalContribution {
  goal: Goal
  recurring: RecurringContribution
  date: string
}

/** Every goal's recurring rule that has a not-yet-logged occurrence, across the whole plan — archived goals excluded, same as everywhere else recurring things are surfaced. */
export function dueGoalContributions(data: AppData, today = todayKey()): DueGoalContribution[] {
  const out: DueGoalContribution[] = []
  for (const g of data.goals) {
    if (g.archived) continue
    for (const r of g.recurring) {
      const date = dueContribution(r, today)
      if (date) out.push({ goal: g, recurring: r, date })
    }
  }
  return out
}

/** A goal's standing recurring contributions (spouse autopay, employer match, …), normalised to a monthly figure the same way income is — money that lands toward the goal without counting against `g.monthly`, your own planned contribution. */
export const recurringMonthlyTotal = (g: Goal) => g.recurring.reduce((s, r) => s + monthlyFrom(r.amount, r.cadence), 0)

/** Months of contributions still needed to reach a goal. Infinity if it never gets there. */
export function monthsToGoal(g: Goal): number {
  const saved = goalSaved(g)
  if (saved >= g.target) return 0
  const pace = g.monthly + recurringMonthlyTotal(g)
  if (pace <= 0) return Infinity
  return Math.ceil((g.target - saved) / pace)
}

/** Monthly contribution needed to close the gap by `targetDate`. 0 if already funded. */
export function requiredMonthlyToGoal(target: number, saved: number, targetDate: string, today = new Date()): number {
  const remaining = Math.max(0, target - saved)
  if (remaining <= 0) return 0
  const monthsLeft = monthsUntil(targetDate, today)
  // 0 months left means the deadline is this month — the whole remainder is due now, not spread out.
  return monthsLeft <= 0 ? remaining : remaining / monthsLeft
}

export type GoalPace = 'funded' | 'no-deadline' | 'on-track' | 'behind'

export interface GoalProgress {
  pct: number
  /** Whole months until targetDate. Null when there's no deadline. */
  monthsLeft: number | null
  /** What g.monthly would need to be to hit targetDate. Null when there's no deadline; 0 once funded. */
  requiredMonthly: number | null
  pace: GoalPace
}

/** Ties a goal's saved/target/monthly to its (optional) deadline: is the current contribution actually enough? */
export function goalProgress(g: Goal, today = new Date()): GoalProgress {
  const saved = goalSaved(g)
  const pct = g.target > 0 ? Math.round((saved / g.target) * 100) : 0
  const remaining = Math.max(0, g.target - saved)

  if (remaining <= 0) {
    return { pct, monthsLeft: g.targetDate ? monthsUntil(g.targetDate, today) : null, requiredMonthly: 0, pace: 'funded' }
  }
  if (!g.targetDate) {
    return { pct, monthsLeft: null, requiredMonthly: null, pace: 'no-deadline' }
  }
  const monthsLeft = monthsUntil(g.targetDate, today)
  // The total pace needed to hit the deadline, minus what standing recurring
  // contributions already cover on their own — what's left is what your own
  // `g.monthly` actually has to make up.
  const totalRequiredMonthly = requiredMonthlyToGoal(g.target, saved, g.targetDate, today)
  const requiredMonthly = Math.max(0, totalRequiredMonthly - recurringMonthlyTotal(g))
  // A cent of float slop shouldn't flip a goal from on-track to behind.
  const pace: GoalPace = g.monthly >= requiredMonthly - 0.005 ? 'on-track' : 'behind'
  return { pct, monthsLeft, requiredMonthly, pace }
}

export interface InvestProgress {
  contributed: number
  target: number
  pct: number
  met: boolean
}

/**
 * For an investing goal, "how am I doing" is about keeping up the monthly
 * contribution, not a total — there's no finish line to save toward, just a
 * pace to hold. Compares what's landed this month against `g.monthly`.
 */
export function investMonthlyProgress(g: Goal, mk = monthKey()): InvestProgress {
  const contributed = goalContributedInMonth(g, mk)
  const target = g.monthly
  let pct = 0
  if (target > 0) pct = Math.round((contributed / target) * 100)
  else if (contributed > 0) pct = 100
  return { contributed, target, pct, met: target <= 0 || contributed >= target - 0.005 }
}

export function formatMoney(n: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
    minimumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
  }).format(n)
}
