import { useEffect, useMemo, useState } from 'react'
import { store, uid, useData, useHighlight } from '../../core/store'
import type { Game, GameStatus, Movie, Series } from '../../core/types'
import { formatMoney } from '../../core/budget'
import { backlogHours, costPerHour, gameHours } from '../../core/games'
import { snoozeTriage, triageCandidates, triageDue } from '../../core/triage'
import { prettyDate, todayKey } from '../../core/dates'
import { Empty, Field, Icons, Panel, Segmented, Sheet, useCountUp, useHighlightRow } from '../components/kit'

type Tab = 'movies' | 'series' | 'games'

export default function Queue() {
  const data = useData()
  const [tab, setTab] = useState<Tab>('movies')

  // A search jump (#18) has to land on the right sub-tab, not just the screen.
  const highlight = useHighlight()
  useEffect(() => {
    if (!highlight) return
    if (data.games.some((g) => g.id === highlight)) setTab('games')
    else if (data.series.some((s) => s.id === highlight)) setTab('series')
    else if (data.movies.some((m) => m.id === highlight)) setTab('movies')
  }, [highlight, data.games, data.series, data.movies])

  return (
    <>
      <TriageCard />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'movies', label: 'Films' },
          { value: 'series', label: 'Series' },
          { value: 'games', label: 'Games' },
        ]}
      />
      {tab === 'movies' && <Movies />}
      {tab === 'series' && <SeriesTab />}
      {tab === 'games' && <Games />}
    </>
  )
}

/**
 * #43 — offered at most monthly, never the whole backlog, and never auto-
 * removes anything: every action here is something explicitly chosen.
 * Mixes movies and games in one card since the prompt is "still want
 * these?", not "review your films."
 */
function TriageCard() {
  const data = useData()
  const [dismissed, setDismissed] = useState(false)
  if (dismissed || !triageDue(data)) return null
  const candidates = triageCandidates(data)
  const isGame = (item: Movie | Game): item is Game => 'status' in item

  const dismissCard = () => {
    store.update((d) => snoozeTriage(d))
    setDismissed(true)
  }
  const keep = (item: Movie | Game) =>
    store.update((d) => {
      const list = isGame(item) ? d.games : d.movies
      const t = list.find((x) => x.id === item.id)
      if (t) t.lastReviewed = todayKey()
    })
  const drop = (item: Movie | Game) =>
    store.update((d) => {
      const list = isGame(item) ? d.games : d.movies
      const t = list.find((x) => x.id === item.id)
      if (t) t.archived = true
    })
  const bump = (item: Movie | Game) =>
    store.update((d) => {
      if (isGame(item)) {
        const g = d.games.find((x) => x.id === item.id)
        if (g) {
          if (g.status === 'wishlist') g.status = 'backlog'
          g.lastReviewed = todayKey()
        }
      } else {
        const m = d.movies.find((x) => x.id === item.id)
        if (m) {
          m.priority = Math.min(3, m.priority + 1) as 1 | 2 | 3
          m.lastReviewed = todayKey()
        }
      }
    })

  return (
    <Panel
      title="Still want these?"
      action={
        <button type="button" className="btn sm ghost" onClick={dismissCard}>
          Not now
        </button>
      }
    >
      <p className="fieldnote" style={{ padding: '0 14px' }}>
        {candidates.length} thing{candidates.length === 1 ? '' : 's'} you added a while ago.
      </p>
      <div className="rows">
        {candidates.map((item) => (
          <div key={item.id} className="row" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <div className="title">{item.title}</div>
              <div className="meta">{isGame(item) ? item.platform ?? 'Game' : item.year ?? 'Film'}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button type="button" className="btn sm ghost" onClick={() => keep(item)}>Keep</button>
              <button type="button" className="btn sm ghost" onClick={() => bump(item)}>Bump</button>
              <button type="button" className="btn sm ghost" onClick={() => drop(item)}>Drop</button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

/* ══ Movies ══════════════════════════════════════════════════════════════ */

const PRIORITY_LABEL: Record<number, string> = { 3: 'Next up', 2: 'Soon', 1: 'Someday' }
/** A colour cue per priority, not just "Next up" standing out — Soon and Someday now read at a glance too. */
const PRIORITY_TONE: Record<number, string> = { 3: 'accent', 2: 'warn', 1: 'good' }

function Movies() {
  const data = useData()
  const [editing, setEditing] = useState<Movie | 'new' | null>(null)
  const [title, setTitle] = useState('')
  const [showWatched, setShowWatched] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  // "What fits tonight" — a 40-item watchlist is decision paralysis; a time
  // filter plus a shuffle button is a real answer instead of more scrolling.
  const [maxMinutes, setMaxMinutes] = useState<number | null>(null)

  const { queue, watched, archived } = useMemo(() => {
    const active = data.movies.filter((m) => !m.archived)
    const sorted = [...active].sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title))
    return {
      queue: sorted.filter((m) => !m.watched),
      watched: sorted.filter((m) => m.watched),
      archived: data.movies.filter((m) => m.archived),
    }
  }, [data.movies])

  const fitsTonight = useMemo(
    () => (maxMinutes == null ? queue : queue.filter((m) => m.runtime != null && m.runtime <= maxMinutes)),
    [queue, maxMinutes],
  )

  const shuffle = () => {
    const pool = maxMinutes == null ? queue : fitsTonight
    if (pool.length === 0) return
    const pick = pool[Math.floor(Math.random() * pool.length)]
    store.setHighlight(pick.id)
  }

  // Same reasoning as Tasks' "Done" list: a highlighted watched film has to
  // be expanded into view, or its row never mounts to clear the highlight.
  const highlight = useHighlight()
  useEffect(() => {
    if (highlight && watched.some((m) => m.id === highlight)) setShowWatched(true)
  }, [highlight, watched])

  const quickAdd = () => {
    const t = title.trim()
    if (!t) return
    store.update((d) => {
      d.movies.unshift({ id: uid(), title: t, priority: 2, watched: false, addedAt: todayKey() })
    })
    setTitle('')
  }

  const toggleWatched = (id: string) =>
    store.update((d) => {
      const m = d.movies.find((x) => x.id === id)
      if (m) m.watched = !m.watched
    })

  return (
    <>
      <Panel title={`Watchlist · ${queue.length}`}>
        <div className="quickadd">
          <input
            type="text"
            value={title}
            placeholder="Add a film…"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
            aria-label="Film title"
          />
          <button className="btn primary" type="button" onClick={quickAdd}>
            Add
          </button>
        </div>
        {queue.length > 0 && (
          <div style={{ display: 'flex', gap: 8, padding: '12px 14px', alignItems: 'center' }}>
            <select
              value={maxMinutes ?? ''}
              onChange={(e) => setMaxMinutes(e.target.value ? Number(e.target.value) : null)}
              aria-label="Got time for"
              style={{ flex: 1, minWidth: 0 }}
            >
              <option value="">Any length</option>
              <option value="30">Under 30 min</option>
              <option value="60">Under an hour</option>
              <option value="90">Under 1.5 hours</option>
              <option value="120">Under 2 hours</option>
            </select>
            <button type="button" className="btn sm ghost" onClick={shuffle} disabled={(maxMinutes == null ? queue : fitsTonight).length === 0}>
              <Icons.shuffle size={14} /> Surprise me
            </button>
          </div>
        )}
        <div className="rows">
          {queue.length === 0 && <Empty>Nothing queued. Add the one you keep forgetting.</Empty>}
          {queue.length > 0 && fitsTonight.length === 0 && (
            <Empty>Nothing logged that short — try a longer window, or add a runtime to a film.</Empty>
          )}
          {fitsTonight.map((m) => (
            <MovieRow key={m.id} movie={m} onToggle={() => toggleWatched(m.id)} onEdit={() => setEditing(m)} />
          ))}
        </div>
      </Panel>

      <Panel
        title={`Watched · ${watched.length}`}
        action={
          <button className="btn sm ghost" onClick={() => setShowWatched((s) => !s)}>
            {showWatched ? 'Hide' : 'Show'}
          </button>
        }
      >
        {showWatched && (
          <div className="rows">
            {watched.length === 0 && <Empty>Nothing marked watched yet.</Empty>}
            {watched.map((m) => (
              <WatchedMovieRow key={m.id} movie={m} onToggle={() => toggleWatched(m.id)} onEdit={() => setEditing(m)} />
            ))}
          </div>
        )}
      </Panel>

      {archived.length > 0 && (
        <Panel
          title={`Archived · ${archived.length}`}
          action={
            <button className="btn sm ghost" onClick={() => setShowArchived((s) => !s)}>
              {showArchived ? 'Hide' : 'Show'}
            </button>
          }
        >
          {showArchived && (
            <div className="rows">
              {archived.map((m) => (
                <div key={m.id} className="row">
                  <div className="grow title">{m.title}</div>
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={() => store.update((d) => { const t = d.movies.find((x) => x.id === m.id); if (t) t.archived = false })}
                  >
                    Unarchive
                  </button>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {editing && <MovieSheet movie={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function MovieRow({ movie: m, onToggle, onEdit }: { movie: Movie; onToggle: () => void; onEdit: () => void }) {
  const { ref, highlighted } = useHighlightRow<HTMLDivElement>(m.id)
  return (
    <div ref={ref} className={`row${highlighted ? ' highlight' : ''}`}>
      <input type="checkbox" className="check" checked={false} onChange={onToggle} aria-label={`Mark ${m.title} watched`} />
      <div className="grow">
        <div className="title">
          {m.title} {m.year && <span className="meta num">{m.year}</span>}
        </div>
        <div className="meta">
          {m.service ?? 'No service set'}
          {m.runtime && ` · ${m.runtime} min`}
          {m.notes && ` · ${m.notes}`}
        </div>
      </div>
      <span className={`chip ${PRIORITY_TONE[m.priority]}`}>{PRIORITY_LABEL[m.priority]}</span>
      <button className="iconbtn" aria-label={`Edit ${m.title}`} onClick={onEdit}>
        <Icons.edit />
      </button>
    </div>
  )
}

function WatchedMovieRow({ movie: m, onToggle, onEdit }: { movie: Movie; onToggle: () => void; onEdit: () => void }) {
  const { ref, highlighted } = useHighlightRow<HTMLDivElement>(m.id)
  return (
    <div ref={ref} className={`row${highlighted ? ' highlight' : ''}`}>
      <input type="checkbox" className="check" checked onChange={onToggle} aria-label={`Move ${m.title} back to watchlist`} />
      <div className="grow">
        <div className="title">{m.title}</div>
        <div className="meta">{m.rating ? `Rated ${m.rating}/10` : 'Not rated'}</div>
      </div>
      <button className="iconbtn" aria-label={`Edit ${m.title}`} onClick={onEdit}>
        <Icons.edit />
      </button>
    </div>
  )
}

function MovieSheet({ movie, onClose }: { movie: Movie | null; onClose: () => void }) {
  const [title, setTitle] = useState(movie?.title ?? '')
  const [year, setYear] = useState(String(movie?.year ?? ''))
  const [service, setService] = useState(movie?.service ?? '')
  const [priority, setPriority] = useState(String(movie?.priority ?? 2))
  const [watched, setWatched] = useState(movie?.watched ?? false)
  const [rating, setRating] = useState(String(movie?.rating ?? ''))
  const [runtime, setRuntime] = useState(String(movie?.runtime ?? ''))
  const [notes, setNotes] = useState(movie?.notes ?? '')

  const save = () => {
    if (!title.trim()) return
    const patch = {
      title: title.trim(),
      year: Number(year) || undefined,
      service: service.trim() || undefined,
      priority: (Number(priority) || 2) as Movie['priority'],
      watched,
      rating: Number(rating) || undefined,
      runtime: Number(runtime) || undefined,
      notes: notes.trim() || undefined,
    }
    store.update((d) => {
      if (movie) {
        const t = d.movies.find((x) => x.id === movie.id)
        if (t) Object.assign(t, patch)
      } else {
        d.movies.unshift({ id: uid(), addedAt: todayKey(), ...patch })
      }
    })
    onClose()
  }

  return (
    <Sheet
      title={movie ? 'Edit film' : 'Add film'}
      onClose={onClose}
      onSubmit={save}
      onDelete={movie ? () => { store.remove(movie.title, (d) => { d.movies = d.movies.filter((x) => x.id !== movie.id) }); onClose() } : undefined}
    >
      <Field label="Title">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="formgrid">
        <Field label="Year">
          <input type="text" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2025" />
        </Field>
        <Field label="Where to watch">
          <input type="text" value={service} onChange={(e) => setService(e.target.value)} placeholder="Max" />
        </Field>
        <Field label="Priority">
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="3">Next up</option>
            <option value="2">Soon</option>
            <option value="1">Someday</option>
          </select>
        </Field>
        <Field label="Rating out of 10">
          <input type="text" inputMode="numeric" value={rating} onChange={(e) => setRating(e.target.value)} disabled={!watched} />
        </Field>
        <Field label="Runtime (minutes)">
          <input type="text" inputMode="numeric" value={runtime} onChange={(e) => setRuntime(e.target.value)} placeholder="118" />
        </Field>
        <Field label="Notes" wide>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14 }}>
        <input type="checkbox" className="check" checked={watched} onChange={(e) => setWatched(e.target.checked)} />
        Already watched
      </label>
      {movie && !movie.archived && (
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => {
            store.update((d) => { const t = d.movies.find((x) => x.id === movie.id); if (t) t.archived = true })
            onClose()
          }}
        >
          Archive — keep the record, off the list
        </button>
      )}
    </Sheet>
  )
}

/* ══ Series ══════════════════════════════════════════════════════════════ */

const SERIES_STATUS: { value: Series['status']; label: string; tone?: string }[] = [
  { value: 'watching', label: 'Watching', tone: 'accent' },
  { value: 'queued', label: 'Queued' },
  { value: 'finished', label: 'Finished', tone: 'good' },
  { value: 'dropped', label: 'Dropped' },
]

function SeriesTab() {
  const data = useData()
  const [editing, setEditing] = useState<Series | 'new' | null>(null)
  const [title, setTitle] = useState('')

  const grouped = useMemo(() => {
    const out: Record<Series['status'], Series[]> = { watching: [], queued: [], finished: [], dropped: [] }
    for (const s of data.series) out[s.status].push(s)
    return out
  }, [data.series])

  const quickAdd = () => {
    const t = title.trim()
    if (!t) return
    store.update((d) => {
      d.series.unshift({ id: uid(), title: t, season: 1, episode: 1, status: 'queued', addedAt: todayKey() })
    })
    setTitle('')
  }

  return (
    <>
      <Panel title="Add a series">
        <div className="quickadd">
          <input
            type="text"
            value={title}
            placeholder="Show title…"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
            aria-label="Series title"
          />
          <button className="btn primary" type="button" onClick={quickAdd}>
            Add
          </button>
        </div>
      </Panel>

      {SERIES_STATUS.map(({ value, label, tone }) => {
        const list = grouped[value]
        if (list.length === 0 && value !== 'watching') return null
        return (
          <Panel key={value} title={`${label} · ${list.length}`}>
            <div className="rows">
              {list.length === 0 && <Empty>Nothing here right now.</Empty>}
              {list.map((s) => (
                <SeriesRow key={s.id} series={s} tone={tone} label={label} onEdit={() => setEditing(s)} />
              ))}
            </div>
          </Panel>
        )
      })}

      {editing && <SeriesSheet series={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function SeriesRow({ series: s, tone, label, onEdit }: { series: Series; tone?: string; label: string; onEdit: () => void }) {
  const { ref, highlighted } = useHighlightRow<HTMLDivElement>(s.id)
  const bump = () => store.update((d) => { const t = d.series.find((x) => x.id === s.id); if (t) t.episode += 1 })
  return (
    <div ref={ref} className={`row${highlighted ? ' highlight' : ''}`}>
      <div className="grow">
        <div className="title">{s.title}</div>
        <div className="meta">
          S{s.season} E{s.episode}
          {s.service ? ` · ${s.service}` : ''}
          {s.notes ? ` · ${s.notes}` : ''}
        </div>
      </div>
      {/* The one interaction that will actually get used: one tap after each episode. */}
      {s.status === 'watching' && (
        <button className="btn sm" type="button" onClick={bump}>
          +1
        </button>
      )}
      {tone && <span className={`chip ${tone}`}>{label}</span>}
      <button className="iconbtn" aria-label={`Edit ${s.title}`} onClick={onEdit}>
        <Icons.edit />
      </button>
    </div>
  )
}

function SeriesSheet({ series, onClose }: { series: Series | null; onClose: () => void }) {
  const [title, setTitle] = useState(series?.title ?? '')
  const [service, setService] = useState(series?.service ?? '')
  const [season, setSeason] = useState(String(series?.season ?? 1))
  const [episode, setEpisode] = useState(String(series?.episode ?? 1))
  const [status, setStatus] = useState<Series['status']>(series?.status ?? 'queued')
  const [notes, setNotes] = useState(series?.notes ?? '')

  const save = () => {
    if (!title.trim()) return
    const patch = {
      title: title.trim(),
      service: service.trim() || undefined,
      season: Number(season) || 1,
      episode: Number(episode) || 1,
      status,
      notes: notes.trim() || undefined,
    }
    store.update((d) => {
      if (series) {
        const t = d.series.find((x) => x.id === series.id)
        if (t) Object.assign(t, patch)
      } else {
        d.series.unshift({ id: uid(), addedAt: todayKey(), ...patch })
      }
    })
    onClose()
  }

  return (
    <Sheet
      title={series ? 'Edit series' : 'Add series'}
      onClose={onClose}
      onSubmit={save}
      onDelete={series ? () => { store.remove(series.title, (d) => { d.series = d.series.filter((x) => x.id !== series.id) }); onClose() } : undefined}
    >
      <Field label="Title">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="formgrid">
        <Field label="Season">
          <input type="text" inputMode="numeric" value={season} onChange={(e) => setSeason(e.target.value)} />
        </Field>
        <Field label="Episode">
          <input type="text" inputMode="numeric" value={episode} onChange={(e) => setEpisode(e.target.value)} />
        </Field>
        <Field label="Where to watch">
          <input type="text" value={service} onChange={(e) => setService(e.target.value)} placeholder="Apple TV+" />
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as Series['status'])}>
            {SERIES_STATUS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Notes" wide>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  )
}

/* ══ Games ═══════════════════════════════════════════════════════════════ */

const GAME_STATUS: { value: GameStatus; label: string; tone?: string }[] = [
  { value: 'playing', label: 'Playing', tone: 'accent' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'wishlist', label: 'Wishlist' },
  { value: 'beaten', label: 'Beaten', tone: 'good' },
  { value: 'shelved', label: 'Shelved' },
]

function Games() {
  const data = useData()
  const [editing, setEditing] = useState<Game | 'new' | null>(null)
  const [title, setTitle] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const grouped = useMemo(() => {
    const out: Record<GameStatus, Game[]> = { playing: [], backlog: [], wishlist: [], beaten: [], shelved: [] }
    for (const g of data.games) if (!g.archived) out[g.status].push(g)
    return out
  }, [data.games])

  const archived = useMemo(() => data.games.filter((g) => g.archived), [data.games])

  const wishlistValue = grouped.wishlist.reduce((s, g) => s + (g.price ?? 0), 0)
  const activeGames = useMemo(() => data.games.filter((g) => !g.archived), [data.games])
  const backlog = backlogHours(activeGames)
  const backlogDisplay = useCountUp(backlog)

  const quickAdd = () => {
    const t = title.trim()
    if (!t) return
    store.update((d) => {
      d.games.unshift({ id: uid(), title: t, status: 'wishlist', addedAt: todayKey() })
    })
    setTitle('')
  }

  return (
    <>
      {backlog > 0 && (
        <section className="panel">
          <div className="hero">
            <div className="figure">{Math.round(backlogDisplay)}h</div>
            <p className="caption">queued up across your backlog and wishlist.</p>
          </div>
        </section>
      )}

      <Panel title="Add to the pile">
        <div className="quickadd">
          <input
            type="text"
            value={title}
            placeholder="Game title…"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
            aria-label="Game title"
          />
          <button className="btn primary" type="button" onClick={quickAdd}>
            Add
          </button>
        </div>
      </Panel>

      {GAME_STATUS.map(({ value, label, tone }) => {
        const list = grouped[value]
        if (list.length === 0 && value !== 'playing') return null
        return (
          <Panel
            key={value}
            title={
              value === 'wishlist' && wishlistValue > 0
                ? `${label} · ${formatMoney(wishlistValue, data.settings.currency)} to buy`
                : `${label} · ${list.length}`
            }
          >
            <div className="rows">
              {list.length === 0 && <Empty>Nothing in progress right now.</Empty>}
              {list.map((g) => (
                <GameRow key={g.id} game={g} tone={tone} label={label} currency={data.settings.currency} onEdit={() => setEditing(g)} />
              ))}
            </div>
          </Panel>
        )
      })}

      {archived.length > 0 && (
        <Panel
          title={`Archived · ${archived.length}`}
          action={
            <button className="btn sm ghost" onClick={() => setShowArchived((s) => !s)}>
              {showArchived ? 'Hide' : 'Show'}
            </button>
          }
        >
          {showArchived && (
            <div className="rows">
              {archived.map((g) => (
                <div key={g.id} className="row">
                  <div className="grow title">{g.title}</div>
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={() => store.update((d) => { const t = d.games.find((x) => x.id === g.id); if (t) t.archived = false })}
                  >
                    Unarchive
                  </button>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {editing && <GameSheet game={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function GameRow({
  game: g,
  tone,
  label,
  currency,
  onEdit,
}: {
  game: Game
  tone?: string
  label: string
  currency: string
  onEdit: () => void
}) {
  const { ref, highlighted } = useHighlightRow<HTMLDivElement>(g.id)
  const hours = gameHours(g)
  const perHour = costPerHour(g)
  return (
    <div ref={ref} className={`row${highlighted ? ' highlight' : ''}`}>
      <div className="grow">
        <div className="title">{g.title}</div>
        <div className="meta">
          {g.platform ?? 'Any platform'}
          {hours > 0 ? ` · ${hours}h played` : ''}
          {perHour != null && ` · ${formatMoney(perHour, currency)}/hr`}
          {g.notes ? ` · ${g.notes}` : ''}
        </div>
      </div>
      {g.price ? <span className="num meta">{formatMoney(g.price, currency)}</span> : null}
      {tone && <span className={`chip ${tone}`}>{label}</span>}
      {/* Platinum indicator — colour alone carries the state here since the
          icon's shape never changes, but it's decorative, not the only way
          to tell (the sheet's own checkbox is the actual control). */}
      <span
        title={g.platinum ? 'Platinum trophy earned' : 'Platinum trophy not yet earned'}
        style={{ display: 'inline-flex', color: g.platinum ? 'var(--accent-ink)' : 'var(--ink-3)', opacity: g.platinum ? 1 : 0.4 }}
      >
        <Icons.trophy size={16} />
      </span>
      <button className="iconbtn" aria-label={`Edit ${g.title}`} onClick={onEdit}>
        <Icons.edit />
      </button>
    </div>
  )
}

function GameSheet({ game, onClose }: { game: Game | null; onClose: () => void }) {
  const data = useData()
  // Re-read the live game so the session ledger below updates as entries are
  // added/removed, instead of freezing at whatever `game` was on open.
  const live = game ? (data.games.find((x) => x.id === game.id) ?? game) : null
  const [showAllSessions, setShowAllSessions] = useState(false)
  const sortedSessions = useMemo(() => [...(live?.sessions ?? [])].sort((a, b) => b.date.localeCompare(a.date)), [live])
  const collapsibleSessions = sortedSessions.length > 2
  const visibleSessions = showAllSessions || !collapsibleSessions ? sortedSessions : sortedSessions.slice(0, 2)

  const [title, setTitle] = useState(game?.title ?? '')
  const [platform, setPlatform] = useState(game?.platform ?? '')
  const [price, setPrice] = useState(String(game?.price ?? ''))
  const [status, setStatus] = useState<GameStatus>(game?.status ?? 'wishlist')
  const [notes, setNotes] = useState(game?.notes ?? '')
  const [platinum, setPlatinum] = useState(game?.platinum ?? false)

  const [sessionHours, setSessionHours] = useState('')
  const [sessionDate, setSessionDate] = useState(todayKey())

  const save = () => {
    if (!title.trim()) return
    const patch = {
      title: title.trim(),
      platform: platform.trim() || undefined,
      price: Number(price) || undefined,
      status,
      notes: notes.trim() || undefined,
      platinum,
    }
    store.update((d) => {
      if (game) {
        const t = d.games.find((x) => x.id === game.id)
        if (t) Object.assign(t, patch)
      } else {
        d.games.unshift({ id: uid(), addedAt: todayKey(), sessions: [], ...patch })
      }
    })
    onClose()
  }

  const addSession = () => {
    const hrs = Number(sessionHours)
    if (!game || !Number.isFinite(hrs) || hrs <= 0) return
    store.update((d) => {
      const g = d.games.find((x) => x.id === game.id)
      if (g) {
        g.sessions ??= []
        g.sessions.push({ id: uid(), date: sessionDate, hours: hrs })
      }
    })
    setSessionHours('')
  }

  const removeSession = (id: string) => {
    if (!game) return
    store.update((d) => {
      const g = d.games.find((x) => x.id === game.id)
      if (g) g.sessions = (g.sessions ?? []).filter((s) => s.id !== id)
    })
  }

  return (
    <Sheet
      title={game ? 'Edit game' : 'Add game'}
      onClose={onClose}
      onSubmit={save}
      onDelete={game ? () => { store.remove(game.title, (d) => { d.games = d.games.filter((x) => x.id !== game.id) }); onClose() } : undefined}
    >
      <Field label="Title">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="formgrid">
        <Field label="Platform">
          <input type="text" value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Steam Deck" />
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as GameStatus)}>
            {GAME_STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Price watching">
          <input type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="24.99" />
        </Field>
        <Field label="Notes" wide>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="wait for a sale" />
        </Field>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14 }}>
        <input type="checkbox" className="check" checked={platinum} onChange={(e) => setPlatinum(e.target.checked)} />
        <Icons.trophy size={16} /> Platinum trophy earned
      </label>

      {game && (
        <Field label={`Play sessions · ${gameHours(live!)} hours total`}>
          <div className="rows" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
            {visibleSessions.length ? null : <Empty>No sessions logged yet.</Empty>}
            {visibleSessions.map((s) => (
              <div key={s.id} className="row">
                <div className="grow">
                  <div className="title">{s.hours}h</div>
                  <div className="meta">{prettyDate(s.date)}</div>
                </div>
                <button type="button" className="iconbtn" aria-label="Remove session" onClick={() => removeSession(s.id)}>
                  <Icons.x size={15} />
                </button>
              </div>
            ))}
          </div>
          {collapsibleSessions && (
            <button type="button" className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => setShowAllSessions((s) => !s)}>
              {showAllSessions ? 'Show fewer sessions' : `Show all ${sortedSessions.length} sessions`}
            </button>
          )}
          <div style={{ display: 'flex', gap: 8, paddingTop: 10 }}>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              aria-label="Session date"
              style={{ flex: 1, minWidth: 0 }}
            />
            <input
              type="text"
              inputMode="decimal"
              value={sessionHours}
              placeholder="Hours"
              onChange={(e) => setSessionHours(e.target.value)}
              aria-label="Session hours"
              style={{ flex: 1, minWidth: 0 }}
            />
            <button className="btn primary" onClick={addSession} type="button">
              Add
            </button>
          </div>
        </Field>
      )}
      {game && !game.archived && (
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => {
            store.update((d) => { const t = d.games.find((x) => x.id === game.id); if (t) t.archived = true })
            onClose()
          }}
        >
          Archive — keep the record, off the list
        </button>
      )}
    </Sheet>
  )
}
