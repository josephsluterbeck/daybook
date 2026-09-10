/**
 * #40's ritual — pure logic only; the six-step wizard lives in
 * ui/MonthCloseSheet.tsx. A MonthClose is a frozen snapshot: envelopes get
 * renamed and re-budgeted over time, so without one, last March becomes
 * unreconstructable from the live data.
 */
import type { AppData, Expense, MonthClose } from './types'
import { addMonthsToKey, monthKey, todayKey } from './dates'
import { effectiveEnvelopeBudget, expensesInMonth, expenseTotal, goalContributedInMonth, isBillDueInMonth, monthlyIncome, billsTotal, spentByEnvelope } from './budget'

/** Every past month (not the current one, always in-progress) that has any activity and isn't closed yet, oldest first — the order you'd actually want to catch up in. */
export function pendingCloseMonths(data: AppData, today = todayKey()): string[] {
  const current = monthKey(new Date(today))
  const closed = new Set(data.closes.map((c) => c.month))
  const monthsWithActivity = new Set(data.expenses.map((e: Expense) => e.date.slice(0, 7)))
  return [...monthsWithActivity]
    .filter((mk) => mk !== current && mk < current && !closed.has(mk))
    .sort((a, b) => a.localeCompare(b))
}

/** Just the next one to offer — what Today prompts with, and what the drawer's re-open flow defaults to. */
export function nextCloseMonth(data: AppData, today = todayKey()): string | null {
  return pendingCloseMonths(data, today)[0] ?? null
}

/** The frozen numbers for one month — computed fresh from the live data at close time, then never recomputed again. */
export function buildMonthClose(data: AppData, mk: string, note?: string): MonthClose {
  const income = monthlyIncome(data.incomes)
  const bills = billsTotal(data.bills)
  const spent = expensesInMonth(data.expenses, mk).reduce((s, e) => s + expenseTotal(e), 0)
  const saved = data.goals.reduce((s, g) => s + goalContributedInMonth(g, mk), 0)
  const spentByEnv = spentByEnvelope(data.expenses, mk)
  const perEnvelope = data.envelopes.map((e) => ({
    envelopeId: e.id,
    budgeted: effectiveEnvelopeBudget(data, e.id, mk),
    spent: spentByEnv[e.id] ?? 0,
  }))
  return { month: mk, closedAt: todayKey(), totals: { income, bills, spent, saved }, perEnvelope, note }
}

/** Records a close, replacing any existing record for that month (re-closing after editing something is allowed, not blocked). */
export function commitMonthClose(data: AppData, close: MonthClose): void {
  data.closes = [...data.closes.filter((c) => c.month !== close.month), close]
}

/** Unpaid bills that were actually due in that month — step 3's "paid and forgotten, or actually missed?" list. A bill due in a different cycle isn't "unpaid" just because this month isn't in its paid array. */
export function unpaidBillsFor(data: AppData, mk: string) {
  return data.bills.filter((b) => isBillDueInMonth(b, mk) && !b.paid.includes(mk))
}

/** The month right before `mk` — for "next month" framing in the envelope-adjustment step. */
export function monthAfter(mk: string): string {
  return addMonthsToKey(mk, 1)
}
