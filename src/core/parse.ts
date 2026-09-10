/**
 * One field that works out what you meant. Pure, and the one place in the
 * app where being wrong is worse than being absent — a silent misfile hides
 * for weeks — so the UI must always show the parse before committing it
 * (see Today.tsx's quick-add). Feeds the same applyIntent() write path as
 * #6's deep links via intentFromParsed(); parsing differs, writing doesn't.
 */
import type { Intent } from './intents'
import type { Envelope, Parsed } from './types'
import { addDays, addMonths, relativeDay, toKey } from './dates'
import { formatMoney } from './budget'

export type { Parsed }

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const AMOUNT_DOLLAR = /\$\s?(\d+(?:\.\d{1,2})?)/
const AMOUNT_DECIMAL = /\b(\d+\.\d{1,2})\b/
const AMOUNT_BARE = /\b(\d+)\b/
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/i
const IN_DAYS_RE = /\bin\s+(\d+)\s+days?\b/i
const IN_WEEKS_RE = /\bin\s+(\d+)\s+weeks?\b/i
const MONTH_DAY_RE = new RegExp(`\\b(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i')
const TAG_RE = /#(\w+)/
const WEEKDAY_RE = new RegExp(`\\b(${WEEKDAYS.join('|')})\\b`, 'i')
const SIMPLE_DATE_WORDS = /\b(today|tonight|tomorrow|next week|next month)\b/i

/** Whether any recognisable date phrase is present — used both to route to 'task' and to keep a bare number from being mistaken for an amount (a plain "2" in "friday 2pm" is a time, not $2). */
function hasDateWord(text: string): boolean {
  return (
    SIMPLE_DATE_WORDS.test(text) ||
    IN_DAYS_RE.test(text) ||
    IN_WEEKS_RE.test(text) ||
    WEEKDAY_RE.test(text) ||
    MONTH_DAY_RE.test(text) ||
    TIME_RE.test(text)
  )
}

/** Resolves whatever date/time phrase is in the text to a due date + time, from `from`. Returns the exact substrings matched, so the caller can strip them back out of the title. */
function resolveDue(text: string, from = new Date()): { due?: string; time?: string; matched: string[] } {
  const matched: string[] = []
  const todayK = toKey(from)

  const timeMatch = text.match(TIME_RE)
  let time: string | undefined
  if (timeMatch) {
    let h = Number(timeMatch[1])
    const m = timeMatch[2] ? Number(timeMatch[2]) : 0
    const suffix = timeMatch[3].toLowerCase()
    if (suffix === 'pm' && h < 12) h += 12
    if (suffix === 'am' && h === 12) h = 0
    time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    matched.push(timeMatch[0])
  }

  let due: string | undefined
  const lower = text.toLowerCase()
  if (/\btonight\b/.test(lower)) {
    due = todayK
    matched.push('tonight')
  } else if (/\btomorrow\b/.test(lower)) {
    due = addDays(todayK, 1)
    matched.push('tomorrow')
  } else if (/\btoday\b/.test(lower)) {
    due = todayK
    matched.push('today')
  } else if (/\bnext week\b/.test(lower)) {
    due = addDays(todayK, 7)
    matched.push('next week')
  } else if (/\bnext month\b/.test(lower)) {
    due = addMonths(todayK, 1)
    matched.push('next month')
  } else {
    const inDays = lower.match(IN_DAYS_RE)
    const inWeeks = !inDays ? lower.match(IN_WEEKS_RE) : null
    const monthDay = !inDays && !inWeeks ? text.match(MONTH_DAY_RE) : null
    const weekday = !inDays && !inWeeks && !monthDay ? lower.match(WEEKDAY_RE) : null
    if (inDays) {
      due = addDays(todayK, Number(inDays[1]))
      matched.push(inDays[0])
    } else if (inWeeks) {
      due = addDays(todayK, Number(inWeeks[1]) * 7)
      matched.push(inWeeks[0])
    } else if (monthDay) {
      const monthIdx = MONTHS.indexOf(monthDay[1].toLowerCase().slice(0, 3))
      const day = Number(monthDay[2])
      const startOfToday = new Date(from.getFullYear(), from.getMonth(), from.getDate())
      let candidate = new Date(from.getFullYear(), monthIdx, day)
      if (candidate.getTime() < startOfToday.getTime()) candidate = new Date(from.getFullYear() + 1, monthIdx, day)
      due = toKey(candidate)
      matched.push(monthDay[0])
    } else if (weekday) {
      const target = WEEKDAYS.indexOf(weekday[1].toLowerCase())
      let diff = (target - from.getDay() + 7) % 7
      if (diff === 0) diff = 7 // naming today's own weekday means next week's, not today
      due = addDays(todayK, diff)
      matched.push(weekday[0])
    }
  }

  return { due, time, matched }
}

/** Removes the matched date/time phrases (and a dangling "at" left behind by "friday at 2pm"), tidying whitespace and punctuation. */
function stripPhrases(text: string, phrases: string[]): string {
  let out = text
  for (const p of phrases) out = out.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
  return out
    .replace(/\bat\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.-]+|[\s,.-]+$/g, '')
    .trim()
}

/**
 * Rules, in order — first match wins:
 * 1. A currency amount anywhere -> expense. `#tag` or a fuzzy label match
 *    picks the envelope; whatever's left is the note.
 * 2. A date/time phrase -> task, due date stripped out of the title.
 * 3. Otherwise -> a journal note, verbatim.
 */
export function parseQuickAdd(input: string, envelopes: Envelope[]): Parsed {
  const raw = input.trim()
  if (!raw) return { kind: 'note', text: raw }

  const tagMatch = raw.match(TAG_RE)
  let envelopeHint: string | undefined
  let working = raw
  if (tagMatch) {
    const tag = tagMatch[1].toLowerCase()
    const env = envelopes.find((e) => e.label.toLowerCase().replace(/\s+/g, '') === tag)
    envelopeHint = env?.label ?? tagMatch[1]
    working = raw.replace(TAG_RE, '').replace(/\s{2,}/g, ' ').trim()
  }

  const dateWordPresent = hasDateWord(working)
  const dollar = working.match(AMOUNT_DOLLAR)
  const decimal = !dollar ? working.match(AMOUNT_DECIMAL) : null
  // A bare integer only counts as an amount when there's no date/time phrase
  // in the text — otherwise "friday 2pm" reads its "2" as two dollars.
  const bare = !dollar && !decimal && !dateWordPresent ? working.match(AMOUNT_BARE) : null
  const amountMatch = dollar ?? decimal ?? bare

  if (amountMatch) {
    const amount = Number(amountMatch[1])
    if (Number.isFinite(amount) && amount > 0) {
      let note = working.replace(amountMatch[0], '').replace(/\s{2,}/g, ' ').trim()
      if (!envelopeHint && note) {
        const words = note.toLowerCase().split(/\W+/).filter((w) => w.length > 2)
        const match = envelopes.find((e) => words.includes(e.label.toLowerCase()) || e.label.toLowerCase().replace(/\s+/g, '') === note.toLowerCase().replace(/\s+/g, ''))
        if (match) envelopeHint = match.label
      }
      return { kind: 'expense', amount, envelopeHint, note: note || raw }
    }
  }

  if (dateWordPresent) {
    const { due, time, matched } = resolveDue(working)
    const title = stripPhrases(working, matched) || working
    return { kind: 'task', title, due, time }
  }

  return { kind: 'note', text: raw }
}

/** The same write path #6's deep links use — parsing differs, writing shouldn't. */
export function intentFromParsed(p: Parsed): Intent {
  if (p.kind === 'expense') return { kind: 'expense', amount: p.amount, envelope: p.envelopeHint, note: p.note }
  if (p.kind === 'task') return { kind: 'task', title: p.title, due: p.due, time: p.time }
  return { kind: 'note', text: p.text }
}

/** One line describing a parse — the live preview under quick-add, and the pre-filled guess shown during inbox triage (#29). */
export function describeParsed(p: Parsed, currency = 'USD'): string {
  if (p.kind === 'expense') return `Expense · ${formatMoney(p.amount, currency)} · ${p.envelopeHint ?? 'Unassigned'}`
  if (p.kind === 'task') {
    const when = p.due ? ` · due ${relativeDay(p.due)}` : ''
    const time = p.time ? ` · ${p.time}` : ''
    return `Task${when}${time}`
  }
  return 'Journal note'
}
