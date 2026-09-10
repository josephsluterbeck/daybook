/**
 * Projects: status, one next physical step, and the clock. Pure, like the
 * rest of core/ — no task system hiding in here, just enough to notice a
 * project going quiet.
 */
import type { Project } from './types'
import { fromKey, todayKey } from './dates'

/** Days since a project's lastTouched date — 0 for today, never negative (a future date just reads as "today"). */
export function daysSinceTouched(p: Project, today = todayKey()): number {
  const ms = fromKey(today).getTime() - fromKey(p.lastTouched).getTime()
  return Math.max(0, Math.round(ms / 86_400_000))
}

/** Active projects that have gone quiet for `days` or more, stalest first — the whole reason to track this at all. */
export function staleProjects(projects: Project[], days = 14, today = todayKey()): Project[] {
  return projects
    .filter((p) => p.status === 'active' && daysSinceTouched(p, today) >= days)
    .sort((a, b) => daysSinceTouched(b, today) - daysSinceTouched(a, today))
}
