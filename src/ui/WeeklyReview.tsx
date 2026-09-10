import { useMemo } from 'react'
import { useData } from '../core/store'
import { buildPlan, expenseTotal, formatMoney, spentByEnvelope } from '../core/budget'
import { addDays, monthKey, prettyDate, todayKey } from '../core/dates'
import { Empty, Panel, Sheet } from './components/kit'

/**
 * Reachable from Today, any day — not just Sundays, since "on demand" beats
 * a screen that only exists one day a week and is forgotten the other six.
 * No new maths: this is buildPlan/spentByEnvelope and the task/note arrays,
 * just arranged to answer "what actually happened this week" instead of
 * "what's the state of things right now".
 */
export default function WeeklyReview({ onClose }: { onClose: () => void }) {
  const data = useData()
  const money = (n: number) => formatMoney(n, data.settings.currency)
  const today = todayKey()
  const weekAgo = addDays(today, -7)
  const monthAgoWeekStart = addDays(today, -37)
  const monthAgoWeekEnd = addDays(today, -30)

  const spentThisWeek = useMemo(
    () => data.expenses.filter((e) => e.date >= weekAgo && e.date <= today).reduce((s, e) => s + expenseTotal(e), 0),
    [data.expenses, weekAgo, today],
  )
  const spentSameWeekLastMonth = useMemo(
    () => data.expenses.filter((e) => e.date >= monthAgoWeekStart && e.date <= monthAgoWeekEnd).reduce((s, e) => s + expenseTotal(e), 0),
    [data.expenses, monthAgoWeekStart, monthAgoWeekEnd],
  )

  const overEnvelopes = useMemo(() => {
    const spent = spentByEnvelope(data.expenses, monthKey())
    return data.envelopes.filter((e) => (spent[e.id] ?? 0) > e.monthly)
  }, [data.expenses, data.envelopes])

  const completedThisWeek = useMemo(
    () => data.tasks.filter((t) => t.done && t.due && t.due >= weekAgo && t.due <= today),
    [data.tasks, weekAgo, today],
  )
  const slipped = useMemo(
    () => data.tasks.filter((t) => !t.done && t.due && t.due >= weekAgo && t.due < today),
    [data.tasks, weekAgo, today],
  )

  const weekNotes = useMemo(
    () => data.notes.filter((n) => n.at.slice(0, 10) >= weekAgo),
    [data.notes, weekAgo],
  )

  const plan = buildPlan(data)

  return (
    <Sheet title="This week" onClose={onClose} onSubmit={onClose} submitLabel="Done">
      <Panel title="Spending">
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="hero" style={{ padding: 0 }}>
            <div className="figure" style={{ fontSize: 30 }}>{money(spentThisWeek)}</div>
            <p className="caption">
              this week, vs {money(spentSameWeekLastMonth)} the same week last month.
            </p>
          </div>
        </div>
        {overEnvelopes.length > 0 && (
          <div className="rows">
            {overEnvelopes.map((e) => (
              <div key={e.id} className="row" style={{ borderLeftColor: e.color || undefined }}>
                <div className="grow">
                  <div className="title">{e.label}</div>
                  <div className="meta">over its {money(e.monthly)} limit this month</div>
                </div>
                <span className="chip over">Over</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={`Tasks · ${completedThisWeek.length} done`}>
        <div className="rows">
          {completedThisWeek.length === 0 && slipped.length === 0 && <Empty>Nothing due this week either way.</Empty>}
          {completedThisWeek.map((t) => (
            <div key={t.id} className="row done">
              <div className="grow">
                <div className="title">{t.title}</div>
              </div>
              <span className="chip good">Done</span>
            </div>
          ))}
          {slipped.map((t) => (
            <div key={t.id} className="row">
              <div className="grow">
                <div className="title">{t.title}</div>
                <div className="meta">was due {prettyDate(t.due!)}</div>
              </div>
              <span className="chip over">Slipped</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={`Journal · ${weekNotes.length} ${weekNotes.length === 1 ? 'entry' : 'entries'}`}>
        {weekNotes.length === 0 && <Empty>Nothing written this week.</Empty>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: weekNotes.length > 0 ? 14 : 0 }}>
          {weekNotes.map((n) => (
            <div key={n.id}>
              <p style={{ margin: 0, fontSize: 13.5 }}>{n.text}</p>
              <p className="meta" style={{ margin: '2px 0 0' }}>{prettyDate(n.at.slice(0, 10))}</p>
            </div>
          ))}
        </div>
      </Panel>

      <p className="fieldnote">
        Overall: {money(plan.income)} take-home this month, {money(plan.unallocated)} unassigned right now.
      </p>
    </Sheet>
  )
}
