/**
 * The one thing a spreadsheet can't do easily: "your low point is $43 on the
 * 12th, and rent lands on the 1st." Everything else in this app looks
 * backwards (what happened); this looks forwards.
 *
 * Pure, like the rest of core/ — no React, no DOM.
 */
import type { AppData } from './types'
import { addDays, addMonthsToKey, daysInMonth, fromKey, pad, todayKey } from './dates'
import { billAmountFor, buildPlan, incomeDates, isBillDueInMonth } from './budget'

export interface CashEvent {
  kind: 'income' | 'bill' | 'spend'
  label: string
  amount: number // positive = money in, negative = money out
}

export interface DayPoint {
  date: string
  balance: number
  events: CashEvent[]
}

/**
 * Day-by-day balance from today (or Settings.balanceAsOf) out `days` days.
 * Income events from each income's cadence, bill events from their due
 * dates (skipping anything already marked paid for that month), and
 * envelope spending as a flat daily burn — crude, but honest, and far
 * better than pretending irregular spending is predictable.
 */
export function project(data: AppData, days = 45): DayPoint[] {
  const startKey = data.settings.balanceAsOf ?? todayKey()
  const endKey = addDays(startKey, days)
  let balance = data.settings.balance ?? 0

  const eventsByDate = new Map<string, CashEvent[]>()
  const push = (date: string, e: CashEvent) => {
    if (date < startKey || date > endKey) return
    const list = eventsByDate.get(date) ?? []
    list.push(e)
    eventsByDate.set(date, list)
  }

  for (const income of data.incomes) {
    for (const d of incomeDates(income, startKey, endKey)) push(d, { kind: 'income', label: income.label, amount: income.amount })
  }

  for (const bill of data.bills) {
    let mk = startKey.slice(0, 7)
    const endMk = endKey.slice(0, 7)
    while (mk <= endMk) {
      if (isBillDueInMonth(bill, mk) && !bill.paid.includes(mk)) {
        const dim = daysInMonth(fromKey(`${mk}-01`))
        const dateKey = `${mk}-${pad(Math.min(bill.dueDay, dim))}`
        push(dateKey, { kind: 'bill', label: bill.label, amount: -billAmountFor(bill, mk) })
      }
      mk = addMonthsToKey(mk, 1)
    }
  }

  // buildPlan's own envelopeLeft/daysLeft — what's actually left to spend
  // this month, spread over the days actually left in it — not a fresh
  // guess. Floored at 0: already over budget shouldn't read as the
  // projection *gaining* money for the rest of the month.
  const plan = buildPlan(data)
  const dailyEnvelopeBurn = plan.daysLeft > 0 ? Math.max(0, plan.envelopeLeft) / plan.daysLeft : 0

  const points: DayPoint[] = []
  let d = startKey
  for (let i = 0; i <= days; i++) {
    const events = eventsByDate.get(d) ?? []
    for (const e of events) balance += e.amount
    if (dailyEnvelopeBurn > 0) {
      events.push({ kind: 'spend', label: 'Everyday spending', amount: -dailyEnvelopeBurn })
      balance -= dailyEnvelopeBurn
    }
    points.push({ date: d, balance, events })
    d = addDays(d, 1)
  }
  return points
}

/** The single worst day in a projection — the headline of the whole screen. */
export function lowPoint(points: DayPoint[]): DayPoint {
  return points.reduce((worst, p) => (p.balance < worst.balance ? p : worst), points[0])
}
