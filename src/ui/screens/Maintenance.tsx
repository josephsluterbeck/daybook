import { useMemo, useState } from 'react'
import { store, uid, useData } from '../../core/store'
import type { MaintenanceItem } from '../../core/types'
import { dueMaintenance, maintenanceMonthlyCost, type DueMaintenance } from '../../core/maintenance'
import { formatMoney } from '../../core/budget'
import { todayKey } from '../../core/dates'
import { Empty, Field, Icons, Panel, Segmented, Sheet, useHighlightRow } from '../components/kit'

const SCOPE_LABEL: Record<MaintenanceItem['scope'], string> = { car: 'Car', home: 'Home', tech: 'Tech', other: 'Other' }
const SCOPE_ORDER: MaintenanceItem['scope'][] = ['car', 'home', 'tech', 'other']

type Fmt = (n: number) => string

/**
 * Silent most days, on purpose — the list here shows everything regardless
 * of urgency (this is the editing view), but Today's own panel only shows
 * up when something's actually due (see Today.tsx).
 */
export default function Maintenance() {
  const data = useData()
  const [editing, setEditing] = useState<MaintenanceItem | 'new' | null>(null)
  const [odometer, setOdometer] = useState(String(data.settings.odometer ?? ''))
  const money = (n: number) => formatMoney(n, data.settings.currency)

  const due = useMemo(() => dueMaintenance(data.maintenance, data.settings.odometer), [data.maintenance, data.settings.odometer])
  const dueById = useMemo(() => new Map(due.map((d) => [d.item.id, d])), [due])

  const grouped = useMemo(() => {
    const out: Record<MaintenanceItem['scope'], MaintenanceItem[]> = { car: [], home: [], tech: [], other: [] }
    for (const item of data.maintenance) out[item.scope].push(item)
    for (const list of Object.values(out)) list.sort((a, b) => Number(dueById.get(b.id)?.urgent) - Number(dueById.get(a.id)?.urgent))
    return out
  }, [data.maintenance, dueById])

  const saveOdometer = (v: string) => {
    setOdometer(v)
    const n = Number(v)
    store.update((d) => {
      d.settings.odometer = Number.isFinite(n) && n > 0 ? n : undefined
    })
  }

  const markDone = (id: string) =>
    store.update((d) => {
      const item = d.maintenance.find((x) => x.id === id)
      if (item) item.lastDone = todayKey()
    })

  const hasMileageItems = data.maintenance.some((m) => m.everyMiles)

  return (
    <>
      {hasMileageItems && (
        <Panel title="Odometer">
          <div style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="text"
              inputMode="numeric"
              value={odometer}
              onChange={(e) => saveOdometer(e.target.value)}
              placeholder="Current mileage"
              aria-label="Current odometer"
              style={{ maxWidth: 140 }}
            />
            <span className="meta">miles — powers the mileage-based items below</span>
          </div>
        </Panel>
      )}

      <Panel
        title="Maintenance"
        action={
          <button className="btn sm" onClick={() => setEditing('new')}>
            <Icons.plus size={14} /> Add
          </button>
        }
      >
        {data.maintenance.length === 0 && (
          <Empty>Oil changes, filters, registration, warranty expiries — the stuff a to-do list handles badly.</Empty>
        )}
      </Panel>

      {SCOPE_ORDER.map((scope) => {
        const list = grouped[scope]
        if (list.length === 0) return null
        return (
          <Panel key={scope} title={`${SCOPE_LABEL[scope]} · ${list.length}`}>
            <div className="rows">
              {list.map((item) => (
                <MaintenanceRow
                  key={item.id}
                  item={item}
                  due={dueById.get(item.id)}
                  money={money}
                  onDone={() => markDone(item.id)}
                  onEdit={() => setEditing(item)}
                />
              ))}
            </div>
          </Panel>
        )
      })}

      {editing && <MaintenanceSheet item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function MaintenanceRow({
  item,
  due,
  money,
  onDone,
  onEdit,
}: {
  item: MaintenanceItem
  due?: DueMaintenance
  money: Fmt
  onDone: () => void
  onEdit: () => void
}) {
  const { ref, highlighted } = useHighlightRow<HTMLDivElement>(item.id)
  const monthlyCost = maintenanceMonthlyCost(item)
  return (
    <div ref={ref} className={`row${highlighted ? ' highlight' : ''}`}>
      <div className="grow">
        <div className="title">{item.label}</div>
        <div className="meta">
          {due?.dueIn ?? 'No cadence set'}
          {monthlyCost != null && ` · ~${money(monthlyCost)}/mo`}
        </div>
      </div>
      {due?.urgent && <span className="chip warn">Due</span>}
      <button className="btn sm ghost" type="button" onClick={onDone}>
        Done
      </button>
      <button className="iconbtn" aria-label={`Edit ${item.label}`} onClick={onEdit}>
        <Icons.edit />
      </button>
    </div>
  )
}

function MaintenanceSheet({ item, onClose }: { item: MaintenanceItem | null; onClose: () => void }) {
  const [label, setLabel] = useState(item?.label ?? '')
  const [scope, setScope] = useState<MaintenanceItem['scope']>(item?.scope ?? 'car')
  const [everyDays, setEveryDays] = useState(String(item?.everyDays ?? ''))
  const [everyMiles, setEveryMiles] = useState(String(item?.everyMiles ?? ''))
  const [lastDone, setLastDone] = useState(item?.lastDone ?? '')
  const [lastOdometer, setLastOdometer] = useState(String(item?.lastOdometer ?? ''))
  const [cost, setCost] = useState(String(item?.cost ?? ''))
  const [notes, setNotes] = useState(item?.notes ?? '')

  const save = () => {
    if (!label.trim()) return
    // Mileage fields are car-only in the form above — clearing them here too
    // means switching scope away from Car doesn't silently leave stale
    // odometer data behind on an item that no longer shows it.
    const isCar = scope === 'car'
    const patch = {
      label: label.trim(),
      scope,
      everyDays: Number(everyDays) || undefined,
      everyMiles: isCar ? Number(everyMiles) || undefined : undefined,
      lastDone: lastDone || undefined,
      lastOdometer: isCar ? Number(lastOdometer) || undefined : undefined,
      cost: Number(cost) || undefined,
      notes: notes.trim() || undefined,
    }
    store.update((d) => {
      if (item) {
        const t = d.maintenance.find((x) => x.id === item.id)
        if (t) Object.assign(t, patch)
      } else {
        d.maintenance.push({ id: uid(), ...patch })
      }
    })
    onClose()
  }

  return (
    <Sheet
      title={item ? 'Edit item' : 'New item'}
      onClose={onClose}
      onSubmit={save}
      onDelete={item ? () => { store.remove(item.label, (d) => { d.maintenance = d.maintenance.filter((x) => x.id !== item.id) }); onClose() } : undefined}
    >
      <Field label="Label">
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Oil change" />
      </Field>
      <Field label="Scope">
        <Segmented<MaintenanceItem['scope']>
          value={scope}
          onChange={setScope}
          options={[
            { value: 'car', label: 'Car' },
            { value: 'home', label: 'Home' },
            { value: 'tech', label: 'Tech' },
            { value: 'other', label: 'Other' },
          ]}
        />
      </Field>
      <div className="formgrid">
        <Field label="Every (days)">
          <input type="text" inputMode="numeric" value={everyDays} onChange={(e) => setEveryDays(e.target.value)} placeholder="180" />
        </Field>
        {/* Mileage-based cadence only makes sense for a car — a home/tech/
            other item has no odometer, so these two fields are car-only. */}
        {scope === 'car' && (
          <Field label="Every (miles)">
            <input type="text" inputMode="numeric" value={everyMiles} onChange={(e) => setEveryMiles(e.target.value)} placeholder="5000" />
          </Field>
        )}
        {/* Own row, not paired with the field next to it — a date input's
            intrinsic width on iOS Safari can exceed a formgrid column's,
            overlapping whatever's beside it. */}
        <Field label="Last done" wide>
          <input type="date" value={lastDone} onChange={(e) => setLastDone(e.target.value)} />
        </Field>
        {scope === 'car' && (
          <Field label="Mileage at last service">
            <input type="text" inputMode="numeric" value={lastOdometer} onChange={(e) => setLastOdometer(e.target.value)} />
          </Field>
        )}
        <Field label="Cost">
          <input type="text" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="60" />
        </Field>
        <Field label="Notes" wide>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  )
}
