/**
 * Deep-link intents — the shape a URL from an iOS Shortcut (Lock Screen or
 * Action Button) gets parsed into. Portable: a React Native build maps the
 * same shapes onto its own deep-link handler, no redesign needed.
 *
 * URL shapes:
 *   ?add=expense&amount=12.50&envelope=groceries&note=coffee
 *   ?add=task&title=Renew%20registration&due=2026-10-01
 *   ?add=note&text=Idea%20for%20the%20app
 *   ?capture=Raw%20text%2C%20no%20decision%20required   — see parseCaptureParam
 */
import type { AppData } from './types'
import { todayKey } from './dates'
import { uid } from './store'

export type Intent =
  | { kind: 'expense'; amount: number; envelope?: string; note?: string }
  | { kind: 'task'; title: string; due?: string; time?: string }
  | { kind: 'note'; text: string }

/** Parses a URL's search string into one of ours, or null if it isn't one. */
export function parseIntent(search: string): Intent | null {
  const params = new URLSearchParams(search)
  const add = params.get('add')

  if (add === 'expense') {
    const amount = Number(params.get('amount'))
    if (!Number.isFinite(amount) || amount <= 0) return null
    return { kind: 'expense', amount, envelope: params.get('envelope') ?? undefined, note: params.get('note') ?? undefined }
  }
  if (add === 'task') {
    const title = params.get('title')
    if (!title) return null
    return { kind: 'task', title, due: params.get('due') ?? undefined, time: params.get('time') ?? undefined }
  }
  if (add === 'note') {
    const text = params.get('text')
    if (!text) return null
    return { kind: 'note', text }
  }
  return null
}

/**
 * `?capture=` is the free-text deep link — unlike the structured `?add=`
 * shapes above, a Shortcut (or Siri dictation) can hand over raw, un-typed
 * text here, exactly like typing into Today's own quick-add field. App.tsx
 * runs it through the same parser and commits it the same way. Kept separate
 * from `Intent` since nothing has been decided for it to represent yet.
 */
export function parseCaptureParam(search: string): string | null {
  return new URLSearchParams(search).get('capture')
}

/**
 * Applies an intent to a draft AppData — this is the same (d) => AppData
 * shape store.update() already expects, so a caller just does
 * `store.update((d) => applyIntent(d, intent))`.
 *
 * Envelope matching is by case-insensitive label, not id — a Shortcut can't
 * know your ids. An unmatched label lands the expense unassigned rather than
 * being dropped.
 */
export function applyIntent(data: AppData, intent: Intent): AppData {
  if (intent.kind === 'expense') {
    const match = intent.envelope
      ? data.envelopes.find((e) => e.label.toLowerCase() === intent.envelope!.toLowerCase())
      : undefined
    data.expenses.push({ id: uid(), date: todayKey(), lines: [{ envelopeId: match?.id, amount: intent.amount }], note: intent.note })
  } else if (intent.kind === 'task') {
    data.tasks.push({ id: uid(), title: intent.title, due: intent.due, time: intent.time, done: false, flagged: false, repeat: 'none', createdAt: todayKey() })
  } else {
    data.notes.unshift({ id: uid(), at: new Date().toISOString(), text: intent.text, tags: [] })
  }
  return data
}

/**
 * A one-line description of what applyIntent did — for a confirmation toast,
 * so a mistyped source is visible immediately. Source-agnostic on purpose: a
 * deep link and the quick-add parser (#17) both write through applyIntent and
 * both want this same sentence, just with a different "from ___" appended by
 * the caller that knows where it came from.
 */
export function describeIntent(intent: Intent): string {
  if (intent.kind === 'expense') {
    const amount = `$${intent.amount.toFixed(2)}`
    return `Logged ${amount}${intent.envelope ? ` · ${intent.envelope}` : ''}`
  }
  if (intent.kind === 'task') return `Added task "${intent.title}"`
  return 'Added a journal note'
}
