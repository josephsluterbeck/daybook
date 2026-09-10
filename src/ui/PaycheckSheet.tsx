import { useMemo, useState } from 'react'
import { store, uid, useData } from '../core/store'
import { fundingGap, formatMoney, type FundingNeed } from '../core/budget'
import type { Income } from '../core/types'
import { Empty, Panel, Sheet } from './components/kit'

/** Days until the next paycheck, when no other income can pin down an exact date. */
export const FALLBACK_PAY_WINDOW: Record<Income['cadence'], number> = { weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30 }

const key = (n: FundingNeed) => `${n.targetKind}:${n.targetId}`

/**
 * "Your paycheck landed. $1,450 to assign." A second, execution-level ledger
 * sitting beside the monthly plan (buildPlan) rather than replacing it — this
 * only records which paycheck covered what. The monthly numbers on the Money
 * screen don't change no matter what happens in here.
 */
export default function PaycheckSheet({
  income,
  paycheckDate,
  until,
  onClose,
}: {
  income: Income
  paycheckDate: string
  until: string
  onClose: () => void
}) {
  const data = useData()
  const money = (n: number) => formatMoney(n, data.settings.currency)

  const needs = useMemo(() => fundingGap(data, until), [data, until])

  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    let remaining = income.amount
    const initial: Record<string, string> = {}
    for (const n of needs) {
      const suggested = Math.min(n.needed, Math.max(0, remaining))
      initial[key(n)] = suggested > 0.005 ? suggested.toFixed(2) : ''
      remaining -= suggested
    }
    return initial
  })

  const assigned = needs.reduce((s, n) => s + (Number(amounts[key(n)]) || 0), 0)
  const left = income.amount - assigned
  const tone = left < -0.005 ? 'over' : Math.abs(left) < 0.005 ? 'good' : 'warn'

  const submit = () => {
    store.update((d) => {
      for (const n of needs) {
        const amt = Number(amounts[key(n)])
        if (Number.isFinite(amt) && amt > 0.005) {
          d.allocations.push({ id: uid(), paycheckDate, targetKind: n.targetKind, targetId: n.targetId, amount: amt })
        }
      }
    })
    onClose()
  }

  const KIND_NOUN: Record<FundingNeed['targetKind'], string> = { bill: 'Bill', envelope: 'Envelope', goal: 'Goal' }

  return (
    <Sheet title={`${income.label} landed`} onClose={onClose} onSubmit={submit} submitLabel="Assign">
      <div className="hero" style={{ padding: '4px 0 14px' }}>
        <div className="figure" style={{ fontSize: 30, color: `var(--${tone})` }}>{money(Math.max(0, left))}</div>
        <p className="caption">
          {left < -0.005
            ? `${money(-left)} more assigned than this paycheck brought in.`
            : left < 0.005
              ? 'Fully assigned.'
              : 'still to assign, of ' + money(income.amount) + '.'}
        </p>
      </div>

      <Panel title={`Due before the next paycheck (${until})`}>
        <div className="rows">
          {needs.length === 0 && <Empty>Nothing unfunded before then — everything's already covered.</Empty>}
          {needs.map((n) => (
            <div key={key(n)} className="row">
              <div className="grow">
                <div className="title">{n.label}</div>
                <div className="meta">
                  {KIND_NOUN[n.targetKind]} · needs {money(n.needed)}
                </div>
              </div>
              <input
                type="text"
                inputMode="decimal"
                style={{ maxWidth: 100, textAlign: 'right' }}
                value={amounts[key(n)] ?? ''}
                placeholder="0.00"
                onChange={(e) => setAmounts((a) => ({ ...a, [key(n)]: e.target.value }))}
                aria-label={`Assign to ${n.label}`}
              />
            </div>
          ))}
        </div>
      </Panel>

      <p className="fieldnote">
        This records which paycheck covered what — it doesn't change your monthly plan on the Money tab, which stays
        the source of truth either way.
      </p>
    </Sheet>
  )
}
