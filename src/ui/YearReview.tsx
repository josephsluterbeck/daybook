import { useMemo, useState } from 'react'
import { useData } from '../core/store'
import { buildYearReview, reviewMonthLabel } from '../core/review'
import { formatMoney } from '../core/budget'
import { prettyDate } from '../core/dates'
import { Empty, Icons, Panel, Sheet } from './components/kit'

/**
 * A long scroll, on purpose — the reward for a year of logging, built from
 * data nobody else has. Reads as a summary, not a celebration: plain
 * sentences, no confetti, and an honest "so far" when the year isn't over.
 */
export default function YearReview({ onClose }: { onClose: () => void }) {
  const data = useData()
  const [year, setYear] = useState(new Date().getFullYear())
  const money = (n: number) => formatMoney(n, data.settings.currency)
  const review = useMemo(() => buildYearReview(data, year), [data, year])
  const isCurrentYear = year === new Date().getFullYear()

  return (
    <Sheet title={review.isPartial ? `${year}, so far` : String(year)} onClose={onClose} onSubmit={onClose} submitLabel="Done">
      <div className="monthnav">
        {/* type="button" isn't optional here — unlike Money's own month nav,
            this one sits inside the Sheet's <form>, where a bare <button>
            defaults to type="submit" and would close the whole sheet. */}
        <button type="button" className="iconbtn flip" aria-label="Previous year" onClick={() => setYear((y) => y - 1)}>
          <Icons.chevron />
        </button>
        <span className="monthnav-label">{review.isPartial ? `${year}, so far` : year}</span>
        <button type="button" className="iconbtn" aria-label="Next year" disabled={isCurrentYear} onClick={() => setYear((y) => y + 1)}>
          <Icons.chevron />
        </button>
      </div>

      <Panel title="Money">
        <div style={{ padding: '4px 14px 12px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
          <p style={{ margin: 0 }}>
            You spent <strong>{money(review.totalSpent)}</strong>{review.biggestEnvelope && <> — most of it in <strong>{review.biggestEnvelope.label}</strong> ({money(review.biggestEnvelope.amount)})</>}.
          </p>
          {review.biggestExpense && (
            <p style={{ margin: 0 }}>
              The single biggest expense was <strong>{money(review.biggestExpense.amount)}</strong>
              {review.biggestExpense.label !== 'Expense' && <> · {review.biggestExpense.label}</>}, on {prettyDate(review.biggestExpense.date)}.
            </p>
          )}
          {review.bestMonth && (
            <p style={{ margin: 0 }}>
              Your best month was <strong>{reviewMonthLabel(review.bestMonth.month)}</strong>, at {money(review.bestMonth.spent)}.
            </p>
          )}
          {review.totalSpent === 0 && <Empty>Nothing logged {review.isPartial ? 'yet' : 'that year'}.</Empty>}
        </div>
      </Panel>

      <Panel title="Bills">
        <div style={{ padding: '4px 14px 12px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
          <p style={{ margin: 0 }}>
            <strong>{review.billsPaidCount}</strong> bill{review.billsPaidCount === 1 ? '' : 's'} marked paid.
          </p>
          {review.variableBills.map((b) => (
            <p key={b.label} style={{ margin: 0 }}>
              <strong>{b.label}</strong> varied — {money(b.total)} total across {b.months} month{b.months === 1 ? '' : 's'}.
            </p>
          ))}
        </div>
      </Panel>

      <Panel title="Goals">
        <div style={{ padding: '4px 14px 12px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
          <p style={{ margin: 0 }}>
            <strong>{review.goalsHit}</strong> goal{review.goalsHit === 1 ? '' : 's'} hit this {review.isPartial ? 'year so far' : 'year'}.
          </p>
          <p style={{ margin: 0 }}>
            <strong>{money(review.totalSaved)}</strong> saved and <strong>{money(review.totalInvested)}</strong> invested, from any source.
          </p>
        </div>
      </Panel>

      <Panel title="Watching & playing">
        <div style={{ padding: '4px 14px 12px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
          <p style={{ margin: 0 }}>
            <strong>{review.filmsWatched}</strong> film{review.filmsWatched === 1 ? '' : 's'} watched
            {review.bestFilm && <> — the best was <strong>{review.bestFilm.title}</strong>, rated {review.bestFilm.rating}/10</>}.
          </p>
          <p style={{ margin: 0 }}>
            <strong>{review.gamesBeaten}</strong> game{review.gamesBeaten === 1 ? '' : 's'} beaten, <strong>{review.hoursPlayed}</strong> hours played
            {review.costPerHour != null && <> — {money(review.costPerHour)}/hour on what you finished</>}.
          </p>
        </div>
      </Panel>

      <Panel title="Tasks">
        <div style={{ padding: '4px 14px 12px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
          <p style={{ margin: 0 }}>
            <strong>{review.tasksCompleted}</strong> task{review.tasksCompleted === 1 ? '' : 's'} completed.
          </p>
          {review.longestOpenTask && (
            <p style={{ margin: 0 }}>
              Still open the longest: <strong>{review.longestOpenTask.title}</strong>, {review.longestOpenTask.daysOpen} days.
            </p>
          )}
        </div>
      </Panel>

      <Panel title="Journal">
        <div style={{ padding: '4px 14px 12px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
          <p style={{ margin: 0 }}>
            <strong>{review.journalWordCount.toLocaleString()}</strong> words written.
            {review.topTags.length > 0 && <> Most used: {review.topTags.map((t) => `#${t.tag}`).join(', ')}.</>}
          </p>
          {review.fromJanuary && (
            <div style={{ paddingTop: 4 }}>
              <div className="meta" style={{ marginBottom: 4 }}>From January — {prettyDate(review.fromJanuary.date)}</div>
              <p className="note-body" style={{ margin: 0 }}>{review.fromJanuary.text}</p>
            </div>
          )}
        </div>
      </Panel>
    </Sheet>
  )
}
