import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { store, uid, useData } from '../../core/store'
import { buildPlan, formatMoney, fundingGap, goalProgress, goalSaved, lastPayDate, loggingStreak, nextPaydayFor, upcomingBills } from '../../core/budget'
import { gameHours } from '../../core/games'
import { daysSinceTouched, staleProjects } from '../../core/projects'
import { overdueContact, upcomingBirthdays } from '../../core/people'
import { dueMaintenance } from '../../core/maintenance'
import { tasksFor } from '../../core/tasks'
import { todaysTakeaway } from '../../core/learning'
import { allInsights, dismissInsight, TODAY_INSIGHT_CAP, type Insight } from '../../core/insights'
import { nextCloseMonth } from '../../core/monthclose'
import MonthCloseSheet from '../MonthCloseSheet'
import { addDays, daysAway, fromKey, monthLabel, relativeDay, todayKey } from '../../core/dates'
import { parseQuickAdd } from '../../core/parse'
import { search, type Hit } from '../../core/search'
import { Empty, Icons, Panel, useCountUp } from '../components/kit'
import PaycheckSheet, { FALLBACK_PAY_WINDOW } from '../PaycheckSheet'
import RoutinesPanel from '../RoutinesPanel'
import WeeklyReview from '../WeeklyReview'
import YearReview from '../YearReview'
import { effectiveTodayOrder, type RouteKey, type TodayPanelKey } from '../nav'

const KIND_LABEL: Record<Hit['kind'], string> = { task: 'Tasks', note: 'Journal', movie: 'Movies', series: 'Series', game: 'Games', expense: 'Expenses', project: 'Projects', shopping: 'Shopping', person: 'People', maintenance: 'Maintenance', topic: 'Learning', inbox: 'Inbox' }
const KIND_ORDER: Hit['kind'][] = ['task', 'note', 'inbox', 'project', 'shopping', 'person', 'maintenance', 'topic', 'movie', 'series', 'game', 'expense']

/** 'HH:MM' 24h -> '2:00 PM'. Local to this screen — the only place a task time needs to read as a sentence instead of a form field. */
function formatTime12(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

const INSIGHT_TONE: Record<Insight['severity'], string> = { urgent: 'over', warn: 'warn', info: undefined as unknown as string }

/**
 * BACKLOG #34-38's engine surfaced here — at most `TODAY_INSIGHT_CAP` shown
 * directly, the rest behind a plain expand toggle rather than a whole
 * separate screen, since there's nowhere else in the nav that would make
 * sense for "the ones you haven't looked at yet." A recurring-charge insight
 * dismisses effectively permanently (see the long `days` below) since it's
 * about one specific subscription, not something to be re-annoyed about in
 * 30 days the way a drifting budget might still be worth a second look.
 */
function InsightsPanel({ go }: { go: (r: RouteKey) => void }) {
  const data = useData()
  const [expanded, setExpanded] = useState(false)
  const insights = useMemo(() => allInsights(data), [data])
  if (insights.length === 0) return null

  const shown = expanded ? insights : insights.slice(0, TODAY_INSIGHT_CAP)
  const rest = insights.length - TODAY_INSIGHT_CAP

  const dismiss = (i: Insight) =>
    store.update((d) => dismissInsight(d, i.id, todayKey(), i.kind === 'recurring-found' ? 36_500 : undefined))

  return (
    <Panel title="Insights">
      <div className="rows">
        {shown.map((i) => (
          <div key={i.id} className="row" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <div className="title" style={INSIGHT_TONE[i.severity] ? { color: `var(--${INSIGHT_TONE[i.severity]})` } : undefined}>
                {i.title}
              </div>
              <div className="meta">{i.detail}</div>
            </div>
            {i.action && (
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => {
                  if (i.action?.targetId) store.setHighlight(i.action.targetId)
                  go(i.action!.route)
                }}
              >
                {i.action.label}
              </button>
            )}
            <button type="button" className="iconbtn" aria-label={`Dismiss "${i.title}"`} onClick={() => dismiss(i)}>
              <Icons.x size={15} />
            </button>
          </div>
        ))}
        {!expanded && rest > 0 && (
          <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => setExpanded(true)}>
            {rest} more insight{rest === 1 ? '' : 's'}
          </button>
        )}
      </div>
    </Panel>
  )
}

/**
 * The summary screen: everything that needs a decision today, and nothing else.
 * Each panel links through to the section that owns the detail.
 */
export default function Today({ go }: { go: (t: RouteKey) => void }) {
  const data = useData()
  const [quickAdd, setQuickAdd] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [reviewingYear, setReviewingYear] = useState(false)
  const [assigningPaycheck, setAssigningPaycheck] = useState(false)
  const [closingMonth, setClosingMonth] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const money = (n: number) => formatMoney(n, data.settings.currency)
  const plan = useMemo(() => buildPlan(data), [data])
  const streak = useMemo(() => loggingStreak(data.expenses), [data.expenses])
  // Offered from the 1st until it's done, then gone (#40) — "done" just
  // means nextCloseMonth() no longer finds a past month without a record.
  const pendingClose = useMemo(() => nextCloseMonth(data), [data])

  // The most recent note from exactly this month/day in a prior year — the
  // only thing that makes an old journal worth having written.
  const onThisDay = useMemo(() => {
    const todayMD = todayKey().slice(5)
    const thisYear = todayKey().slice(0, 4)
    return [...data.notes]
      .filter((n) => n.at.slice(5, 10) === todayMD && n.at.slice(0, 4) !== thisYear)
      .sort((a, b) => b.at.localeCompare(a.at))[0]
  }, [data.notes])

  // The entire point of the Learning section: an unprompted takeaway,
  // stable for the day. Whichever topic it belongs to, tapping through
  // opens that topic, not just Learning in general.
  const takeaway = useMemo(() => todaysTakeaway(data.notes), [data.notes])
  const takeawayTopic = useMemo(() => data.topics.find((t) => t.id === takeaway?.topicId), [data.topics, takeaway])

  const searchHits = useMemo(() => (searchQuery.trim() ? search(data, searchQuery) : []), [searchQuery, data])
  const searchGroups = useMemo(() => {
    const out: Partial<Record<Hit['kind'], Hit[]>> = {}
    for (const h of searchHits) (out[h.kind] ??= []).push(h)
    return out
  }, [searchHits])
  const jumpToHit = (hit: Hit) => {
    store.setHighlight(hit.id)
    setSearchQuery('')
    if (hit.kind === 'task') go('tasks')
    else if (hit.kind === 'note') go('journal')
    else if (hit.kind === 'project') go('projects')
    else if (hit.kind === 'shopping') go('shopping')
    else if (hit.kind === 'person') go('people')
    else if (hit.kind === 'maintenance') go('maintenance')
    else if (hit.kind === 'topic') go('learning')
    else if (hit.kind === 'inbox') go('inbox')
    else if (hit.kind === 'movie' || hit.kind === 'game' || hit.kind === 'series') go('queue')
    else go('money')
  }

  const dueSoon = useMemo(
    () => upcomingBills(data.bills).filter((b) => !b.paid_ && daysAway(b.due) <= 10).slice(0, 4),
    [data.bills],
  )

  const todayTasks = useMemo(
    () => data.tasks.filter((t) => !t.done && t.due && daysAway(t.due) <= 0).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? '')),
    [data.tasks],
  )
  // #44's "optionally one suggestion on Today" — only worth surfacing when
  // there's nothing already due, so it reads as "here's something else you
  // could do" rather than competing with what's actually due today.
  const quickTask = useMemo(
    () => (todayTasks.length === 0 ? tasksFor(data, 'low', 15).find((t) => !t.due || daysAway(t.due) > 0) : undefined),
    [data, todayTasks.length],
  )

  const nextFilm = useMemo(
    () => [...data.movies].filter((m) => !m.watched).sort((a, b) => b.priority - a.priority)[0],
    [data.movies],
  )
  const playing = useMemo(() => data.games.find((g) => g.status === 'playing'), [data.games])

  // Goals with a deadline inside the next 90 days, unfunded ones first — a goal that's
  // comfortably on track for next year doesn't need to be here every morning.
  const goalDeadlines = useMemo(
    () =>
      data.goals
        .filter((g) => !g.archived && g.targetDate && daysAway(g.targetDate) <= 90)
        .map((g) => ({ g, progress: goalProgress(g) }))
        .filter(({ progress }) => progress.pace !== 'funded')
        .sort((a, b) => (a.g.targetDate! < b.g.targetDate! ? -1 : 1))
        .slice(0, 4),
    [data.goals],
  )

  // One nudge, not a nag list — the single stalest active project, if any
  // have actually gone quiet.
  const stalestProject = useMemo(() => staleProjects(data.projects)[0], [data.projects])

  // "A birthday in the next two weeks, or one person you're overdue with" —
  // both can show at once, but each is at most one person, not a list.
  const nextBirthday = useMemo(() => upcomingBirthdays(data.people, 14)[0], [data.people])
  const mostOverdue = useMemo(() => overdueContact(data.people)[0], [data.people])

  // Silent 95% of days, by design — only urgent items even reach this list.
  const urgentMaintenance = useMemo(
    () => dueMaintenance(data.maintenance, data.settings.odometer).filter((d) => d.urgent),
    [data.maintenance, data.settings.odometer],
  )

  // A paycheck that's landed but has nothing assigned yet — and still has
  // something left unfunded before the next one, so a fully-covered month
  // doesn't nag forever with nothing useful to do about it.
  const paycheckPrompt = useMemo(() => {
    for (const income of data.incomes) {
      const last = lastPayDate(income)
      if (!last) continue
      if (data.allocations.some((a) => a.paycheckDate === last)) continue
      const afterCandidates = data.incomes
        .map((i) => nextPaydayFor(i, fromKey(addDays(last, 1))))
        .filter((d): d is string => d != null)
      const until = afterCandidates.length > 0 ? afterCandidates.sort()[0] : addDays(last, FALLBACK_PAY_WINDOW[income.cadence])
      if (fundingGap(data, until).length === 0) continue
      return { income, paycheckDate: last, until }
    }
    return null
  }, [data])

  const perDayTone = plan.perDay <= 0 ? 'over' : plan.perDay < 15 ? 'warn' : 'good'
  const perDayDisplay = useCountUp(Math.max(0, plan.perDay))

  // Live preview as you type — the parser's own non-negotiable: never file
  // something silently. Recomputed on every keystroke since it's cheap regex
  // work, not a debounce-worthy cost.
  const quickAddParsed = useMemo(() => (quickAdd.trim() ? parseQuickAdd(quickAdd, data.envelopes) : null), [quickAdd, data.envelopes])

  // #29: capture asks nothing — the parse is shown for reassurance, but
  // committing it is Inbox's job now, done in a batch during triage. Nothing
  // here decides an envelope or files a task; it just lands the raw text
  // (plus the guess, so triage doesn't start from scratch).
  const submitQuickAdd = () => {
    const raw = quickAdd.trim()
    if (!raw) return
    store.update((d) => {
      d.inbox.push({ id: uid(), at: new Date().toISOString(), text: raw, guess: quickAddParsed ?? undefined })
    })
    setQuickAdd('')
  }

  const complete = (id: string) =>
    store.update((d) => {
      const t = d.tasks.find((x) => x.id === id)
      if (t) t.done = true
    })

  const snooze = (id: string) =>
    store.update((d) => {
      const t = d.tasks.find((x) => x.id === id)
      if (t) t.due = addDays(todayKey(), 1)
    })

  // Everything lives in one browser on one device — the failure mode is
  // silent and total, so this nags until an export actually happens.
  const exportedDaysAgo = data.settings.lastExportAt
    ? Math.floor((Date.now() - new Date(data.settings.lastExportAt).getTime()) / 86_400_000)
    : null
  const snoozed = data.settings.exportNagSnoozedUntil != null && data.settings.exportNagSnoozedUntil > todayKey()
  const showBackupNag = !snoozed && (exportedDaysAgo === null || exportedDaysAgo > 30)

  const backUpNow = () => {
    const blob = new Blob([store.export()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `jarvis-${todayKey()}.json`
    a.click()
    URL.revokeObjectURL(url)
    store.update((d) => { d.settings.lastExportAt = new Date().toISOString() })
  }

  const snoozeBackupNag = () =>
    store.update((d) => { d.settings.exportNagSnoozedUntil = addDays(todayKey(), 7) })

  // Reorderable/hideable content panels (#12) — everyone's "today" is a
  // different shape. Keyed so Settings can reorder/hide by key without this
  // component needing to know about that UI at all.
  const panelContent: Record<TodayPanelKey, ReactNode> = {
    insights: <InsightsPanel go={go} />,
    tasks: (
      <Panel
        title="Today"
        action={
          <button className="btn sm ghost" onClick={() => go('tasks')}>
            All tasks <Icons.chevron size={13} />
          </button>
        }
      >
        <div className="rows">
          {todayTasks.length === 0 && !quickTask && <Empty>Nothing due today.</Empty>}
          {todayTasks.length === 0 && quickTask && (
            <div className="row">
              <input type="checkbox" className="check" checked={false} onChange={() => complete(quickTask.id)} aria-label={`Complete ${quickTask.title}`} />
              <div className="grow">
                <div className="title">{quickTask.title}</div>
                <div className="meta">Nothing due today — low energy{quickTask.minutes ? `, ~${quickTask.minutes}m` : ''}</div>
              </div>
            </div>
          )}
          {todayTasks.map((t) => (
            <div key={t.id} className="row">
              <input type="checkbox" className="check" checked={false} onChange={() => complete(t.id)} aria-label={`Complete ${t.title}`} />
              <div className="grow">
                <div className="title">{t.title}</div>
                <div className="meta">
                  {t.due && relativeDay(t.due)}
                  {t.time && ` · ${t.time}`}
                  {t.steps && t.steps.length > 0 && ` · ${t.steps.filter((s) => s.done).length}/${t.steps.length} steps`}
                </div>
              </div>
              {t.due && daysAway(t.due) < 0 && <span className="chip over">Late</span>}
              <button className="iconbtn" aria-label={`Snooze ${t.title} to tomorrow`} onClick={() => snooze(t.id)}>
                <Icons.snooze />
              </button>
            </div>
          ))}
        </div>
      </Panel>
    ),
    routines: <RoutinesPanel />,
    projects: stalestProject ? (
      <Panel
        title="Gone quiet"
        action={
          <button className="btn sm ghost" onClick={() => go('projects')}>
            Projects <Icons.chevron size={13} />
          </button>
        }
      >
        <div className="rows">
          <div className="row">
            <div className="grow">
              <div className="title">{stalestProject.label} — {daysSinceTouched(stalestProject)} days</div>
              {stalestProject.nextAction && <div className="meta">Next: {stalestProject.nextAction}</div>}
            </div>
          </div>
        </div>
      </Panel>
    ) : null,
    people: nextBirthday || mostOverdue ? (
      <Panel
        title="People"
        action={
          <button className="btn sm ghost" onClick={() => go('people')}>
            People <Icons.chevron size={13} />
          </button>
        }
      >
        <div className="rows">
          {nextBirthday && (
            <div className="row">
              <div className="grow">
                <div className="title">{nextBirthday.person.name}’s birthday {relativeDay(nextBirthday.date)}</div>
                {nextBirthday.turning != null && <div className="meta">Turning {nextBirthday.turning}</div>}
              </div>
            </div>
          )}
          {mostOverdue && (
            <div className="row">
              <div className="grow">
                <div className="title">Reach out to {mostOverdue.name}</div>
                <div className="meta">
                  {mostOverdue.lastContact ? `Last talked ${relativeDay(mostOverdue.lastContact)}` : 'No contact logged yet'}
                </div>
              </div>
            </div>
          )}
        </div>
      </Panel>
    ) : null,
    maintenance: urgentMaintenance.length > 0 ? (
      <Panel
        title="Maintenance due"
        action={
          <button className="btn sm ghost" onClick={() => go('maintenance')}>
            Maintenance <Icons.chevron size={13} />
          </button>
        }
      >
        <div className="rows">
          {urgentMaintenance.map((d) => (
            <div key={d.item.id} className="row">
              <div className="grow">
                <div className="title">{d.item.label}</div>
                <div className="meta">{d.dueIn}</div>
              </div>
              <span className="chip warn">Due</span>
            </div>
          ))}
        </div>
      </Panel>
    ) : null,
    bills: (
      <Panel
        title="Bills coming up"
        action={
          <button className="btn sm ghost" onClick={() => go('money')}>
            Money <Icons.chevron size={13} />
          </button>
        }
      >
        <div className="rows">
          {dueSoon.length === 0 && <Empty>Nothing due in the next 10 days.</Empty>}
          {dueSoon.map((b) => (
            <div key={b.id} className="row">
              <div className="grow">
                <div className="title">{b.label}</div>
                <div className="meta">
                  {relativeDay(b.due)}
                  {b.autopay && ' · autopay'}
                </div>
              </div>
              {daysAway(b.due) <= 0 && <span className="chip over">Due today</span>}
              <span className="num">{money(b.amount)}</span>
            </div>
          ))}
        </div>
      </Panel>
    ),
    goals: goalDeadlines.length > 0 ? (
      <Panel
        title="Savings deadlines"
        action={
          <button className="btn sm ghost" onClick={() => go('money')}>
            Money <Icons.chevron size={13} />
          </button>
        }
      >
        <div className="rows">
          {goalDeadlines.map(({ g, progress }) => (
            <div key={g.id} className="row">
              <div className="grow">
                <div className="title">{g.label}</div>
                <div className="meta">
                  Due {relativeDay(g.targetDate!)} · {money(goalSaved(g))} of {money(g.target)}
                </div>
              </div>
              {progress.pace === 'behind' && progress.requiredMonthly != null ? (
                <span className="chip over">Need {money(progress.requiredMonthly)}/mo</span>
              ) : (
                <span className="chip good">On track</span>
              )}
            </div>
          ))}
        </div>
      </Panel>
    ) : null,
    downtime: (
      <Panel
        title="Downtime"
        action={
          <button className="btn sm ghost" onClick={() => go('queue')}>
            Queue <Icons.chevron size={13} />
          </button>
        }
      >
        <div className="rows">
          {!nextFilm && !playing && <Empty>Nothing queued up to watch or play.</Empty>}
          {nextFilm && (
            <div className="row">
              <div className="grow">
                <div className="title">{nextFilm.title}</div>
                <div className="meta">Next film{nextFilm.service ? ` · ${nextFilm.service}` : ''}</div>
              </div>
              <span className="chip accent">Watch</span>
            </div>
          )}
          {playing && (
            <div className="row">
              <div className="grow">
                <div className="title">{playing.title}</div>
                <div className="meta">
                  Currently playing{gameHours(playing) > 0 ? ` · ${gameHours(playing)}h in` : ''}
                </div>
              </div>
              <span className="chip accent">Play</span>
            </div>
          )}
        </div>
      </Panel>
    ),
    quickadd: (
      <Panel title="Quick add">
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={quickAdd}
              placeholder="coffee 4.50, buy milk tomorrow, or just an idea…"
              onChange={(e) => setQuickAdd(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitQuickAdd()}
              aria-label="Quick add"
              style={{ flex: 1, minWidth: 0 }}
            />
            <button className="btn primary" type="button" onClick={submitQuickAdd} disabled={!quickAdd.trim()}>
              Capture
            </button>
          </div>
          {/* Capture asks nothing — this preview is reassurance, not a gate.
              The actual filing decision happens in Inbox, in a batch. */}
          {quickAddParsed && (
            <span className="chip accent" style={{ alignSelf: 'flex-start' }}>
              {quickAddParsed.kind === 'expense' &&
                `Expense · ${money(quickAddParsed.amount)} · ${quickAddParsed.envelopeHint ?? 'Unassigned'}`}
              {quickAddParsed.kind === 'task' &&
                `Task${quickAddParsed.due ? ` · due ${relativeDay(quickAddParsed.due)}` : ''}${quickAddParsed.time ? ` · ${formatTime12(quickAddParsed.time)}` : ''}`}
              {quickAddParsed.kind === 'note' && 'Journal note'}
            </span>
          )}
          {data.inbox.length > 0 && (
            <button
              className="btn sm ghost"
              type="button"
              onClick={() => go('inbox')}
              style={{ alignSelf: 'flex-start', color: data.inbox.length > 20 ? 'var(--warn)' : undefined, borderColor: data.inbox.length > 20 ? 'var(--warn)' : undefined }}
            >
              {data.inbox.length > 20
                ? `${data.inbox.length} waiting in Inbox — worth a pass`
                : `${data.inbox.length} waiting in Inbox`}
            </button>
          )}
        </div>
      </Panel>
    ),
  }

  const hidden = data.settings.todayHidden ?? []
  const orderedPanels = effectiveTodayOrder(data.settings.todayOrder).filter((k) => !hidden.includes(k))

  return (
    <>
      <div className="searchbox">
        <Icons.search size={16} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search everything…"
          aria-label="Search"
        />
      </div>
      {searchQuery.trim() !== '' && (
        <Panel>
          {searchHits.length === 0 && <Empty>Nothing matches "{searchQuery.trim()}".</Empty>}
          {KIND_ORDER.map((kind) => {
            const hits = searchGroups[kind]
            if (!hits || hits.length === 0) return null
            return (
              <div key={kind}>
                <div className="section-label" style={{ padding: '10px 14px 4px' }}>{KIND_LABEL[kind]}</div>
                <div className="rows">
                  {hits.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      className="row"
                      style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, cursor: 'pointer' }}
                      onClick={() => jumpToHit(h)}
                    >
                      <div className="grow">
                        <div className="title">{h.title}</div>
                        <div className="meta">{h.sub}</div>
                      </div>
                      <Icons.chevron size={14} />
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </Panel>
      )}

      {showBackupNag && (
        <div className="notice" style={{ background: 'var(--warn-soft)', color: 'var(--warn)', borderColor: 'var(--warn)' }}>
          <span>
            {exportedDaysAgo === null ? "You haven't backed up yet." : `Last backup was ${exportedDaysAgo} days ago.`} Everything lives on this one device.
          </span>
          <span className="spacer" style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm" onClick={backUpNow}>Back up now</button>
            <button className="btn sm ghost" onClick={snoozeBackupNag}>Not now</button>
          </span>
        </div>
      )}

      {paycheckPrompt && (
        <div className="notice" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' }}>
          <span>
            {money(paycheckPrompt.income.amount)} from {paycheckPrompt.income.label} landed {relativeDay(paycheckPrompt.paycheckDate)}. Nothing's assigned yet.
          </span>
          <span className="spacer" style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm" onClick={() => setAssigningPaycheck(true)}>Assign it</button>
          </span>
        </div>
      )}

      {pendingClose && (
        <div className="notice" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' }}>
          <span>{monthLabel(pendingClose)} hasn't been closed out yet.</span>
          <span className="spacer" style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm" onClick={() => setClosingMonth(true)}>Close it out</button>
          </span>
        </div>
      )}

      <section className="panel">
        <div className="hero">
          <div className="figure" style={{ color: `var(--${perDayTone})` }}>{money(perDayDisplay)}</div>
          <p className="caption">
            a day for the rest of the month. <strong>{money(plan.billsRemaining)}</strong> of bills still to come.
          </p>
        </div>
        <div className="stats">
          <div className="stat">
            <div className="k">Left to spend</div>
            <div className="v" style={{ color: plan.envelopeLeft < 0 ? 'var(--over)' : undefined }}>
              {money(plan.envelopeLeft)}
            </div>
          </div>
          <div className="stat">
            <div className="k">Spent</div>
            <div className="v">{money(plan.spent)}</div>
          </div>
          <div className="stat">
            <div className="k">Days left</div>
            <div className="v">{plan.daysLeft}</div>
          </div>
          {streak > 0 && (
            <div className="stat">
              <div className="k">Logging streak</div>
              <div className="v">{streak} {streak === 1 ? 'day' : 'days'}</div>
            </div>
          )}
        </div>
      </section>

      {onThisDay && (
        <Panel title="On this day">
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p className="meta" style={{ margin: 0 }}>
              {new Date().getFullYear() - Number(onThisDay.at.slice(0, 4))} year{new Date().getFullYear() - Number(onThisDay.at.slice(0, 4)) === 1 ? '' : 's'} ago
            </p>
            <p className="note-body" style={{ margin: 0 }}>{onThisDay.text}</p>
          </div>
        </Panel>
      )}

      {takeaway && (
        <Panel
          title="From what you've been learning"
          action={
            <button className="btn sm ghost" onClick={() => go('learning')}>
              Learning <Icons.chevron size={13} />
            </button>
          }
        >
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {takeawayTopic && <p className="meta" style={{ margin: 0 }}>{takeawayTopic.label}</p>}
            <p className="note-body" style={{ margin: 0 }}>{takeaway.text}</p>
          </div>
        </Panel>
      )}

      {orderedPanels.map((key) => <Fragment key={key}>{panelContent[key]}</Fragment>)}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn ghost" style={{ justifyContent: 'center', flex: 1 }} type="button" onClick={() => setReviewing(true)}>
          Review this week
        </button>
        <button className="btn ghost" style={{ justifyContent: 'center', flex: 1 }} type="button" onClick={() => setReviewingYear(true)}>
          Year in review
        </button>
      </div>

      <p className="section-label" style={{ textAlign: 'center', paddingBottom: 4 }}>
        {new Date(todayKey() + 'T12:00:00').toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}
      </p>

      {reviewing && <WeeklyReview onClose={() => setReviewing(false)} />}
      {reviewingYear && <YearReview onClose={() => setReviewingYear(false)} />}
      {assigningPaycheck && paycheckPrompt && (
        <PaycheckSheet
          income={paycheckPrompt.income}
          paycheckDate={paycheckPrompt.paycheckDate}
          until={paycheckPrompt.until}
          onClose={() => setAssigningPaycheck(false)}
        />
      )}
      {closingMonth && pendingClose && <MonthCloseSheet month={pendingClose} onClose={() => setClosingMonth(false)} />}
    </>
  )
}
