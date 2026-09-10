import { useEffect, useRef, useState, type RefObject } from 'react'
import { store, useData } from '../../core/store'
import { DRAWER, type DrawerKey } from '../nav'
import { Icons } from './kit'

const DRAWER_ICON: Record<DrawerKey, (p?: { size?: number }) => ReturnType<typeof Icons.journal>> = {
  journal: Icons.journal,
  projects: Icons.projects,
  shopping: Icons.shopping,
  people: Icons.people,
  maintenance: Icons.maintenance,
  learning: Icons.learning,
  inbox: Icons.inbox,
  scenarios: Icons.scenario,
  monthclose: Icons.monthClose,
  settings: Icons.settings,
}

/** A run of drawer entries sharing a `group` label, in original order — turns the flat DRAWER list into sections with dividers. */
function groupEntries() {
  const groups: { group?: string; items: typeof DRAWER }[] = []
  for (const item of DRAWER) {
    const last = groups[groups.length - 1]
    if (last && last.group === item.group) last.items.push(item)
    else groups.push({ group: item.group, items: [item] })
  }
  return groups
}

/**
 * The slide-out drawer (#23) on mobile; the same markup becomes the bottom
 * half of the left rail at desktop widths via CSS alone (see styles.css) —
 * one component, no duplicated markup between the two layouts.
 */
export default function Drawer({
  open,
  onClose,
  isActive,
  onNavigate,
  triggerRef,
}: {
  open: boolean
  onClose: () => void
  isActive: (key: DrawerKey) => boolean
  onNavigate: (key: DrawerKey) => void
  triggerRef: RefObject<HTMLButtonElement | null>
}) {
  const data = useData()
  const quiet = data.settings.quiet ?? false
  const panelRef = useRef<HTMLDivElement>(null)
  const dragStartX = useRef<number | null>(null)
  const [dragX, setDragX] = useState(0)

  // Body scroll lock, iOS-safe: plain `overflow: hidden` on body still lets
  // Safari bounce-scroll the page behind a fixed overlay. Pinning body to its
  // current scroll offset with position:fixed is the actual fix; scroll
  // position is restored on close.
  useEffect(() => {
    if (!open) return
    const scrollY = window.scrollY
    const { style } = document.body
    const prev = { position: style.position, top: style.top, width: style.width, overflow: style.overflow }
    style.position = 'fixed'
    style.top = `-${scrollY}px`
    style.width = '100%'
    style.overflow = 'hidden'
    return () => {
      style.position = prev.position
      style.top = prev.top
      style.width = prev.width
      style.overflow = prev.overflow
      window.scrollTo(0, scrollY)
    }
  }, [open])

  // Focus trap + Escape-to-close + focus returns to the hamburger on close.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const focusable = () =>
      panel ? [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), [href]')] : []
    focusable()[0]?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      triggerRef.current?.focus()
    }
  }, [open, onClose, triggerRef])

  const onPointerDown = (e: React.PointerEvent) => {
    dragStartX.current = e.clientX
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStartX.current == null) return
    setDragX(Math.min(0, e.clientX - dragStartX.current))
  }
  const endDrag = () => {
    if (dragX < -80) onClose()
    setDragX(0)
    dragStartX.current = null
  }

  return (
    <>
      {open && <div className="drawer-scrim" onClick={onClose} />}
      <div
        ref={panelRef}
        className="drawer"
        data-open={open}
        role="dialog"
        aria-modal="true"
        aria-label="Sections"
        style={open && dragX ? { transform: `translateX(${dragX}px)`, transition: 'none' } : undefined}
        onPointerDown={open ? onPointerDown : undefined}
        onPointerMove={open ? onPointerMove : undefined}
        onPointerUp={open ? endDrag : undefined}
        onPointerCancel={open ? endDrag : undefined}
      >
        {/* Top-level, one tap from anywhere (#42) — deliberately not inside a
            group and doesn't close the drawer, so the blur is visible right
            away as confirmation instead of only after the drawer's already shut. */}
        <button
          type="button"
          className="drawer-item quiet-toggle"
          aria-pressed={quiet}
          onClick={() => store.update((d) => { d.settings.quiet = !quiet })}
        >
          <Icons.eyeOff size={19} />
          {quiet ? 'Quiet mode: on' : 'Quiet mode'}
        </button>
        {groupEntries().map((g, i) => (
          <div key={i}>
            {g.group && <div className="drawer-group">{g.group}</div>}
            {g.items.map((item) => {
              const I = DRAWER_ICON[item.key]
              return (
                <button
                  key={item.key}
                  type="button"
                  className="drawer-item"
                  aria-current={isActive(item.key)}
                  onClick={() => {
                    onNavigate(item.key)
                    onClose()
                  }}
                >
                  <I size={19} />
                  {item.label}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )
}
