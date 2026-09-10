import { useEffect, useMemo, useState } from 'react'
import { store, uid, useData, useHighlight } from '../../core/store'
import type { Project } from '../../core/types'
import { daysSinceTouched } from '../../core/projects'
import { todayKey } from '../../core/dates'
import { Empty, Field, Icons, Panel, Segmented, Sheet, useHighlightRow } from '../components/kit'

const STATUS_LABEL: Record<Project['status'], string> = {
  active: 'Active',
  paused: 'Paused',
  shipped: 'Shipped',
  abandoned: 'Abandoned',
}

/** A project idle this long or longer shows the "Stale" flag on its own row — same threshold as the Today nudge. */
const STALE_DAYS = 14

export default function Projects() {
  const data = useData()
  const [editing, setEditing] = useState<Project | 'new' | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [title, setTitle] = useState('')

  const { active, paused, done } = useMemo(() => {
    const sorted = [...data.projects].sort((a, b) => daysSinceTouched(b) - daysSinceTouched(a))
    return {
      active: sorted.filter((p) => p.status === 'active'),
      paused: sorted.filter((p) => p.status === 'paused'),
      done: sorted.filter((p) => p.status === 'shipped' || p.status === 'abandoned'),
    }
  }, [data.projects])

  // A search jump (#18) landing on a shipped/abandoned project has to expand
  // that section first, or its row never mounts to clear the highlight.
  const highlight = useHighlight()
  useEffect(() => {
    if (highlight && done.some((p) => p.id === highlight)) setShowDone(true)
  }, [highlight, done])

  const quickAdd = () => {
    const t = title.trim()
    if (!t) return
    const id = uid()
    store.update((d) => {
      d.projects.unshift({ id, label: t, status: 'active', lastTouched: todayKey(), createdAt: todayKey() })
    })
    setTitle('')
    // A brand-new project has no next action yet — open straight to editing
    // so the "mandatory for active projects" rule has somewhere to bite
    // before it's just another silent entry. `data` here is the pre-update
    // snapshot, so build the row from what was just written, not a lookup.
    setEditing({ id, label: t, status: 'active', lastTouched: todayKey(), createdAt: todayKey() })
  }

  const touchProject = (id: string) =>
    store.update((d) => {
      const p = d.projects.find((x) => x.id === id)
      if (p) p.lastTouched = todayKey()
    })

  return (
    <>
      <Panel title="Add a project">
        <div className="quickadd">
          <input
            type="text"
            value={title}
            placeholder="What are you working on?"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
            aria-label="Project"
          />
          <button className="btn primary" type="button" onClick={quickAdd}>
            Add
          </button>
        </div>
      </Panel>

      <Panel title={`Active · ${active.length}`}>
        <div className="rows">
          {active.length === 0 && <Empty>Nothing active right now.</Empty>}
          {active.map((p) => (
            <ProjectRow key={p.id} project={p} onTouch={() => touchProject(p.id)} onEdit={() => setEditing(p)} />
          ))}
        </div>
      </Panel>

      {paused.length > 0 && (
        <Panel title={`Paused · ${paused.length}`}>
          <div className="rows">
            {paused.map((p) => (
              <ProjectRow key={p.id} project={p} onTouch={() => touchProject(p.id)} onEdit={() => setEditing(p)} />
            ))}
          </div>
        </Panel>
      )}

      {done.length > 0 && (
        <Panel
          title={`Shipped & abandoned · ${done.length}`}
          action={
            <button className="btn sm ghost" onClick={() => setShowDone((s) => !s)}>
              {showDone ? 'Hide' : 'Show'}
            </button>
          }
        >
          {showDone && (
            <div className="rows">
              {done.map((p) => (
                <DoneProjectRow key={p.id} project={p} onEdit={() => setEditing(p)} />
              ))}
            </div>
          )}
        </Panel>
      )}

      {editing && <ProjectSheet project={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function DoneProjectRow({ project: p, onEdit }: { project: Project; onEdit: () => void }) {
  const { ref, highlighted } = useHighlightRow<HTMLDivElement>(p.id)
  return (
    <div ref={ref} className={`row${highlighted ? ' highlight' : ''}`}>
      <div className="grow">
        <div className="title">{p.label}</div>
        <div className="meta">{STATUS_LABEL[p.status]}</div>
      </div>
      <button className="iconbtn" aria-label={`Edit ${p.label}`} onClick={onEdit}>
        <Icons.edit />
      </button>
    </div>
  )
}

function ProjectRow({ project: p, onTouch, onEdit }: { project: Project; onTouch: () => void; onEdit: () => void }) {
  const { ref, highlighted } = useHighlightRow<HTMLDivElement>(p.id)
  const days = daysSinceTouched(p)
  const stale = p.status === 'active' && days >= STALE_DAYS
  return (
    <div ref={ref} className={`row${highlighted ? ' highlight' : ''}`} style={{ alignItems: 'flex-start' }}>
      <div className="grow">
        <div className="title">{p.label}</div>
        <div className="meta">
          {days === 0 ? 'Touched today' : `${days} day${days === 1 ? '' : 's'} since touched`}
          {p.nextAction && ` · Next: ${p.nextAction}`}
        </div>
      </div>
      {stale && <span className="chip warn">Stale</span>}
      {p.status === 'active' && (
        <button className="btn sm ghost" type="button" onClick={onTouch}>
          Touched today
        </button>
      )}
      <button className="iconbtn" aria-label={`Edit ${p.label}`} onClick={onEdit}>
        <Icons.edit />
      </button>
    </div>
  )
}

function ProjectSheet({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const [label, setLabel] = useState(project?.label ?? '')
  const [status, setStatus] = useState<Project['status']>(project?.status ?? 'active')
  const [nextAction, setNextAction] = useState(project?.nextAction ?? '')
  const [why, setWhy] = useState(project?.why ?? '')
  const [notes, setNotes] = useState(project?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    if (!label.trim()) return
    // The one rule that actually matters here: an active project without a
    // written next step is where momentum dies, quietly.
    if (status === 'active' && !nextAction.trim()) {
      setError('Active projects need a next action — the single next physical step.')
      return
    }
    const patch = {
      label: label.trim(),
      status,
      nextAction: nextAction.trim() || undefined,
      why: why.trim() || undefined,
      notes: notes.trim() || undefined,
    }
    store.update((d) => {
      if (project) {
        const t = d.projects.find((x) => x.id === project.id)
        if (t) Object.assign(t, patch)
      } else {
        d.projects.push({ id: uid(), lastTouched: todayKey(), createdAt: todayKey(), ...patch })
      }
    })
    onClose()
  }

  return (
    <Sheet
      title={project ? 'Edit project' : 'New project'}
      onClose={onClose}
      onSubmit={save}
      onDelete={project ? () => { store.remove(project.label, (d) => { d.projects = d.projects.filter((x) => x.id !== project.id) }); onClose() } : undefined}
    >
      <Field label="Project">
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label="Status">
        <Segmented<Project['status']>
          value={status}
          onChange={(v) => { setStatus(v); setError(null) }}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'paused', label: 'Paused' },
            { value: 'shipped', label: 'Shipped' },
            { value: 'abandoned', label: 'Abandoned' },
          ]}
        />
      </Field>

      {/* Read the reason back before it's gone — half the time it doesn't hold up anymore. */}
      {status === 'abandoned' && why && (
        <p className="fieldnote" style={{ background: 'var(--warn-soft)', color: 'var(--warn)', padding: 10, borderRadius: 8, margin: 0 }}>
          You started this because: “{why}” — still the case?
        </p>
      )}

      <Field label={status === 'active' ? 'Next action (required for active)' : 'Next action'}>
        <input type="text" value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="The single next physical step" />
      </Field>
      {error && <p className="fieldnote error">{error}</p>}

      <Field label="Why you started this">
        <input type="text" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Read this back before abandoning" />
      </Field>

      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Sheet>
  )
}
