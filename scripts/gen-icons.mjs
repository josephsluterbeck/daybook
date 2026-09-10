/**
 * Generates all six home-screen icon variants (#31) from the one master
 * logo at assets/logo-source.png — a 3D-rendered "J" with an amber
 * saturn-ring accent, supplied at 1254×1254 with a ~6% black margin baked
 * in around the actual artwork. This script crops that margin away (the
 * bounding box was measured once by hand off the source file and is fixed
 * below — re-measure if the source logo is ever replaced) and re-derives
 * five more variants by rotating the artwork's native hue to match each
 * other palette in core/theme.ts, so "your accent, your icon" stays true
 * even though the logo itself isn't a flat, trivially-recolorable glyph
 * anymore.
 *
 * 'ember' is the exact source artwork — `hueRotate: 0`, no colour shift at
 * all — because the logo as supplied IS amber/orange; it is the plain
 * (unsuffixed) public/icon-*.png default, and DEFAULT_PALETTE in
 * core/theme.ts points at it. (An earlier version of this script defaulted
 * to 'cobalt', hue-rotating the given logo to blue — wrong, caught after
 * shipping: the icon someone hands you is the icon, not a palette slot to
 * reinterpret.) The other four are real rotations computed from each
 * palette's own dark-mode accent hue against the logo's ~29° source hue.
 *
 * Run manually after touching core/theme.ts's palette list, or if the
 * source logo changes:
 *
 *   node scripts/gen-icons.mjs
 */
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '../public')
const iconsDir = resolve(publicDir, 'icons')
mkdirSync(iconsDir, { recursive: true })

const SOURCE = resolve(here, '../assets/logo-source.png')
// Measured bounding box of the actual artwork within the 1254×1254 source
// (see the file-level comment) — a square crop centered on it with a small
// buffer so the ring's soft outer glow isn't clipped.
const CROP = { left: 70, top: 62, width: 1110, height: 1110 }

const SIZES = [192, 512, 180]

// hueRotate in degrees, applied via sharp's HSL modulate — computed from
// each palette's dark-mode accent hue vs. the logo's native ~29° amber.
// 'ember' has no separate file of its own; it's just the plain (unsuffixed)
// public/icon-*.png, same as every other palette's file naming here except
// it's the one that omits the "-<id>" suffix — see the file-level comment
// for why ember, not cobalt, gets that slot.
const VARIANTS = [
  { id: 'ember', hueRotate: 0, suffix: false },
  { id: 'cobalt', hueRotate: -174, suffix: true },
  { id: 'indigo', hueRotate: -141, suffix: true },
  { id: 'moss', hueRotate: 43, suffix: true },
  { id: 'slate', hueRotate: 172, suffix: true },
  { id: 'plum', hueRotate: -60, suffix: true },
]

const cropped = await sharp(SOURCE).extract(CROP).toBuffer()

for (const v of VARIANTS) {
  // Slate is meant to read as a desaturated blue-gray, not a saturated hue
  // like the other five — drop saturation for that one variant only.
  const modulate = v.id === 'slate' ? { hue: v.hueRotate, saturation: 0.35 } : { hue: v.hueRotate }
  const recolored = await sharp(cropped).modulate(modulate).toBuffer()
  for (const size of SIZES) {
    const name = v.suffix ? `icon-${size}-${v.id}.png` : `icon-${size}.png`
    const dir = v.suffix ? iconsDir : publicDir
    const out = resolve(dir, name)
    await sharp(recolored).resize(size, size).png().toFile(out)
    console.log('wrote', out)
  }
}
console.log(`\nDone — ${VARIANTS.length} palettes × ${SIZES.length} sizes.`)
