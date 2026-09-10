/**
 * Generates all six home-screen icon variants (#31) from the one master
 * logo at assets/logo-source.png — "Ribbon" (2026-09): a closed journal
 * with its amber bookmark still in it, on a near-black full-bleed square.
 * The master is already exactly square content at 512×512 with no margin
 * to crop (it was built that way — see the reconstruction note below).
 *
 * Unlike the previous (mostly-amber) logo, this one has a large neutral
 * cream card as its dominant area — a plain hue rotation over the whole
 * image visibly tints that cream toward whatever hue each palette lands on
 * (a pale blue card for cobalt, pale green for moss, etc.), which reads as
 * a bug, not a palette. So only the ribbon itself gets re-hued: a mask
 * isolates it, the rotated colour is repainted as a flat fill (not sampled
 * from the source, so there's no cream/dark contamination to begin with)
 * through a softly blurred edge, over a version of the master with the
 * ribbon erased back to flat cream first (so the blend at the edge is
 * always "new colour → cream", never "new colour → leftover amber").
 *
 * 'ember' is the exact source artwork — `hueRotate: 0`, no colour shift at
 * all — because the ribbon as supplied IS amber/orange; it is the plain
 * (unsuffixed) public/icon-*.png default, and DEFAULT_PALETTE in
 * core/theme.ts points at it. The other four are real rotations computed
 * from each palette's own dark-mode accent hue against the ribbon's ~36°
 * source hue (measured off the source file).
 *
 * Note on the source file itself: the design was delivered as a concept
 * mockup (dark rounded square, drop shadow, on a page background) rather
 * than a clean full-bleed asset, so assets/logo-source.png here is a
 * reconstruction — the cream card + ribbon glyph cropped out of that mockup
 * and recomposited centered (same 50%-width/62.5%-height proportions as
 * the original) onto a solid #1b1a20 square, full-bleed with no corners
 * baked in, matching how every icon in this pipeline (and the platform's
 * own masking) expects the source to be shaped. Redo that reconstruction
 * by hand instead of patching this script if the master ever changes again
 * from a fresh mockup.
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
const SIZES = [192, 512, 180]

const RIBBON = { r: 232, g: 163, b: 61 }
const CREAM = { r: 245, g: 239, b: 228 }

// hueRotate in degrees, applied via sharp's HSL modulate — computed from
// each palette's dark-mode accent hue vs. the ribbon's native ~36° amber.
// 'ember' has no separate file of its own; it's just the plain (unsuffixed)
// public/icon-*.png, same as every other palette's file naming here except
// it's the one that omits the "-<id>" suffix — see the file-level comment
// for why ember, not cobalt, gets that slot.
const VARIANTS = [
  { id: 'ember', hueRotate: 0, suffix: false },
  { id: 'cobalt', hueRotate: -180, suffix: true },
  { id: 'indigo', hueRotate: -147, suffix: true },
  { id: 'moss', hueRotate: 37, suffix: true },
  { id: 'slate', hueRotate: 166, suffix: true },
  { id: 'plum', hueRotate: -67, suffix: true },
]

const { data, info } = await sharp(SOURCE).raw().toBuffer({ resolveWithObject: true })
const { width, height, channels } = info
const pixels = width * height

// Binary "core ribbon" mask — only pixels solidly ribbon-coloured, not the
// source's own anti-aliased edge pixels (those are excluded on purpose so
// they don't drag amber into either the erase or the repaint step below).
const core = new Uint8Array(pixels)
for (let p = 0; p < pixels; p++) {
  const i = p * channels
  const d = Math.hypot(data[i] - RIBBON.r, data[i + 1] - RIBBON.g, data[i + 2] - RIBBON.b)
  core[p] = d <= 30 ? 255 : 0
}

/** Cheap max-filter dilation, `radius` 3×3 passes — good enough at icon resolution. */
function dilate(src, radius) {
  let cur = src
  for (let iter = 0; iter < radius; iter++) {
    const next = new Uint8Array(pixels)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let v = 0
        for (let dy = -1; dy <= 1 && !v; dy++) {
          for (let dx = -1; dx <= 1 && !v; dx++) {
            const nx = x + dx, ny = y + dy
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && cur[ny * width + nx]) v = 255
          }
        }
        next[y * width + x] = v
      }
    }
    cur = next
  }
  return cur
}

// Erase mask: core dilated by 3px, comfortably covering the source's 1px
// anti-aliased fringe so none of the original amber survives underneath.
const erasePng = await sharp(Buffer.from(dilate(core, 3)), { raw: { width, height, channels: 1 } }).png().toBuffer()
// Repaint mask: the tight core, softly blurred for a smooth (but
// contamination-free) edge — entirely inside the erased region.
const paintPng = await sharp(Buffer.from(core), { raw: { width, height, channels: 1 } }).blur(1.1).png().toBuffer()

const solidRgb = (c) => {
  const buf = Buffer.alloc(pixels * 3)
  for (let p = 0; p < pixels; p++) { buf[p * 3] = c.r; buf[p * 3 + 1] = c.g; buf[p * 3 + 2] = c.b }
  return buf
}

// Ribbon erased back to flat cream — the common base every variant repaints onto.
const creamPatch = await sharp(solidRgb(CREAM), { raw: { width, height, channels: 3 } }).joinChannel(erasePng).png().toBuffer()
const baseClean = await sharp(SOURCE).composite([{ input: creamPatch }]).png().toBuffer()

for (const v of VARIANTS) {
  let recolored
  if (v.id === 'ember') {
    recolored = await sharp(SOURCE).toBuffer() // the source ribbon color, unrotated — no repaint needed
  } else {
    // Slate reads as a desaturated blue-gray, not a saturated hue like the other four.
    const modulate = v.id === 'slate' ? { hue: v.hueRotate, saturation: 0.35 } : { hue: v.hueRotate }
    const rotatedFlat = await sharp(solidRgb(RIBBON), { raw: { width, height, channels: 3 } }).modulate(modulate).raw().toBuffer()
    const rotatedPatch = await sharp(rotatedFlat, { raw: { width, height, channels: 3 } }).joinChannel(paintPng).png().toBuffer()
    recolored = await sharp(baseClean).composite([{ input: rotatedPatch }]).toBuffer()
  }
  for (const size of SIZES) {
    const name = v.suffix ? `icon-${size}-${v.id}.png` : `icon-${size}.png`
    const dir = v.suffix ? iconsDir : publicDir
    const out = resolve(dir, name)
    await sharp(recolored).resize(size, size).png().toFile(out)
    console.log('wrote', out)
  }
}
console.log(`\nDone — ${VARIANTS.length} palettes × ${SIZES.length} sizes.`)
