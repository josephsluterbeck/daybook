import { useEffect, useMemo, useState } from 'react'
import { store, uid, useData, useHighlight } from '../../core/store'
import type { Bill, Energy, Repeat, Task, TaskStep } from '../../core/types'
import { billsDueOn, formatMoney } from '../../core/budget'
import { tasksFor } from '../../core/tasks'
import { addDays, addMonths, addMonthsToKey, daysAway, daysInMonth, firstOfMonth, monthKey, monthLabel, pad, prettyDate, relativeDay, todayKey } from '../../core/dates'
import { Empty, Field, Icons, Panel, Segmented, Sheet, useHighlightRow } from '../components/kit'

type View = 'agenda' | 'calendar'

const stepProgress = (steps?: TaskStep[]) => (steps && steps.length > 0 ? `${steps.filter((s) => s.done).length}/${steps.length} steps` : null)

/** Buckets are computed from the due date, so the agenda re-sorts itself daily. */
type Bucket = 'overdue' | 'today' | 'week' | 'later' | 'someday'

const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  week: 'Next 7 days',
  later: 'Later',
  someday: 'No date',
}

function bucketOf(t: Task): Bucket {
  if (!t.due) return 'someday'
  const n = daysAway(t.due)
  if (n < 0) return 'overdue'
  if (n === 0) return 'today'
  if (n <= 7) return 'week'
  return 'later'
}

function TaskRow({ task: t, overdue, onComplete, onSnooze, onEdit }: { task: Task; overdue: boolean; onComplete: () => void; onSnooze: () => void; onEdit: () => void }) {
  const { ref, highlighted } = useHighlightRow<HTMLDivElement>(t.id)
  return (
    <div ref={ref} className={`row${highlighted ? ' highlight' : ''}`}>
      <input type="checkbox" className="check" checked={false} onChange={onComplete} aria-label={`Complete ${t.title}`} />
      <div className="grow">
        <div className="title">{t.title}</div>
        <div className="meta">
          {t.due ? relativeDay(t.due) : 'No date'}
          {t.time && ` · ${t.time}`}
          {t.repeat !== 'none' && ` · repeats ${t.repeat}`}
          {stepProgress(t.steps) && ` · ${stepProgress(t.steps)}`}
          {t.notes && ` · ${t.notes}`}
        </div>
      </div>
      {t.flagged && (
        <span className="chip warn">
          <Icons.flag size={11} /> Flagged
        </span>
      )}
      {overdue && !t.flagged && <span className="chip over">Late</span>}
      {/* The single most-used button in every task app that has one — push it to tomorrow without opening the edit sheet. */}
      <button className="iconbtn" aria-label={`Snooze ${t.title} to tomorrow`} onClick={onSnooze}>
        <Icons.snooze />
      </button>
      <button className="iconbtn" aria-label={`Edit ${t.title}`} onClick={onEdit}>
        <Icons.edit />
      </button>
    </div>
  )
}

function DoneTaskRow({ task: t, onReopen }: { task: Task; onReopen: () => void }) {
  const { ref, highlighted } = useHighlightRow<HTMLDivElement>(t.id)
  return (
    <div ref={ref} className={`row done${highlighted ? ' highlight' : ''}`}>
      <input type="checkbox" className="check" checked onChange={onReopen} aria-label={`Reopen ${t.title}`} />
      <div className="grow">
        <div className="title">{t.title}</div>
      </div>
      <button
        className="iconbtn"
        aria-label={`Delete ${t.title}`}
        onClick={() => store.update((d) => { d.tasks = d.tasks.filter((x) => x.id !== t.id) })}
      >
        <Icons.trash />
      </button>
    </div>
  )
}

export default function Tasks() {
  const data = useData()
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const [title, setTitle] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [view, setView] = useState<View>('agenda')
  // #44 — a lens, not the structure: both off by default, and a task with
  // neither field set always shows regardless (silence isn't "high energy").
  const [lowEnergyOnly, setLowEnergyOnly] = useState(false)
  const [shortOnly, setShortOnly] = useState(false)

  // A search jump (#18) landing on a completed task has to expand "Done"
  // first, or that row never mounts to scroll to and the highlight is never
  // consumed — a permanently "stuck" target.
  const highlight = useHighlight()
  useEffect(() => {
    if (highlight && data.tasks.some((t) => t.id === highlight && t.done)) setShowDone(true)
  }, [highlight, data.tasks])

  const filterIds = useMemo(() => {
    if (!lowEnergyOnly && !shortOnly) return null
    const matches = tasksFor(data, lowEnergyOnly ? 'low' : 'high', shortOnly ? 15 : undefined)
    return new Set(matches.map((t) => t.id))
  }, [data, lowEnergyOnly, shortOnly])

  const { open, done } = useMemo(() => {
    const sorted = [...data.tasks].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
    const openSorted = sorted.filter((t) => !t.done)
    return { open: filterIds ? openSorted.filter((t) => filterIds.has(t.id)) : openSorted, done: sorted.filter((t) => t.done) }
  }, [data.tasks, filterIds])

  const buckets = useMemo(() => {
    const out: Record<Bucket, Task[]> = { overdue: [], today: [], week: [], later: [], someday: [] }
    for (const t of open) out[bucketOf(t)].push(t)
    return out
  }, [open])

  const quickAdd = () => {
    const t = title.trim()
    if (!t) return
    store.update((d) => {
      d.tasks.push({ id: uid(), title: t, due: todayKey(), done: false, flagged: false, repeat: 'none', createdAt: todayKey() })
    })
    setTitle('')
  }

  /** Completing a repeating task rolls it forward instead of closing it. */
  const complete = (id: string) =>
    store.update((d) => {
      const t = d.tasks.find((x) => x.id === id)
      if (!t) return
      if (!t.done && t.repeat !== 'none' && t.due) {
        t.due =
          t.repeat === 'daily' ? addDays(t.due, 1) : t.repeat === 'weekly' ? addDays(t.due, 7) : addMonths(t.due, 1)
        return
      }
      t.done = !t.done
    })

  const snooze = (id: string) =>
    store.update((d) => {
      const t = d.tasks.find((x) => x.id === id)
      if (t) t.due = addDays(todayKey(), 1)
    })

  return (
    <>
      <Segmented<View>
        value={view}
        onChange={setView}
        options={[
          { value: 'agenda', label: 'Agenda' },
          { value: 'calendar', label: 'Calendar' },
        ]}
      />

      {view === 'calendar' && <CalendarView tasks={data.tasks} bills={data.bills} currency={data.settings.currency} onEdit={setEditing} />}

      {view === 'agenda' && (
        <>
          <div style={{ display: 'flex', gap: 8, padding: '0 2px' }}>
            <button
              type="button"
              className={`chip${lowEnergyOnly ? ' accent' : ''}`}
              style={{ cursor: 'pointer', border: lowEnergyOnly ? 0 : undefined }}
              aria-pressed={lowEnergyOnly}
              onClick={() => setLowEnergyOnly((v) => !v)}
            >
              Low energy
            </button>
            <button
              type="button"
              className={`chip${shortOnly ? ' accent' : ''}`}
              style={{ cursor: 'pointer', border: shortOnly ? 0 : undefined }}
              aria-pressed={shortOnly}
              onClick={() => setShortOnly((v) => !v)}
            >
              Got 15 minutes?
            </button>
          </div>

          <Panel title={`Open · ${open.length}`}>
            <div className="quickadd">
              <input
                type="text"
                value={title}
                placeholder="What needs doing?"
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
                aria-label="Task"
              />
              <button className="btn primary" type="button" onClick={quickAdd}>
                Add
              </button>
            </div>
            {open.length === 0 && <Empty>Nothing open. Enjoy it.</Empty>}
          </Panel>

          {(Object.keys(BUCKET_LABEL) as Bucket[]).map((b) => {
            const list = buckets[b]
            if (list.length === 0) return null
            return (
              <Panel key={b} title={`${BUCKET_LABEL[b]} · ${list.length}`}>
                <div className="rows">
                  {list.map((t) => (
                    <TaskRow key={t.id} task={t} overdue={b === 'overdue'} onComplete={() => complete(t.id)} onSnooze={() => snooze(t.id)} onEdit={() => setEditing(t)} />
                  ))}
                </div>
              </Panel>
            )
          })}

          <Panel
            title={`Done · ${done.length}`}
            action={
              <button className="btn sm ghost" onClick={() => setShowDone((s) => !s)}>
                {showDone ? 'Hide' : 'Show'}
              </button>
            }
          >
            {showDone && (
              <div className="rows">
                {done.length === 0 && <Empty>Nothing completed yet.</Empty>}
                {done.map((t) => (
                  <DoneTaskRow key={t.id} task={t} onReopen={() => complete(t.id)} />
                ))}
              </div>
            )}
          </Panel>
        </>
      )}

      {editing && <TaskSheet task={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function TaskSheet({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [due, setDue] = useState(task?.due ?? '')
  const [time, setTime] = useState(task?.time ?? '')
  const [repeat, setRepeat] = useState<Repeat>(task?.repeat ?? 'none')
  const [flagged, setFlagged] = useState(task?.flagged ?? false)
  const [notes, setNotes] = useState(task?.notes ?? '')
  // Kept as ordinary local state, not written to the store until Save — same
  // as every other field here. Unlike a goal's dated contributions or a
  // bill's monthly overrides, a step has no meaning yet without the task
  // existing to attach it to, so there's no reason to persist it any earlier.
  const [steps, setSteps] = useState<TaskStep[]>(task?.steps ?? [])
  const [newStep, setNewStep] = useState('')
  const [energy, setEnergy] = useState<Energy | ''>(task?.energy ?? '')
  const [minutes, setMinutes] = useState(task?.minutes != null ? String(task.minutes) : '')

  const addStep = () => {
    const text = newStep.trim()
    if (!text) return
    setSteps((s) => [...s, { id: uid(), text, done: false }])
    setNewStep('')
  }
  const toggleStep = (id: string) => setSteps((s) => s.map((x) => (x.id === id ? { ...x, done: !x.done } : x)))
  const removeStep = (id: string) => setSteps((s) => s.filter((x) => x.id !== id))

  const save = () => {
    if (!title.trim()) return
    const mins = Number(minutes)
    const patch = {
      title: title.trim(),
      due: due || undefined,
      time: time || undefined,
      repeat,
      flagged,
      notes: notes.trim() || undefined,
      steps: steps.length > 0 ? steps : undefined,
      energy: energy || undefined,
      minutes: minutes.trim() && Number.isFinite(mins) && mins > 0 ? mins : undefined,
    }
    store.update((d) => {
      if (task) {
        const t = d.tasks.find((x) => x.id === task.id)
        if (t) Object.assign(t, patch)
      } else {
        d.tasks.push({ id: uid(), done: false, createdAt: todayKey(), ...patch })
      }
    })
    onClose()
  }

  return (
    <Sheet
      title={task ? 'Edit task' : 'New task'}
      onClose={onClose}
      onSubmit={save}
      onDelete={task ? () => { store.remove(task.title, (d) => { d.tasks = d.tasks.filter((x) => x.id !== task.id) }); onClose() } : undefined}
    >
      <Field label="Task">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="formgrid">
        <Field label="Due" wide>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Time" wide>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Repeat" wide>
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
            <option value="none">Doesn't repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </Field>
        <Field label="Energy needed">
          <select value={energy} onChange={(e) => setEnergy(e.target.value as Energy | '')} aria-label="Energy needed">
            <option value="">Not set</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </Field>
        <Field label="Minutes (rough)">
          <input type="text" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} placeholder="Optional" />
        </Field>
        <Field label="Notes" wide>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>

      <Field label={`Steps${steps.length > 0 ? ` · ${steps.filter((s) => s.done).length}/${steps.length}` : ''}`}>
        <div className="rows" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
          {steps.length === 0 && <Empty>No steps yet — break this into pieces if it helps.</Empty>}
          {steps.map((s) => (
            <div key={s.id} className={`row${s.done ? ' done' : ''}`}>
              <input
                type="checkbox"
                className="check"
                checked={s.done}
                onChange={() => toggleStep(s.id)}
                aria-label={`Step: ${s.text}`}
              />
              <div className="grow title">{s.text}</div>
              <button type="button" className="iconbtn" aria-label={`Remove step: ${s.text}`} onClick={() => removeStep(s.id)}>
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

      <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14 }}>
        <input type="checkbox" className="check" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} />
        Flag this one
      </label>
    </Sheet>
  )
}

/* ══ Calendar view ═══════════════════════════════════════════════════════ */

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/**
 * "The bucket list answers 'what's next'; a grid answers 'what does this
 * month look like'" — dated tasks and bill due-dates on a real month grid,
 * an alternative to Agenda's bucketed list rather than a replacement for it.
 */
function CalendarView({ tasks, bills, currency, onEdit }: { tasks: Task[]; bills: Bill[]; currency: string; onEdit: (t: Task) => void }) {
  const [mk, setMk] = useState(monthKey())
  const [selected, setSelected] = useState<string | null>(null)
  const isCurrentMonth = mk === monthKey()

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.due || !t.due.startsWith(mk)) continue
      const list = map.get(t.due) ?? []
      list.push(t)
      map.set(t.due, list)
    }
    return map
  }, [tasks, mk])

  const billsByDay = useMemo(() => billsDueOn(bills, mk), [bills, mk])

  const first = firstOfMonth(mk)
  const dim = daysInMonth(first)
  const startWeekday = first.getDay()
  const cells: (string | null)[] = [...Array(startWeekday).fill(null), ...Array.from({ length: dim }, (_, i) => `${mk}-${pad(i + 1)}`)]

  const selectedTasks = selected ? (tasksByDay.get(selected) ?? []) : []
  const selectedBills = selected ? (billsByDay.get(Number(selected.slice(8, 10))) ?? []) : []

  return (
    <>
      <div className="monthnav">
        <button type="button" className="iconbtn flip" aria-label="Previous month" onClick={() => { setMk((m) => addMonthsToKey(m, -1)); setSelected(null) }}>
          <Icons.chevron />
        </button>
        <span className="monthnav-label">{monthLabel(mk)}</span>
        <button
          type="button"
          className="iconbtn"
          aria-label="Next month"
          disabled={isCurrentMonth}
          onClick={() => { setMk((m) => addMonthsToKey(m, 1)); setSelected(null) }}
        >
          <Icons.chevron />
        </button>
      </div>

      <div className="calendar-grid">
        {DOW.map((d, i) => (
          <div key={i} className="calendar-dow">{d}</div>
        ))}
        {cells.map((dateKey, i) => {
          if (!dateKey) return <div key={i} className="calendar-cell empty" />
          const dayTasks = tasksByDay.get(dateKey) ?? []
          const dayBills = billsByDay.get(Number(dateKey.slice(8, 10))) ?? []
          const isToday = dateKey === todayKey()
          return (
            <button
              key={dateKey}
              type="button"
              className={`calendar-cell${isToday ? ' today' : ''}${selected === dateKey ? ' selected' : ''}`}
              onClick={() => setSelected(dateKey === selected ? null : dateKey)}
              aria-label={`${prettyDate(dateKey)}${dayTasks.length ? `, ${dayTasks.length} tasks` : ''}${dayBills.length ? `, ${dayBills.length} bills due` : ''}`}
            >
              <span className="calendar-daynum">{Number(dateKey.slice(8, 10))}</span>
              <span className="calendar-dots">
                {dayBills.slice(0, 3).map((b, idx) => (
                  <span key={idx} className="calendar-dot" style={{ background: b.color || undefined }} />
                ))}
                {dayTasks.length > 0 && <span className="calendar-dot task" />}
              </span>
            </button>
          )
        })}
      </div>

      {selected && (
        <Panel title={prettyDate(selected)}>
          <div className="rows">
            {selectedTasks.length === 0 && selectedBills.length === 0 && <Empty>Nothing this day.</Empty>}
            {selectedTasks.map((t) => (
              <div key={t.id} className="row">
                <div className="grow">
                  <div className="title">{t.title}</div>
                  {t.time && <div className="meta">{t.time}</div>}
                </div>
                <button type="button" className="iconbtn" aria-label={`Edit ${t.title}`} onClick={() => onEdit(t)}>
                  <Icons.edit />
                </button>
              </div>
            ))}
            {selectedBills.map((b) => (
              <div key={b.id} className="row" style={{ borderLeftColor: b.color || undefined }}>
                <div className="grow title">{b.label}</div>
                <span className="num">{formatMoney(b.amount, currency)}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  )
}
