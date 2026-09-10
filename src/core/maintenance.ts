/**
 * Recurring-but-rare — oil changes, filters, registration — which is exactly
 * what a to-do list is bad at. Pure, like the rest of core/. This section is
 * meant to be silent most days: dueMaintenance() only returns items that
 * actually have a computable cadence, and `urgent` is the Today panel's cue
 * to show up at all.
 */
import type { MaintenanceItem } from './types'
import { fromKey, todayKey } from './dates'

const DAYS_URGENT = 14
const MILES_URGENT = 500

export interface DueMaintenance {
  item: MaintenanceItem
  /** Human-readable status for whichever cadence(s) are computable — e.g. "12 days left", "overdue 40mi", or both joined together. */
  dueIn: string
  urgent: boolean
}

/**
 * `odometer` is optional — a mileage cadence with no current reading (or no
 * `lastOdometer` recorded yet) just doesn't contribute a mileage figure,
 * rather than guessing.
 */
export function dueMaintenance(items: MaintenanceItem[], odometer?: number, today = todayKey()): DueMaintenance[] {
  const out: DueMaintenance[] = []

  for (const item of items) {
    if (!item.everyDays && !item.everyMiles) continue
    const parts: string[] = []
    let urgent = false

    if (item.everyDays) {
      if (!item.lastDone) {
        parts.push('never done')
        urgent = true
      } else {
        const dueMs = fromKey(item.lastDone).getTime() + item.everyDays * 86_400_000
        const daysLeft = Math.round((dueMs - fromKey(today).getTime()) / 86_400_000)
        parts.push(daysLeft < 0 ? `overdue ${-daysLeft}d` : `${daysLeft}d left`)
        if (daysLeft <= DAYS_URGENT) urgent = true
      }
    }

    if (item.everyMiles && item.lastOdometer != null && odometer != null) {
      const milesLeft = item.lastOdometer + item.everyMiles - odometer
      parts.push(milesLeft < 0 ? `overdue ${-milesLeft}mi` : `${milesLeft}mi left`)
      if (milesLeft <= MILES_URGENT) urgent = true
    }

    if (parts.length === 0) continue
    out.push({ item, dueIn: parts.join(' · '), urgent })
  }

  return out.sort((a, b) => Number(b.urgent) - Number(a.urgent))
}

/** The sinking-fund reading of a maintenance item — "brakes, ~$400, every 2 years" is a real monthly figure, the same math as an irregular bill (#12), just not one that's a Bill unless you make it one. */
export function maintenanceMonthlyCost(item: MaintenanceItem): number | null {
  if (!item.cost || !item.everyDays) return null
  return item.cost / (item.everyDays / 30)
}
