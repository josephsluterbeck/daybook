/**
 * #43 — the prompt is the value, not the pruning. Never auto-removes
 * anything; every action here is something the user explicitly chose.
 */
import type { AppData, Game, Movie } from './types'
import { addDays, todayKey } from './dates'

const TRIAGE_BATCH = 5
export const TRIAGE_INTERVAL_DAYS = 30

/** Oldest `lastReviewed ?? addedAt` first, capped to a batch — never the whole backlog at once. */
export function triageCandidates(data: AppData, olderThanDays = 120, today = todayKey()): (Movie | Game)[] {
  const cutoff = addDays(today, -olderThanDays)
  const unwatched = data.movies.filter((m) => !m.archived && !m.watched)
  const unplayed = data.games.filter((g) => !g.archived && g.status !== 'beaten')
  const candidates = [...unwatched, ...unplayed].filter((item) => (item.lastReviewed ?? item.addedAt) <= cutoff)
  return candidates.sort((a, b) => (a.lastReviewed ?? a.addedAt).localeCompare(b.lastReviewed ?? b.addedAt)).slice(0, TRIAGE_BATCH)
}

/** Whether the triage card is due to be offered again — at most once a month. */
export function triageDue(data: AppData, today = todayKey()): boolean {
  const snoozedUntil = data.settings.triageSnoozedUntil
  if (snoozedUntil && snoozedUntil > today) return false
  return triageCandidates(data, 120, today).length > 0
}

export function snoozeTriage(data: AppData, today = todayKey()): void {
  data.settings.triageSnoozedUntil = addDays(today, TRIAGE_INTERVAL_DAYS)
}
