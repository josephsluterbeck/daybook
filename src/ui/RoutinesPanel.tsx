import { useState } from 'react'
import { store, uid, useData } from '../core/store'
import type { Routine } from '../core/types'
import { routineDueToday, routineProgress, toggleRoutineStep } from '../core/routines'
import { todayKey } from '../core/dates'
import { Empty, Field, Icons, Panel, Segmented, Sheet } from './components/kit'

const WEEKDAY_LABEL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * One collapsed row per routine due today — "Morning · 2/5" — expanding to
 * its checklist. Collapsed by default: five of these on Today at once would
 * swamp the screen the same way five repeating tasks would (#20's whole
 * reason for existing instead of just being more tasks).
 */
export default function RoutinesPanel() {
  const data = useData()
  const [editing, setEditing] = useState<Routine | 'new' | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const today = todayKey()
  const due = data.routines.filter((r) => routineDueToday(r, today))

  return (
    <>
      <Panel
        title="Routines"
        action={
          <button className="btn sm" onClick={() => setEditing('new')}>
            <Icons.plus size={14} /> Add
          </button>
        }
      >
        <div className="rows">
          {data.routines.length === 0 && (
            <Empty>A morning routine, a Sunday reset, a gym-day checklist — steps that reset together.</Empty>
          )}
          {data.routines.length > 0 && due.length === 0 && <Empty>Nothing due today.</Empty>}
          {due.map((r) => {
            const progress = routineProgress(r, today)
            const isOpen = expanded === r.id
            const doneToday = r.completions.find((c) => c.date === today)?.stepIds ?? []
            return (
              <div key={r.id}>
                <div className="row">
                  <button
                    type="button"
                    className="iconbtn"
                    aria-label={isOpen ? `Collapse ${r.label}` : `Expand ${r.label}`}
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                  >
                    <span className={`chevron-toggle${isOpen ? ' open' : ''}`}>
                      <Icons.chevron size={14} />
                    </span>
                  </button>
                  <button
                    type="button"
                    className="grow"
                    style={{ textAlign: 'left', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                  >
                    <div className="title">{r.label}</div>
                    <div className="meta">{progress.done}/{progress.total} done</div>
                  </button>
                  <button type="button" className="iconbtn" aria-label={`Edit ${r.label}`} onClick={() => setEditing(r)}>
                    <Icons.edit />
                  </button>
                </div>
                {isOpen && (
                  <div className="rows" style={{ paddingLeft: 20 }}>
                    {r.steps.length === 0 && <Empty>No steps yet — edit this routine to add some.</Empty>}
                    {r.steps.map((s) => {
                      const done = doneToday.includes(s.id)
                      return (
                        <div key={s.id} className={`row${done ? ' done' : ''}`}>
                          <input
                            type="checkbox"
                            className="check"
                            checked={done}
                            onChange={() => store.update((d) => toggleRoutineStep(d, r.id, s.id, today))}
                            aria-label={s.label}
                          />
                          <div className="grow title">{s.label}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Panel>
      {editing && <RoutineSheet routine={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function RoutineSheet({ routine, onClose }: { routine: Routine | null; onClose: () => void }) {
  const [label, setLabel] = useState(routine?.label ?? '')
  const [cadence, setCadence] = useState<Routine['cadence']>(routine?.cadence ?? 'daily')
  const [weekday, setWeekday] = useState(routine?.weekday ?? 0)
  const [steps, setSteps] = useState<{ id: string; label: string }[]>(routine?.steps ?? [])
  const [newStep, setNewStep] = useState('')

  const addStep = () => {
    const text = newStep.trim()
    if (!text) return
    setSteps((s) => [...s, { id: uid(), label: text }])
    setNewStep('')
  }
  const removeStep = (id: string) => setSteps((s) => s.filter((x) => x.id !== id))

  const save = () => {
    if (!label.trim()) return
    const patch = { label: label.trim(), cadence, weekday: cadence === 'weekly' ? weekday : undefined, steps }
    store.update((d) => {
      if (routine) {
        const r = d.routines.find((x) => x.id === routine.id)
        if (r) Object.assign(r, patch)
      } else {
        d.routines.push({ id: uid(), completions: [], ...patch })
      }
    })
    onClose()
  }

  return (
    <Sheet
      title={routine ? 'Edit routine' : 'New routine'}
      onClose={onClose}
      onSubmit={save}
      onDelete={routine ? () => { store.remove(routine.label, (d) => { d.routines = d.routines.filter((x) => x.id !== routine.id) }); onClose() } : undefined}
    >
      <Field label="Name">
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Morning" />
      </Field>
      <Field label="Resets">
        <Segmented<Routine['cadence']>
          value={cadence}
          onChange={setCadence}
          options={[
            { value: 'daily', label: 'Daily' },
            { value: 'weekly', label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' },
          ]}
        />
      </Field>
      {cadence === 'weekly' && (
        <Field label="On">
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {WEEKDAY_LABEL.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Steps">
        <div className="rows" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
          {steps.length === 0 && <Empty>No steps yet.</Empty>}
          {steps.map((s) => (
            <div key={s.id} className="row">
              <div className="grow title">{s.label}</div>
              <button type="button" className="iconbtn" aria-label={`Remove ${s.label}`} onClick={() => removeStep(s.id)}>
                <Icons.x size={15} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, paddingTop: 10 }}>
          <input
            type="text"
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addStep())}
            placeholder="Add a step"
            aria-label="New step"
            style={{ flex: 1, minWidth: 0 }}
          />
          <button className="btn primary" onClick={addStep} type="button">
            Add
          </button>
        </div>
      </Field>
    </Sheet>
  )
}
