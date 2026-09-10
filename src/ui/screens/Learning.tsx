import { useMemo, useState } from 'react'
import { store, uid, useData } from '../../core/store'
import type { Resource, Topic } from '../../core/types'
import { daysSinceStudied, takeawaysFor } from '../../core/learning'
import { prettyDate, todayKey } from '../../core/dates'
import { Empty, Field, Icons, Panel, Segmented, Sheet, useHighlightRow } from '../components/kit'

const STATUS_LABEL: Record<Topic['status'], string> = { learning: 'Learning', shelved: 'Shelved', comfortable: 'Comfortable' }
const STATUS_ORDER: Record<Topic['status'], number> = { learning: 0, shelved: 1, comfortable: 2 }
const RESOURCE_KIND_LABEL: Record<Resource['kind'], string> = { book: 'Book', course: 'Course', docs: 'Docs', video: 'Video', project: 'Project' }

/** Opening a topic (the edit sheet) shows its resources and takeaways — no separate drill-down screen, same pattern as every other ledger-bearing sheet in the app. */
export default function Learning() {
  const data = useData()
  const [editing, setEditing] = useState<Topic | 'new' | null>(null)
  const [label, setLabel] = useState('')

  const sorted = useMemo(
    () => [...data.topics].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.label.localeCompare(b.label)),
    [data.topics],
  )

  const quickAdd = () => {
    const t = label.trim()
    if (!t) return
    store.update((d) => {
      d.topics.push({ id: uid(), label: t, status: 'learning', resources: [] })
    })
    setLabel('')
  }

  return (
    <>
      <Panel title="Add a topic">
        <div className="quickadd">
          <input
            type="text"
            value={label}
            placeholder="What are you learning?"
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
            aria-label="Topic"
          />
          <button className="btn primary" type="button" onClick={quickAdd}>
            Add
          </button>
        </div>
      </Panel>

      <Panel title={`Topics · ${sorted.length}`}>
        <div className="rows">
          {sorted.length === 0 && <Empty>No syllabus, no exam — just what you're picking up on your own.</Empty>}
          {sorted.map((t) => (
            <TopicRow key={t.id} topic={t} takeawayCount={takeawaysFor(data.notes, t.id).length} onEdit={() => setEditing(t)} />
          ))}
        </div>
      </Panel>

      {editing && <TopicSheet topic={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function TopicRow({ topic: t, takeawayCount, onEdit }: { topic: Topic; takeawayCount: number; onEdit: () => void }) {
  const { ref, highlighted } = useHighlightRow<HTMLDivElement>(t.id)
  const doneCount = t.resources.filter((r) => r.done).length
  const days = daysSinceStudied(t.lastStudied)
  return (
    <div ref={ref} className={`row${highlighted ? ' highlight' : ''}`}>
      <div className="grow">
        <div className="title">{t.label}</div>
        <div className="meta">
          {STATUS_LABEL[t.status]}
          {t.resources.length > 0 && ` · ${doneCount}/${t.resources.length} resources`}
          {takeawayCount > 0 && ` · ${takeawayCount} takeaway${takeawayCount === 1 ? '' : 's'}`}
          {days != null && ` · studied ${days === 0 ? 'today' : `${days}d ago`}`}
        </div>
      </div>
      <button className="iconbtn" aria-label={`Edit ${t.label}`} onClick={onEdit}>
        <Icons.edit />
      </button>
    </div>
  )
}

function TopicSheet({ topic, onClose }: { topic: Topic | null; onClose: () => void }) {
  const data = useData()
  // Re-read the live topic so the resource/takeaway ledgers below update as
  // entries are added/removed, instead of freezing at whatever `topic` was on open.
  const live = topic ? (data.topics.find((x) => x.id === topic.id) ?? topic) : null
  const liveTakeaways = topic ? takeawaysFor(data.notes, topic.id) : []

  const [label, setLabel] = useState(topic?.label ?? '')
  const [status, setStatus] = useState<Topic['status']>(topic?.status ?? 'learning')
  const [lastStudied, setLastStudied] = useState(topic?.lastStudied ?? '')

  const [resourceTitle, setResourceTitle] = useState('')
  const [resourceKind, setResourceKind] = useState<Resource['kind']>('book')
  const [resourceUrl, setResourceUrl] = useState('')

  const [takeawayText, setTakeawayText] = useState('')

  const save = () => {
    if (!label.trim()) return
    const patch = { label: label.trim(), status, lastStudied: lastStudied || undefined }
    store.update((d) => {
      if (topic) {
        const t = d.topics.find((x) => x.id === topic.id)
        if (t) Object.assign(t, patch)
      } else {
        d.topics.push({ id: uid(), resources: [], ...patch })
      }
    })
    onClose()
  }

  const addResource = () => {
    const title = resourceTitle.trim()
    if (!topic || !title) return
    store.update((d) => {
      const t = d.topics.find((x) => x.id === topic.id)
      if (t) t.resources.push({ id: uid(), title, kind: resourceKind, done: false, url: resourceUrl.trim() || undefined })
    })
    setResourceTitle('')
    setResourceUrl('')
  }

  const toggleResource = (id: string) => {
    if (!topic) return
    store.update((d) => {
      const t = d.topics.find((x) => x.id === topic.id)
      const r = t?.resources.find((x) => x.id === id)
      if (r) r.done = !r.done
    })
  }

  const removeResource = (id: string) => {
    if (!topic) return
    store.update((d) => {
      const t = d.topics.find((x) => x.id === topic.id)
      if (t) t.resources = t.resources.filter((x) => x.id !== id)
    })
  }

  const addTakeaway = () => {
    const text = takeawayText.trim()
    if (!topic || !text) return
    store.update((d) => {
      d.notes.unshift({ id: uid(), at: new Date().toISOString(), text, tags: [], topicId: topic.id })
      const t = d.topics.find((x) => x.id === topic.id)
      if (t) t.lastStudied = todayKey()
    })
    setTakeawayText('')
    setLastStudied(todayKey())
  }

  const removeTakeaway = (id: string) =>
    store.update((d) => {
      d.notes = d.notes.filter((n) => n.id !== id)
    })

  return (
    <Sheet
      title={topic ? 'Edit topic' : 'New topic'}
      onClose={onClose}
      onSubmit={save}
      onDelete={topic ? () => { store.remove(topic.label, (d) => { d.topics = d.topics.filter((x) => x.id !== topic.id) }); onClose() } : undefined}
    >
      <Field label="Topic">
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label="Status">
        <Segmented<Topic['status']>
          value={status}
          onChange={setStatus}
          options={[
            { value: 'learning', label: 'Learning' },
            { value: 'shelved', label: 'Shelved' },
            { value: 'comfortable', label: 'Comfortable' },
          ]}
        />
      </Field>
      <Field label="Last studied">
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="date" value={lastStudied} onChange={(e) => setLastStudied(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
          <button type="button" className="btn sm ghost" onClick={() => setLastStudied(todayKey())}>
            Today
          </button>
        </div>
      </Field>

      {topic && (
        <Field label={`Resources · ${live!.resources.filter((r) => r.done).length}/${live!.resources.length}`}>
          <div className="rows" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
            {live!.resources.length === 0 && <Empty>Nothing yet.</Empty>}
            {live!.resources.map((r) => (
              <div key={r.id} className={`row${r.done ? ' done' : ''}`}>
                <input type="checkbox" className="check" checked={r.done} onChange={() => toggleResource(r.id)} aria-label={`Mark ${r.title} done`} />
                <div className="grow">
                  <div className="title">{r.title}</div>
                  <div className="meta">{RESOURCE_KIND_LABEL[r.kind]}</div>
                </div>
                <button type="button" className="iconbtn" aria-label={`Remove ${r.title}`} onClick={() => removeResource(r.id)}>
                  <Icons.x size={15} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={resourceTitle}
                onChange={(e) => setResourceTitle(e.target.value)}
                placeholder="A book, course, doc…"
                aria-label="Resource title"
                style={{ flex: 2, minWidth: 0 }}
              />
              <select value={resourceKind} onChange={(e) => setResourceKind(e.target.value as Resource['kind'])} aria-label="Resource kind" style={{ flex: 1 }}>
                {(Object.keys(RESOURCE_KIND_LABEL) as Resource['kind'][]).map((k) => (
                  <option key={k} value={k}>{RESOURCE_KIND_LABEL[k]}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={resourceUrl}
                onChange={(e) => setResourceUrl(e.target.value)}
                placeholder="Link (optional)"
                aria-label="Resource link"
                style={{ flex: 1, minWidth: 0 }}
              />
              <button className="btn primary" onClick={addResource} type="button">
                Add
              </button>
            </div>
          </div>
        </Field>
      )}

      {topic && (
        <Field label={`Takeaways · ${liveTakeaways.length}`}>
          <div className="rows" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
            {liveTakeaways.length === 0 && <Empty>Nothing yet — write one in your own words after you study.</Empty>}
            {liveTakeaways.map((n) => (
              <div key={n.id} className="row" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <p className="note-body" style={{ margin: 0 }}>{n.text}</p>
                  <div className="meta">{prettyDate(n.at.slice(0, 10))}</div>
                </div>
                <button type="button" className="iconbtn" aria-label="Remove takeaway" onClick={() => removeTakeaway(n.id)}>
                  <Icons.x size={15} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, paddingTop: 10 }}>
            <textarea
              value={takeawayText}
              onChange={(e) => setTakeawayText(e.target.value)}
              placeholder="What actually stuck, in your own words"
              aria-label="New takeaway"
              style={{ flex: 1 }}
            />
          </div>
          <button className="btn sm primary" onClick={addTakeaway} type="button" style={{ marginTop: 8 }}>
            Add takeaway
          </button>
        </Field>
      )}
    </Sheet>
  )
}
