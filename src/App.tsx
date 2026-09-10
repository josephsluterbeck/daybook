import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { store, uid, useData, useLockState, useUndoToast } from './core/store'
import { applyIntent, describeIntent, parseCaptureParam, parseIntent } from './core/intents'
import { parseQuickAdd } from './core/parse'
import { DEFAULT_PALETTE, iconPaths } from './core/theme'
import { TABS, type RouteKey } from './ui/nav'
import { Icons, usePullToRefresh } from './ui/components/kit'
import Drawer from './ui/components/Drawer'
import { Pet } from './ui/components/Pet'
import Today from './ui/screens/Today'
import Money from './ui/screens/Money'
import Queue from './ui/screens/Queue'
import Tasks from './ui/screens/Tasks'
import Journal from './ui/screens/Journal'
import Projects from './ui/screens/Projects'
import Shopping from './ui/screens/Shopping'
import People from './ui/screens/People'
import Maintenance from './ui/screens/Maintenance'
import Learning from './ui/screens/Learning'
import Scenarios from './ui/screens/Scenarios'
import Inbox from './ui/screens/Inbox'
import Settings from './ui/Settings'
import { MonthCloseLauncher } from './ui/MonthCloseSheet'
import LockScreen from './ui/LockScreen'

/** How long the app can sit backgrounded before it re-locks itself. */
const AUTO_RELOCK_MS = 2 * 60 * 1000

const ICON: Record<RouteKey, (p?: { size?: number }) => ReactElement> = {
  today: Icons.today,
  money: Icons.money,
  queue: Icons.queue,
  tasks: Icons.tasks,
  journal: Icons.journal,
  projects: Icons.projects,
  shopping: Icons.shopping,
  people: Icons.people,
  maintenance: Icons.maintenance,
  learning: Icons.learning,
  inbox: Icons.inbox,
  scenarios: Icons.scenario,
}

/** RouteKey headings the topbar title falls back to outside Today's own greeting. */
const HEADING: Record<RouteKey, string> = { today: 'Today', money: 'Money', queue: 'Queue', tasks: 'Tasks', journal: 'Journal', projects: 'Projects', shopping: 'Shopping', people: 'People', maintenance: 'Maintenance', learning: 'Learning', inbox: 'Inbox', scenarios: 'Scenarios' }

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Still up' : h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'
}

/** "Deleted 'X'. Undo." for five seconds — only for deletions, not every edit. */
function UndoToast() {
  const msg = useUndoToast()
  if (!msg) return null
  return (
    <div className="toast" role="status">
      <span>{msg}</span>
      <button
        type="button"
        onClick={() => store.undo()}
        style={{ background: 'none', border: 0, padding: 0, color: 'var(--ground)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}
      >
        Undo
      </button>
    </div>
  )
}

export default function App() {
  const lockState = useLockState()
  const data = useData()
  // Ephemeral on purpose (#23): navigation state is never written to
  // AppData, and the app always opens on Home regardless of where it was
  // left — nothing here survives a reload, deliberately.
  const [route, setRoute] = useState<RouteKey>('today')
  const [settings, setSettings] = useState(false)
  const [monthCloseOpen, setMonthCloseOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const hamburgerRef = useRef<HTMLButtonElement>(null)
  const pullToRefresh = usePullToRefresh()

  const heading = HEADING[route]

  // Dark is the default look (not 'system') — applied via useLayoutEffect,
  // before paint, so switching in Settings never flashes the old theme first.
  const theme = data.settings.theme ?? 'dark'
  const palette = data.settings.palette ?? DEFAULT_PALETTE
  useLayoutEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
    // 'ember' needs no [data-palette] CSS block — it IS the bare :root accent
    // — but the attribute is still set for it so Settings' swatch highlight
    // has one consistent source of truth to read back.
    document.documentElement.dataset.palette = palette

    // theme-color is a static tag — it has no idea a manual override even
    // exists, so it gets kept in sync here by hand. In 'system' mode it also
    // has to track live OS changes, not just get set once.
    //
    // status-bar-style stays 'default' unconditionally (see index.html) —
    // 'black-translucent' was tried here and reverted: it draws app content
    // under the iOS status bar, which needs matching `env(safe-area-inset-
    // top)` padding on the topbar to not collide with the clock/battery
    // icons. That padding was never added, and — worse — this sandbox has no
    // way to verify a safe-area fix at all (env() reads as 0 in every
    // browser this session can actually test in), so "fix the padding"
    // isn't a safe claim to make from here. Not worth the risk for a purely
    // cosmetic win.
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      meta?.setAttribute('content', dark ? '#000000' : '#f4f6f3')
    }
    apply()
    if (theme !== 'system') return
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme, palette])

  // Quiet mode (#42) — a plain data attribute + one CSS rule blurs every
  // `.num`/`.figure`/`.stat .v` app-wide; the press-and-hold peek below is
  // the only other JS this needs.
  const quiet = data.settings.quiet ?? false
  useLayoutEffect(() => {
    document.documentElement.dataset.quiet = quiet ? 'true' : 'false'
  }, [quiet])

  // Tap-and-hold any blurred figure to reveal it briefly — global, event-
  // delegated listeners rather than touching every screen that renders a
  // .num/.figure/.stat .v, which is most of them. Only armed while quiet
  // mode is actually on.
  useEffect(() => {
    if (!quiet) return
    const target = (e: PointerEvent) => (e.target as HTMLElement).closest?.('.num, .figure, .stat .v') as HTMLElement | null
    const onDown = (e: PointerEvent) => target(e)?.classList.add('quiet-peek')
    const onUp = () => document.querySelectorAll('.quiet-peek').forEach((el) => el.classList.remove('quiet-peek'))
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      onUp()
    }
  }, [quiet])

  // Icon + home-screen name (#31) — both are "next time you add it to your
  // home screen" changes on iOS, not live ones, but the <link>/<meta> tags
  // still need updating now: iOS reads whatever's live in the DOM at the
  // moment of "Add to Home Screen", not the original index.html source.
  const homeScreenName = data.settings.homeScreenName?.trim() || 'Daybook'
  useLayoutEffect(() => {
    const { icon192, icon180 } = iconPaths(palette)
    document.getElementById('favicon-link')?.setAttribute('href', icon192)
    document.getElementById('apple-touch-icon-link')?.setAttribute('href', icon180)
    document.getElementById('app-title-meta')?.setAttribute('content', homeScreenName)
  }, [palette, homeScreenName])

  // A Shortcut's Open URL lands here as a query string. Skipped entirely
  // while locked — applying it would mutate the empty placeholder data (see
  // the store's constructor) and lose it the moment the real data loads on
  // unlock — so this re-runs once lockState flips, and the intent is still
  // sitting in the URL to pick up then. replaceState only happens after a
  // successful apply, which is not optional: without it, one pull-to-refresh
  // logs the same expense twice.
  useEffect(() => {
    if (lockState === 'locked') return
    const capture = parseCaptureParam(window.location.search)
    if (capture) {
      store.update((d) => {
        d.inbox.push({ id: uid(), at: new Date().toISOString(), text: capture, guess: parseQuickAdd(capture, d.envelopes) })
      })
      store.notice('Captured — decide later in Inbox')
      window.history.replaceState({}, '', window.location.pathname)
      return
    }
    const intent = parseIntent(window.location.search)
    if (!intent) return
    store.update((d) => applyIntent(d, intent))
    store.notice(`${describeIntent(intent)} from a Shortcut`)
    window.history.replaceState({}, '', window.location.pathname)
  }, [lockState])

  // Re-lock after a spell backgrounded, so a lock left unattended doesn't
  // stay open indefinitely. Only matters once a lock is actually set —
  // relock() is a no-op otherwise.
  const hiddenAt = useRef<number | null>(null)
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now()
      } else if (hiddenAt.current && Date.now() - hiddenAt.current > AUTO_RELOCK_MS) {
        store.relock()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  if (lockState === 'locked') return <LockScreen />

  // The drawer's own onClick handler special-cases 'settings' (and now
  // 'monthclose') to open a Sheet instead of changing `route` — see nav.ts's
  // DrawerKey doc comment.
  const navigateFromDrawer = (key: 'journal' | 'inbox' | 'projects' | 'shopping' | 'people' | 'maintenance' | 'learning' | 'scenarios' | 'monthclose' | 'settings') => {
    if (key === 'settings') setSettings(true)
    else if (key === 'monthclose') setMonthCloseOpen(true)
    else setRoute(key)
  }

  return (
    <div className="app">
      {/*
        .rail is `display: contents` on phone — invisible to layout, so .tabs
        (fixed bottom bar) and Drawer's panel (fixed overlay, hidden unless
        open) behave exactly as if they were direct children of .app, same as
        before this wrapper existed. At the desktop breakpoint it becomes a
        real flex column, stacking the same two elements into one continuous
        left sidebar — "the rail becomes the drawer" — with no separate
        desktop markup and no second list of drawer buttons (see styles.css).

        `inert` on .tabs and .col (not on .app itself, and not on Drawer) is
        deliberate: the drawer overlay is the one thing that must stay
        interactive while it's open — inert-ing its own ancestor would take
        the drawer down with everything else.
      */}
      <div className="rail">
        <nav className="tabs" aria-label="Sections" inert={drawerOpen || undefined}>
          {TABS.map((t) => {
            const I = ICON[t.key]
            return (
              <button key={t.key} className="tab" aria-current={route === t.key} onClick={() => setRoute(t.key)}>
                <I />
                {t.label}
              </button>
            )
          })}
        </nav>

        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          isActive={(key) => (key === 'settings' ? settings : key === 'monthclose' ? monthCloseOpen : route === key)}
          onNavigate={(key) => navigateFromDrawer(key as 'journal' | 'inbox' | 'projects' | 'shopping' | 'people' | 'maintenance' | 'learning' | 'scenarios' | 'monthclose' | 'settings')}
          triggerRef={hamburgerRef}
        />
      </div>

      <div className="col" inert={drawerOpen || undefined}>
        <header className="topbar">
          <button
            ref={hamburgerRef}
            className="iconbtn hamburger"
            aria-label="Open sections menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <Icons.menu />
          </button>
          <h1>{route === 'today' ? `${greeting()}, ${data.settings.name}` : heading}</h1>
          <span className="sub">
            {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </header>

        {quiet && (
          <button type="button" className="quiet-banner" onClick={() => store.update((d) => { d.settings.quiet = false })}>
            <Icons.eyeOff size={14} /> Quiet mode is on — figures blurred (tap-and-hold one to peek). Tap to turn off.
          </button>
        )}

        <Pet />

        <main {...pullToRefresh.mainProps}>
          {pullToRefresh.indicator}
          {route === 'today' && <Today go={setRoute} />}
          {route === 'money' && <Money />}
          {route === 'queue' && <Queue />}
          {route === 'tasks' && <Tasks />}
          {route === 'journal' && <Journal />}
          {route === 'projects' && <Projects />}
          {route === 'shopping' && <Shopping />}
          {route === 'people' && <People />}
          {route === 'maintenance' && <Maintenance />}
          {route === 'learning' && <Learning />}
          {route === 'scenarios' && <Scenarios />}
          {route === 'inbox' && <Inbox />}
        </main>
      </div>

      {settings && <Settings onClose={() => setSettings(false)} />}
      {monthCloseOpen && <MonthCloseLauncher onClose={() => setMonthCloseOpen(false)} />}
      <UndoToast />
    </div>
  )
}
