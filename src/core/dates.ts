/** Local-date helpers. Everything is stored as 'YYYY-MM-DD' in local time. */

export const pad = (n: number) => String(n).padStart(2, '0')

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const todayKey = () => toKey(new Date())

export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** The first day of a month key, as a local Date — the anchor most "which month" math starts from. */
export function firstOfMonth(mk: string): Date {
  const [y, m] = mk.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

/** A month key ('YYYY-MM'), n months on — negative steps back. Stays a month key, not a full date. */
export function addMonthsToKey(mk: string, n: number): string {
  const d = firstOfMonth(mk)
  d.setMonth(d.getMonth() + n)
  return monthKey(d)
}

/** A month key ('YYYY-MM') as a human label, e.g. 'September 2026'. */
export function monthLabel(mk: string): string {
  return firstOfMonth(mk).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function daysInMonth(d: Date = new Date()): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

export function addMonths(key: string, n: number): string {
  const d = fromKey(key)
  d.setMonth(d.getMonth() + n)
  return toKey(d)
}

/** Whole days from today. Negative = overdue. */
export function daysAway(key: string): number {
  const a = fromKey(todayKey()).getTime()
  const b = fromKey(key).getTime()
  return Math.round((b - a) / 86_400_000)
}

export function relativeDay(key: string): string {
  const n = daysAway(key)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n === -1) return 'Yesterday'
  if (n < 0) return `${-n} days late`
  if (n < 7) return fromKey(key).toLocaleDateString(undefined, { weekday: 'long' })
  return fromKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function prettyDate(key: string): string {
  return fromKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Whole calendar months from now to a date's month — Sep 4 to any Feb date is 5. Never negative. */
export function monthsUntil(key: string, from: Date = new Date()): number {
  const target = fromKey(key)
  const months = (target.getFullYear() - from.getFullYear()) * 12 + (target.getMonth() - from.getMonth())
  return Math.max(0, months)
}

/** Next occurrence of a monthly due-day, as a date key. */
export function nextDueDate(dueDay: number, from: Date = new Date()): string {
  const dim = daysInMonth(from)
  const day = Math.min(dueDay, dim)
  if (day >= from.getDate()) {
    return `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(day)}`
  }
  const nxt = new Date(from.getFullYear(), from.getMonth() + 1, 1)
  return `${nxt.getFullYear()}-${pad(nxt.getMonth() + 1)}-${pad(Math.min(dueDay, daysInMonth(nxt)))}`
}

/**
 * The next payday on/after `from`, given one known payday (`anchor`) and a
 * fixed period in days — 7 for weekly, 14 for biweekly. A fixed day-count
 * period is what makes this solvable from a single real date, unlike
 * semimonthly/monthly which follow the calendar instead.
 */
export function nextPayday(anchor: string, periodDays: number, from: Date = new Date()): string {
  const start = fromKey(anchor).getTime()
  const at = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const daysSince = Math.round((at - start) / 86_400_000)
  if (daysSince <= 0) return anchor // anchor is today, or still ahead of `from`
  const rem = daysSince % periodDays
  return addDays(anchor, rem === 0 ? daysSince : daysSince - rem + periodDays)
}
