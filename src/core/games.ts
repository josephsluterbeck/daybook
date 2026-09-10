/**
 * Game-time arithmetic. Pure, like the rest of core/.
 */
import type { Game } from './types'

/** Total hours recorded for a game — the sum of its play sessions. */
export function gameHours(g: Game): number {
  return (g.sessions ?? []).reduce((s, x) => s + x.hours, 0)
}

/** price / hours, for a game with both — null when there's nothing to divide by (no price, or no hours logged yet). */
export function costPerHour(g: Game): number | null {
  const hours = gameHours(g)
  if (!g.price || hours <= 0) return null
  return g.price / hours
}

/** Total hours across everything not yet finished or set aside — a rough measure of what's queued up. */
export function backlogHours(games: Game[]): number {
  return games.filter((g) => g.status !== 'beaten' && g.status !== 'shelved').reduce((s, g) => s + gameHours(g), 0)
}

/** At a realistic weekly pace, how many weeks the current backlog represents. Null if there's no pace to divide by. */
export function weeksToClearBacklog(games: Game[], hoursPerWeek: number): number | null {
  if (hoursPerWeek <= 0) return null
  return Math.ceil(backlogHours(games) / hoursPerWeek)
}
