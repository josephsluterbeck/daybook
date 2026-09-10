import { useMemo, useState } from 'react'
import { store, uid, useData } from '../core/store'
import { effectiveEnvelopeBudget, formatMoney, goalContributedInMonth, spentByEnvelope } from '../core/budget'
import { envelopeDrift } from '../core/insights'
import { buildMonthClose, commitMonthClose, monthAfter, pendingCloseMonths, unpaidBillsFor } from '../core/monthclose'
import { monthLabel, todayKey } from '../core/dates'
import { Empty, Field, Panel, Sheet } from './components/kit'

/**
 * The drawer's re-open entry point (#40's "it should be possible to close
 * out a month late") — unlike Today's banner, which already knows which
 * month is pending, this has to work out whether there's anything to close
 * at all. Oldest pending month first, same order Today would have offered
 * them in; closing one and reopening the drawer surfaces the next.
 */
export function MonthCloseLauncher({ onClose }: { onClose: () => void }) {
  const data = useData()
  const pending = useMemo(() => pendingCloseMonths(data), [data])
  if (pending.length === 0) {
    return (
      <Sheet title="Month close-out" onClose={onClose} onSubmit={onClose} submitLabel="OK">
        <Empty>All caught up — every past month has been closed out.</Empty>
      </Sheet>
    )
  }
  return <MonthCloseSheet month={pending[0]} onClose={onClose} />
}

const STEP_TITLES = ['What happened', 'Envelopes', 'Unpaid bills', 'Goals', 'Roll over', 'A note']

/**
 * #40's ritual — a guided sequence, one step per screen, reusing the one
 * Sheet component rather than inventing a wizard shell. Every step is
 * skippable (Next without touching anything on that step IS the skip) and
 * the whole thing is dismissible via Sheet's own Cancel/backdrop/Escape —
 * nothing is written to `data.closes` until the final "Close out" commit,
 * so backing out midway leaves no trace.
 */
export default function MonthCloseSheet({ month, onClose }: { month: string; onClose: () => void }) {
  const data = useData()
  const money = (n: number) => formatMoney(n, data.settings.currency)
  const [step, setStep] = useState(0)
  const [note, setNote] = useState('')
  const [goalDrafts, setGoalDrafts] = useState<Record<string, string>>({})

  const spent = useMemo(() => spentByEnvelope(data.expenses, month), [data.expenses, month])
  const drifts = useMemo(() => envelopeDrift(data), [data])
  const unpaidBills = useMemo(() => unpaidBillsFor(data, month), [data.bills, month])
  const activeGoals = useMemo(() => data.goals.filter((g) => !g.archived), [data.goals])
  const rolloverEnvelopes = useMemo(() => data.envelopes.filter((e) => e.rollover), [data.envelopes])
  const preview = useMemo(() => buildMonthClose(data, month), [data, month])

  const adjustEnvelope = (envelopeId: string, amount: number) =>
    store.update((d) => {
      const env = d.envelopes.find((e) => e.id === envelopeId)
      if (env) env.monthly = amount
    })

  const markBillPaid = (billId: string) =>
    store.update((d) => {
      const b = d.bills.find((x) => x.id === billId)
      if (b && !b.paid.includes(month)) b.paid.push(month)
    })

  const logContribution = (goalId: string) => {
    const amt = Number(goalDrafts[goalId])
    if (!Number.isFinite(amt) || amt <= 0) return
    store.update((d) => {
      const g = d.goals.find((x) => x.id === goalId)
      if (g) g.contributions.push({ id: uid(), amount: amt, date: todayKey() })
    })
    setGoalDrafts((d) => ({ ...d, [goalId]: '' }))
  }

  const advance = () => {
    if (step < STEP_TITLES.length - 1) {
      setStep(step + 1)
      return
    }
    store.update((d) => commitMonthClose(d, buildMonthClose(d, month, note.trim() || undefined)))
    onClose()
  }

  return (
    <Sheet
      title={`Close out ${monthLabel(month)} — ${STEP_TITLES[step]}`}
      onClose={onClose}
      onSubmit={advance}
      submitLabel={step < STEP_TITLES.length - 1 ? 'Next' : 'Close out'}
    >
      {step > 0 && (
        <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setStep(step - 1)}>
          Back
        </button>
      )}

      {step === 0 && (
        <Panel title="What happened">
          <div className="rows">
            <div className="row">
              <div className="grow title">Income</div>
              <span className="num">{money(preview.totals.income)}</span>
            </div>
            <div className="row">
              <div className="grow title">Bills</div>
              <span className="num">{money(preview.totals.bills)}</span>
            </div>
            <div className="row">
              <div className="grow title">Spent</div>
              <span className="num">{money(preview.totals.spent)}</span>
            </div>
            <div className="row">
              <div className="grow title">Saved toward goals</div>
              <span className="num">{money(preview.totals.saved)}</span>
            </div>
          </div>
        </Panel>
      )}

      {step === 1 && (
        <Panel title="Over and under">
          <div className="rows">
            {data.envelopes.length === 0 && <Empty>No envelopes to review.</Empty>}
            {data.envelopes.map((e) => {
              const s = spent[e.id] ?? 0
              const budget = effectiveEnvelopeBudget(data, e.id, month)
              const over = s - budget
              const suggestion = drifts.find((d) => d.envelopeId === e.id)
              return (
                <div key={e.id} className="row" style={{ alignItems: 'flex-start' }}>
                  <div className="grow">
                    <div className="title">{e.label}</div>
                    <div className="meta">
                      {money(s)} of {money(budget)}
                      {over > 0.005 ? ` · ${money(over)} over` : over < -0.005 ? ` · ${money(-over)} under` : ' · on budget'}
                    </div>
                  </div>
                  {suggestion && Math.abs(suggestion.pct) >= 15 && (
                    <button type="button" className="btn sm ghost" onClick={() => adjustEnvelope(e.id, suggestion.median)}>
                      Adjust to {money(suggestion.median)} for {monthLabel(monthAfter(month))}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {step === 2 && (
        <Panel title="Still unpaid">
          <div className="rows">
            {unpaidBills.length === 0 && <Empty>Nothing unticked — everything due this month is marked paid.</Empty>}
            {unpaidBills.map((b) => (
              <div key={b.id} className="row">
                <div className="grow">
                  <div className="title">{b.label}</div>
                  <div className="meta">Paid and forgotten to tick, or actually missed?</div>
                </div>
                <button type="button" className="btn sm ghost" onClick={() => markBillPaid(b.id)}>
                  Mark paid
                </button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {step === 3 && (
        <Panel title="Did the planned contributions happen?">
          <div className="rows">
            {activeGoals.length === 0 && <Empty>No active goals.</Empty>}
            {activeGoals.map((g) => {
              const contributed = goalContributedInMonth(g, month)
              const short = g.monthly - contributed
              return (
                <div key={g.id} className="row" style={{ alignItems: 'flex-start' }}>
                  <div className="grow">
                    <div className="title">{g.label}</div>
                    <div className="meta">
                      {money(contributed)} of {money(g.monthly)} planned
                      {short > 0.005 && ` · ${money(short)} short`}
                    </div>
                  </div>
                  {short > 0.005 && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        style={{ width: 90 }}
                        value={goalDrafts[g.id] ?? ''}
                        onChange={(e) => setGoalDrafts((d) => ({ ...d, [g.id]: e.target.value }))}
                        aria-label={`Log a contribution for ${g.label}`}
                      />
                      <button type="button" className="btn sm ghost" onClick={() => logContribution(g.id)}>
                        Log
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {step === 4 && (
        <Panel title="Carrying into next month">
          {/* Rollover is already fully automatic — effectiveEnvelopeBudget
              folds the carried balance in the moment next month starts, no
              stored "applied" flag to flip. This step is informational: a
              chance to see the carry before it's the new normal, not an
              action to take. */}
          <div className="rows">
            {rolloverEnvelopes.length === 0 && <Empty>No envelopes have rollover turned on.</Empty>}
            {rolloverEnvelopes.map((e) => {
              const carry = effectiveEnvelopeBudget(data, e.id, monthAfter(month)) - e.monthly
              return (
                <div key={e.id} className="row">
                  <div className="grow title">{e.label}</div>
                  <span className="num" style={{ color: carry < 0 ? 'var(--over)' : carry > 0 ? 'var(--good)' : undefined }}>
                    {carry >= 0 ? '+' : '−'}{money(Math.abs(carry))}
                  </span>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {step === 5 && (
        <Field label="One line on how the month went">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional — feeds the year in review"
            aria-label="Month note"
          />
        </Field>
      )}
    </Sheet>
  )
}
