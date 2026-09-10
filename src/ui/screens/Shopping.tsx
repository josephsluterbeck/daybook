import { useMemo, useState } from 'react'
import { store, uid, useData } from '../../core/store'
import type { ShopItem } from '../../core/types'
import { checkout } from '../../core/shopping'
import { todayKey } from '../../core/dates'
import { Empty, Field, Icons, Panel, Sheet, useHighlightRow } from '../components/kit'

/**
 * Fast and dumb on purpose (per the roadmap's own "Careful"): an add field,
 * checkable rows grouped by aisle, and one payoff button. No price tracking,
 * no per-item cost — the moment this needs more than a name, that's Notes.
 */
export default function Shopping() {
  const data = useData()
  const [label, setLabel] = useState('')
  const [editing, setEditing] = useState<ShopItem | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)

  const groups = useMemo(() => {
    const byAisle = new Map<string, ShopItem[]>()
    for (const item of data.shopping) {
      const key = item.aisle || 'Unsorted'
      const list = byAisle.get(key) ?? []
      list.push(item)
      byAisle.set(key, list)
    }
    // Unchecked first within an aisle — what's still needed should read before what's already in the basket.
    for (const list of byAisle.values()) list.sort((a, b) => Number(a.done) - Number(b.done))
    const keys = [...byAisle.keys()].sort((a, b) => (a === 'Unsorted' ? 1 : b === 'Unsorted' ? -1 : a.localeCompare(b)))
    return keys.map((aisle) => ({ aisle, items: byAisle.get(aisle)! }))
  }, [data.shopping])

  const uncheckedCount = data.shopping.filter((i) => !i.done).length

  const quickAdd = () => {
    const t = label.trim()
    if (!t) return
    store.update((d) => {
      d.shopping.push({ id: uid(), label: t, done: false, recurring: false, addedAt: todayKey() })
    })
    setLabel('')
  }

  const toggle = (id: string) =>
    store.update((d) => {
      const item = d.shopping.find((x) => x.id === id)
      if (item) item.done = !item.done
    })

  return (
    <>
      <Panel
        title={`Shopping · ${uncheckedCount} left`}
        action={
          data.shopping.length > 0 ? (
            <button className="btn sm" onClick={() => setCheckingOut(true)}>
              Done shopping
            </button>
          ) : undefined
        }
      >
        <div className="quickadd">
          <input
            type="text"
            value={label}
            placeholder="Add an item…"
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
            aria-label="Shopping item"
          />
          <button className="btn primary" type="button" onClick={quickAdd}>
            Add
          </button>
        </div>
        {data.shopping.length === 0 && <Empty>Nothing on the list.</Empty>}
        {groups.map((g) => (
          <div key={g.aisle}>
            <div className="section-label" style={{ padding: '10px 14px 4px' }}>{g.aisle}</div>
            <div className="rows">
              {g.items.map((item) => (
                <ShopRow key={item.id} item={item} onToggle={() => toggle(item.id)} onEdit={() => setEditing(item)} />
              ))}
            </div>
          </div>
        ))}
      </Panel>

      {editing && <ShopItemSheet item={editing} onClose={() => setEditing(null)} />}
      {checkingOut && <CheckoutSheet onClose={() => setCheckingOut(false)} />}
    </>
  )
}

/** The whole row toggles done, not just the checkbox — one-handed, holding a basket, is the actual use case. */
function ShopRow({ item, onToggle, onEdit }: { item: ShopItem; onToggle: () => void; onEdit: () => void }) {
  const { ref, highlighted } = useHighlightRow<HTMLDivElement>(item.id)
  return (
    <div ref={ref} className={`row${item.done ? ' done' : ''}${highlighted ? ' highlight' : ''}`}>
      <input
        type="checkbox"
        className="check"
        checked={item.done}
        onChange={onToggle}
        aria-label={`${item.done ? 'Uncheck' : 'Check off'} ${item.label}`}
      />
      <button type="button" className="grow" style={{ textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={onToggle}>
        <div className="title">
          {item.label}
          {item.qty && <span className="meta num"> · {item.qty}</span>}
        </div>
        {item.recurring && <div className="meta">Recurring</div>}
      </button>
      <button className="iconbtn" aria-label={`Edit ${item.label}`} onClick={onEdit}>
        <Icons.edit />
      </button>
    </div>
  )
}

function ShopItemSheet({ item, onClose }: { item: ShopItem; onClose: () => void }) {
  const [label, setLabel] = useState(item.label)
  const [qty, setQty] = useState(item.qty ?? '')
  const [aisle, setAisle] = useState(item.aisle ?? '')
  const [recurring, setRecurring] = useState(item.recurring)

  const save = () => {
    if (!label.trim()) return
    store.update((d) => {
      const t = d.shopping.find((x) => x.id === item.id)
      if (t) Object.assign(t, { label: label.trim(), qty: qty.trim() || undefined, aisle: aisle.trim() || undefined, recurring })
    })
    onClose()
  }

  return (
    <Sheet
      title="Edit item"
      onClose={onClose}
      onSubmit={save}
      onDelete={() => { store.remove(item.label, (d) => { d.shopping = d.shopping.filter((x) => x.id !== item.id) }); onClose() }}
    >
      <Field label="Item">
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <div className="formgrid">
        <Field label="Quantity">
          <input type="text" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="2 lb, a bunch…" />
        </Field>
        <Field label="Aisle">
          <input type="text" value={aisle} onChange={(e) => setAisle(e.target.value)} placeholder="Dairy" />
        </Field>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14 }}>
        <input type="checkbox" className="check" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
        Recurring — comes back after checkout
      </label>
    </Sheet>
  )
}

/** The payoff: logs the total against an envelope, clears checked non-recurring items, un-checks the recurring ones. */
function CheckoutSheet({ onClose }: { onClose: () => void }) {
  const data = useData()
  const [total, setTotal] = useState('')
  const [envelopeId, setEnvelopeId] = useState(data.settings.lastExpenseEnvelopeId ?? data.envelopes[0]?.id ?? '')
  const checkedCount = data.shopping.filter((i) => i.done).length

  const submit = () => {
    const amt = Number(total) || 0
    store.update((d) => {
      checkout(d, amt, envelopeId || undefined, todayKey())
      if (amt > 0) d.settings.lastExpenseEnvelopeId = envelopeId || undefined
    })
    onClose()
  }

  return (
    <Sheet title="Done shopping" onClose={onClose} onSubmit={submit} submitLabel="Checkout">
      <Field label="Total spent">
        <input type="text" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="0.00" />
      </Field>
      <Field label="Envelope">
        <select value={envelopeId} onChange={(e) => setEnvelopeId(e.target.value)}>
          <option value="">Unassigned</option>
          {data.envelopes.map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </select>
      </Field>
      <p className="fieldnote">
        {checkedCount} checked item{checkedCount === 1 ? '' : 's'} will clear — recurring ones come right back for next time.
      </p>
    </Sheet>
  )
}
