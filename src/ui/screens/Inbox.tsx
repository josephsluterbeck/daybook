import { useState } from 'react'
import { store, useData } from '../../core/store'
import type { InboxItem } from '../../core/types'
import { describeParsed, intentFromParsed, type Parsed } from '../../core/parse'
import { applyIntent, describeIntent } from '../../core/intents'
import { prettyDate } from '../../core/dates'
import { Empty, Icons, Panel } from '../components/kit'

const KIND_CYCLE: Parsed['kind'][] = ['expense', 'task', 'note']

/** Re-derives a minimal guess of a different kind from the raw text, for "change type" — not a re-run of the parser, just enough to act on. */
function reinterpret(item: InboxItem, kind: Parsed['kind']): Parsed {
  if (item.guess?.kind === kind) return item.guess
  if (kind === 'note') return { kind: 'note', text: item.text }
  if (kind === 'task') return { kind: 'task', title: item.text }
  const match = item.text.match(/\d+(\.\d{1,2})?/)
  return { kind: 'expense', amount: match ? Number(match[0]) : 0, note: item.text }
}

/**
 * The triage view (#29): capture asks nothing, so the decision happens here
 * instead, in a batch. "Fast enough to clear twenty items in a minute" is
 * the design target — three actions per row, nothing more.
 */
export default function Inbox() {
  const data = useData()
  const [overrides, setOverrides] = useState<Record<string, Parsed['kind']>>({})

  const guessFor = (item: InboxItem): Parsed => {
    const kind = overrides[item.id]
    if (!kind) return item.guess ?? { kind: 'note', text: item.text }
    return reinterpret(item, kind)
  }

  const cycleType = (item: InboxItem) => {
    const current = guessFor(item).kind
    const next = KIND_CYCLE[(KIND_CYCLE.indexOf(current) + 1) % KIND_CYCLE.length]
    setOverrides((o) => ({ ...o, [item.id]: next }))
  }

  const accept = (item: InboxItem) => {
    const intent = intentFromParsed(guessFor(item))
    store.update((d) => {
      applyIntent(d, intent)
      d.inbox = d.inbox.filter((x) => x.id !== item.id)
    })
    store.notice(describeIntent(intent))
    setOverrides((o) => {
      const { [item.id]: _, ...rest } = o
      return rest
    })
  }

  const remove = (item: InboxItem) =>
    store.remove(item.text.length > 40 ? `${item.text.slice(0, 40)}…` : item.text, (d) => {
      d.inbox = d.inbox.filter((x) => x.id !== item.id)
    })

  const items = [...data.inbox].sort((a, b) => a.at.localeCompare(b.at))
  const graveyard = items.length > 20

  return (
    <Panel title={`Inbox · ${items.length}`}>
      {graveyard && (
        <div className="notice" style={{ background: 'var(--warn-soft)', color: 'var(--warn)', borderColor: 'var(--warn)' }}>
          <span>{items.length} items waiting — an inbox that never empties is a graveyard. Worth a pass right now.</span>
        </div>
      )}
      <div className="rows">
        {items.length === 0 && <Empty>Nothing to triage — capture something from Today and it'll show up here.</Empty>}
        {items.map((item) => {
          const parsed = guessFor(item)
          return (
            <div key={item.id} className="row" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="title">{item.text}</div>
                <div className="meta">
                  {describeParsed(parsed, data.settings.currency)} · {prettyDate(item.at.slice(0, 10))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button className="btn sm primary" type="button" onClick={() => accept(item)}>
                  Accept
                </button>
                <button className="btn sm ghost" type="button" onClick={() => cycleType(item)}>
                  Change type
                </button>
              </div>
              <button className="iconbtn" aria-label={`Delete "${item.text}"`} onClick={() => remove(item)}>
                <Icons.trash />
              </button>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
