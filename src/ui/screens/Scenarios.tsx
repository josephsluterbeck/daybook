import { useMemo, useState } from 'react'
import { store, uid, useData } from '../../core/store'
import type { Bill, Goal, Income, Scenario } from '../../core/types'
import { buildPlan, formatMoney, type Plan } from '../../core/budget'
import {
  addBill,
  addEnvelope,
  addGoal,
  addIncome,
  addScenario,
  commitScenario,
  comparePlans,
  isStale,
  planFor,
  removeBill,
  removeEnvelope,
  removeGoal,
  removeIncome,
  removeScenario,
  scenarioAge,
  scenarioFrom,
  updateBill,
  updateEnvelope,
  updateGoal,
  updateIncome,
} from '../../core/scenario'
import { Empty, Field, Icons, Panel, Sheet } from '../components/kit'

const PLAN_LABEL: Partial<Record<keyof Plan, string>> = {
  income: 'Income',
  bills: 'Bills',
  envelopes: 'Envelopes',
  goals: 'Goals',
  unallocated: 'Unassigned',
  perDay: 'Per day',
}
const PLAN_ORDER: (keyof Plan)[] = ['income', 'bills', 'envelopes', 'goals', 'unallocated', 'perDay']

/**
 * #39: a safe place to think — "what if rent were $1,400?" — without editing
 * the real budget and having to remember to change it back. Only the plan-
 * shaping arrays are copied (see core/scenario.ts); editing here never
 * touches the live incomes/bills/envelopes/goals until an explicit Apply.
 */
export default function Scenarios() {
  const data = useData()
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')

  const scenario = data.scenarios.find((s) => s.id === selected)

  const create = () => {
    store.update((d) => addScenario(d, scenarioFrom(d, newLabel)))
    setNewLabel('')
    setCreating(false)
  }

  if (scenario) return <ScenarioEditor scenario={scenario} onExit={() => setSelected(null)} />

  return (
    <>
      <Panel
        title={`Scenarios · ${data.scenarios.length}`}
        action={
          <button type="button" className="btn sm" onClick={() => setCreating(true)}>
            <Icons.plus size={14} /> New from current plan
          </button>
        }
      >
        <div className="rows">
          {data.scenarios.length === 0 && (
            <Empty>A copy of your incomes, bills, envelopes and goals you can freely break — nothing here touches your real plan until you say so.</Empty>
          )}
          {[...data.scenarios].reverse().map((s) => {
            const age = scenarioAge(s)
            const stale = isStale(s)
            return (
              <div key={s.id} className="row" style={{ cursor: 'pointer' }} onClick={() => setSelected(s.id)}>
                <div className="grow">
                  <div className="title">{s.label}</div>
                  <div className="meta">
                    {age === 0 ? 'Created today' : `${age} day${age === 1 ? '' : 's'} old`}
                    {stale && ' · your real plan has likely moved on'}
                  </div>
                </div>
                {stale && <span className="chip warn">Stale</span>}
                <button
                  type="button"
                  className="iconbtn"
                  aria-label={`Delete scenario ${s.label}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    store.remove(s.label, (d) => removeScenario(d, s.id))
                  }}
                >
                  <Icons.trash />
                </button>
              </div>
            )
          })}
        </div>
      </Panel>

      {creating && (
        <Sheet title="New scenario" onClose={() => setCreating(false)} onSubmit={create} submitLabel="Create">
          <Field label="Label">
            <input
              type="text"
              autoFocus
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Cheaper apartment"
            />
          </Field>
          <p className="fieldnote">Clones your current incomes, bills, envelopes and goals — not your expense history.</p>
        </Sheet>
      )}
    </>
  )
}

function ScenarioEditor({ scenario, onExit }: { scenario: Scenario; onExit: () => void }) {
  const data = useData()
  const money = (n: number) => formatMoney(n, data.settings.currency)
  const [confirming, setConfirming] = useState(false)

  // Re-read the live scenario each render (data.scenarios, not the stale
  // prop) so edits below show up immediately.
  const live = data.scenarios.find((s) => s.id === scenario.id) ?? scenario

  const realPlan = useMemo(() => buildPlan(data), [data])
  const scenarioPlan = useMemo(() => planFor(live), [live])
  const deltas = useMemo(() => comparePlans(realPlan, scenarioPlan), [realPlan, scenarioPlan])

  const discard = () => store.update((d) => removeScenario(d, live.id))
  const apply = () => {
    store.update((d) => commitScenario(d, live.id))
    store.notice(`Applied "${live.label}" to your real plan`)
    onExit()
  }

  return (
    <>
      {/* Visually unmistakable sandbox banner (#39's own "Careful") — editing
          the real budget thinking you were in here is the failure mode. */}
      <div className="notice" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' }}>
        <span>
          <strong>Scenario:</strong> {live.label}
        </span>
        <span className="spacer" style={{ display: 'flex', gap: 8 }}>
          <button className="btn sm ghost" onClick={onExit}>Back to list</button>
        </span>
      </div>

      <Panel title="Real vs. scenario">
        <div className="rows">
          {PLAN_ORDER.map((key) => {
            const d = deltas.find((x) => x.key === key)
            if (!d) return null
            const signed = d.delta === 0 ? 'even' : d.delta > 0 ? 'more' : 'less'
            return (
              <div key={key} className="row">
                <div className="grow title">{PLAN_LABEL[key]}</div>
                <span className="meta num" style={{ marginRight: 8 }}>{money(d.from)} → {money(d.to)}</span>
                <span
                  className="num"
                  style={{ color: signed === 'even' ? undefined : signed === 'more' ? 'var(--over)' : 'var(--good)', minWidth: 70, textAlign: 'right' }}
                >
                  {d.delta >= 0 ? '+' : '−'}{money(Math.abs(d.delta))}
                </span>
              </div>
            )
          })}
        </div>
      </Panel>

      <EntityPanel
        title="Incomes"
        items={live.data.incomes}
        renderMeta={(i: Income) => i.cadence}
        onAdd={(label, amount) => store.update((d) => addIncome(d, live.id, { id: uid(), label, amount, cadence: 'monthly' }))}
        onAmount={(id, amount) => store.update((d) => updateIncome(d, live.id, id, { amount }))}
        onRemove={(id) => store.update((d) => removeIncome(d, live.id, id))}
        money={money}
      />

      <EntityPanel
        title="Bills"
        items={live.data.bills}
        renderMeta={(b: Bill) => b.cadence}
        onAdd={(label, amount) => store.update((d) => addBill(d, live.id, { id: uid(), label, amount, dueDay: 1, cadence: 'monthly', autopay: false, paid: [] }))}
        onAmount={(id, amount) => store.update((d) => updateBill(d, live.id, id, { amount }))}
        onRemove={(id) => store.update((d) => removeBill(d, live.id, id))}
        money={money}
      />

      <EntityPanel
        title="Envelopes"
        items={live.data.envelopes}
        renderMeta={() => 'per month'}
        amountKey="monthly"
        onAdd={(label, amount) => store.update((d) => addEnvelope(d, live.id, { id: uid(), label, monthly: amount }))}
        onAmount={(id, amount) => store.update((d) => updateEnvelope(d, live.id, id, { monthly: amount }))}
        onRemove={(id) => store.update((d) => removeEnvelope(d, live.id, id))}
        money={money}
      />

      <EntityPanel
        title="Goals"
        items={live.data.goals}
        renderMeta={(g: Goal) => `${g.kind} · ${money(g.target)} target`}
        amountKey="monthly"
        onAdd={(label, amount) => store.update((d) => addGoal(d, live.id, { id: uid(), label, kind: 'save', target: amount * 12, monthly: amount, contributions: [], recurring: [] }))}
        onAmount={(id, amount) => store.update((d) => updateGoal(d, live.id, id, { monthly: amount }))}
        onRemove={(id) => store.update((d) => removeGoal(d, live.id, id))}
        money={money}
      />

      <div style={{ display: 'flex', gap: 8, padding: '4px 14px 14px' }}>
        <button type="button" className="btn danger" onClick={() => { discard(); onExit() }}>
          Discard
        </button>
        <button type="button" className="btn primary" onClick={() => setConfirming(true)} style={{ marginLeft: 'auto' }}>
          Apply to my real plan
        </button>
      </div>

      {confirming && (
        <Sheet title="Apply this scenario?" onClose={() => setConfirming(false)} onSubmit={apply} submitLabel="Apply">
          <p className="fieldnote">
            This replaces your real incomes, bills, envelopes and goals with "{live.label}"'s versions — {live.data.incomes.length} income
            {live.data.incomes.length === 1 ? '' : 's'}, {live.data.bills.length} bill{live.data.bills.length === 1 ? '' : 's'},{' '}
            {live.data.envelopes.length} envelope{live.data.envelopes.length === 1 ? '' : 's'}, {live.data.goals.length} goal
            {live.data.goals.length === 1 ? '' : 's'}. You can undo right after from the toast that appears.
          </p>
        </Sheet>
      )}
    </>
  )
}

interface EntityWithAmount {
  id: string
  label: string
  amount?: number
  monthly?: number
}

function EntityPanel<T extends EntityWithAmount>({
  title,
  items,
  renderMeta,
  amountKey = 'amount',
  onAdd,
  onAmount,
  onRemove,
  money,
}: {
  title: string
  items: T[]
  renderMeta: (item: T) => string
  amountKey?: 'amount' | 'monthly'
  onAdd: (label: string, amount: number) => void
  onAmount: (id: string, amount: number) => void
  onRemove: (id: string) => void
  money: (n: number) => string
}) {
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')

  const add = () => {
    const amt = Number(amount)
    if (!label.trim() || !Number.isFinite(amt) || amt <= 0) return
    onAdd(label.trim(), amt)
    setLabel('')
    setAmount('')
  }

  return (
    <Panel title={title}>
      <div className="rows">
        {items.length === 0 && <Empty>None in this scenario.</Empty>}
        {items.map((item) => (
          <div key={item.id} className="row">
            <div className="grow">
              <div className="title">{item.label}</div>
              <div className="meta">{renderMeta(item)}</div>
            </div>
            <input
              type="text"
              inputMode="decimal"
              style={{ maxWidth: 90, textAlign: 'right' }}
              defaultValue={String(item[amountKey] ?? '')}
              onBlur={(e) => {
                const v = Number(e.target.value)
                if (Number.isFinite(v) && v >= 0) onAmount(item.id, v)
              }}
              aria-label={`${item.label} amount`}
            />
            <button type="button" className="iconbtn" aria-label={`Remove ${item.label}`} onClick={() => onRemove(item.id)}>
              <Icons.x size={15} />
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '0 14px 14px' }}>
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" style={{ flex: 1, minWidth: 0 }} />
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="0.00"
          style={{ width: 90 }}
        />
        <button type="button" className="btn sm ghost" onClick={add}>
          Add
        </button>
      </div>
    </Panel>
  )
}
