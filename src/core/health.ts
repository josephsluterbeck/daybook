/**
 * Data health — run on demand from Settings, not automatically. A single
 * pass over data you already have, looking for the kind of drift that
 * accumulates quietly: a deleted envelope an old expense still points to,
 * the same film added twice, money that's never been given a job.
 */
import type { AppData } from './types'
import { formatMoney } from './budget'

export interface HealthIssue {
  kind: 'orphaned-envelope' | 'duplicate-title' | 'unassigned-spend'
  label: string
  detail: string
}

function findDuplicateTitles(items: { title: string }[], kind: string, issues: HealthIssue[]): void {
  const counts = new Map<string, number>()
  for (const it of items) {
    const key = it.title.trim().toLowerCase()
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (const [key, n] of counts) {
    if (n > 1) issues.push({ kind: 'duplicate-title', label: `"${key}" added ${n} times`, detail: kind })
  }
}

export function checkDataHealth(data: AppData): HealthIssue[] {
  const issues: HealthIssue[] = []
  const envelopeIds = new Set(data.envelopes.map((e) => e.id))

  const orphanedLines = data.expenses.reduce(
    (s, e) => s + e.lines.filter((l) => l.envelopeId && !envelopeIds.has(l.envelopeId)).length,
    0,
  )
  if (orphanedLines > 0) {
    issues.push({
      kind: 'orphaned-envelope',
      label: orphanedLines === 1 ? '1 expense line points to a deleted envelope' : `${orphanedLines} expense lines point to a deleted envelope`,
      detail: 'Edit those expenses and pick a current envelope, or leave them unassigned.',
    })
  }

  findDuplicateTitles(data.movies, 'Films', issues)
  findDuplicateTitles(data.games, 'Games', issues)
  findDuplicateTitles(data.series, 'Series', issues)

  const unassignedTotal = data.expenses.reduce(
    (s, e) => s + e.lines.filter((l) => !l.envelopeId).reduce((s2, l) => s2 + l.amount, 0),
    0,
  )
  if (unassignedTotal > 0) {
    issues.push({
      kind: 'unassigned-spend',
      label: `${formatMoney(unassignedTotal, data.settings.currency)} logged with no envelope, all-time`,
      detail: 'Not a problem by itself — some spending is genuinely unassigned — but worth a glance if the number is bigger than expected.',
    })
  }

  return issues
}
