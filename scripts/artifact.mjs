/**
 * Turns the single-file build into an Artifact-ready fragment.
 *
 * The Artifact host supplies its own <!doctype>/<html>/<head>/<body>, so this
 * strips the skeleton and keeps only <title>, the font <link>s, the inlined
 * <style>, and the inlined <script> plus the #root div.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../dist-single/index.html')
const out = resolve(here, '../dist-single/artifact.html')

const html = readFileSync(src, 'utf8')

const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? ''
const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? ''

const grab = (source, re) => source.match(re) ?? []

const headBits = [
  ...grab(head, /<title>[\s\S]*?<\/title>/gi),
  ...grab(head, /<link[^>]*fonts\.(?:googleapis|gstatic)[^>]*>/gi),
  ...grab(head, /<style[\s\S]*?<\/style>/gi),
]

// The bundle can be inlined into either <head> or <body>; take it from both and
// place it after the mount point.
const scripts = [...grab(head, /<script[\s\S]*?<\/script>/gi), ...grab(body, /<script[\s\S]*?<\/script>/gi)]
const markup = body.replace(/<script[\s\S]*?<\/script>/gi, '').trim()

if (scripts.length === 0) throw new Error('no inlined script found — did the singlefile build run?')

writeFileSync(out, `${headBits.join('\n')}\n${markup}\n${scripts.join('\n')}\n`)
console.log(`artifact fragment -> ${out}`)
