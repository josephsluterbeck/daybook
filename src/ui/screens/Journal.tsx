import { useEffect, useMemo, useState } from 'react'
import { store, uid, useData, useHighlight } from '../../core/store'
import type { Note } from '../../core/types'
import { Empty, Icons, Panel, useHighlightRow } from '../components/kit'

/**
 * #hashtags typed while writing a brand-new note become tags automatically —
 * a nice zero-friction default. But tags are their own field on Note, and
 * once a note exists they're edited through their own chips (add/remove),
 * never by hunting for "#word" inside the prose — see TagEditor below.
 */
function extractTags(text: string): string[] {
  return [...new Set([...text.matchAll(/(?:^|\s)#([\p{L}\d_-]{1,24})/gu)].map((m) => m[1].toLowerCase()))]
}

function normaliseTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-').slice(0, 24)
}

/** Tags as their own chips — each removable on its own, plus a small input to add one. Never touches the note's text. */
function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const t = normaliseTag(input)
    if (t && !tags.includes(t)) onChange([...tags, t])
    setInput('')
  }
  const removeTag = (t: string) => onChange(tags.filter((x) => x !== t))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {tags.length > 0 && (
        <div className="tags">
          {tags.map((t) => (
            <span key={t} className="chip">
              #{t}
              <button type="button" className="chip-remove" aria-label={`Remove tag ${t}`} onClick={() => removeTag(t)}>
                <Icons.x size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag()
            }
          }}
          placeholder="Add a tag"
          aria-label="Add a tag"
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="button" className="btn sm" onClick={addTag}>
          Add
        </button>
      </div>
    </div>
  )
}

export default function Journal() {
  const data = useData()
  const [draft, setDraft] = useState('')
  const [draftTags, setDraftTags] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const n of data.notes) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  }, [data.notes])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...data.notes].sort((a, b) => b.at.localeCompare(a.at))
    if (!q) return list
    return list.filter((n) => n.text.toLowerCase().includes(q) || n.tags.some((t) => t.includes(q.replace('#', ''))))
  }, [data.notes, query])

  // A search jump (#18) landing on a note this screen's own filter is
  // currently hiding has to clear that filter first, or the row never mounts
  // to scroll to and the highlight is never consumed.
  const highlight = useHighlight()
  useEffect(() => {
    if (highlight && !shown.some((n) => n.id === highlight) && data.notes.some((n) => n.id === highlight)) setQuery('')
  }, [highlight, shown, data.notes])

  const post = () => {
    const text = draft.trim()
    if (!text) return
    // Union: whatever you added as a chip, plus any #hashtag still in the
    // text — a fresh note gets the convenience, without it overriding a tag
    // you deliberately added or removed.
    const tags = [...new Set([...draftTags, ...extractTags(text)])]
    store.update((d) => {
      d.notes.unshift({ id: uid(), at: new Date().toISOString(), text, tags })
    })
    setDraft('')
    setDraftTags([])
  }

  const saveEdit = (id: string) => {
    const text = editText.trim()
    if (text) {
      store.update((d) => {
        const n = d.notes.find((x) => x.id === id)
        if (n) {
          n.text = text
          // Tags are exactly what the chip editor holds — editing the body
          // text never re-derives or overwrites them from this point on.
          n.tags = editTags
        }
      })
    }
    setEditingId(null)
  }

  const when = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <>
      <Panel title="What's on your mind">
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type it before it's gone. Use #tags to group things, or add them below."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post()
            }}
          />
          <TagEditor tags={draftTags} onChange={setDraftTags} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="meta" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              ⌘/Ctrl + Enter to save
            </span>
            <button className="btn primary" type="button" onClick={post} style={{ marginLeft: 'auto' }}>
              Save note
            </button>
          </div>
        </div>
      </Panel>

      {data.notes.length > 0 && (
        <Panel title={`Notes · ${data.notes.length}`}>
          <div className="quickadd">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes and tags…"
              aria-label="Search notes"
            />
          </div>
          {allTags.length > 0 && (
            <div className="quickadd tags" style={{ gap: 6 }}>
              {allTags.map(([t, n]) => (
                <button
                  key={t}
                  type="button"
                  className={`chip${query.replace('#', '') === t ? ' accent' : ''}`}
                  style={{ border: 0, cursor: 'pointer' }}
                  onClick={() => setQuery(query.replace('#', '') === t ? '' : t)}
                >
                  #{t} — {n}
                </button>
              ))}
            </div>
          )}
          <div className="rows">
            {shown.length === 0 && <Empty>No notes match that.</Empty>}
            {shown.map((n) => (
              <NoteRow
                key={n.id}
                note={n}
                when={when(n.at)}
                editing={editingId === n.id}
                editText={editText}
                setEditText={setEditText}
                editTags={editTags}
                setEditTags={setEditTags}
                onStartEdit={() => {
                  setEditingId(n.id)
                  setEditText(n.text)
                  setEditTags(n.tags)
                }}
                onSave={() => saveEdit(n.id)}
                onCancel={() => setEditingId(null)}
                onDelete={() => store.remove(n.text.length > 40 ? n.text.slice(0, 40) + '…' : n.text, (d) => { d.notes = d.notes.filter((x) => x.id !== n.id) })}
              />
            ))}
          </div>
        </Panel>
      )}
    </>
  )
}

function NoteRow({
  note,
  when,
  editing,
  editText,
  setEditText,
  editTags,
  setEditTags,
  onStartEdit,
  onSave,
  onCancel,
  onDelete,
}: {
  note: Note
  when: string
  editing: boolean
  editText: string
  setEditText: (s: string) => void
  editTags: string[]
  setEditTags: (tags: string[]) => void
  onStartEdit: () => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  const { ref, highlighted } = useHighlightRow<HTMLDivElement>(note.id)
  return (
    <div ref={ref} className={`row${highlighted ? ' highlight' : ''}`} style={{ alignItems: 'flex-start' }}>
      <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div className="meta num">{when}</div>
        {editing ? (
          <>
            <textarea value={editText} onChange={(e) => setEditText(e.target.value)} />
            <TagEditor tags={editTags} onChange={setEditTags} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn sm primary" type="button" onClick={onSave}>
                Save
              </button>
              <button className="btn sm ghost" type="button" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="note-body" style={{ margin: 0 }}>
              {note.text}
            </p>
            {note.tags.length > 0 && (
              <div className="tags">
                {note.tags.map((t) => (
                  <span key={t} className="chip">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {!editing && (
        <>
          <button className="iconbtn" aria-label="Edit note" onClick={onStartEdit}>
            <Icons.edit />
          </button>
          <button className="iconbtn" aria-label="Delete note" onClick={onDelete}>
            <Icons.trash />
          </button>
        </>
      )}
    </div>
  )
}
