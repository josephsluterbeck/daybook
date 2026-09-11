/**
 * "Where did I write that thing" and "did I already add that film" — a plain
 * case-insensitive substring search across everything, weighted so a title
 * match always outranks a body match. A few hundred rows doesn't earn a
 * fuzzy-search library.
 */
import type { AppData, ID } from './types'
import { expenseTotal } from './budget'
import { prettyDate } from './dates'

export interface Hit {
  kind: 'task' | 'note' | 'movie' | 'game' | 'expense' | 'series' | 'project' | 'shopping' | 'person' | 'maintenance' | 'topic'
  id: ID
  title: string
  sub: string
  score: number
}

const TITLE_SCORE = 10
const TITLE_PREFIX_BONUS = 5
const BODY_SCORE = 3

function scoreOf(q: string, title: string, body: string): number {
  const lowerTitle = title.toLowerCase()
  let score = 0
  if (lowerTitle.includes(q)) {
    score += TITLE_SCORE
    if (lowerTitle.startsWith(q)) score += TITLE_PREFIX_BONUS
  }
  if (body && body.toLowerCase().includes(q)) score += BODY_SCORE
  return score
}

export function search(data: AppData, q: string, limit = 20): Hit[] {
  const query = q.trim().toLowerCase()
  if (!query) return []
  const hits: Hit[] = []

  for (const t of data.tasks) {
    const score = scoreOf(query, t.title, t.notes ?? '')
    if (score > 0) hits.push({ kind: 'task', id: t.id, title: t.title, sub: t.due ? prettyDate(t.due) : 'No date', score })
  }

  for (const n of data.notes) {
    const title = n.text.length > 60 ? `${n.text.slice(0, 60)}…` : n.text
    const score = scoreOf(query, n.text, n.tags.join(' '))
    if (score > 0) hits.push({ kind: 'note', id: n.id, title, sub: prettyDate(n.at.slice(0, 10)), score })
  }

  for (const m of data.movies) {
    const score = scoreOf(query, m.title, m.notes ?? '')
    if (score > 0) hits.push({ kind: 'movie', id: m.id, title: m.title, sub: [m.year, m.service].filter(Boolean).join(' · ') || 'Movie', score })
  }

  for (const g of data.games) {
    const score = scoreOf(query, g.title, g.notes ?? '')
    if (score > 0) hits.push({ kind: 'game', id: g.id, title: g.title, sub: [g.platform, g.status].filter(Boolean).join(' · ') || 'Game', score })
  }

  for (const sv of data.series) {
    const score = scoreOf(query, sv.title, sv.notes ?? '')
    if (score > 0) hits.push({ kind: 'series', id: sv.id, title: sv.title, sub: `S${sv.season} E${sv.episode}${sv.service ? ` · ${sv.service}` : ''}`, score })
  }

  for (const e of data.expenses) {
    const total = expenseTotal(e)
    const title = e.note || (total < 0 ? 'Refund' : 'Expense')
    const score = scoreOf(query, title, e.note ?? '')
    if (score > 0) {
      const env = e.lines.length === 1 && e.lines[0].envelopeId ? data.envelopes.find((x) => x.id === e.lines[0].envelopeId) : undefined
      hits.push({ kind: 'expense', id: e.id, title, sub: `${prettyDate(e.date)}${env ? ` · ${env.label}` : ''}`, score })
    }
  }

  for (const p of data.projects) {
    const score = scoreOf(query, p.label, [p.nextAction, p.why, p.notes].filter(Boolean).join(' '))
    if (score > 0) hits.push({ kind: 'project', id: p.id, title: p.label, sub: p.nextAction ? `Next: ${p.nextAction}` : p.status, score })
  }

  for (const item of data.shopping) {
    const score = scoreOf(query, item.label, item.aisle ?? '')
    if (score > 0) hits.push({ kind: 'shopping', id: item.id, title: item.label, sub: item.qty ?? item.aisle ?? 'Shopping list', score })
  }

  for (const p of data.people) {
    const score = scoreOf(query, p.name, [p.notes, ...p.giftIdeas.map((g) => g.idea)].filter(Boolean).join(' '))
    if (score > 0) hits.push({ kind: 'person', id: p.id, title: p.name, sub: p.notes || 'Person', score })
  }

  for (const m of data.maintenance) {
    const score = scoreOf(query, m.label, m.notes ?? '')
    if (score > 0) hits.push({ kind: 'maintenance', id: m.id, title: m.label, sub: m.scope, score })
  }

  for (const t of data.topics) {
    const score = scoreOf(query, t.label, t.resources.map((r) => r.title).join(' '))
    if (score > 0) hits.push({ kind: 'topic', id: t.id, title: t.label, sub: t.status, score })
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}
