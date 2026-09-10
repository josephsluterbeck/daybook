/**
 * Takeaways are journal Notes with `topicId` set (see types.ts's Note) —
 * this file is just the handful of queries that make that useful, plus the
 * one thing that makes the section more than a bookmark folder: resurfacing
 * one, unprompted, on Today.
 */
import type { Note } from './types'
import { fromKey, todayKey } from './dates'

export function takeawaysFor(notes: Note[], topicId: string): Note[] {
  return notes.filter((n) => n.topicId === topicId).sort((a, b) => b.at.localeCompare(a.at))
}

/**
 * A stable pick for the day — not re-randomised on every render, so it
 * doesn't jump around mid-session, but different from one day to the next.
 * Prefers a takeaway that isn't from today itself (resurfacing something
 * you wrote five minutes ago isn't the retrieval-practice effect this is
 * for), falling back to anything if that's all there is.
 */
export function todaysTakeaway(notes: Note[], today = todayKey()): Note | null {
  const all = notes.filter((n) => n.topicId != null)
  if (all.length === 0) return null
  const notFromToday = all.filter((n) => n.at.slice(0, 10) !== today)
  const pool = notFromToday.length > 0 ? notFromToday : all

  let hash = 0
  for (const ch of today) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return pool[hash % pool.length]
}

/** Days since a topic was last studied — for a quiet "it's been a while" cue, same shape as Projects' daysSinceTouched. */
export function daysSinceStudied(lastStudied: string | undefined, today = todayKey()): number | null {
  if (!lastStudied) return null
  return Math.max(0, Math.round((fromKey(today).getTime() - fromKey(lastStudied).getTime()) / 86_400_000))
}
