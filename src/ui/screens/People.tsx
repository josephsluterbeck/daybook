import { useMemo, useState } from 'react'
import { store, uid, useData } from '../../core/store'
import type { Person } from '../../core/types'
import { overdueContact, upcomingBirthdays, type BirthdayHit } from '../../core/people'
import { formatMoney } from '../../core/budget'
import { relativeDay, todayKey } from '../../core/dates'
import { Empty, Field, Icons, Panel, Sheet, useHighlightRow } from '../components/kit'

/**
 * The list view is for editing — the value is in Today's surfacing (see
 * Today.tsx's "People" panel), not in browsing this screen day to day.
 */
export default function People() {
  const data = useData()
  const [editing, setEditing] = useState<Person | 'new' | null>(null)
  const [name, setName] = useState('')

  const sorted = useMemo(() => [...data.people].sort((a, b) => a.name.localeCompare(b.name)), [data.people])
  const overdueIds = useMemo(() => new Set(overdueContact(data.people).map((p) => p.id)), [data.people])
  const birthdaysById = useMemo(() => {
    const map = new Map<string, BirthdayHit>()
    for (const hit of upcomingBirthdays(data.people, 60)) map.set(hit.person.id, hit)
    return map
  }, [data.people])

  const quickAdd = () => {
    const t = name.trim()
    if (!t) return
    store.update((d) => {
      d.people.push({ id: uid(), name: t, giftIdeas: [] })
    })
    setName('')
  }

  return (
    <>
      <Panel title="Add a person">
        <div className="quickadd">
          <input
            type="text"
            value={name}
            placeholder="Name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
            aria-label="Person"
          />
          <button className="btn primary" type="button" onClick={quickAdd}>
            Add
          </button>
        </div>
      </Panel>

      <Panel title={`People · ${sorted.length}`}>
        <div className="rows">
          {sorted.length === 0 && <Empty>Add someone you don't want to lose track of.</Empty>}
          {sorted.map((p) => (
            <PersonRow key={p.id} person={p} overdue={overdueIds.has(p.id)} birthday={birthdaysById.get(p.id)} onEdit={() => setEditing(p)} />
          ))}
        </div>
      </Panel>

      {editing && <PersonSheet person={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function PersonRow({
  person: p,
  overdue,
  birthday,
  onEdit,
}: {
  person: Person
  overdue: boolean
  birthday?: BirthdayHit
  onEdit: () => void
}) {
  const { ref, highlighted } = useHighlightRow<HTMLDivElement>(p.id)
  const metaParts = [
    birthday && `Birthday ${relativeDay(birthday.date)}${birthday.turning != null ? ` · turning ${birthday.turning}` : ''}`,
    overdue && 'Overdue to reach out',
    !birthday && !overdue && p.notes,
  ].filter(Boolean)
  return (
    <div ref={ref} className={`row${highlighted ? ' highlight' : ''}`}>
      <div className="grow">
        <div className="title">{p.name}</div>
        {metaParts.length > 0 && <div className="meta">{metaParts.join(' · ')}</div>}
      </div>
      {overdue && <span className="chip warn">Overdue</span>}
      <button className="iconbtn" aria-label={`Edit ${p.name}`} onClick={onEdit}>
        <Icons.edit />
      </button>
    </div>
  )
}

function PersonSheet({ person, onClose }: { person: Person | null; onClose: () => void }) {
  const data = useData()
  // Re-read the live person so the gift-idea ledger updates as entries are
  // added/removed, instead of freezing at whatever `person` was on open.
  const live = person ? (data.people.find((x) => x.id === person.id) ?? person) : null

  const [name, setName] = useState(person?.name ?? '')
  const [birthday, setBirthday] = useState(person?.birthday ?? '')
  const [lastContact, setLastContact] = useState(person?.lastContact ?? '')
  const [contactEvery, setContactEvery] = useState(String(person?.contactEvery ?? ''))
  const [notes, setNotes] = useState(person?.notes ?? '')
  const [ideaText, setIdeaText] = useState('')
  const [ideaPrice, setIdeaPrice] = useState('')

  const save = () => {
    if (!name.trim()) return
    const patch = {
      name: name.trim(),
      birthday: birthday.trim() || undefined,
      lastContact: lastContact || undefined,
      contactEvery: Number(contactEvery) || undefined,
      notes: notes.trim() || undefined,
    }
    store.update((d) => {
      if (person) {
        const t = d.people.find((x) => x.id === person.id)
        if (t) Object.assign(t, patch)
      } else {
        d.people.push({ id: uid(), giftIdeas: [], ...patch })
      }
    })
    onClose()
  }

  const addIdea = () => {
    const idea = ideaText.trim()
    if (!person || !idea) return
    store.update((d) => {
      const p = d.people.find((x) => x.id === person.id)
      if (p) p.giftIdeas.push({ id: uid(), idea, price: Number(ideaPrice) || undefined, addedAt: todayKey() })
    })
    setIdeaText('')
    setIdeaPrice('')
  }

  const removeIdea = (id: string) => {
    if (!person) return
    store.update((d) => {
      const p = d.people.find((x) => x.id === person.id)
      if (p) p.giftIdeas = p.giftIdeas.filter((g) => g.id !== id)
    })
  }

  return (
    <Sheet
      title={person ? 'Edit person' : 'New person'}
      onClose={onClose}
      onSubmit={save}
      onDelete={person ? () => { store.remove(person.name, (d) => { d.people = d.people.filter((x) => x.id !== person.id) }); onClose() } : undefined}
    >
      <Field label="Name">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="formgrid">
        <Field label="Birthday" wide>
          <input type="text" value={birthday} onChange={(e) => setBirthday(e.target.value)} placeholder="MM-DD or YYYY-MM-DD" />
        </Field>
        <Field label="Contact every (days)" wide>
          <input type="text" inputMode="numeric" value={contactEvery} onChange={(e) => setContactEvery(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
      <Field label="Last contact">
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="date" value={lastContact} onChange={(e) => setLastContact(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
          <button type="button" className="btn sm ghost" onClick={() => setLastContact(todayKey())}>
            Today
          </button>
        </div>
      </Field>
      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {person && (
        <Field label={`Gift ideas · ${live!.giftIdeas.length}`}>
          <div className="rows" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
            {live!.giftIdeas.length === 0 && <Empty>Nothing yet — the one from June you'd otherwise lose by December.</Empty>}
            {live!.giftIdeas.map((g) => (
              <div key={g.id} className="row">
                <div className="grow">
                  <div className="title">{g.idea}</div>
                  {g.price != null && <div className="meta num">{formatMoney(g.price, data.settings.currency)}</div>}
                </div>
                <button type="button" className="iconbtn" aria-label={`Remove idea: ${g.idea}`} onClick={() => removeIdea(g.id)}>
                  <Icons.x size={15} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, paddingTop: 10 }}>
            <input
              type="text"
              value={ideaText}
              onChange={(e) => setIdeaText(e.target.value)}
              placeholder="A gift idea"
              aria-label="Gift idea"
              style={{ flex: 2, minWidth: 0 }}
            />
            <input
              type="text"
              inputMode="decimal"
              value={ideaPrice}
              onChange={(e) => setIdeaPrice(e.target.value)}
              placeholder="$"
              aria-label="Gift price"
              style={{ flex: 1, minWidth: 0 }}
            />
            <button className="btn primary" onClick={addIdea} type="button">
              Add
            </button>
          </div>
        </Field>
      )}
    </Sheet>
  )
}
