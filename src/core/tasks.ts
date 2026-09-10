/**
 * #44 — energy/time filtering. A lens over the existing task list, not a
 * structural change: both fields stay optional so quick-add never has to
 * ask for them.
 */
import type { AppData, Energy, Task } from './types'

const ENERGY_RANK: Record<Energy, number> = { low: 0, medium: 1, high: 2 }

/**
 * Not-done tasks at or under the given energy level (a "high energy" task
 * still counts when you're only filtering for "low", since more energy than
 * needed is never the blocker) and, if given, estimated at `maxMinutes` or
 * less. A task with no `minutes` set passes the time filter — silence isn't
 * evidence it's long.
 */
export function tasksFor(data: AppData, energy: Energy, maxMinutes?: number): Task[] {
  return data.tasks.filter((t) => {
    if (t.done) return false
    if (t.energy && ENERGY_RANK[t.energy] > ENERGY_RANK[energy]) return false
    if (maxMinutes != null && t.minutes != null && t.minutes > maxMinutes) return false
    return true
  })
}
