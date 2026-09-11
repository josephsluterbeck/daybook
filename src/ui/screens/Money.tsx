import { useEffect, useMemo, useRef, useState } from 'react'
import { store, uid, useData, useHighlight } from '../../core/store'
import type { Bill, BillCadence, Cadence, Debt, Envelope, Expense, Goal, Income, RecurringContribution } from '../../core/types'
import { lowPoint, project } from '../../core/cashflow'
import { order, payoffDate, totalInterest } from '../../core/debt'
import {
  billMonthlyCost,
  billsForMonths,
  buildPlan,
  canIAfford,
  dueContribution,
  envelopeHistory,
  expenseTotal,
  formatMoney,
  goalProgress,
  goalSaved,
  investMonthlyProgress,
  isBillDueInMonth,
  monthlyFrom,
  nextPaydayFor,
  monthsToGoal,
  recurringMonthlyTotal,
  requiredMonthlyToGoal,
  rolloverBalance,
  sinkingBalance,
  spentByEnvelope,
  upcomingBills,
} from '../../core/budget'
import { envelopeDrift } from '../../core/insights'
import { addMonthsToKey, daysAway, firstOfMonth, monthKey, monthLabel, prettyDate, relativeDay, todayKey } from '../../core/dates'
import { ColorPicker, Empty, Field, Icons, IconPicker, Meter, Panel, Segmented, Sheet, Sparkline, useCountUp, useHighlightRow } from '../components/kit'

type Tab = 'plan' | 'bills' | 'spending' | 'goals' | 'debt'

export default function Money() {
  const data = useData()
  const [tab, setTab] = useState<Tab>('plan')
  // One month, shared across Plan/Bills/Spending — Goals isn't month-scoped
  // (a goal spans its whole life, not one month), so it doesn't take this.
  const [mk, setMk] = useState(monthKey())
  const money = (n: number) => formatMoney(n, data.settings.currency)
  const isCurrentMonth = mk === monthKey()

  // A search jump (#18) landing on an expense has to land on Spending *and*
  // that expense's own month, or the row it's after was never rendered.
  const highlight = useHighlight()
  useEffect(() => {
    if (!highlight) return
    const exp = data.expenses.find((e) => e.id === highlight)
    if (exp) {
      setTab('spending')
      setMk(exp.date.slice(0, 7))
    }
  }, [highlight, data.expenses])

  return (
    <>
      <div className="monthnav">
        <button className="iconbtn flip" aria-label="Previous month" onClick={() => setMk((m) => addMonthsToKey(m, -1))}>
          <Icons.chevron />
        </button>
        <span className="monthnav-label">{monthLabel(mk)}</span>
        <button
          className="iconbtn"
          aria-label="Next month"
          disabled={isCurrentMonth}
          onClick={() => setMk((m) => addMonthsToKey(m, 1))}
        >
          <Icons.chevron />
        </button>
      </div>

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'plan', label: 'Plan' },
          { value: 'bills', label: 'Bills' },
          { value: 'spending', label: 'Spending' },
          { value: 'goals', label: 'Goals' },
          { value: 'debt', label: 'Debt' },
        ]}
      />
      {tab === 'plan' && <PlanTab money={money} mk={mk} />}
      {tab === 'bills' && <BillsTab money={money} mk={mk} />}
      {tab === 'spending' && <SpendingTab money={money} mk={mk} />}
      {tab === 'goals' && <GoalsTab money={money} />}
      {tab === 'debt' && <DebtTab money={money} />}
    </>
  )
}

type Fmt = (n: number) => string

/* ══ Plan ════════════════════════════════════════════════════════════════ */

function PlanTab({ money, mk }: { money: Fmt; mk: string }) {
  const data = useData()
  const plan = useMemo(() => buildPlan(data, mk), [data, mk])
  const [editing, setEditing] = useState<Income | 'new' | null>(null)
  const isCurrentMonth = mk === monthKey()

  const tone = plan.unallocated < 0 ? 'over' : plan.unallocated < plan.income * 0.05 ? 'warn' : 'good'
  const perDayTone = plan.perDay <= 0 ? 'over' : plan.perDay < 15 ? 'warn' : 'good'
  // Both count-ups run unconditionally every render (Rules of Hooks) even
  // though only one branch below is ever shown at a time.
  const perDayDisplay = useCountUp(Math.max(0, plan.perDay))
  const spentDisplay = useCountUp(plan.spent)

  return (
    <>
      <section className="panel">
        {isCurrentMonth ? (
          <div className="hero">
            <div className="figure" style={{ color: `var(--${perDayTone})` }}>
              {money(perDayDisplay)}
            </div>
            <p className="caption">
              per day for the next <strong>{plan.daysLeft}</strong> {plan.daysLeft === 1 ? 'day' : 'days'}, after
              bills and savings are set aside.{' '}
              {plan.envelopeLeft < 0 && <strong style={{ color: 'var(--over)' }}>You're over your envelopes.</strong>}
            </p>
          </div>
        ) : (
          // A per-day figure means "how much I have left, divided by days
          // left" — for a month that's already over, there are no days left
          // and the number is meaningless. What actually happened is what
          // was spent, so that's the headline here instead.
          <div className="hero">
            <div className="figure">{money(spentDisplay)}</div>
            <p className="caption">
              spent in {monthLabel(mk)}
              {plan.envelopeLeft < 0 && <> · <strong style={{ color: 'var(--over)' }}>over your envelopes</strong></>}
            </p>
          </div>
        )}
        <div className="stats">
          <div className="stat">
            <div className="k">Take-home</div>
            <div className="v">{money(plan.income)}</div>
          </div>
          <div className="stat">
            <div className="k">Your bills</div>
            <div className="v">−{money(plan.billsYourShare)}</div>
            {plan.billsYourShare !== plan.bills && (
              <div className="meta">of {money(plan.bills)} total</div>
            )}
          </div>
          <div className="stat">
            <div className="k">Spent so far</div>
            <div className="v">−{money(plan.spent)}</div>
          </div>
          <div className="stat">
            <div className="k">Saving</div>
            <div className="v">−{money(plan.goals)}</div>
          </div>
          <div className="stat">
            <div className="k">Unassigned</div>
            <div className="v" style={{ color: `var(--${tone})` }}>{money(plan.unallocated)}</div>
          </div>
        </div>
      </section>

      {plan.unallocated < 0 && (
        <div className="notice" style={{ background: 'var(--over-soft)', color: 'var(--over)', borderColor: 'var(--over)' }}>
          Your plan spends {money(-plan.unallocated)} more than you bring home. Trim an envelope or a savings
          contribution until Unassigned reaches zero.
        </div>
      )}

      <Panel
        title="Take-home pay"
        action={
          <button className="btn sm" onClick={() => setEditing('new')}>
            <Icons.plus size={14} /> Add
          </button>
        }
      >
        <div className="rows">
          {data.incomes.length === 0 && <Empty>Add what actually lands in your account — after tax, not gross.</Empty>}
          {data.incomes.map((i) => {
            const payday = nextPaydayFor(i)
            return (
              <div key={i.id} className="row">
                <div className="grow">
                  <div className="title">{i.label}</div>
                  <div className="meta">
                    {money(i.amount)} {CADENCE_LABEL[i.cadence]} · {money(monthlyFrom(i.amount, i.cadence))}/mo
                    {payday && ` · next payday ${relativeDay(payday)}`}
                  </div>
                </div>
                <button className="iconbtn" aria-label={`Edit ${i.label}`} onClick={() => setEditing(i)}>
                  <Icons.edit />
                </button>
              </div>
            )
          })}
        </div>
      </Panel>

      <EnvelopePanel money={money} mk={mk} />

      {/* A present-tense question — doesn't mean anything for a month you're
          just browsing history for. */}
      {isCurrentMonth && <AffordabilityPanel money={money} />}
      {isCurrentMonth && <CashflowPanel money={money} />}

      {editing && <IncomeSheet income={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function CashflowPanel({ money }: { money: Fmt }) {
  const data = useData()
  const [balanceInput, setBalanceInput] = useState(String(data.settings.balance ?? ''))
  const [editingBalance, setEditingBalance] = useState(false)
  const hasBalance = data.settings.balance != null

  const setBalance = () => {
    const amt = Number(balanceInput)
    if (!Number.isFinite(amt)) return
    store.update((d) => {
      d.settings.balance = amt
      d.settings.balanceAsOf = todayKey()
    })
    setEditingBalance(false)
  }

  if (!hasBalance || editingBalance) {
    return (
      <Panel title="Cashflow projection">
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="fieldnote">
            See your low point over the next 45 days — rent lands on the 1st, your balance dips lowest on the 12th,
            that kind of thing. Set your current account balance to start; it's typed once, not synced from anywhere.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              inputMode="decimal"
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value)}
              placeholder="Current balance"
              aria-label="Current balance"
              style={{ flex: 1, minWidth: 0 }}
            />
            <button className="btn primary" type="button" onClick={setBalance}>Set</button>
          </div>
        </div>
      </Panel>
    )
  }

  const daysSinceBalance = data.settings.balanceAsOf ? -daysAway(data.settings.balanceAsOf) : 0
  const isStale = daysSinceBalance > 10

  if (isStale) {
    return (
      <Panel title="Cashflow projection">
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="fieldnote">
            Your balance was set {daysSinceBalance} days ago — a projection from a stale figure is worse than none.
            What's the real number today?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              inputMode="decimal"
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value)}
              placeholder="Current balance"
              aria-label="Current balance"
              style={{ flex: 1, minWidth: 0 }}
            />
            <button className="btn primary" type="button" onClick={setBalance}>Update</button>
          </div>
        </div>
      </Panel>
    )
  }

  const points = project(data, 45)
  const low = lowPoint(points)
  const tone = low.balance < 0 ? 'over' : low.balance < 100 ? 'warn' : 'good'

  const w = 300
  const h = 90
  const padTop = 10
  const padBottom = 8
  const balances = points.map((p) => p.balance)
  const minB = Math.min(0, ...balances)
  const maxB = Math.max(0, ...balances)
  const range = maxB - minB || 1
  const xAt = (i: number) => (i / (points.length - 1)) * w
  const yAt = (b: number) => padTop + (1 - (b - minB) / range) * (h - padTop - padBottom)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.balance).toFixed(1)}`).join(' ')
  const lowIdx = points.findIndex((p) => p.date === low.date)
  const zeroY = yAt(0)
  const showZeroLine = minB < 0 && maxB > 0

  return (
    <Panel
      title="Cashflow projection"
      action={
        <button className="btn sm ghost" onClick={() => { setBalanceInput(String(data.settings.balance ?? '')); setEditingBalance(true) }}>
          Update balance
        </button>
      }
    >
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          width="100%"
          height={h}
          role="img"
          aria-label={`Projected balance over the next 45 days. Low point ${money(low.balance)} on ${prettyDate(low.date)}.`}
        >
          {showZeroLine && (
            <line x1={0} y1={zeroY} x2={w} y2={zeroY} stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3,3" />
          )}
          <path d={path} fill="none" stroke={`var(--${tone})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={xAt(lowIdx)} cy={yAt(low.balance)} r="3.5" fill={`var(--${tone})`} />
        </svg>
        <p className="caption">
          Low point: <strong style={{ color: `var(--${tone})` }}>{money(low.balance)}</strong> on {prettyDate(low.date)}
          {low.balance < 0 && ' — that\'s below zero.'}
        </p>
      </div>
    </Panel>
  )
}

function AffordabilityPanel({ money }: { money: Fmt }) {
  const data = useData()
  const [amount, setAmount] = useState('')
  const [envelopeId, setEnvelopeId] = useState('')
  const amt = Number(amount) || 0
  const result = amt > 0 ? canIAfford(data, amt, envelopeId || undefined) : null
  const tone = result ? (result.verdict === 'yes' ? 'good' : result.verdict === 'tight' ? 'warn' : 'over') : undefined

  return (
    <Panel title="Can I afford this?">
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="formgrid">
          <Field label="Amount">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              aria-label="Amount to check"
            />
          </Field>
          <Field label="Envelope (optional)">
            <select value={envelopeId} onChange={(e) => setEnvelopeId(e.target.value)} aria-label="Envelope to check against">
              <option value="">Whole budget</option>
              {data.envelopes.map((e) => (
                <option key={e.id} value={e.id}>{e.label}</option>
              ))}
            </select>
          </Field>
        </div>
        {result && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span
              className="figure"
              style={{ color: `var(--${tone})`, fontSize: 30, fontWeight: 700, fontFamily: 'var(--font-display)' }}
            >
              {result.verdict === 'yes' ? 'Yes' : result.verdict === 'tight' ? 'Tight' : 'No'}
            </span>
            <span className="caption" style={{ maxWidth: '100%' }}>{result.reason}</span>
          </div>
        )}
      </div>
    </Panel>
  )
}

const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: 'weekly',
  biweekly: 'every 2 weeks',
  semimonthly: 'twice a month',
  monthly: 'monthly',
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const CADENCE_NOUN: Record<BillCadence, string> = {
  monthly: 'monthly',
  quarterly: 'every 3 months',
  semiannual: 'twice a year',
  annual: 'yearly',
}

function IncomeSheet({ income, onClose }: { income: Income | null; onClose: () => void }) {
  const [label, setLabel] = useState(income?.label ?? '')
  const [amount, setAmount] = useState(String(income?.amount ?? ''))
  const [cadence, setCadence] = useState<Cadence>(income?.cadence ?? 'biweekly')
  const [anchorDate, setAnchorDate] = useState(income?.anchorDate ?? '')

  // Weekly/biweekly are the only cadences with a fixed day-count period —
  // semimonthly and monthly follow the calendar instead, so an anchor date
  // wouldn't pin anything down for those.
  const anchorable = cadence === 'weekly' || cadence === 'biweekly'
  const preview = anchorable && anchorDate ? nextPaydayFor({ cadence, anchorDate }) : null

  const save = () => {
    const amt = Number(amount)
    if (!label.trim() || !Number.isFinite(amt)) return
    const patch = { label: label.trim(), amount: amt, cadence, anchorDate: anchorable ? anchorDate || undefined : undefined }
    store.update((d) => {
      if (income) {
        const t = d.incomes.find((x) => x.id === income.id)
        if (t) Object.assign(t, patch)
      } else {
        d.incomes.push({ id: uid(), ...patch })
      }
    })
    onClose()
  }

  return (
    <Sheet
      title={income ? 'Edit income' : 'Add income'}
      onClose={onClose}
      onSubmit={save}
      onDelete={income ? () => { store.remove(income.label, (d) => { d.incomes = d.incomes.filter((x) => x.id !== income.id) }); onClose() } : undefined}
    >
      <Field label="Source">
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Paycheck" />
      </Field>
      <div className="formgrid">
        <Field label="Take-home amount">
          <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1450" />
        </Field>
        <Field label="How often">
          <select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="semimonthly">Twice a month</option>
            <option value="monthly">Monthly</option>
          </select>
        </Field>
        {anchorable && (
          <Field label="A known payday" wide>
            <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
          </Field>
        )}
      </div>
      {preview && (
        <p className="fieldnote">
          Every {cadence === 'weekly' ? 'week' : 'other week'} from there — next payday is <strong>{prettyDate(preview)}</strong>.
        </p>
      )}
    </Sheet>
  )
}

/* ══ Envelopes ═══════════════════════════════════════════════════════════ */

function EnvelopePanel({ money, mk }: { money: Fmt; mk: string }) {
  const data = useData()
  const [editing, setEditing] = useState<Envelope | 'new' | null>(null)
  const spent = useMemo(() => spentByEnvelope(data.expenses, mk), [data.expenses, mk])
  // #35's permanent home: budgeted vs. what you actually typically spend,
  // once there's enough history to say so — envelopeDrift itself returns []
  // before three complete months exist, so this silently has nothing to show.
  const drifts = useMemo(() => envelopeDrift(data), [data])

  return (
    <>
      <Panel
        title="Spending envelopes"
        action={
          <button className="btn sm" onClick={() => setEditing('new')}>
            <Icons.plus size={14} /> Add
          </button>
        }
      >
        <div className="rows">
          {data.envelopes.length === 0 && (
            <Empty>An envelope is a job for your money — groceries, gas, fun. What's left is the number that matters.</Empty>
          )}
          {data.envelopes.map((e) => {
            const used = spent[e.id] ?? 0
            const carry = e.rollover ? rolloverBalance(data, e.id, mk) : 0
            const budget = e.monthly + carry
            const left = budget - used
            const tone = left < 0 ? 'over' : used / Math.max(budget, 1) > 0.8 ? 'warn' : 'good'
            // Six months of this envelope — three is the minimum for the
            // shape to mean anything, six before it's genuinely interesting.
            const history = envelopeHistory(data.expenses, e.id, 6).map((h) => h.total)
            const drift = drifts.find((x) => x.envelopeId === e.id)
            return (
              <div key={e.id} className="row" style={{ alignItems: 'stretch', borderLeftColor: e.color || undefined }}>
                <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <EnvelopeIcon icon={e.icon} color={e.color} />
                    <span className="title">{e.label}</span>
                    <span className="num meta" style={{ marginLeft: 'auto', color: `var(--${tone})` }}>
                      {left < 0 ? `${money(-left)} over` : `${money(left)} left`}
                    </span>
                  </div>
                  <Meter value={used} max={budget} tone={tone} color={e.color} />
                  <div className="meta num">
                    {money(used)} of {carry !== 0 ? `${money(e.monthly)} ${carry > 0 ? '+' : '−'} ${money(Math.abs(carry))} carried = ${money(budget)}` : money(budget)} limit
                  </div>
                  {drift && (
                    <div className="meta num">
                      Plan vs. actual: {money(drift.budgeted)} budgeted · {money(drift.median)} typical · {money(used)} this month
                    </div>
                  )}
                </div>
                {history.some((v) => v > 0) && <Sparkline values={history} color={e.color} />}
                <button className="iconbtn" aria-label={`Edit ${e.label}`} onClick={() => setEditing(e)}>
                  <Icons.edit />
                </button>
              </div>
            )
          })}
        </div>
      </Panel>
      {editing && <EnvelopeSheet env={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

/** The small category glyph beside an envelope's label (#32) — silent when unset, tinted by the envelope's own colour so the two choices read as one identity rather than two competing signals. Never the only thing distinguishing an envelope; the label always sits right next to it. */
function EnvelopeIcon({ icon, color }: { icon?: string; color?: string }) {
  const Icon = icon ? Icons[icon as keyof typeof Icons] : undefined
  if (!Icon) return null
  return (
    <span style={{ color: color || 'var(--ink-3)', display: 'inline-flex' }}>
      <Icon size={15} />
    </span>
  )
}

function EnvelopeSheet({ env, onClose }: { env: Envelope | null; onClose: () => void }) {
  const [label, setLabel] = useState(env?.label ?? '')
  const [monthly, setMonthly] = useState(String(env?.monthly ?? ''))
  const [color, setColor] = useState(env?.color)
  const [icon, setIcon] = useState(env?.icon)
  const [rollover, setRollover] = useState(env?.rollover ?? false)

  const save = () => {
    const amt = Number(monthly)
    if (!label.trim() || !Number.isFinite(amt)) return
    store.update((d) => {
      if (env) {
        const t = d.envelopes.find((x) => x.id === env.id)
        if (t) Object.assign(t, { label: label.trim(), monthly: amt, color, icon, rollover })
      } else {
        d.envelopes.push({ id: uid(), label: label.trim(), monthly: amt, color, icon, rollover })
      }
    })
    onClose()
  }

  return (
    <Sheet
      title={env ? 'Edit envelope' : 'New envelope'}
      onClose={onClose}
      onSubmit={save}
      onDelete={env ? () => { store.remove(env.label, (d) => { d.envelopes = d.envelopes.filter((x) => x.id !== env.id) }); onClose() } : undefined}
    >
      <Field label="Name">
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Groceries" />
      </Field>
      <Field label="Limit each month">
        <input type="text" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="400" />
      </Field>
      <Field label="Colour">
        <ColorPicker value={color} onChange={setColor} />
      </Field>
      <Field label="Icon">
        <IconPicker value={icon} onChange={setIcon} />
      </Field>
      <Field label="Carry unused budget into next month">
        <Segmented
          value={rollover ? 'on' : 'off'}
          onChange={(v) => setRollover(v === 'on')}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'on', label: 'On' },
          ]}
        />
        <p className="fieldnote">
          {rollover
            ? 'Unspent room rolls forward; overspend carries too, so a heavy month costs you room next month.'
            : 'Resets to the limit every month, whatever happened last month.'}
        </p>
      </Field>
    </Sheet>
  )
}

/* ══ Bills ═══════════════════════════════════════════════════════════════ */

function BillsTab({ money, mk }: { money: Fmt; mk: string }) {
  const data = useData()
  const [editing, setEditing] = useState<Bill | 'new' | null>(null)
  const isCurrentMonth = mk === monthKey()
  // Real-now for the current month (rolls a passed due day to next month —
  // "what's coming up"); the 1st of the viewed month for any other one (that
  // month's due date, whether or not it's already gone by).
  const dueFrom = isCurrentMonth ? new Date() : firstOfMonth(mk)
  const list = useMemo(() => upcomingBills(data.bills, mk, dueFrom), [data.bills, mk, dueFrom])
  // "Due this month" (literally due, whatever's unpaid counts toward the hero
  // figure) vs "Building up" (a longer-cadence bill just accruing toward a
  // future due date — never "still to pay" for a month it was never due in).
  const dueThisMonth = useMemo(() => list.filter((b) => isBillDueInMonth(b, mk)), [list, mk])
  const buildingUp = useMemo(() => list.filter((b) => !isBillDueInMonth(b, mk)), [list, mk])
  const remaining = dueThisMonth.filter((b) => !b.paid_).reduce((s, b) => s + b.amount, 0)
  const remainingDisplay = useCountUp(remaining)
  // Always the next two real months, regardless of which month is being
  // browsed — this is "what's coming up," a different question from month nav.
  const ahead = useMemo(() => (isCurrentMonth ? billsForMonths(data.bills, 3).slice(1) : []), [data.bills, isCurrentMonth])

  const togglePaidFor = (id: string, forMonth: string) =>
    store.update((d) => {
      const b = d.bills.find((x) => x.id === id)
      if (!b) return
      b.paid = b.paid.includes(forMonth) ? b.paid.filter((m) => m !== forMonth) : [...b.paid, forMonth]
    })
  const togglePaid = (id: string) => togglePaidFor(id, mk)

  const splitNote = (b: Bill) =>
    b.splitAmount ? ` · ${b.splitSource?.trim() || 'Someone else'} covers ${money(b.splitAmount)}/mo` : ''

  return (
    <>
      <section className="panel">
        <div className="hero">
          <div className="figure">{money(remainingDisplay)}</div>
          <p className="caption">
            still to pay this month across <strong>{dueThisMonth.filter((b) => !b.paid_).length}</strong> bills.
          </p>
        </div>
      </section>

      <Panel
        title={monthLabel(mk)}
        action={
          <button className="btn sm" onClick={() => setEditing('new')}>
            <Icons.plus size={14} /> Add
          </button>
        }
      >
        <div className="rows">
          {dueThisMonth.length === 0 && <Empty>Add the fixed things — rent, car, phone, insurance, subscriptions.</Empty>}
          {dueThisMonth.map((b) => (
            <div key={b.id} className={`row${b.paid_ ? ' done' : ''}`} style={{ borderLeftColor: b.color || undefined }}>
              <input
                type="checkbox"
                className="check"
                checked={b.paid_}
                onChange={() => togglePaid(b.id)}
                aria-label={`Mark ${b.label} paid`}
              />
              <div className="grow">
                <div className="title">{b.label}</div>
                <div className="meta">
                  Due {relativeDay(b.due)} · day {b.dueDay}
                  {b.autopay && ' · autopay'}
                  {b.cadence !== 'monthly' && ' · ' + CADENCE_NOUN[b.cadence]}
                  {splitNote(b)}
                </div>
              </div>
              <span className="num">{money(b.amount)}</span>
              <button className="iconbtn" aria-label={`Edit ${b.label}`} onClick={() => setEditing(b)}>
                <Icons.edit />
              </button>
            </div>
          ))}
        </div>
      </Panel>

      {buildingUp.length > 0 && (
        <Panel title="Building up">
          <div className="rows">
            {buildingUp.map((b) => {
              const saved = sinkingBalance(b, dueFrom)
              return (
                <div key={b.id} className="row" style={{ alignItems: 'stretch', borderLeftColor: b.color || undefined }}>
                  <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span className="title">{b.label}</span>
                      <span className="num meta" style={{ marginLeft: 'auto' }}>{money(billMonthlyCost(b))}/mo</span>
                    </div>
                    <Meter value={saved} max={b.amount} color={b.color} />
                    <div className="meta num">
                      {money(saved)} of {money(b.amount)} set aside · due {relativeDay(b.due)}
                    </div>
                  </div>
                  <button className="iconbtn" aria-label={`Edit ${b.label}`} onClick={() => setEditing(b)}>
                    <Icons.edit />
                  </button>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {ahead.length > 0 && (
        <p className="section-label" style={{ padding: '4px 4px 0' }}>
          Coming up — the next two months, regardless of which one you're browsing
        </p>
      )}
      {ahead.map((mo) => {
        const label = monthLabel(mo.monthKey)
        return (
          <Panel key={mo.monthKey} title={label} action={<span className="num meta">{money(mo.total)}</span>}>
            <div className="rows">
              {mo.bills.map((b) => (
                <div key={b.id} className={`row${b.paid_ ? ' done' : ''}`} style={{ borderLeftColor: b.color || undefined }}>
                  <input
                    type="checkbox"
                    className="check"
                    checked={b.paid_}
                    onChange={() => togglePaidFor(b.id, mo.monthKey)}
                    aria-label={`Mark ${b.label} paid for ${label}`}
                  />
                  <div className="grow">
                    <div className="title">{b.label}</div>
                    <div className="meta">
                      {prettyDate(b.due)}
                      {b.autopay && ' · autopay'}
                      {splitNote(b)}
                    </div>
                  </div>
                  <span className="num">{money(b.amount)}</span>
                </div>
              ))}
            </div>
          </Panel>
        )
      })}

      {editing && <BillSheet bill={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function BillSheet({ bill, onClose }: { bill: Bill | null; onClose: () => void }) {
  const data = useData()
  const money = (n: number) => formatMoney(n, data.settings.currency)
  // Re-read the live bill so the override ledger below updates as entries are
  // added/removed, instead of freezing at whatever `bill` was on open.
  const live = bill ? (data.bills.find((x) => x.id === bill.id) ?? bill) : null

  const [label, setLabel] = useState(bill?.label ?? '')
  const [amount, setAmount] = useState(String(bill?.amount ?? ''))
  const [dueDay, setDueDay] = useState(String(bill?.dueDay ?? 1))
  const [cadence, setCadence] = useState<BillCadence>(bill?.cadence ?? 'monthly')
  const [dueMonth, setDueMonth] = useState(String(bill?.dueMonth ?? 1))
  const [autopay, setAutopay] = useState(bill?.autopay ?? false)
  const [splitAmount, setSplitAmount] = useState(String(bill?.splitAmount ?? ''))
  const [splitSource, setSplitSource] = useState(bill?.splitSource ?? '')
  const [color, setColor] = useState(bill?.color)

  const [overrideMonth, setOverrideMonth] = useState(monthKey())
  const [overrideAmount, setOverrideAmount] = useState('')

  const splitNum = Number(splitAmount) || 0
  const amountNum = Number(amount) || 0

  const save = () => {
    const amt = Number(amount)
    const day = Math.min(31, Math.max(1, Number(dueDay) || 1))
    if (!label.trim() || !Number.isFinite(amt)) return
    const split = splitNum > 0
    const patch = {
      label: label.trim(),
      amount: amt,
      dueDay: day,
      cadence,
      dueMonth: cadence === 'monthly' ? undefined : Math.min(12, Math.max(1, Number(dueMonth) || 1)),
      autopay,
      splitAmount: split ? splitNum : undefined,
      splitSource: split ? splitSource.trim() || undefined : undefined,
      color,
    }
    store.update((d) => {
      if (bill) {
        const t = d.bills.find((x) => x.id === bill.id)
        if (t) Object.assign(t, patch)
      } else {
        d.bills.push({ id: uid(), paid: [], ...patch })
      }
    })
    onClose()
  }

  const addOverride = () => {
    const amt = Number(overrideAmount)
    if (!bill || !Number.isFinite(amt) || amt <= 0 || !overrideMonth) return
    store.update((d) => {
      const b = d.bills.find((x) => x.id === bill.id)
      if (b) b.amounts = { ...(b.amounts ?? {}), [overrideMonth]: amt }
    })
    setOverrideAmount('')
  }

  const removeOverride = (mk: string) => {
    if (!bill) return
    store.update((d) => {
      const b = d.bills.find((x) => x.id === bill.id)
      if (!b?.amounts) return
      const { [mk]: _removed, ...rest } = b.amounts
      b.amounts = rest
    })
  }

  return (
    <Sheet
      title={bill ? 'Edit bill' : 'New bill'}
      onClose={onClose}
      onSubmit={save}
      onDelete={bill ? () => { store.remove(bill.label, (d) => { d.bills = d.bills.filter((x) => x.id !== bill.id) }); onClose() } : undefined}
    >
      <Field label="Bill">
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Internet" />
      </Field>
      <div className="formgrid">
        <Field label="Usual amount">
          <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="70" />
        </Field>
        <Field label="Day of month">
          <input type="text" inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
        </Field>
        <Field label="How often">
          <select value={cadence} onChange={(e) => setCadence(e.target.value as BillCadence)}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Every 3 months</option>
            <option value="semiannual">Every 6 months</option>
            <option value="annual">Once a year</option>
          </select>
        </Field>
        {cadence !== 'monthly' && (
          <Field label="Due month">
            <select value={dueMonth} onChange={(e) => setDueMonth(e.target.value)}>
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
          </Field>
        )}
        {/* Grouped in their own nested row so the split amount and who-covers-it
            stay side by side no matter how the cadence-conditional "Due month"
            field above shifts the outer grid's column parity. */}
        <div className="formgrid wide split-row">
          <Field label="Someone else covers (optional)">
            <input
              type="text"
              inputMode="decimal"
              value={splitAmount}
              onChange={(e) => setSplitAmount(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Who">
            <input
              type="text"
              value={splitSource}
              onChange={(e) => setSplitSource(e.target.value)}
              placeholder="Wife"
              disabled={splitNum <= 0}
            />
          </Field>
        </div>
        <Field label="Colour" wide>
          <ColorPicker value={color} onChange={setColor} />
        </Field>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14 }}>
        <input type="checkbox" className="check" checked={autopay} onChange={(e) => setAutopay(e.target.checked)} />
        Paid automatically
      </label>
      {splitNum > 0 && (
        <p className="fieldnote">
          {splitSource.trim() || 'They'} cover{splitSource.trim() ? 's' : ''} {money(splitNum)}/mo, so only{' '}
          <strong>{money(Math.max(0, amountNum - splitNum))}</strong> of this counts against your own income.
        </p>
      )}

      {bill && (
        <Field label="Different amount some months">
          <div className="rows" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
            {Object.keys(live!.amounts ?? {}).length === 0 && <Empty>No overrides set.</Empty>}
            {Object.entries(live!.amounts ?? {})
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([mk, amt]) => (
                <div key={mk} className="row">
                  <div className="grow">
                    <div className="title">{money(amt)}</div>
                    <div className="meta">{monthLabel(mk)}</div>
                  </div>
                  <button type="button" className="iconbtn" aria-label={`Remove override for ${monthLabel(mk)}`} onClick={() => removeOverride(mk)}>
                    <Icons.x size={15} />
                  </button>
                </div>
              ))}
          </div>
          <div style={{ display: 'flex', gap: 8, paddingTop: 10 }}>
            <input
              type="month"
              value={overrideMonth}
              onChange={(e) => setOverrideMonth(e.target.value)}
              aria-label="Override month"
              style={{ flex: 1, minWidth: 0 }}
            />
            <input
              type="text"
              inputMode="decimal"
              value={overrideAmount}
              placeholder="0.00"
              onChange={(e) => setOverrideAmount(e.target.value)}
              aria-label="Override amount"
              style={{ flex: 1, minWidth: 0 }}
            />
            <button className="btn primary" onClick={addOverride} type="button">
              Add
            </button>
          </div>
        </Field>
      )}
    </Sheet>
  )
}

/* ══ Spending ════════════════════════════════════════════════════════════ */

/** One line of one expense, as it appears inside its envelope's group — carries enough of the parent back to open it for editing. */
interface EnvelopeGroupItem {
  key: string
  expense: Expense
  amount: number
  split: boolean
}

interface EnvelopeGroup {
  key: string
  label: string
  color?: string
  icon?: string
  items: EnvelopeGroupItem[]
  total: number
}

/**
 * Expenses bucketed by envelope, in the envelopes' own declared order
 * (Unassigned last) — by *line*, not by expense, so a split Target run shows
 * its $95 under Groceries and its $45 under Household instead of the whole
 * $140 landing under whichever envelope happened to be first.
 */
function groupByEnvelope(items: Expense[], envelopes: Envelope[]): EnvelopeGroup[] {
  const byId = new Map(envelopes.map((e) => [e.id, e] as const))
  const buckets = new Map<string, EnvelopeGroup>()
  for (const e of items) {
    for (const line of e.lines) {
      const env = line.envelopeId ? byId.get(line.envelopeId) : undefined
      const key = env?.id ?? '__unassigned'
      if (!buckets.has(key)) buckets.set(key, { key, label: env?.label ?? 'Unassigned', color: env?.color, icon: env?.icon, items: [], total: 0 })
      const g = buckets.get(key)!
      g.items.push({ key: `${e.id}:${g.items.length}`, expense: e, amount: line.amount, split: e.lines.length > 1 })
      g.total += line.amount
    }
  }
  const ordered: EnvelopeGroup[] = []
  for (const env of envelopes) if (buckets.has(env.id)) ordered.push(buckets.get(env.id)!)
  if (buckets.has('__unassigned')) ordered.push(buckets.get('__unassigned')!)
  return ordered
}

function SpendingTab({ money, mk }: { money: Fmt; mk: string }) {
  const data = useData()
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const [amount, setAmount] = useState('')
  // Pre-selects whatever envelope you used last time — one line of state that
  // removes half the taps, per the roadmap's "do this regardless" call.
  const [envId, setEnvId] = useState(data.settings.lastExpenseEnvelopeId ?? data.envelopes[0]?.id ?? '')
  const [batch, setBatch] = useState(false)
  const isCurrentMonth = mk === monthKey()

  // Newest-added first within each envelope — a new expense is always pushed
  // onto the end of data.expenses, so reversing reflects the order they were
  // actually logged in, not just where their dates happen to fall (which
  // broke down the moment two landed on one day).
  const items = useMemo(() => data.expenses.filter((e) => e.date.startsWith(mk)).reverse(), [data.expenses, mk])
  const total = items.reduce((s, e) => s + expenseTotal(e), 0)
  const groups = useMemo(() => groupByEnvelope(items, data.envelopes), [items, data.envelopes])

  const logExpense = (amt: number, envelopeId?: string) => {
    if (!Number.isFinite(amt) || amt <= 0) return
    store.update((d) => {
      d.expenses.push({ id: uid(), date: todayKey(), lines: [{ envelopeId, amount: amt }] })
      d.settings.lastExpenseEnvelopeId = envelopeId
    })
  }

  const quickAdd = () => {
    logExpense(Number(amount), envId || undefined)
    setAmount('')
  }

  if (batch) return <BatchEntry money={money} onExit={() => setBatch(false)} />

  return (
    <>
      {/* Logging only makes sense for today, so it's only offered while
          today's month is the one being viewed — no silent misfiling into
          whatever month the stepper happens to be on. */}
      {isCurrentMonth && (
        <Panel
          title="Log an expense"
          action={
            <button type="button" className="btn sm ghost" onClick={() => setBatch(true)}>
              Batch
            </button>
          }
        >
          <div className="quickadd">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              placeholder="0.00"
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
              aria-label="Amount"
              style={{ maxWidth: 140 }}
            />
            <select value={envId} onChange={(e) => setEnvId(e.target.value)} aria-label="Envelope">
              <option value="">Unassigned</option>
              {data.envelopes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
            <button className="btn primary" onClick={quickAdd} type="button">
              Log
            </button>
          </div>
          {/* The fast path above only does one amount, one envelope, always
              positive — a split or a refund needs the full sheet instead. */}
          <button
            type="button"
            className="btn sm ghost"
            style={{ margin: '4px 14px 8px' }}
            onClick={() => setEditing('new')}
          >
            Split across envelopes or log a refund
          </button>
        </Panel>
      )}

      <Panel title={`${monthLabel(mk)} · ${money(total)}`}>
        {items.length === 0 && <Empty>Nothing logged in {monthLabel(mk)}.</Empty>}
        {groups.map((g) => (
          <EnvelopeGroupSection key={g.key} group={g} money={money} onEdit={setEditing} />
        ))}
      </Panel>

      {editing && <ExpenseSheet expense={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

/** Two most-recent entries always show — collapsed just hides the rest, it never hides the whole envelope. */
const COLLAPSED_COUNT = 2

/** One envelope's group of expense lines within the Spending list — collapsible once it has more than a couple of entries, since a heavily-used envelope's history can otherwise push everything else off screen. */
function EnvelopeGroupSection({ group: g, money, onEdit }: { group: EnvelopeGroup; money: Fmt; onEdit: (e: Expense | 'new') => void }) {
  const [expanded, setExpanded] = useState(false)
  const collapsible = g.items.length > COLLAPSED_COUNT
  const visible = expanded || !collapsible ? g.items : g.items.slice(0, COLLAPSED_COUNT)
  const hidden = g.items.length - visible.length

  return (
    <div>
      <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between', padding: '10px 14px 4px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <EnvelopeIcon icon={g.icon} color={g.color} />
          {g.label}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="num">{money(g.total)}</span>
          {collapsible && (
            <button
              type="button"
              className="iconbtn"
              aria-label={expanded ? `Collapse ${g.label}` : `Expand ${g.label}`}
              onClick={() => setExpanded((e) => !e)}
              style={{ transform: expanded ? 'rotate(90deg)' : undefined }}
            >
              <Icons.chevron size={14} />
            </button>
          )}
        </span>
      </div>
      <div className="rows">
        {visible.map((it) => (
          <ExpenseRow key={it.key} item={it} color={g.color} money={money} onEdit={() => onEdit(it.expense)} />
        ))}
      </div>
      {collapsible && hidden > 0 && (
        <button type="button" className="btn sm ghost" style={{ margin: '0 14px 10px' }} onClick={() => setExpanded(true)}>
          Show {hidden} more
        </button>
      )}
    </div>
  )
}

/** One thing logged this batch session — enough to show in the running list and to delete it again without re-deriving it from the full month. */
interface BatchAdd {
  id: string
  amount: number
  envelopeId?: string
  envelopeLabel: string
  note: string
  date: string
}

/**
 * #34: an inline rapid-entry mode, deliberately not a Sheet — a modal you
 * open and close fifteen times is the exact friction this replaces. Each
 * add lands in the store immediately (same write path as the normal
 * quick-log), so leaving batch mode mid-session loses nothing; `sessionAdds`
 * is purely local, ephemeral display state for the running list + total.
 */
function BatchEntry({ money, onExit }: { money: Fmt; onExit: () => void }) {
  const data = useData()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [envId, setEnvId] = useState(data.settings.lastExpenseEnvelopeId ?? data.envelopes[0]?.id ?? '')
  const [date, setDate] = useState(todayKey())
  const [sessionAdds, setSessionAdds] = useState<BatchAdd[]>([])
  const amountRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onExit])

  const envName = (id?: string) => data.envelopes.find((e) => e.id === id)?.label ?? 'Unassigned'

  const add = () => {
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) return
    const id = uid()
    store.update((d) => {
      d.expenses.push({ id, date, lines: [{ envelopeId: envId || undefined, amount: amt }], note: note.trim() || undefined })
      d.settings.lastExpenseEnvelopeId = envId || undefined
    })
    setSessionAdds((list) => [{ id, amount: amt, envelopeId: envId || undefined, envelopeLabel: envName(envId), note: note.trim(), date }, ...list])
    // Envelope and date persist between entries — a catch-up session is
    // usually the same envelope across consecutive days. Amount and note
    // reset, and focus returns to amount: that return is the whole feature.
    setAmount('')
    setNote('')
    amountRef.current?.focus()
  }

  const removeAdd = (a: BatchAdd) => {
    store.update((d) => { d.expenses = d.expenses.filter((e) => e.id !== a.id) })
    setSessionAdds((list) => list.filter((x) => x.id !== a.id))
  }

  const total = sessionAdds.reduce((s, a) => s + a.amount, 0)
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') add()
  }

  return (
    <Panel
      title="Batch entry"
      action={
        <button type="button" className="btn sm ghost" onClick={onExit}>
          Done
        </button>
      }
    >
      <div className="formgrid batch-formgrid" style={{ padding: '14px 14px 0' }}>
        <Field label="Amount">
          <input
            ref={amountRef}
            type="text"
            inputMode="decimal"
            autoFocus
            value={amount}
            placeholder="0.00"
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={onEnter}
            aria-label="Amount"
          />
        </Field>
        <Field label="Envelope">
          <select value={envId} onChange={(e) => setEnvId(e.target.value)} aria-label="Envelope">
            <option value="">Unassigned</option>
            {data.envelopes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note">
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={onEnter} placeholder="Optional" aria-label="Note" />
        </Field>
        {/* Own row, not squeezed to half-width next to Note — a native date
            input's intrinsic width on a real phone can exceed a formgrid
            column's, clipping it (same fix used everywhere else in the app). */}
        <Field label="Date" wide>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
        </Field>
      </div>
      <div style={{ padding: '14px 14px 0' }}>
        <button type="button" className="btn primary" onClick={add} disabled={!amount}>
          Add
        </button>
      </div>

      <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between', padding: '20px 14px 8px' }}>
        <span>This session · {sessionAdds.length}</span>
        <span className="num">{money(total)}</span>
      </div>
      <div className="rows batch-rows">
        {sessionAdds.length === 0 && <Empty>Nothing added yet — the amount field keeps focus after each one.</Empty>}
        {sessionAdds.map((a) => (
          <div key={a.id} className="row">
            <div className="grow">
              <div className="title">{a.note || a.envelopeLabel}</div>
              <div className="meta">
                {a.note && `${a.envelopeLabel} · `}
                {prettyDate(a.date)}
              </div>
            </div>
            <span className="num">{money(a.amount)}</span>
            <button type="button" className="iconbtn" aria-label={`Remove ${money(a.amount)} entry`} onClick={() => removeAdd(a)}>
              <Icons.x size={15} />
            </button>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function ExpenseRow({ item: it, color, money, onEdit }: { item: EnvelopeGroupItem; color?: string; money: Fmt; onEdit: () => void }) {
  // Keyed by the parent expense's id, not the line's own key — a split
  // expense's portions live in different envelope sections, and a search hit
  // on it should flash all of them, not just whichever one matched first.
  const { ref, highlighted } = useHighlightRow<HTMLDivElement>(it.expense.id)
  return (
    <div ref={ref} className={`row${highlighted ? ' highlight' : ''}`} style={{ borderLeftColor: color || undefined }}>
      <div className="grow">
        <div className="title">{it.expense.note || prettyDate(it.expense.date)}</div>
        <div className="meta">
          {it.expense.note && prettyDate(it.expense.date)}
          {it.split && (it.expense.note ? ' · split' : 'Split')}
        </div>
      </div>
      <span className="num">{money(it.amount)}</span>
      <button className="iconbtn" aria-label="Edit expense" onClick={onEdit}>
        <Icons.edit />
      </button>
    </div>
  )
}

/** Editable line state — amount kept as text while it's being typed, parsed only on save. */
interface DraftLine {
  envelopeId: string
  amount: string
}

function ExpenseSheet({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const data = useData()
  const [date, setDate] = useState(expense?.date ?? todayKey())
  const [note, setNote] = useState(expense?.note ?? '')
  const [lines, setLines] = useState<DraftLine[]>(() =>
    (expense?.lines ?? [{ envelopeId: undefined, amount: 0 }]).map((l) => ({ envelopeId: l.envelopeId ?? '', amount: l.amount === 0 ? '' : String(l.amount) })),
  )
  // Snapshot of the single amount at the moment "Split" is pressed — used only
  // to suggest what's left over as you add lines. Never enforced: this is a
  // starting point, not a total the lines have to add back up to.
  const splitTarget = useRef<number | null>(null)
  const split = lines.length > 1

  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)

  const startSplit = () => {
    splitTarget.current = Number(lines[0].amount) || 0
    setLines((ls) => [...ls, { envelopeId: '', amount: '' }])
  }
  const addLine = () => {
    const remainder = splitTarget.current != null ? Math.max(0, splitTarget.current - total) : 0
    setLines((ls) => [...ls, { envelopeId: '', amount: remainder > 0 ? remainder.toFixed(2) : '' }])
  }
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i))
  const updateLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  const save = () => {
    const finalLines = lines
      .map((l) => ({ envelopeId: l.envelopeId || undefined, amount: Number(l.amount) }))
      .filter((l) => Number.isFinite(l.amount) && l.amount !== 0)
    if (finalLines.length === 0) return
    store.update((d) => {
      if (expense) {
        const t = d.expenses.find((x) => x.id === expense.id)
        if (t) Object.assign(t, { date, lines: finalLines, note: note.trim() || undefined })
      } else {
        d.expenses.push({ id: uid(), date, lines: finalLines, note: note.trim() || undefined })
      }
    })
    onClose()
  }

  return (
    <Sheet
      title={expense ? 'Edit expense' : 'New expense'}
      onClose={onClose}
      onSubmit={save}
      onDelete={
        expense
          ? () => { store.remove(expense.note || formatMoney(expenseTotal(expense), data.settings.currency), (d) => { d.expenses = d.expenses.filter((x) => x.id !== expense.id) }); onClose() }
          : undefined
      }
    >
      <div className="formgrid">
        <Field label="Date" wide>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note" wide>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Weekly shop" />
        </Field>
      </div>

      <Field label={split ? `Split across ${lines.length}` : 'Amount & envelope'}>
        <div className={split ? 'rows' : undefined} style={split ? { border: '1px solid var(--line)', borderRadius: 8 } : { display: 'flex', gap: 8 }}>
          {lines.map((l, i) => (
            <div key={i} className={split ? 'row' : undefined} style={split ? undefined : { display: 'flex', gap: 8, flex: 1 }}>
              <input
                type="text"
                inputMode="decimal"
                value={l.amount}
                placeholder="0.00"
                onChange={(e) => updateLine(i, { amount: e.target.value })}
                aria-label={`Amount ${i + 1}`}
                style={split ? { maxWidth: 100 } : { flex: 1, minWidth: 0 }}
              />
              <select
                value={l.envelopeId}
                onChange={(e) => updateLine(i, { envelopeId: e.target.value })}
                aria-label={`Envelope ${i + 1}`}
                style={{ flex: 1, minWidth: 0 }}
              >
                <option value="">Unassigned</option>
                {data.envelopes.map((e) => (
                  <option key={e.id} value={e.id}>{e.label}</option>
                ))}
              </select>
              {split && (
                <button type="button" className="iconbtn" aria-label={`Remove line ${i + 1}`} onClick={() => removeLine(i)}>
                  <Icons.x size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
        {split ? (
          <>
            <p className="fieldnote">Total: {formatMoney(total, data.settings.currency)}. A negative amount is a refund.</p>
            <button type="button" className="btn sm ghost" onClick={addLine}>
              <Icons.plus size={14} /> Add another line
            </button>
          </>
        ) : (
          <button type="button" className="btn sm ghost" style={{ marginTop: 8 }} onClick={startSplit}>
            Split across envelopes
          </button>
        )}
      </Field>
    </Sheet>
  )
}

/* ══ Goals ═══════════════════════════════════════════════════════════════ */

function GoalsTab({ money }: { money: Fmt }) {
  const data = useData()
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const activeGoals = data.goals.filter((g) => !g.archived)
  const archivedGoals = data.goals.filter((g) => g.archived)
  const monthly = activeGoals.reduce((s, g) => s + g.monthly, 0)
  const saved = activeGoals.reduce((s, g) => s + goalSaved(g), 0)
  const monthlyDisplay = useCountUp(monthly)

  return (
    <>
      <section className="panel">
        <div className="hero">
          <div className="figure">{money(monthlyDisplay)}</div>
          <p className="caption">
            set aside each month across <strong>{activeGoals.length}</strong> goals ·{' '}
            <span className="num">{money(saved)}</span> banked so far, from any source.
          </p>
        </div>
      </section>

      <Panel
        title="Saving & investing"
        action={
          <button className="btn sm" onClick={() => setEditing('new')}>
            <Icons.plus size={14} /> Add
          </button>
        }
      >
        <div className="rows">
          {activeGoals.length === 0 && <Empty>An emergency fund first, then the fun ones.</Empty>}
          {activeGoals.map((g) => (
            <div key={g.id} className="row" style={{ borderLeftColor: g.color || undefined }}>
              <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span className="title">{g.label}</span>
                  <span className={`chip ${g.kind === 'invest' ? 'accent' : 'good'}`}>{g.kind}</span>
                  {g.kind === 'save' ? <SaveBadge g={g} /> : <InvestBadge g={g} />}
                </div>
                {g.kind === 'save' ? <SaveProgress g={g} money={money} /> : <InvestProgress g={g} money={money} />}
              </div>
              <button className="iconbtn" aria-label={`Edit ${g.label}`} onClick={() => setEditing(g)}>
                <Icons.edit />
              </button>
            </div>
          ))}
        </div>
      </Panel>

      {archivedGoals.length > 0 && (
        <Panel
          title={`Archived · ${archivedGoals.length}`}
          action={
            <button className="btn sm ghost" onClick={() => setShowArchived((s) => !s)}>
              {showArchived ? 'Hide' : 'Show'}
            </button>
          }
        >
          {showArchived && (
            <div className="rows">
              {archivedGoals.map((g) => (
                <div key={g.id} className="row">
                  <div className="grow title">{g.label}</div>
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={() => store.update((d) => { const t = d.goals.find((x) => x.id === g.id); if (t) t.archived = false })}
                  >
                    Unarchive
                  </button>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {editing && <GoalSheet goal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function SaveBadge({ g }: { g: Goal }) {
  const progress = goalProgress(g)
  if (progress.pace === 'behind') return <span className="chip over">Behind</span>
  if (progress.pace === 'on-track') return <span className="chip good">On track</span>
  return <span className="num meta" style={{ marginLeft: 'auto' }}>{progress.pct}%</span>
}

/** Total-toward-target view — an emergency fund, a laptop: there's a finish line. */
function SaveProgress({ g, money }: { g: Goal; money: Fmt }) {
  const months = monthsToGoal(g)
  const progress = goalProgress(g)
  const saved = goalSaved(g)
  const meterTone = progress.pct >= 100 ? 'good' : progress.pace === 'behind' ? 'warn' : undefined
  return (
    <>
      <Meter value={saved} max={g.target} tone={meterTone} color={g.color} />
      <div className="meta num">
        {money(saved)} of {money(g.target)} · {money(g.monthly)}/mo ·{' '}
        {months === 0 ? 'funded' : months === Infinity ? 'no contribution set' : `${months} mo at this pace`}
      </div>
      {g.targetDate && (
        <div className="meta">
          Due {prettyDate(g.targetDate)}
          {progress.pace === 'behind' && progress.requiredMonthly != null && (
            <> · needs <strong style={{ color: 'var(--over)' }}>{money(progress.requiredMonthly)}/mo</strong> to make it
            {progress.monthsLeft != null && ` (${progress.monthsLeft} mo left)`}</>
          )}
          {progress.pace === 'on-track' && progress.monthsLeft != null && ` · ${progress.monthsLeft} mo left`}
        </div>
      )}
      {progress.pace === 'funded' && <GoalFundedMoment goal={g} />}
    </>
  )
}

/**
 * The one moment in the whole app that's purely celebratory (#33) — plays
 * once, ever, the first time a save goal reaches its target. Whether to show
 * anything is decided ONCE, at mount, from `goal.celebratedAt` as it stood
 * at that moment — captured into local state rather than re-read live —
 * because the mount effect below immediately writes `celebratedAt` back to
 * the store, and re-checking the live prop after that would make the moment
 * vanish the instant it appeared. A later mount (leaving Goals and coming
 * back) reads the now-set `celebratedAt` fresh and correctly shows nothing.
 */
function GoalFundedMoment({ goal }: { goal: Goal }) {
  const [justFunded] = useState(() => !goal.celebratedAt)
  useEffect(() => {
    if (!justFunded) return
    store.update((d) => {
      const t = d.goals.find((x) => x.id === goal.id)
      if (t && !t.celebratedAt) t.celebratedAt = todayKey()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!justFunded) return null
  return (
    <div className="goal-funded" role="status">
      <Icons.star size={14} /> Funded — nice work.
    </div>
  )
}

function InvestBadge({ g }: { g: Goal }) {
  const inv = investMonthlyProgress(g)
  if (inv.target <= 0) return null
  return inv.met ? <span className="chip good">Reached</span> : <span className="chip warn">{inv.pct}%</span>
}

/**
 * Pace view, not a total — an ongoing investment has no finish line, so what
 * matters is whether this month's contribution landed, not a lifetime sum.
 */
function InvestProgress({ g, money }: { g: Goal; money: Fmt }) {
  const inv = investMonthlyProgress(g)
  const total = goalSaved(g)
  return (
    <>
      <Meter value={inv.contributed} max={Math.max(inv.target, inv.contributed)} tone={inv.met ? 'good' : undefined} color={g.color} />
      <div className="meta num">
        {money(inv.contributed)} of {money(inv.target)}/mo this month · {money(total)} total
      </div>
    </>
  )
}

function GoalSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const data = useData()
  const money = (n: number) => formatMoney(n, data.settings.currency)
  // Re-read the live goal so the contribution ledger below updates as entries
  // are added/removed, instead of freezing at whatever `goal` was on open.
  const live = goal ? (data.goals.find((g) => g.id === goal.id) ?? goal) : null

  const [label, setLabel] = useState(goal?.label ?? '')
  const [kind, setKind] = useState<Goal['kind']>(goal?.kind ?? 'save')
  const [target, setTarget] = useState(String(goal?.target ?? ''))
  const [monthly, setMonthly] = useState(String(goal?.monthly ?? ''))
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '')
  const [color, setColor] = useState(goal?.color)

  const [contribAmount, setContribAmount] = useState('')
  const [contribDate, setContribDate] = useState(todayKey())
  const [contribSource, setContribSource] = useState('')

  const [recurAmount, setRecurAmount] = useState('')
  const [recurCadence, setRecurCadence] = useState<Cadence>('biweekly')
  const [recurAnchor, setRecurAnchor] = useState(todayKey())
  const [recurSource, setRecurSource] = useState('')

  const savedNum = live ? goalSaved(live) : 0
  // What the deadline actually requires, recomputed as the fields change — this is what turns
  // "by February" into a number instead of a hope. Only meaningful for a total-toward-target goal.
  const targetNum = Number(target) || 0
  // Net out standing recurring contributions (e.g. a spouse's autopay) — they
  // count toward the deadline same as a hand-logged deposit, so what's left
  // for your own `monthly` field is the total requirement minus those.
  const required =
    kind === 'save' && targetDate && targetNum > savedNum
      ? Math.max(0, requiredMonthlyToGoal(targetNum, savedNum, targetDate) - (live ? recurringMonthlyTotal(live) : 0))
      : null
  const monthlyNum = Number(monthly) || 0

  const save = () => {
    if (!label.trim()) return
    const patch = {
      label: label.trim(),
      kind,
      target: kind === 'save' ? Number(target) || 0 : 0,
      monthly: Number(monthly) || 0,
      targetDate: kind === 'save' ? targetDate || undefined : undefined,
      color,
    }
    store.update((d) => {
      if (goal) {
        const t = d.goals.find((x) => x.id === goal.id)
        if (t) Object.assign(t, patch)
      } else {
        d.goals.push({ id: uid(), contributions: [], recurring: [], ...patch })
      }
    })
    onClose()
  }

  const addContribution = () => {
    const amt = Number(contribAmount)
    if (!goal || !Number.isFinite(amt) || amt <= 0) return
    store.update((d) => {
      const g = d.goals.find((x) => x.id === goal.id)
      if (g) g.contributions.push({ id: uid(), date: contribDate, amount: amt, source: contribSource.trim() || undefined })
    })
    setContribAmount('')
    setContribSource('')
  }

  const removeContribution = (id: string) => {
    if (!goal) return
    store.update((d) => {
      const g = d.goals.find((x) => x.id === goal.id)
      if (g) g.contributions = g.contributions.filter((c) => c.id !== id)
    })
  }

  const addRecurring = () => {
    const amt = Number(recurAmount)
    if (!goal || !Number.isFinite(amt) || amt <= 0 || !recurAnchor) return
    store.update((d) => {
      const g = d.goals.find((x) => x.id === goal.id)
      if (g) g.recurring.push({ id: uid(), amount: amt, cadence: recurCadence, anchorDate: recurAnchor, source: recurSource.trim() || undefined })
    })
    setRecurAmount('')
    setRecurSource('')
  }

  const removeRecurring = (id: string) => {
    if (!goal) return
    store.update((d) => {
      const g = d.goals.find((x) => x.id === goal.id)
      if (g) g.recurring = g.recurring.filter((r) => r.id !== id)
    })
  }

  /** Turns one due occurrence into a real, dated Contribution and advances the rule past it — same one-tap-confirm shape as every other money entry, just pre-filled from the recurring rule instead of typed by hand. */
  const logRecurring = (r: RecurringContribution, date: string) => {
    if (!goal) return
    store.update((d) => {
      const g = d.goals.find((x) => x.id === goal.id)
      if (!g) return
      g.contributions.push({ id: uid(), date, amount: r.amount, source: r.source })
      const rec = g.recurring.find((x) => x.id === r.id)
      if (rec) rec.lastLogged = date
    })
  }

  return (
    <Sheet
      title={goal ? 'Edit goal' : 'New goal'}
      onClose={onClose}
      onSubmit={save}
      onDelete={goal ? () => { store.remove(goal.label, (d) => { d.goals = d.goals.filter((x) => x.id !== goal.id) }); onClose() } : undefined}
    >
      <Field label="Goal">
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Emergency fund" />
      </Field>
      <div className="formgrid">
        <Field label="Type">
          <select value={kind} onChange={(e) => setKind(e.target.value as Goal['kind'])}>
            <option value="save">Saving</option>
            <option value="invest">Investing</option>
          </select>
        </Field>
        <Field label={kind === 'invest' ? 'Monthly goal' : 'Per month'}>
          <input type="text" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
        </Field>
        {kind === 'save' && (
          <>
            <Field label="Target" wide>
              <input type="text" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
            </Field>
            {/* Its own row, not squeezed to half-width next to Target — a native
                date input's calendar icon plus mm/dd/yyyy doesn't reliably fit
                a formgrid column on a real phone, which is what was clipping it. */}
            <Field label="Target date (optional)" wide>
              <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </Field>
          </>
        )}
        <Field label="Colour" wide>
          <ColorPicker value={color} onChange={setColor} />
        </Field>
      </div>

      {kind === 'invest' && (
        <p className="fieldnote">
          Investing goals track keeping up the monthly contribution, not a lifetime total —
          {monthlyNum > 0 ? ` this month needs ${money(monthlyNum)}.` : ' set a monthly goal above.'}
        </p>
      )}

      {required !== null && (
        <p className="fieldnote">
          That's <strong>{money(required)}/mo</strong> from you to hit {money(targetNum)} by {prettyDate(targetDate)}
          {live && recurringMonthlyTotal(live) > 0 && ` (recurring contributions already cover ${money(recurringMonthlyTotal(live))}/mo)`}.
          {monthlyNum < required - 0.005 && (
            <>
              {' '}
              <button type="button" className="btn sm" onClick={() => setMonthly(required.toFixed(2))}>
                Use this
              </button>
            </>
          )}
        </p>
      )}

      {goal && (
        <Field label={`Contributions · ${money(savedNum)} total`}>
          <div className="rows" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
            {live!.contributions.length === 0 && <Empty>Nothing logged yet.</Empty>}
            {[...live!.contributions]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((c) => (
                <div key={c.id} className="row">
                  <div className="grow">
                    <div className="title">{money(c.amount)}</div>
                    <div className="meta">
                      {prettyDate(c.date)}
                      {c.source && ` · ${c.source}`}
                    </div>
                  </div>
                  <button type="button" className="iconbtn" aria-label="Remove contribution" onClick={() => removeContribution(c.id)}>
                    <Icons.x size={15} />
                  </button>
                </div>
              ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                inputMode="decimal"
                value={contribAmount}
                placeholder="0.00"
                onChange={(e) => setContribAmount(e.target.value)}
                aria-label="Contribution amount"
                style={{ flex: 1, minWidth: 0 }}
              />
              <input
                type="date"
                value={contribDate}
                onChange={(e) => setContribDate(e.target.value)}
                aria-label="Contribution date"
                style={{ flex: 1, minWidth: 0 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={contribSource}
                onChange={(e) => setContribSource(e.target.value)}
                placeholder="Who (optional) — leave blank for you"
                aria-label="Contribution source"
                style={{ flex: 1, minWidth: 0 }}
              />
              <button className="btn primary" onClick={addContribution} type="button">
                Add
              </button>
            </div>
          </div>
        </Field>
      )}

      {goal && (
        <Field label="Recurring contributions">
          <div className="rows" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
            {live!.recurring.length === 0 && <Empty>None set up — for a deposit that lands on its own, like a spouse's paycheck autopay.</Empty>}
            {live!.recurring.map((r) => {
              const due = dueContribution(r)
              return (
                <div key={r.id} className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div className="grow">
                      <div className="title">
                        {money(r.amount)} · {CADENCE_LABEL[r.cadence]}
                      </div>
                      <div className="meta">
                        {r.source && `${r.source} · `}since {prettyDate(r.anchorDate)}
                      </div>
                    </div>
                    <button type="button" className="iconbtn" aria-label="Remove recurring contribution" onClick={() => removeRecurring(r.id)}>
                      <Icons.x size={15} />
                    </button>
                  </div>
                  {due && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '6px 10px',
                        background: 'var(--accent-soft)',
                        borderRadius: 6,
                      }}
                    >
                      <span style={{ fontSize: 13, color: 'var(--accent-ink)' }}>Due {prettyDate(due)}</span>
                      <button type="button" className="btn sm" onClick={() => logRecurring(r, due)}>
                        Log it
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                inputMode="decimal"
                value={recurAmount}
                placeholder="0.00"
                onChange={(e) => setRecurAmount(e.target.value)}
                aria-label="Recurring amount"
                style={{ flex: 1, minWidth: 0 }}
              />
              <select
                value={recurCadence}
                onChange={(e) => setRecurCadence(e.target.value as Cadence)}
                aria-label="Recurring cadence"
                style={{ flex: 1, minWidth: 0 }}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="semimonthly">Twice a month</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="date"
                value={recurAnchor}
                onChange={(e) => setRecurAnchor(e.target.value)}
                aria-label="First occurrence"
                style={{ flex: 1, minWidth: 0 }}
              />
              <input
                type="text"
                value={recurSource}
                onChange={(e) => setRecurSource(e.target.value)}
                placeholder="Who (optional) — leave blank for you"
                aria-label="Recurring source"
                style={{ flex: 1, minWidth: 0 }}
              />
            </div>
            <button className="btn primary" onClick={addRecurring} type="button">
              Add recurring contribution
            </button>
          </div>
          <p className="fieldnote">
            For a deposit that happens on its own — a paycheck autopay, an employer match. A due occurrence waits for
            "Log it" before it's added to the ledger above; nothing posts by itself.
          </p>
        </Field>
      )}

      {goal && !goal.archived && (
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => {
            store.update((d) => { const t = d.goals.find((x) => x.id === goal.id); if (t) t.archived = true })
            onClose()
          }}
        >
          Archive — keep the record, off the list
        </button>
      )}
    </Sheet>
  )
}

/* ══ Debt ════════════════════════════════════════════════════════════════ */

type DebtOrder = 'snowball' | 'avalanche'

function DebtTab({ money }: { money: Fmt }) {
  const data = useData()
  const [editing, setEditing] = useState<Debt | 'new' | null>(null)
  const [priority, setPriority] = useState<DebtOrder>('snowball')
  const ordered = useMemo(() => order(data.debts, priority), [data.debts, priority])

  return (
    <>
      {data.debts.length > 1 && (
        <Panel title="Priority for extra payments">
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Segmented<DebtOrder>
              value={priority}
              onChange={setPriority}
              options={[
                { value: 'snowball', label: 'Smallest balance' },
                { value: 'avalanche', label: 'Highest rate' },
              ]}
            />
            <p className="fieldnote">
              {priority === 'snowball'
                ? 'Snowball: pay off the smallest balance first — fewer debts, faster, for the win of seeing one disappear.'
                : 'Avalanche: pay off the highest rate first — costs less overall, even if the first one takes longer.'}{' '}
              Either way, this only orders the list — what actually happens depends on where you put the extra
              payment below.
            </p>
          </div>
        </Panel>
      )}

      <Panel
        title="Debts"
        action={
          <button className="btn sm" onClick={() => setEditing('new')}>
            <Icons.plus size={14} /> Add
          </button>
        }
      >
        <div className="rows">
          {data.debts.length === 0 && (
            <Empty>A car loan, a card, student loans — anything with a balance, a rate, and a minimum.</Empty>
          )}
          {ordered.map((d) => (
            <DebtRow key={d.id} debt={d} money={money} onEdit={() => setEditing(d)} />
          ))}
        </div>
      </Panel>
      {editing && <DebtSheet debt={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function DebtRow({ debt, money, onEdit }: { debt: Debt; money: Fmt; onEdit: () => void }) {
  // Local while dragging so every tick of the slider doesn't push an undo
  // snapshot; committed to the store only once the drag actually ends.
  const [extra, setExtra] = useState(debt.extra)
  const payment = debt.minimum + extra
  const payoff = payoffDate(debt, payment)
  const interest = totalInterest(debt, payment)
  const commit = () => {
    if (extra === debt.extra) return
    store.update((d) => {
      const t = d.debts.find((x) => x.id === debt.id)
      if (t) t.extra = extra
    })
  }

  return (
    <div className="row" style={{ alignItems: 'stretch', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="title">{debt.label}</span>
        <span className="meta num" style={{ marginLeft: 'auto' }}>{debt.apr}% APR</span>
        <button className="iconbtn" aria-label={`Edit ${debt.label}`} onClick={onEdit}>
          <Icons.edit />
        </button>
      </div>
      <div className="stats">
        <div className="stat">
          <div className="k">Balance</div>
          <div className="v">{money(debt.balance)}</div>
        </div>
        <div className="stat">
          <div className="k">Payoff</div>
          <div className="v">{payoff === 'never' ? 'Never' : monthLabel(payoff)}</div>
        </div>
        <div className="stat">
          <div className="k">Interest left</div>
          <div className="v">{Number.isFinite(interest) ? money(interest) : '—'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="meta" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Extra each month</span>
          <span className="num">+{money(extra)} · {money(payment)} total</span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(debt.minimum * 3, extra, 200)}
          step={5}
          value={extra}
          onChange={(e) => setExtra(Number(e.target.value))}
          onMouseUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
          aria-label={`Extra monthly payment toward ${debt.label}`}
        />
      </div>
    </div>
  )
}

function DebtSheet({ debt, onClose }: { debt: Debt | null; onClose: () => void }) {
  const data = useData()
  const [label, setLabel] = useState(debt?.label ?? '')
  const [balance, setBalance] = useState(String(debt?.balance ?? ''))
  const [apr, setApr] = useState(String(debt?.apr ?? ''))
  const [minimum, setMinimum] = useState(String(debt?.minimum ?? ''))
  const [billId, setBillId] = useState(debt?.billId ?? '')

  const save = () => {
    const b = Number(balance)
    const a = Number(apr)
    const m = Number(minimum)
    if (!label.trim() || !Number.isFinite(b) || !Number.isFinite(a) || !Number.isFinite(m)) return
    const patch = { label: label.trim(), balance: b, apr: a, minimum: m, billId: billId || undefined }
    store.update((d) => {
      if (debt) {
        const t = d.debts.find((x) => x.id === debt.id)
        if (t) Object.assign(t, patch)
      } else {
        d.debts.push({ id: uid(), extra: 0, ...patch })
      }
    })
    onClose()
  }

  return (
    <Sheet
      title={debt ? 'Edit debt' : 'New debt'}
      onClose={onClose}
      onSubmit={save}
      onDelete={debt ? () => { store.remove(debt.label, (d) => { d.debts = d.debts.filter((x) => x.id !== debt.id) }); onClose() } : undefined}
    >
      <Field label="Name">
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Car loan" />
      </Field>
      <div className="formgrid">
        <Field label="Balance">
          <input type="text" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="8200" />
        </Field>
        <Field label="APR %">
          <input type="text" inputMode="decimal" value={apr} onChange={(e) => setApr(e.target.value)} placeholder="6.9" />
        </Field>
      </div>
      <Field label="Minimum payment">
        <input type="text" inputMode="decimal" value={minimum} onChange={(e) => setMinimum(e.target.value)} placeholder="312" />
      </Field>
      <Field label="Paid through this bill (optional)">
        <select value={billId} onChange={(e) => setBillId(e.target.value)}>
          <option value="">None</option>
          {data.bills.map((b) => (
            <option key={b.id} value={b.id}>{b.label}</option>
          ))}
        </select>
      </Field>
    </Sheet>
  )
}
