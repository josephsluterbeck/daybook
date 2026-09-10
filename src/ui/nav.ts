import type { RouteKey, TabKey } from '../core/types'

// TabKey/RouteKey now live in core/types.ts (core/insights.ts needs them for
// Insight.action.route, and core/ can't reach into ui/) — re-exported here
// so nothing in ui/ that already imports them from nav.ts has to change.
// Only the visible tab labels moved, to Home and Finance.
export type { TabKey, RouteKey }

export const TABS: { key: TabKey; label: string; heading: string }[] = [
  { key: 'today', label: 'Home', heading: 'Today' },
  { key: 'money', label: 'Finance', heading: 'Money' },
  { key: 'tasks', label: 'Tasks', heading: 'Tasks' },
  { key: 'queue', label: 'Queue', heading: 'Queue' },
]

/**
 * Everything reachable only through the drawer — all of Part four now has a
 * real screen behind it. 'settings' is the one exception: it never drives
 * `route` state — the drawer's own onNavigate special-cases it to open the
 * existing Settings sheet instead, exactly as the topbar gear did before
 * this rewrite. Keeping Settings a sheet (not a full screen) means its
 * Cancel/Save flow needed no changes for this refactor at all.
 */
export type DrawerKey = 'journal' | 'inbox' | 'projects' | 'shopping' | 'people' | 'maintenance' | 'learning' | 'scenarios' | 'monthclose' | 'settings'

/**
 * `group` renders as a divider label above that run of entries; keep groups
 * short. Inbox sits ungrouped, right after Journal — it's structural
 * capture infrastructure, not a "Life" section, per #29's own framing
 * ("it isn't really a feature").
 */
export const DRAWER: { key: DrawerKey; label: string; group?: string }[] = [
  { key: 'journal', label: 'Journal' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'projects', label: 'Projects', group: 'Life' },
  { key: 'shopping', label: 'Shopping', group: 'Life' },
  { key: 'people', label: 'People', group: 'Life' },
  { key: 'maintenance', label: 'Maintenance', group: 'Life' },
  { key: 'learning', label: 'Learning', group: 'Life' },
  { key: 'scenarios', label: 'Scenarios', group: 'App' },
  { key: 'monthclose', label: 'Month close-out', group: 'App' },
  { key: 'settings', label: 'Settings', group: 'App' },
]

/**
 * Today's reorderable/hideable content panels (#12) — everyone's "today" is
 * a different shape. Deliberately excludes the search box, the backup/
 * paycheck alerts, the hero stats, "On this day", and the date footer: those
 * are chrome or contextual alerts, not part of the shape you'd want to
 * rearrange.
 */
export type TodayPanelKey = 'tasks' | 'routines' | 'bills' | 'goals' | 'downtime' | 'quickadd' | 'projects' | 'people' | 'maintenance' | 'insights'

export const TODAY_PANELS: { key: TodayPanelKey; label: string }[] = [
  { key: 'insights', label: 'Insights (budget drift, burn rate, …)' },
  { key: 'tasks', label: 'Today (tasks due)' },
  { key: 'routines', label: 'Routines' },
  { key: 'projects', label: 'Stale project nudge' },
  { key: 'people', label: 'Birthdays & catching up' },
  { key: 'maintenance', label: 'Maintenance due' },
  { key: 'bills', label: 'Bills coming up' },
  { key: 'goals', label: 'Savings deadlines' },
  { key: 'downtime', label: 'Downtime' },
  { key: 'quickadd', label: 'Quick add' },
]

/** `stored` first (in that order), then any key not yet in it, appended — so a panel added in a later build still shows up for someone with a saved order. */
export function effectiveTodayOrder(stored: string[] | undefined): TodayPanelKey[] {
  const all = TODAY_PANELS.map((p) => p.key)
  const known = (stored ?? []).filter((k): k is TodayPanelKey => (all as string[]).includes(k))
  const rest = all.filter((k) => !known.includes(k))
  return [...known, ...rest]
}
