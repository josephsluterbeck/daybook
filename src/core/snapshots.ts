/**
 * Rolling snapshots — the last three serialised states, under rotating
 * localStorage keys, taken right before a destructive operation (an import,
 * or "Start fresh"). A bad import or a fat-fingered reset becomes
 * recoverable instead of gone. Independent of the in-memory undo stack in
 * store.ts, which doesn't survive a reload.
 */
import type { StorageAdapter } from './storage'

const KEYS = ['jarvis.snapshot.0', 'jarvis.snapshot.1', 'jarvis.snapshot.2']

export interface Snapshot {
  key: string
  at: string // ISO timestamp of when this snapshot was taken
}

/** Rotates a fresh snapshot into slot 0, pushing the older ones down a slot (the oldest falls off). Call with the state about to be overwritten, before the destructive operation actually happens. */
export function pushSnapshot(adapter: StorageAdapter, serialisedData: string): void {
  for (let i = KEYS.length - 1; i > 0; i--) {
    const prev = adapter.load(KEYS[i - 1])
    if (prev) adapter.save(KEYS[i], prev)
  }
  adapter.save(KEYS[0], JSON.stringify({ at: new Date().toISOString(), data: serialisedData }))
}

/** Newest first. Skips any slot that doesn't parse rather than failing the whole list. */
export function listSnapshots(adapter: StorageAdapter): Snapshot[] {
  const out: Snapshot[] = []
  for (const key of KEYS) {
    const raw = adapter.load(key)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed.at === 'string') out.push({ key, at: parsed.at })
    } catch {
      /* a corrupt slot just doesn't show up as recoverable */
    }
  }
  return out
}

/** The raw serialised AppData string held in one snapshot slot, or null if it's empty or unreadable. */
export function readSnapshot(adapter: StorageAdapter, key: string): string | null {
  const raw = adapter.load(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed.data === 'string' ? parsed.data : null
  } catch {
    return null
  }
}
