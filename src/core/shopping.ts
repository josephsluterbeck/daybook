/**
 * The shopping list's one real piece of logic: "Done shopping" closes the
 * loop with the groceries envelope instead of being one more thing to
 * remember to log separately. Pure, mutates the draft in place — call from
 * inside store.update().
 */
import type { AppData } from './types'
import { uid } from './store'

/**
 * Logs the trip's total as an expense (skipped if `total` isn't positive —
 * a $0 checkout just clears the list), drops checked non-recurring items,
 * and un-checks recurring ones so they're ready to come back next time.
 */
export function checkout(data: AppData, total: number, envelopeId: string | undefined, date: string): void {
  if (total > 0) {
    data.expenses.push({ id: uid(), date, lines: [{ envelopeId, amount: total }], note: 'Shopping trip' })
  }
  data.shopping = data.shopping
    .filter((i) => !(i.done && !i.recurring))
    .map((i) => (i.done && i.recurring ? { ...i, done: false } : i))
}
