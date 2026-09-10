/**
 * The reward for a year of logging — a summary, not a celebration. Every
 * number here comes from data you already have; nothing is estimated or
 * fetched. Pure, like the rest of core/.
 *
 * Data-honesty note: Movie/Game have no "watched on"/"beaten on" date, only
 * `addedAt` — so the film/game sections below are scoped by when an item was
 * added to Daybook, not precisely when it was finished. Everything else
 * (expenses, bills, goal contributions, tasks, journal entries) has a real
 * date and is scoped by that exactly.
 */
import type { AppData, Expense, Goal } from './types'
import { billAmountFor, expenseTotal, isBillDueInMonth } from './budget'
import { addMonthsToKey, monthLabel } from './dates'
import { gameHours } from './games'

export interface TopEntry {
  label: string
  amount: number
}

export interface MonthSpend {
  month: string
  spent: number
}

export interface VariableBillCost {
  label: string
  total: number
  months: number
}

export interface RatingBucket {
  rating: number
  count: number
}

export interface TagCount {
  tag: string
  count: number
}

export interface YearReview {
  year: number
  /** True when `year` is still in progress — the UI must read as "so far" rather than a finished tally. */
  isPartial: boolean

  totalSpent: number
  biggestEnvelope: TopEntry | null
  biggestExpense: { label: string; amount: number; date: string } | null
  bestMonth: MonthSpend | null

  billsPaidCount: number
  variableBills: VariableBillCost[]

  goalsHit: number
  totalSaved: number
  totalInvested: number

  filmsWatched: number
  ratingDistribution: RatingBucket[]
  bestFilm: { title: string; rating: number } | null

  gamesBeaten: number
  hoursPlayed: number
  costPerHour: number | null

  tasksCompleted: number
  longestOpenTask: { title: string; daysOpen: number } | null

  journalWordCount: number
  topTags: TagCount[]
  fromJanuary: { text: string; date: string } | null
}

const inYear = (dateKey: string, year: number) => dateKey.startsWith(String(year))

export function buildYearReview(data: AppData, year = new Date().getFullYear(), today = new Date()): YearReview {
  const isPartial = year === today.getFullYear()
  const lastMonthIdx = isPartial ? today.getMonth() : 11 // 0-11, months of `year` actually reachable

  /* ── Spending ──────────────────────────────────────────────────────── */

  const yearExpenses = data.expenses.filter((e) => inYear(e.date, year))
  const totalSpent = yearExpenses.reduce((s, e) => s + expenseTotal(e), 0)

  const envelopeTotals = new Map<string, number>()
  for (const e of yearExpenses) {
    for (const l of e.lines) {
      if (!l.envelopeId) continue
      envelopeTotals.set(l.envelopeId, (envelopeTotals.get(l.envelopeId) ?? 0) + l.amount)
    }
  }
  const biggestEnvelope = topOf(envelopeTotals, (id) => data.envelopes.find((x) => x.id === id)?.label ?? 'Unassigned')

  const biggestExpenseRaw = yearExpenses.reduce<Expense | null>(
    (best, e) => (best === null || expenseTotal(e) > expenseTotal(best) ? e : best),
    null,
  )
  const biggestExpense = biggestExpenseRaw
    ? { label: biggestExpenseRaw.note || 'Expense', amount: expenseTotal(biggestExpenseRaw), date: biggestExpenseRaw.date }
    : null

  // "Best" only means something among months you were actually tracking —
  // a month before your first-ever logged expense isn't a great month, it's
  // no data, and would otherwise always win by defaulting to $0.
  const firstExpenseMonth = data.expenses.reduce<string | null>(
    (min, e) => (min === null || e.date.slice(0, 7) < min ? e.date.slice(0, 7) : min),
    null,
  )
  let bestMonth: MonthSpend | null = null
  if (firstExpenseMonth !== null) {
    for (let m = 0; m <= lastMonthIdx; m++) {
      const mk = `${year}-${String(m + 1).padStart(2, '0')}`
      if (mk < firstExpenseMonth) continue
      const spent = yearExpenses.filter((e) => e.date.startsWith(mk)).reduce((s, e) => s + expenseTotal(e), 0)
      if (bestMonth === null || spent < bestMonth.spent) bestMonth = { month: mk, spent }
    }
  }

  /* ── Bills ─────────────────────────────────────────────────────────── */

  const billsPaidCount = data.bills.reduce((s, b) => s + b.paid.filter((mk) => inYear(mk, year)).length, 0)

  const variableBills: VariableBillCost[] = []
  for (const b of data.bills) {
    const overridesInYear = Object.keys(b.amounts ?? {}).filter((mk) => inYear(mk, year))
    if (overridesInYear.length === 0) continue
    let total = 0
    let months = 0
    for (let m = 0; m <= lastMonthIdx; m++) {
      const mk = `${year}-${String(m + 1).padStart(2, '0')}`
      if (!isBillDueInMonth(b, mk)) continue
      total += billAmountFor(b, mk)
      months++
    }
    variableBills.push({ label: b.label, total, months })
  }

  /* ── Goals ─────────────────────────────────────────────────────────── */

  let goalsHit = 0
  let totalSaved = 0
  let totalInvested = 0
  for (const g of data.goals) {
    const inYearContribs = g.contributions.filter((c) => inYear(c.date, year))
    const sumInYear = inYearContribs.reduce((s, c) => s + c.amount, 0)
    if (g.kind === 'invest') totalInvested += sumInYear
    else totalSaved += sumInYear
    if (crossedTargetThisYear(g, year)) goalsHit++
  }

  /* ── Films & games (scoped by addedAt — see the file-level note) ─────── */

  const yearMovies = data.movies.filter((m) => inYear(m.addedAt, year))
  const watchedThisYear = yearMovies.filter((m) => m.watched)
  const filmsWatched = watchedThisYear.length
  const ratingCounts = new Map<number, number>()
  for (const m of watchedThisYear) if (m.rating) ratingCounts.set(m.rating, (ratingCounts.get(m.rating) ?? 0) + 1)
  const ratingDistribution = [...ratingCounts.entries()].map(([rating, count]) => ({ rating, count })).sort((a, b) => a.rating - b.rating)
  const bestFilmRaw = watchedThisYear.reduce<(typeof watchedThisYear)[number] | null>(
    (best, m) => (m.rating && (!best || (best.rating ?? 0) < m.rating) ? m : best),
    null,
  )
  const bestFilm = bestFilmRaw?.rating ? { title: bestFilmRaw.title, rating: bestFilmRaw.rating } : null

  const yearGames = data.games.filter((g) => inYear(g.addedAt, year))
  const beatenGames = yearGames.filter((g) => g.status === 'beaten')
  const gamesBeaten = beatenGames.length
  const hoursPlayed = yearGames.reduce((s, g) => s + gameHours(g), 0)
  const beatenWithCost = beatenGames.filter((g) => gameHours(g) > 0)
  const beatenHours = beatenWithCost.reduce((s, g) => s + gameHours(g), 0)
  const beatenPrice = beatenWithCost.reduce((s, g) => s + (g.price ?? 0), 0)
  const costPerHour = beatenHours > 0 ? beatenPrice / beatenHours : null

  /* ── Tasks ─────────────────────────────────────────────────────────── */

  // Only createdAt is reliable for every task (due is optional, and there's
  // no separate completedAt) — completion count is scoped by when a task was
  // created, its best available date.
  const tasksCompleted = data.tasks.filter((t) => t.done && inYear(t.createdAt, year)).length
  // "Sat undone longest" is a live, ongoing fact, not something that resets
  // each year — the open task with the oldest createdAt, full stop.
  const openTasks = data.tasks.filter((t) => !t.done)
  const oldestOpen = openTasks.reduce<(typeof openTasks)[number] | null>(
    (oldest, t) => (!oldest || t.createdAt < oldest.createdAt ? t : oldest),
    null,
  )
  const longestOpenTask = oldestOpen
    ? { title: oldestOpen.title, daysOpen: Math.round((today.getTime() - new Date(`${oldestOpen.createdAt}T00:00:00`).getTime()) / 86_400_000) }
    : null

  /* ── Journal ───────────────────────────────────────────────────────── */

  const yearNotes = data.notes.filter((n) => inYear(n.at.slice(0, 10), year))
  const journalWordCount = yearNotes.reduce((s, n) => s + n.text.trim().split(/\s+/).filter(Boolean).length, 0)
  const tagCounts = new Map<string, number>()
  for (const n of yearNotes) for (const t of n.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
  const topTags = [...tagCounts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 5)
  const januaryNotes = yearNotes.filter((n) => n.at.slice(5, 7) === '01').sort((a, b) => a.at.localeCompare(b.at))
  const fromJanuary = januaryNotes[0] ? { text: januaryNotes[0].text, date: januaryNotes[0].at.slice(0, 10) } : null

  return {
    year,
    isPartial,
    totalSpent,
    biggestEnvelope,
    biggestExpense,
    bestMonth,
    billsPaidCount,
    variableBills,
    goalsHit,
    totalSaved,
    totalInvested,
    filmsWatched,
    ratingDistribution,
    bestFilm,
    gamesBeaten,
    hoursPlayed,
    costPerHour,
    tasksCompleted,
    longestOpenTask,
    journalWordCount,
    topTags,
    fromJanuary,
  }
}

function topOf(totals: Map<string, number>, labelFor: (id: string) => string): TopEntry | null {
  let best: { id: string; amount: number } | null = null
  for (const [id, amount] of totals) if (!best || amount > best.amount) best = { id, amount }
  return best ? { label: labelFor(best.id), amount: best.amount } : null
}

/** Whether a goal's running total crossed its target sometime within `year` — walking contributions in date order, not just checking the final total, since a goal could have been hit last year and kept growing since. */
function crossedTargetThisYear(g: Goal, year: number): boolean {
  if (g.target <= 0) return false
  const sorted = [...g.contributions].sort((a, b) => a.date.localeCompare(b.date))
  let running = 0
  for (const c of sorted) {
    running += c.amount
    if (running >= g.target) return inYear(c.date, year)
  }
  return false
}

/** "January 2026" style label for a month key, reusing the existing month-name table via monthLabel. */
export const reviewMonthLabel = (mk: string) => monthLabel(mk)

// Re-exported for the UI's convenience when it needs to walk a year's months (e.g. a small sparkline) without duplicating the loop above.
export function monthsOfYear(year: number, upTo = 11): string[] {
  const out: string[] = []
  let mk = `${year}-01`
  for (let i = 0; i <= upTo; i++) {
    out.push(mk)
    mk = addMonthsToKey(mk, 1)
  }
  return out
}
