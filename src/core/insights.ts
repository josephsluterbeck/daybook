/**
 * The insight engine (BACKLOG #34-38's "build this first"). One engine, not
 * four independent banners — every detector below is a separate pure
 * function returning `Insight[]`, and `allInsights` is the single place that
 * concatenates, ranks, and filters out anything dismissed. The UI (Today)
 * decides how many to actually show — see `TODAY_INSIGHT_CAP` — this file
 * just hands back the full, correctly-ordered list.
 *
 * The rules that keep it trustworthy, from BACKLOG.md, restated because
 * they're the whole point: never fire without enough data, always name the
 * number, describe rather than advise, and stay pure enough to unit-test
 * with a fixture in, `Insight[]` out.
 */
import type { AppData, Envelope, Expense, ID, RouteKey } from './types'
import { addDays, daysInMonth, fromKey, monthKey, todayKey } from './dates'
import { envelopeHistory, expensesInMonth, formatMoney, monthsWithExpenses, spentByEnvelope } from './budget'

export type InsightKind = 'budget-drift' | 'burn-rate' | 'recurring-found' | 'anomaly'

export interface Insight {
  id: string // stable per kind+subject, so dismissals stick
  kind: InsightKind
  severity: 'info' | 'warn' | 'urgent'
  title: string // one line, specific, with the number in it
  detail: string // one sentence of why
  action?: { label: string; route: RouteKey; targetId?: ID }
  /** Not "when this was computed" (that's always just today) but the most relevant date behind the underlying thing — the last expense in a drifting envelope, the end of an anomalous week — so ranking can use it as a recency signal. */
  computedAt: string
}

/** How many insights Today shows directly; the rest sit behind a "More insights" row. Exported so the UI and this file agree on one number. */
export const TODAY_INSIGHT_CAP = 2

/** A dismissed insight isn't gone forever — just quiet for a while, or a real recurring problem would vanish the moment you're tired of hearing about it once. */
export const DISMISS_DAYS = 30

const SEVERITY_RANK: Record<Insight['severity'], number> = { urgent: 0, warn: 1, info: 2 }

export function isDismissed(data: AppData, id: string, today = todayKey()): boolean {
  return (data.settings.dismissedInsights ?? []).some((d) => d.id === id && d.until > today)
}

/** Mutates `data` in place — call from inside `store.update`, same as everything else that changes Settings. `days` past the default is how #37's "Ignore" gets to mean effectively-permanent without a second, parallel list. */
export function dismissInsight(data: AppData, id: string, today = todayKey(), days = DISMISS_DAYS): void {
  const until = addDays(today, days)
  const list = data.settings.dismissedInsights ?? []
  const idx = list.findIndex((d) => d.id === id)
  if (idx >= 0) list[idx] = { id, until }
  else list.push({ id, until })
  data.settings.dismissedInsights = list
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0
}

function daysBetween(a: string, b: string): number {
  return Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86_400_000)
}

/* ── #35 Budget vs. reality ───────────────────────────────────────────── */

export interface Drift {
  envelopeId: ID
  budgeted: number
  median: number
  months: number
  pct: number // (median - budgeted) / budgeted * 100, signed
}

/**
 * The median of complete months only — one Costco run shouldn't redefine
 * the grocery budget, and the current month is always partial and always
 * reads low, so it's excluded entirely rather than pro-rated.
 */
export function envelopeDrift(data: AppData, minMonths = 3, from = new Date()): Drift[] {
  // Needs minMonths COMPLETE months before the current one — i.e. more than
  // minMonths distinct months of app usage total, current included.
  if (monthsWithExpenses(data.expenses, from).length <= minMonths) return []
  const priorFrom = new Date(from.getFullYear(), from.getMonth() - 1, 1)
  const out: Drift[] = []
  for (const env of data.envelopes) {
    if (env.monthly <= 0) continue
    const hist = envelopeHistory(data.expenses, env.id, minMonths, priorFrom).map((h) => h.total)
    const med = median(hist)
    const pct = Math.round(((med - env.monthly) / env.monthly) * 100)
    out.push({ envelopeId: env.id, budgeted: env.monthly, median: med, months: minMonths, pct })
  }
  return out
}

export function driftInsights(data: AppData, today = todayKey()): Insight[] {
  const currency = data.settings.currency
  const out: Insight[] = []
  for (const d of envelopeDrift(data)) {
    if (Math.abs(d.pct) < 15) continue // below that it's noise
    const env = data.envelopes.find((e) => e.id === d.envelopeId)
    if (!env) continue
    const over = d.pct > 0
    out.push({
      id: `budget-drift:${d.envelopeId}`,
      kind: 'budget-drift',
      severity: Math.abs(d.pct) >= 30 ? 'warn' : 'info',
      title: `${env.label}: you budget ${formatMoney(d.budgeted, currency)}, you typically spend ${formatMoney(d.median, currency)}`,
      detail: over
        ? `Running ${d.pct}% over its budget across the last ${d.months} months.`
        : `Running ${Math.abs(d.pct)}% under its budget — ${formatMoney(d.budgeted - d.median, currency)}/month with no job.`,
      action: { label: 'Review envelope', route: 'money', targetId: env.id },
      computedAt: today,
    })
  }
  return out
}

/* ── #36 Envelope burn rate ───────────────────────────────────────────── */

export interface BurnRate {
  envelopeId: ID
  spent: number
  perDay: number
  runsOutOn?: string
  projectedTotal: number
}

export function burnRates(data: AppData, mk = monthKey()): BurnRate[] {
  const spent = spentByEnvelope(data.expenses, mk)
  const isCurrentMonth = mk === monthKey()
  const monthStart = `${mk}-01`
  const daysElapsed = isCurrentMonth ? new Date().getDate() : daysInMonth(fromKey(monthStart))
  const daysTotal = daysInMonth(fromKey(monthStart))
  const out: BurnRate[] = []
  for (const env of data.envelopes) {
    const s = Math.max(0, spent[env.id] ?? 0)
    const perDay = daysElapsed > 0 ? s / daysElapsed : 0
    const projectedTotal = perDay * daysTotal
    let runsOutOn: string | undefined
    if (env.monthly > 0 && perDay > 0 && projectedTotal > env.monthly) {
      const daysToLimit = Math.ceil(env.monthly / perDay)
      runsOutOn = addDays(monthStart, daysToLimit - 1)
    }
    out.push({ envelopeId: env.id, spent: s, perDay, runsOutOn, projectedTotal })
  }
  return out
}

export function burnRateInsights(data: AppData, mk = monthKey(), today = todayKey()): Insight[] {
  const currency = data.settings.currency
  const daysElapsed = new Date().getDate()
  const daysTotal = daysInMonth()
  const daysLeft = daysTotal - daysElapsed
  if (daysElapsed < 5 || daysLeft <= 5) return [] // too early to extrapolate, too late to matter
  const out: Insight[] = []
  for (const b of burnRates(data, mk)) {
    const env = data.envelopes.find((e) => e.id === b.envelopeId)
    if (!env || env.monthly <= 0) continue
    const linesThisMonth = expensesInMonth(data.expenses, mk).flatMap((e) => e.lines).filter((l) => l.envelopeId === env.id).length
    if (linesThisMonth < 3) continue // one purchase on the 2nd is astrology
    if (b.projectedTotal <= env.monthly * 1.1) continue
    out.push({
      id: `burn-rate:${env.id}:${mk}`,
      kind: 'burn-rate',
      severity: 'warn',
      title: `${env.label}: on pace for ${formatMoney(b.projectedTotal, currency)}, budget is ${formatMoney(env.monthly, currency)}`,
      detail: b.runsOutOn
        ? `At this rate it runs out around ${b.runsOutOn}, with ${daysLeft} days left in the month.`
        : `Running ${formatMoney(b.perDay, currency)}/day, ahead of what the budget allows.`,
      action: { label: 'View envelope', route: 'money', targetId: env.id },
      computedAt: today,
    })
  }
  return out
}

/* ── #37 Recurring-charge detection ───────────────────────────────────── */

export interface RecurringCandidate {
  key: string // normalised note
  amount: number // median
  occurrences: { date: string; expenseId: ID }[]
  cadenceDays: number // median gap
  confidence: number // 0-1
}

function normalizeNote(note: string): string {
  return note
    .toLowerCase()
    .replace(/[0-9]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "Netflix" reads better than the normalised match key in an insight's title. */
function titleCase(key: string): string {
  return key.replace(/\b\w/g, (c) => c.toUpperCase())
}

function buildCandidate(key: string, items: { date: string; expenseId: ID; amount: number }[]): RecurringCandidate | null {
  if (items.length < 3) return null
  const gaps: number[] = []
  for (let i = 1; i < items.length; i++) gaps.push(daysBetween(items[i - 1].date, items[i].date))
  const medGap = median(gaps)
  const inCadenceWindow = (medGap >= 28 && medGap <= 31) || (medGap >= 90 && medGap <= 92) || (medGap >= 364 && medGap <= 366)
  if (!inCadenceWindow) return null
  const m = mean(gaps)
  const sd = Math.sqrt(mean(gaps.map((g) => (g - m) ** 2)))
  const countScore = Math.min(1, (items.length - 2) / 3)
  const varianceScore = medGap > 0 ? Math.max(0, 1 - sd / medGap) : 0
  const confidence = Math.round(((countScore + varianceScore) / 2) * 100) / 100
  if (confidence < 0.7) return null
  return {
    key,
    amount: median(items.map((i) => i.amount)),
    occurrences: items.map((i) => ({ date: i.date, expenseId: i.expenseId })),
    cadenceDays: Math.round(medGap),
    confidence,
  }
}

/**
 * Groups by normalised note, then within a note clusters consecutive
 * occurrences whose amount hasn't crept more than ±5% since the last one —
 * a renewal that went from $9.99 to $10.99 is still the same subscription,
 * caught here rather than starting a fresh, too-short cluster.
 */
export function findRecurring(data: AppData): RecurringCandidate[] {
  const billKeys = new Set(data.bills.map((b) => normalizeNote(b.label)))
  const groups = new Map<string, { date: string; expenseId: ID; amount: number }[]>()
  for (const e of data.expenses) {
    if (!e.note?.trim() || e.lines.length !== 1) continue
    const key = normalizeNote(e.note)
    if (!key || billKeys.has(key)) continue
    const amount = e.lines[0].amount
    if (amount <= 0) continue // ignore refunds
    const arr = groups.get(key) ?? []
    arr.push({ date: e.date, expenseId: e.id, amount })
    groups.set(key, arr)
  }

  const out: RecurringCandidate[] = []
  for (const [key, itemsUnsorted] of groups) {
    const items = [...itemsUnsorted].sort((a, b) => a.date.localeCompare(b.date))
    let cluster: typeof items = []
    const flush = () => {
      const candidate = buildCandidate(key, cluster)
      if (candidate) out.push(candidate)
      cluster = []
    }
    for (const item of items) {
      const last = cluster[cluster.length - 1]
      if (last && Math.abs(item.amount - last.amount) / last.amount > 0.05) flush()
      cluster.push(item)
    }
    flush()
  }
  return out
}

export function recurringInsights(data: AppData): Insight[] {
  const currency = data.settings.currency
  return findRecurring(data).map((c) => {
    const last = c.occurrences[c.occurrences.length - 1]
    return {
      id: `recurring-found:${c.key}`,
      kind: 'recurring-found' as const,
      severity: 'info' as const,
      title: `Looks recurring: ${titleCase(c.key)} — ${formatMoney(c.amount, currency)} every ~${c.cadenceDays} days`,
      detail: `Seen ${c.occurrences.length} times and not in your bills list — a bill you forgot to set up, or a subscription worth cancelling.`,
      action: { label: 'Review bills', route: 'money' as RouteKey },
      computedAt: last.date,
    }
  })
}

/* ── #38 Spending anomalies ────────────────────────────────────────────── */

function weekTotal(expenses: Expense[], envelopeId: string, endDateKey: string): number {
  const start = addDays(endDateKey, -6)
  return expenses
    .filter((e) => e.date >= start && e.date <= endDateKey)
    .flatMap((e) => e.lines)
    .filter((l) => l.envelopeId === envelopeId)
    .reduce((s, l) => s + l.amount, 0)
}

/**
 * The one detector where restraint matters most (its own words) — tuned
 * high on purpose. MAD, not standard deviation, so one holiday week doesn't
 * inflate the threshold so far that nothing ever fires again; both an MAD
 * multiple AND a dollar floor have to clear, not either; and only the
 * single largest anomaly ever fires, never a wall of them.
 */
export function weeklyAnomalies(data: AppData, sigma = 2.5, today = todayKey()): Insight[] {
  const earliest = data.expenses.reduce((min, e) => (e.date < min ? e.date : min), today)
  if (daysBetween(earliest, today) < 56) return [] // eight weeks minimum

  const currency = data.settings.currency
  let best: { env: Envelope; thisWeek: number; med: number; overBy: number } | null = null

  for (const env of data.envelopes) {
    const thisWeek = weekTotal(data.expenses, env.id, today)
    const priorWeeks: number[] = []
    for (let w = 1; w <= 8; w++) priorWeeks.push(weekTotal(data.expenses, env.id, addDays(today, -7 * w)))
    const med = median(priorWeeks)
    if (thisWeek <= med) continue // never fire on a drop
    const mad = median(priorWeeks.map((v) => Math.abs(v - med)))
    // An envelope that's mostly or entirely unused in the lookback window
    // has a median AND a MAD of 0 (a handful of nonzero weeks among mostly
    // zero ones still medians to 0) — any first purchase would then
    // trivially clear "more than 2.5x a zero MAD" and read as anomalous when
    // it's really just an infrequently-used envelope's first real week in a
    // while. Only skip this when the median is ALSO 0, though — a mad of 0
    // from genuinely identical spending every week (med > 0) is real
    // information and should still be allowed to fire on any deviation.
    if (mad === 0 && med === 0) continue
    const overBy = thisWeek - med
    const clearsMad = overBy > sigma * mad
    const clearsFloor = overBy > 40
    if (!clearsMad || !clearsFloor) continue
    if (!best || overBy > best.overBy) best = { env, thisWeek, med, overBy }
  }

  if (!best) return []
  return [
    {
      id: `anomaly:${best.env.id}:${today}`,
      kind: 'anomaly',
      severity: 'warn',
      title: `${best.env.label}: ${formatMoney(best.thisWeek, currency)} this week, usually around ${formatMoney(best.med, currency)}`,
      detail: `That's ${formatMoney(best.overBy, currency)} more than the last eight weeks' typical week.`,
      action: { label: 'See what it was', route: 'money', targetId: best.env.id },
      computedAt: today,
    },
  ]
}

/* ── The engine ────────────────────────────────────────────────────────── */

export function allInsights(data: AppData, today = todayKey()): Insight[] {
  const all = [
    ...driftInsights(data, today),
    ...burnRateInsights(data, monthKey(), today),
    ...recurringInsights(data),
    ...weeklyAnomalies(data, 2.5, today),
  ]
  return all
    .filter((i) => !isDismissed(data, i.id, today))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.computedAt.localeCompare(a.computedAt))
}
