/**
 * Generates the dark/light launch-splash pair (#31) — a solid ground colour
 * with the (cobalt) app icon centered. iOS only shows one of these when an
 * `apple-touch-startup-image` link's `media` matches the device's exact
 * width/height/pixel-ratio, so a single untargeted pair like this one only
 * covers devices whose splash media query happens to be present in
 * index.html — "a single dark-and-light pair covers most of the ugliness,"
 * per ROADMAP.md's own framing, not "covers every device." Not palette-aware
 * on purpose: the splash is what's on screen before any Settings have loaded.
 *
 *   node scripts/gen-splash.mjs
 */
import sharp from 'sharp'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '../public')

const WIDTH = 1284
const HEIGHT = 2778
const ICON_SIZE = 300

const VARIANTS = [
  { name: 'dark', ground: '#000000' },
  { name: 'light', ground: '#f4f6f3' },
]

const icon = await sharp(resolve(publicDir, 'icon-512.png')).resize(ICON_SIZE, ICON_SIZE).toBuffer()

for (const { name, ground } of VARIANTS) {
  const out = resolve(publicDir, `splash-${name}.png`)
  await sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: ground } })
    .composite([{ input: icon, left: Math.round((WIDTH - ICON_SIZE) / 2), top: Math.round((HEIGHT - ICON_SIZE) / 2) }])
    .png()
    .toFile(out)
  console.log('wrote', out)
}
