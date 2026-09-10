/**
 * Amortisation. Pure arithmetic on numbers you typed — no advice, no
 * recommendation about which debt to attack first. `order()` just sorts;
 * the UI shows what each ordering *is*, never asserts which one is right.
 */
import type { Debt } from './types'
import { addMonthsToKey, monthKey } from './dates'

export interface AmortRow {
  month: number
  date: string // 'YYYY-MM', the month this payment lands in
  interest: number
  principal: number
  balance: number // remaining balance after this payment
}

/** Hard stop so a payment that doesn't cover the interest returns "never" instead of looping forever. */
const MAX_MONTHS = 600

/**
 * Month-by-month amortisation at a given payment (defaults to minimum +
 * extra). Standard `interest = balance * apr / 1200`. Stops early — with the
 * last row left showing a non-zero balance — the moment a payment can't even
 * cover that month's interest, since the balance would only grow from there.
 */
export function amortise(d: Debt, monthlyPayment = d.minimum + d.extra, from = new Date()): AmortRow[] {
  const rows: AmortRow[] = []
  let balance = d.balance
  const monthlyRate = d.apr / 1200
  let mk = monthKey(from)

  for (let month = 1; month <= MAX_MONTHS && balance > 0.005; month++) {
    const interest = balance * monthlyRate
    let principal = monthlyPayment - interest
    mk = addMonthsToKey(mk, 1)
    if (principal <= 0) {
      // Payment doesn't cover the interest — the balance never comes down.
      rows.push({ month, date: mk, interest, principal: 0, balance })
      break
    }
    principal = Math.min(principal, balance)
    balance -= principal
    rows.push({ month, date: mk, interest, principal, balance })
  }
  return rows
}

/** 'YYYY-MM' the debt hits zero, or 'never' if it doesn't within 600 months (payment too low, or covers less than the interest). */
export function payoffDate(d: Debt, monthlyPayment = d.minimum + d.extra, from = new Date()): string {
  if (d.balance <= 0.005) return monthKey(from)
  const rows = amortise(d, monthlyPayment, from)
  const last = rows[rows.length - 1]
  return last && last.balance <= 0.005 ? last.date : 'never'
}

/** Total interest paid over the life of the debt at a given payment — 0 if already paid off, Infinity if it never pays off. */
export function totalInterest(d: Debt, monthlyPayment = d.minimum + d.extra, from = new Date()): number {
  if (d.balance <= 0.005) return 0
  const rows = amortise(d, monthlyPayment, from)
  const last = rows[rows.length - 1]
  if (!last || last.balance > 0.005) return Infinity
  return rows.reduce((s, r) => s + r.interest, 0)
}

/**
 * Debts in priority order for extra payments — a display choice, not a
 * verdict. 'snowball' tackles the smallest balance first (fastest visible
 * win); 'avalanche' tackles the highest rate first (cheapest overall).
 */
export function order(debts: Debt[], method: 'snowball' | 'avalanche'): Debt[] {
  return [...debts].sort((a, b) => (method === 'snowball' ? a.balance - b.balance : b.apr - a.apr))
}
