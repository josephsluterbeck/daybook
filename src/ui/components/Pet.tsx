import { useEffect, useRef } from 'react'

/**
 * A small black aussie mix that trots back and forth along its strip,
 * forever — decorative only (aria-hidden), like a VS Code Pets sprite.
 * Position/direction are driven straight onto the DOM via a ref, not React
 * state, so the walk doesn't cost a re-render every frame; the leg-swing and
 * body-bob are separate, always-on CSS animations layered underneath that.
 * Lives once in App.tsx, outside <main>, so tab switches never remount (and
 * so never reset) it.
 */
const SPEED = 34 // px/sec
const SPRITE_W = 34

export function Pet() {
  const stripRef = useRef<HTMLDivElement>(null)
  const petRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const pos = { x: 20 }
    const dir = { v: 1 as 1 | -1 }
    let raf = 0
    let last = performance.now()

    const tick = (now: number) => {
      // Clamped so a backgrounded/suspended tab doesn't return with one huge jump.
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const maxX = Math.max(0, (stripRef.current?.clientWidth ?? 300) - SPRITE_W)
      pos.x += dir.v * SPEED * dt
      if (pos.x >= maxX) {
        pos.x = maxX
        dir.v = -1
      } else if (pos.x <= 0) {
        pos.x = 0
        dir.v = 1
      }
      if (petRef.current) petRef.current.style.transform = `translateX(${pos.x}px) scaleX(${dir.v})`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="pet-strip" ref={stripRef} aria-hidden="true">
      <div className="pet" ref={petRef}>
        <svg viewBox="0 0 46 30" width="34" height="22">
          <ellipse className="pet-shadow" cx="23" cy="28" rx="14" ry="1.6" />
          <g className="pet-body">
            <rect className="pet-leg b1" x="11" y="18" width="3" height="9" rx="1.4" />
            <rect className="pet-leg b2" x="17" y="18" width="3" height="9" rx="1.4" />
            <path className="pet-tail" d="M9 15 Q3 10 7 6 Q10 9 11 14 Z" />
            <ellipse className="pet-fur" cx="22" cy="15" rx="13" ry="7.5" />
            <ellipse className="pet-patch" cx="14" cy="19" rx="2.6" ry="3.4" />
            <rect className="pet-leg f1" x="27" y="19" width="3" height="9" rx="1.4" />
            <rect className="pet-leg f2" x="33" y="19" width="3" height="9" rx="1.4" />
            <circle className="pet-fur" cx="36" cy="10" r="6.2" />
            <ellipse className="pet-fur" cx="42" cy="12" rx="3.2" ry="2.4" />
            <path className="pet-fur" d="M32 6 Q30 1 35 3 Q34 7 32 8 Z" />
            <path className="pet-collar" d="M32 13.5 Q36 16.5 40.5 14" />
            <circle className="pet-eye" cx="37.5" cy="9" r="0.9" />
            <circle className="pet-nose" cx="44.6" cy="12" r="0.8" />
          </g>
        </svg>
      </div>
    </div>
  )
}
