/**
 * iCalendar (.ics) export — a plain-text file you generate as a string and
 * hand over as a download, no server or account involved. Pure, like the
 * rest of core/: a string in, a string out.
 *
 * One-way snapshot, not sync — stable UIDs mean re-importing a fresh export
 * updates existing calendar events instead of duplicating them, but nothing
 * here pushes a change made *after* export back into Daybook.
 */
import type { AppData, Bill, BillCadence, Person, Repeat, Task } from './types'
import { billNextDue } from './budget'

export interface IcsOptions {
  tasks?: boolean
  bills?: boolean
  people?: boolean
}

/** Months per cadence's recurrence interval — monthly bills get a single next-due event, not a standing RRULE (see toIcs's doc comment for why). */
const CADENCE_INTERVAL: Partial<Record<BillCadence, number>> = { quarterly: 3, semiannual: 6, annual: 12 }

const REPEAT_FREQ: Partial<Record<Repeat, string>> = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' }

function icsTimestamp(d = new Date()): string {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
}
const pad2 = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM-DD' -> 'YYYYMMDD', the all-day DATE form iCalendar wants. */
const icsDate = (dateKey: string) => dateKey.replace(/-/g, '')

/** Backslash, semicolon, comma, and newline all need escaping in free-text iCalendar values. */
function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

/**
 * RFC 5545 line folding: no content line may exceed 75 octets, continuation
 * lines start with one space (which itself counts against that line's 75).
 * Skipped by most hand-rolled generators, and the reason a "working" .ics
 * gets silently rejected by a strict parser — measured in UTF-8 bytes, not
 * characters, so it doesn't split a multi-byte character across lines.
 */
function foldLine(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const chunks: string[] = []
  let start = 0
  let limit = 75
  while (start < line.length) {
    let end = start
    let bytes = 0
    while (end < line.length) {
      const charBytes = enc.encode(line[end]).length
      if (bytes + charBytes > limit) break
      bytes += charBytes
      end++
    }
    if (end === start) end = start + 1 // a single char wider than the limit still has to advance
    chunks.push(line.slice(start, end))
    start = end
    limit = 74 // continuation lines lose one octet to their leading space
  }
  return chunks.join('\r\n ')
}

interface EventSpec {
  uid: string
  dateKey: string
  time?: string
  summary: string
  description?: string
  rrule?: string
}

function vevent(spec: EventSpec, now: Date): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${spec.uid}`, `DTSTAMP:${icsTimestamp(now)}`]
  if (spec.time) {
    const [h, m] = spec.time.split(':')
    lines.push(`DTSTART:${icsDate(spec.dateKey)}T${h.padStart(2, '0')}${m.padStart(2, '0')}00`)
  } else {
    lines.push(`DTSTART;VALUE=DATE:${icsDate(spec.dateKey)}`)
  }
  lines.push(`SUMMARY:${escapeText(spec.summary)}`)
  if (spec.description) lines.push(`DESCRIPTION:${escapeText(spec.description)}`)
  if (spec.rrule) lines.push(`RRULE:${spec.rrule}`)
  lines.push('END:VEVENT')
  return lines
}

function taskEvent(t: Task, now: Date): string[] | null {
  if (!t.due) return null
  const freq = REPEAT_FREQ[t.repeat]
  return vevent(
    {
      uid: `task-${t.id}@daybook.local`,
      dateKey: t.due,
      time: t.time,
      summary: t.title,
      description: t.notes,
      rrule: freq ? `FREQ=${freq}` : undefined,
    },
    now,
  )
}

/** Birthdays as yearly recurring all-day events — the anchor year doesn't matter for a YEARLY RRULE, so an unknown birth year just anchors on the current one. */
function personEvent(p: Person, now: Date): string[] | null {
  if (!p.birthday) return null
  const parts = p.birthday.split('-').map(Number)
  const [month, day] = parts.length === 2 ? parts : [parts[1], parts[2]]
  const birthYear = parts.length === 3 ? parts[0] : undefined
  const dateKey = `${birthYear ?? now.getFullYear()}-${pad2(month)}-${pad2(day)}`
  return vevent(
    {
      uid: `person-${p.id}@daybook.local`,
      dateKey,
      summary: `${p.name}’s birthday`,
      description: birthYear ? `Born ${birthYear}` : undefined,
      rrule: 'FREQ=YEARLY',
    },
    now,
  )
}

function billEvent(b: Bill, now: Date, from: Date): string[] {
  const due = billNextDue(b, from)
  const interval = CADENCE_INTERVAL[b.cadence]
  return vevent(
    {
      uid: `bill-${b.id}@daybook.local`,
      dateKey: due,
      summary: `${b.label} due`,
      description: b.autopay ? 'Autopay is on for this one — informational.' : 'Not on autopay.',
      rrule: interval ? `FREQ=MONTHLY;INTERVAL=${interval}` : undefined,
    },
    now,
  )
}

/**
 * Builds a complete .ics file. Both `tasks` and `bills` default to true — an
 * export with neither selected would just be an empty, confusing file.
 */
export function toIcs(data: AppData, opts: IcsOptions = {}, now = new Date()): string {
  const includeTasks = opts.tasks ?? true
  const includeBills = opts.bills ?? true
  const includePeople = opts.people ?? true

  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Daybook//daybook//EN', 'CALSCALE:GREGORIAN']

  if (includeTasks) {
    for (const t of data.tasks) {
      if (t.done) continue // a finished task has nothing left to remind anyone about
      const ev = taskEvent(t, now)
      if (ev) lines.push(...ev)
    }
  }

  if (includeBills) {
    for (const b of data.bills) lines.push(...billEvent(b, now, now))
  }

  if (includePeople) {
    for (const p of data.people) {
      const ev = personEvent(p, now)
      if (ev) lines.push(...ev)
    }
  }

  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
