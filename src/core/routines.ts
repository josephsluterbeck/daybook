/**
 * Routines: a group of steps that resets together. Pure — no React, no DOM.
 */
import type { AppData, ID, Routine } from './types'
import { addDays, fromKey, todayKey } from './dates'

/** Whether a routine is due on a given day — daily always, weekly on its chosen weekday, monthly on the 1st (no day-of-month field, so the 1st is the one unambiguous default). */
export function routineDueToday(r: Routine, today = todayKey()): boolean {
  if (r.cadence === 'daily') return true
  if (r.cadence === 'weekly') return r.weekday != null && fromKey(today).getDay() === r.weekday
  return today.slice(8, 10) === '01'
}

export interface RoutineProgress {
  done: number
  total: number
}

/** Partial credit is the point — how many of a routine's steps were checked off on a given date, out of how many it has. */
export function routineProgress(r: Routine, date: string): RoutineProgress {
  const c = r.completions.find((x) => x.date === date)
  return { done: c ? c.stepIds.length : 0, total: r.steps.length }
}

/** Toggles one step's completion for a date, creating that day's completion record if it doesn't exist yet. Mutates in place — call from inside store.update(). */
export function toggleRoutineStep(data: AppData, routineId: ID, stepId: ID, date = todayKey()): void {
  const r = data.routines.find((x) => x.id === routineId)
  if (!r) return
  let c = r.completions.find((x) => x.date === date)
  if (!c) {
    c = { date, stepIds: [] }
    r.completions.push(c)
  }
  c.stepIds = c.stepIds.includes(stepId) ? c.stepIds.filter((id) => id !== stepId) : [...c.stepIds, stepId]
}

/** Drops completions older than a year — called once on load so the array doesn't grow forever in localStorage. */
export function pruneOldCompletions(data: AppData, today = todayKey()): void {
  const cutoff = addDays(today, -365)
  for (const r of data.routines) r.completions = r.completions.filter((c) => c.date >= cutoff)
}
