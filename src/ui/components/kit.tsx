import { useEffect, useRef, useState, type ReactNode } from 'react'
import { store, useHighlight } from '../../core/store'

/** Must match the CSS `.scrim.closing` / `.sheet.closing` animation duration. */
const SHEET_CLOSE_MS = 180

/* ── Icons: 20px stroke set, drawn inline so nothing is fetched ─────────── */

const ico =
  (d: ReactNode) =>
  ({ size }: { size?: number } = {}) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={size ? { width: size, height: size } : undefined}
    >
      {d}
    </svg>
  )

export const Icons = {
  today: ico(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  money: ico(<><path d="M3 7h18v11H3z" /><circle cx="12" cy="12.5" r="2.6" /><path d="M6.5 12.5h.01M17.5 12.5h.01" /></>),
  queue: ico(<><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M10 8.5l4.5 2.5L10 13.5z" /><path d="M7 21h10" /></>),
  tasks: ico(<><path d="M4 6.5l2 2 3.5-4" /><path d="M4 15.5l2 2 3.5-4" /><path d="M13 7h7M13 16h7" /></>),
  journal: ico(<><path d="M5 3.5h11a3 3 0 0 1 3 3v14H8a3 3 0 0 1-3-3z" /><path d="M5 17.5h14" /><path d="M9 7.5h6M9 11h4" /></>),
  plus: ico(<path d="M12 5v14M5 12h14" />),
  x: ico(<path d="M6 6l12 12M18 6L6 18" />),
  trash: ico(<><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 13h10l1-13" /></>),
  edit: ico(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14.5 5.5l4 4" /></>),
  star: ico(<path d="M12 4l2.3 5 5.2.6-3.9 3.5 1.1 5.2L12 15.6 7.3 18.3l1.1-5.2L4.5 9.6 9.7 9z" />),
  flag: ico(<><path d="M6 21V4" /><path d="M6 4.5h11l-2 4 2 4H6z" /></>),
  chevron: ico(<path d="M9 6l6 6-6 6" />),
  settings: ico(<><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3" /></>),
  download: ico(<><path d="M12 4v11" /><path d="M8 11.5l4 4 4-4" /><path d="M4 20h16" /></>),
  upload: ico(<><path d="M12 16V5" /><path d="M8 8.5l4-4 4 4" /><path d="M4 20h16" /></>),
  lock: ico(<><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /><path d="M12 14.5v2.5" /></>),
  search: ico(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8" /></>),
  snooze: ico(<><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2" /><path d="M9 2h6" /></>),
  shuffle: ico(<><path d="M3 6h3.5L14 18h6.5" /><path d="M3 18h3.5L10 12" /><path d="M17.5 6H21M21 6v3.5M21 6l-4 4" /><path d="M17.5 18H21M21 18v-3.5M21 18l-4-4" /></>),
  menu: ico(<><path d="M4 6h16M4 12h16M4 18h16" /></>),
  projects: ico(<><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M3.5 9.5h17" /><path d="M8 5V3M16 5V3" /></>),
  shopping: ico(<><path d="M6 8h12l-1.2 11.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>),
  people: ico(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.5a3.2 3.2 0 0 1 0 6.2M20.5 20a5 5 0 0 0-4.5-5.8" /></>),
  maintenance: ico(<path d="M14.5 3.5a4 4 0 0 0-5 5L4 14l2 2 5.5-5.5a4 4 0 0 0 5-5l-2.8 2.8-2-2z" />),
  learning: ico(<><path d="M12 5L2.5 9.5 12 14l9.5-4.5z" /><path d="M6 12v5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-5" /></>),
  check: ico(<path d="M4.5 12.5l4.5 4.5 10.5-11" />),
  refresh: ico(<><path d="M4 12a8 8 0 0 1 14-5.2M20 12a8 8 0 0 1-14 5.2" /><path d="M18 3v4h-4M6 21v-4h4" /></>),
  eyeOff: ico(<><path d="M3.5 3.5l17 17" /><path d="M10.6 5.2A10.4 10.4 0 0 1 12 5c5 0 9 3.5 10 7-0.4 1.3-1.1 2.5-2 3.6M6.5 6.7C4.4 8 2.9 9.9 2 12c1 3.5 5 7 10 7 1.4 0 2.7-0.3 3.9-0.7" /><path d="M9.7 10a3.2 3.2 0 0 0 4.4 4.4" /></>),
  scenario: ico(<><path d="M4 20V10M4 10l4-4 4 3 5-6" /><path d="M17 3h4v4" /><path d="M4 20h16" /></>),
  trophy: ico(<><path d="M7 4h10v4a5 5 0 0 1-10 0z" /><path d="M7 5H4v1.5A3.5 3.5 0 0 0 7.5 10M17 5h3v1.5A3.5 3.5 0 0 1 16.5 10" /><path d="M12 13v3.5M9 20.5h6M9.5 20.5c0-2 1-2.6 1-3.5M14.5 20.5c0-2-1-2.6-1-3.5" /></>),
}

/* ── Sheet: the one modal used for every add/edit form ──────────────────── */

export function Sheet({
  title,
  children,
  onClose,
  onSubmit,
  submitLabel = 'Save',
  onDelete,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  onSubmit: () => void
  submitLabel?: string
  onDelete?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Backdrop tap / Cancel / Escape play the closing animation before the
  // sheet actually unmounts. Submit and Delete skip it — those already read
  // as "done", not "dismissed", so an instant close feels right there.
  const [closing, setClosing] = useState(false)
  const dismiss = () => setClosing(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!closing) return
    const t = setTimeout(onClose, SHEET_CLOSE_MS)
    return () => clearTimeout(t)
  }, [closing, onClose])

  return (
    <div className={`scrim${closing ? ' closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && dismiss()}>
      <div className={`sheet${closing ? ' closing' : ''}`} ref={ref} role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          {children}
          <footer>
            {onDelete && (
              <button type="button" className="btn danger left" onClick={onDelete}>
                Delete
              </button>
            )}
            <button type="button" className="btn ghost" onClick={dismiss}>
              Cancel
            </button>
            <button type="submit" className="btn primary">
              {submitLabel}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

/* ── Field wrappers ─────────────────────────────────────────────────────── */

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`field${wide ? ' wide' : ''}`}>
      <label>{label}</label>
      {children}
    </div>
  )
}

export function Panel({
  title,
  action,
  children,
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="panel">
      {title && (
        <header>
          <h2>{title}</h2>
          {action && <span className="spacer">{action}</span>}
        </header>
      )}
      {children}
    </section>
  )
}

/**
 * A single-series magnitude meter. Status colour is paired with the figure
 * beside it, so state is never carried by colour alone.
 *
 * `color` is an item's own tag colour (an envelope or goal's accent) — it's
 * only used while things are fine. A warn/over tone always wins, because
 * "you're over" needs to read the same everywhere, regardless of which
 * envelope it is.
 */
export function Meter({
  value,
  max,
  tone,
  color,
}: {
  value: number
  max: number
  tone?: 'good' | 'warn' | 'over'
  color?: string
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100))
  const alert = tone === 'warn' || tone === 'over'
  let bg: string | undefined = color
  if (alert || (tone && !color)) bg = `var(--${tone})`
  return (
    <div className="meter" role="presentation">
      <span className={alert ? `is-${tone}` : undefined} style={{ width: `${pct}%`, background: bg }} />
    </div>
  )
}

/**
 * A single-series sparkline — six months of an envelope in one glance. No
 * axis furniture at this size; the row label next to it is the legend. The
 * last segment (the current, still-partial month) is drawn dashed and dimmer
 * so it never reads as a collapse.
 */
export function Sparkline({ values, color }: { values: number[]; color?: string }) {
  if (values.length < 2) return null
  const w = 64
  const h = 20
  const pad = 3
  const max = Math.max(...values, 1)
  const stepX = (w - pad * 2) / (values.length - 1)
  const pts = values.map((v, i) => [pad + i * stepX, h - pad - (v / max) * (h - pad * 2)] as const)
  const stroke = color ?? 'var(--accent)'
  const historyPath = pts
    .slice(0, -1)
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')
  const [lastX, lastY] = pts[pts.length - 1]
  const [prevX, prevY] = pts[pts.length - 2]
  return (
    // Height padded beyond the drawing area so the endpoint dot's radius has
    // room — without it, the dot clips against the SVG's own edge.
    <svg viewBox={`0 0 ${w} ${h + 4}`} width={w} height={h + 4} aria-hidden="true">
      <path d={historyPath} fill="none" stroke={stroke} strokeWidth="1.5" strokeOpacity="0.55" strokeLinecap="round" strokeLinejoin="round" />
      <line x1={prevX} y1={prevY} x2={lastX} y2={lastY} stroke={stroke} strokeWidth="1.5" strokeOpacity="0.3" strokeDasharray="2,2" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2.2" fill={stroke} />
    </svg>
  )
}

/** Curated tag palette for envelopes, goals and bills — muted enough to sit next to the app's own accent. */
export const TAG_COLORS = ['#10736a', '#3d6fb4', '#7d5ba6', '#c98a1f', '#b3562f', '#4f7942', '#c24a5b', '#5c6bc0']

/** Swatch-row picker for an envelope/goal's tag colour. `null` in the list stands for "no colour, use the default accent". */
export function ColorPicker({ value, onChange }: { value?: string; onChange: (color: string | undefined) => void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label="Tag colour">
      {[undefined, ...TAG_COLORS].map((c) => (
        <button
          key={c ?? 'none'}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c ?? 'Default'}
          className={`swatch${value === c ? ' selected' : ''}${c ? '' : ' none'}`}
          style={c ? { background: c } : undefined}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  )
}

/** Curated icon set for an envelope (#32) — a fixed handful of already-drawn icons that read as spending categories, not the full nav set (a task/journal icon on an envelope would be confusing). */
export const ENVELOPE_ICONS: (keyof typeof Icons)[] = ['shopping', 'money', 'queue', 'people', 'maintenance', 'learning', 'flag', 'star']

/** Grid picker for an envelope's icon — same shape as ColorPicker (a "none" option first, radio semantics), so the two sit naturally side by side in a Sheet. */
export function IconPicker({ value, onChange }: { value?: string; onChange: (icon: string | undefined) => void }) {
  return (
    <div className="icon-swatches" role="radiogroup" aria-label="Envelope icon">
      <button
        type="button"
        role="radio"
        aria-checked={!value}
        aria-label="None"
        className={`icon-swatch${!value ? ' selected' : ''}`}
        onClick={() => onChange(undefined)}
      >
        <Icons.x size={16} />
      </button>
      {ENVELOPE_ICONS.map((key) => {
        const Icon = Icons[key]
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={value === key}
            aria-label={key}
            className={`icon-swatch${value === key ? ' selected' : ''}`}
            onClick={() => onChange(key)}
          >
            <Icon size={16} />
          </button>
        )
      })}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * The "fiddly part" of global search (#18): a row that scrolls itself into
 * view and flashes once when it's the current jump target, then clears the
 * target so leaving and returning to the tab doesn't replay it. Attach the
 * returned ref to the row and add ' highlight' to its className while
 * `highlighted` is true.
 */
export function useHighlightRow<T extends HTMLElement>(id: string) {
  const ref = useRef<T>(null)
  const highlighted = useHighlight() === id
  useEffect(() => {
    if (!highlighted) return
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => store.clearHighlight(), 1600)
    return () => clearTimeout(t)
  }, [highlighted])
  return { ref, highlighted }
}

const COUNT_UP_MS = 400

/**
 * Animates a hero figure from its previous value to a new one (#33) —
 * "only on change, never on first paint," so the very first render just
 * shows `value` with no motion at all; only a later change to `value`
 * triggers the ~400ms count. Respects `prefers-reduced-motion` by reading it
 * once per animation start and, when set, jumping straight to the new value
 * — the page must be fully readable at rest either way. Formatting (money,
 * a unit suffix, etc.) stays the caller's job; this only ever returns a
 * plain number to format.
 */
export function useCountUp(value: number): number {
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const from = prevRef.current
    prevRef.current = value
    if (from === value) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_UP_MS)
      // ease-out cubic — fast start, settles gently rather than stopping short
      const eased = 1 - (1 - t) ** 3
      setDisplay(from + (value - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return display
}

const PULL_THRESHOLD = 64
const PULL_MAX = 90
const PULL_SETTLE_MS = 550

/**
 * A no-op pull-to-refresh (#33) — this app has nothing to fetch, but the
 * gesture is instinctive on a phone and doing nothing when you try it reads
 * as broken. Dragging past the threshold and releasing just re-flashes the
 * current time via a toast; there's no actual refetch to trigger. Only
 * arms when the page is already scrolled to the very top, so it never
 * fights an ordinary scroll gesture partway down a long list.
 *
 * Returns props to spread onto the scroll container itself (`<main>`) plus
 * an `indicator` node to render as its first child — deliberately NOT a
 * wrapping `<div>` around the container's existing children, which would
 * turn `main`'s direct-children rules (the `gap`, the per-panel entrance
 * fade) into rules for one wrapper instead of each panel.
 */
export function usePullToRefresh(): {
  mainProps: { onPointerDown: (e: React.PointerEvent) => void; onPointerMove: (e: React.PointerEvent) => void; onPointerUp: () => void; onPointerCancel: () => void; style: { transform?: string; transition: string } }
  indicator: ReactNode
} {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const dragging = useRef(false)

  const onPointerDown = (e: React.PointerEvent) => {
    // A Sheet (and its .scrim) renders as a DOM child of <main> — position:
    // fixed for layout, but still in the bubble path for pointer events —
    // so without this check, dragging inside a long Sheet's own scroll
    // region got hijacked into pulling the whole page instead, and the
    // Sheet's real scroll never got the gesture. Its own overflow-y handles
    // scrolling; this hook has no business touching it.
    if ((e.target as HTMLElement).closest?.('.sheet, .scrim')) return
    if (window.scrollY > 0 || refreshing) return
    startY.current = e.clientY
    dragging.current = true
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || startY.current == null) return
    const dy = e.clientY - startY.current
    if (dy <= 0) {
      setPull(0)
      return
    }
    // Resisted, not 1:1 — a rubber band, not the finger dragging the page.
    setPull(Math.min(PULL_MAX, dy * 0.5))
  }
  const endDrag = () => {
    if (!dragging.current) return
    dragging.current = false
    startY.current = null
    if (pull >= PULL_THRESHOLD) {
      setRefreshing(true)
      setPull(PULL_THRESHOLD)
      setTimeout(() => {
        setRefreshing(false)
        setPull(0)
        store.notice(`Updated ${new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`)
      }, PULL_SETTLE_MS)
    } else {
      setPull(0)
    }
  }

  return {
    mainProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      style: {
        transform: pull ? `translateY(${pull}px)` : undefined,
        transition: dragging.current ? 'none' : 'transform 0.25s ease',
      },
    },
    indicator: (
      <div
        className={`pull-indicator${refreshing ? ' spinning' : ''}`}
        style={{ opacity: Math.min(1, pull / PULL_THRESHOLD), transform: `translate(-50%, ${Math.min(pull, PULL_THRESHOLD) - 36}px) rotate(${refreshing ? 0 : pull * 3}deg)` }}
        aria-hidden="true"
      >
        <Icons.refresh size={18} />
      </div>
    ),
  }
}
