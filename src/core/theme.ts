/**
 * Palette data — pure, no DOM. `App.tsx` is the only place that turns this
 * into a `document.documentElement.dataset.palette` write; `styles.css` is
 * the only place that turns *that* into actual colour, via `[data-palette]`
 * blocks that override just the three accent tokens (#30).
 *
 * Six named hues, not a colour picker: a free-choice picker produces an
 * inaccessible app within minutes (see ROADMAP.md's own warning under #32),
 * and every one of these six has been checked for contrast against both
 * `--surface` (light) and the near-black dark ground before being added here.
 * 'ember' is the app's default — it needs no CSS block of its own, since it
 * already *is* the bare `:root` accent, matching the actual home-screen logo
 * (amber/orange) rather than reinterpreting it into a different hue.
 */
import type { PaletteId } from './types'

export type { PaletteId }

export interface Palette {
  id: PaletteId
  label: string
  /** Light-mode token values: accent (buttons/active states), soft (tinted background), ink (text on that tint). */
  light: { accent: string; soft: string; ink: string }
  /** Same three tokens for dark mode — never derived from `light` automatically; a hue that reads well on off-white is often wrong on near-black. */
  dark: { accent: string; soft: string; ink: string }
}

export const PALETTES: Palette[] = [
  {
    id: 'cobalt',
    label: 'Cobalt',
    light: { accent: '#2f5fc7', soft: '#e3ebfa', ink: '#1e4a9e' },
    dark: { accent: '#6ea8fe', soft: '#16233d', ink: '#a9c8ff' },
  },
  {
    id: 'ember',
    label: 'Ember',
    light: { accent: '#b4541f', soft: '#f6e7dd', ink: '#8c3f14' },
    dark: { accent: '#e0925a', soft: '#34220f', ink: '#f4b98a' },
  },
  {
    id: 'indigo',
    label: 'Indigo',
    light: { accent: '#5b47c9', soft: '#ebe7fa', ink: '#423593' },
    dark: { accent: '#a99bff', soft: '#241f3d', ink: '#cabfff' },
  },
  {
    id: 'moss',
    label: 'Moss',
    light: { accent: '#6b7d2c', soft: '#eef1dd', ink: '#4f5e1c' },
    dark: { accent: '#b0c463', soft: '#262b12', ink: '#cfdb96' },
  },
  {
    id: 'slate',
    label: 'Slate',
    light: { accent: '#51697a', soft: '#e7edf0', ink: '#3a4f5e' },
    dark: { accent: '#9db6c4', soft: '#1c262b', ink: '#c3d5dd' },
  },
  {
    id: 'plum',
    label: 'Plum',
    light: { accent: '#96336b', soft: '#f7e5ee', ink: '#742650' },
    dark: { accent: '#e592bd', soft: '#351522', ink: '#f0b8d4' },
  },
]

export const DEFAULT_PALETTE: PaletteId = 'ember'

export function paletteOf(id: PaletteId | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]
}

/**
 * Home-screen/favicon paths for a palette (#31) — 'ember' points at the
 * original logo, `public/icon-*.png`, unrotated; every other palette points
 * at a generated, hue-shifted `public/icons/icon-<size>-<id>.png` from
 * `scripts/gen-icons.mjs`. Pure path arithmetic, no DOM — App.tsx is the
 * only place that writes these into a `<link>`.
 */
export function iconPaths(id: PaletteId | undefined): { icon192: string; icon180: string } {
  if (!id || id === DEFAULT_PALETTE) return { icon192: './icon-192.png', icon180: './icon-180.png' }
  return { icon192: `./icons/icon-192-${id}.png`, icon180: `./icons/icon-180-${id}.png` }
}
