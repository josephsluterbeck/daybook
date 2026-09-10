/**
 * Birthdays and the cadence of staying in touch. Pure, like the rest of
 * core/ — `contactEvery` is a wish, not a rule, so overdueContact() only
 * ever flags someone who actually has one set.
 */
import type { Person } from './types'
import { fromKey, todayKey } from './dates'

const pad2 = (n: number) => String(n).padStart(2, '0')

function parseBirthday(birthday: string): { month: number; day: number; year?: number } {
  const parts = birthday.split('-').map(Number)
  return parts.length === 2 ? { month: parts[0], day: parts[1] } : { year: parts[0], month: parts[1], day: parts[2] }
}

export interface BirthdayHit {
  person: Person
  date: string // this year's (or next year's, if already past) occurrence, 'YYYY-MM-DD'
  turning?: number // the age they'll turn, only known if the birth year was given
}

/** Birthdays landing within `withinDays`, soonest first. Handles both 'MM-DD' (no known birth year) and 'YYYY-MM-DD'. */
export function upcomingBirthdays(people: Person[], withinDays = 30, today = todayKey()): BirthdayHit[] {
  const todayYear = Number(today.slice(0, 4))
  const todayMs = fromKey(today).getTime()
  const hits: BirthdayHit[] = []

  for (const person of people) {
    if (!person.birthday) continue
    const { month, day, year } = parseBirthday(person.birthday)
    let occurrenceYear = todayYear
    let dateKey = `${occurrenceYear}-${pad2(month)}-${pad2(day)}`
    if (dateKey < today) {
      occurrenceYear += 1
      dateKey = `${occurrenceYear}-${pad2(month)}-${pad2(day)}`
    }
    const days = Math.round((fromKey(dateKey).getTime() - todayMs) / 86_400_000)
    if (days <= withinDays) hits.push({ person, date: dateKey, turning: year != null ? occurrenceYear - year : undefined })
  }

  return hits.sort((a, b) => a.date.localeCompare(b.date))
}

/** How many days past someone's own requested cadence they are — the ranking behind overdueContact()'s order, not just a yes/no. */
function overdueBy(p: Person, today: string): number {
  if (!p.contactEvery) return -Infinity
  if (!p.lastContact) return Infinity
  const daysSince = Math.round((fromKey(today).getTime() - fromKey(p.lastContact).getTime()) / 86_400_000)
  return daysSince - p.contactEvery
}

/**
 * People overdue against their own requested cadence, worst-overdue first.
 * No cadence set means never flagged; a cadence with no contact logged yet
 * counts as overdue from the start.
 */
export function overdueContact(people: Person[], today = todayKey()): Person[] {
  return people.filter((p) => overdueBy(p, today) >= 0).sort((a, b) => overdueBy(b, today) - overdueBy(a, today))
}
