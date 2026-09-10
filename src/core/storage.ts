/**
 * Persistence, behind an interface.
 *
 * The web build uses localStorage. When this ports to React Native, the only
 * file that changes is this one — swap `webStorage` for an AsyncStorage or
 * expo-sqlite implementation of the same three methods. Nothing else in the
 * app knows where the bytes live.
 */
import type { AppData } from './types'
import { SCHEMA_VERSION } from './types'
import { todayKey } from './dates'

// Keyed, not fixed to one slot: the app data lives under KEY, and the
// app-lock record (see lock.ts) lives under its own key in the same store.
// AsyncStorage on React Native is keyed the same way, so this stays a
// faithful one-file swap when the native port happens.
export interface StorageAdapter {
  load(key: string): string | null
  save(key: string, serialised: string): void
  clear(key: string): void
}

export const KEY = 'daybook.data.v1'

/** Where a file that fails to parse/migrate gets parked instead of being discarded. */
export const RECOVERY_KEY = 'daybook.data.recovery'

// Pre-rename keys (the app was called Jarvis until 2026-09). A device that
// last opened the old build still has its data sitting under these.
const LEGACY_KEY = 'jarvis.data.v1'
const LEGACY_RECOVERY_KEY = 'jarvis.data.recovery'

/**
 * One-time carry-forward from the Jarvis → Daybook rename: if nothing lives
 * under the new keys yet but the old ones do, copy it over before anything
 * else touches storage. `lockKey` is passed in (rather than imported) to
 * avoid a storage.ts ↔ lock.ts import cycle. Idempotent — once a new key has
 * been written once, every later call is a no-op.
 */
export function migrateLegacyKeys(adapter: StorageAdapter, lockKey: string, legacyLockKey: string): void {
  const carry = (from: string, to: string) => {
    if (adapter.load(to) !== null) return
    const old = adapter.load(from)
    if (old === null) return
    adapter.save(to, old)
    adapter.clear(from)
  }
  carry(LEGACY_KEY, KEY)
  carry(LEGACY_RECOVERY_KEY, RECOVERY_KEY)
  carry(legacyLockKey, lockKey)
}

export const webStorage: StorageAdapter = {
  load(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null // private mode, blocked cookies, embedded contexts
    }
  },
  save(key, s) {
    try {
      localStorage.setItem(key, s)
    } catch {
      /* quota or blocked — the in-memory state is still correct */
    }
  },
  clear(key) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

/** Migrations run in order when an older file is opened. */
const migrations: Record<number, (d: any) => any> = {
  // 1 → 2: goals gained a dated contribution ledger (so investing progress and
  // joint contributions have something to log against). The old lump-sum
  // `saved` becomes a single opening contribution, so total-saved is unchanged.
  1: (d) => ({
    ...d,
    goals: (d.goals ?? []).map((g: any) => {
      const { saved, ...rest } = g
      if (Array.isArray(g.contributions)) return { ...rest, contributions: g.contributions }
      const opening = saved > 0 ? [{ id: `${g.id}-opening`, date: todayKey(), amount: saved }] : []
      return { ...rest, contributions: opening }
    }),
  }),
  // 2 → 3: bills gained a cadence — every existing bill was implicitly
  // monthly, so that's the straight default. Nothing to guess.
  2: (d) => ({
    ...d,
    bills: (d.bills ?? []).map((b: any) => ({ cadence: 'monthly', ...b })),
  }),
  // 3 → 4: an expense's single amount + envelopeId becomes a line array, so
  // one purchase can be split across envelopes (or carry a refund). Every
  // existing expense becomes exactly the one line it already was — total
  // unchanged, nothing to guess.
  3: (d) => ({
    ...d,
    expenses: (d.expenses ?? []).map((e: any) => {
      const { amount, envelopeId, ...rest } = e
      if (Array.isArray(e.lines)) return { ...rest, lines: e.lines }
      return { ...rest, lines: [{ envelopeId, amount }] }
    }),
  }),
  // 4 → 5: a game's single `hours` number becomes a list of play sessions —
  // gives a real play history and makes cost-per-hour honest instead of a
  // hand-edited running total. The old total becomes one session dated today.
  4: (d) => ({
    ...d,
    games: (d.games ?? []).map((g: any) => {
      const { hours, ...rest } = g
      if (Array.isArray(g.sessions)) return { ...rest, sessions: g.sessions }
      const opening = hours > 0 ? [{ id: `${g.id}-s1`, date: todayKey(), hours }] : []
      return { ...rest, sessions: opening }
    }),
  }),
  // 5 → 6: goals gained standing recurring contributions (a spouse's autopay
  // from every paycheck, say) alongside the one-off contribution ledger.
  // Every existing goal just gets an empty list — nothing to guess, there's
  // no prior data that implies a recurring rule.
  5: (d) => ({
    ...d,
    goals: (d.goals ?? []).map((g: any) => ({ recurring: [], ...g })),
  }),
}

export function migrate(raw: any): AppData {
  let d = raw
  for (let v = d.schema ?? 0; v < SCHEMA_VERSION; v++) {
    const m = migrations[v]
    if (m) d = m(d)
    d.schema = v + 1
  }
  return d as AppData
}

/**
 * Throws on a bad parse or a migration that blows up, rather than quietly
 * handing back `fallback` — a caller that swallowed that itself would end up
 * persisting an empty shell over data that was still sitting there, just
 * unreadable by this build. Callers that can recover the raw bytes (the
 * store's boot path) should catch this and park them instead of losing them;
 * callers where losing is impossible anyway (importing a JSON file) can just
 * let the failure surface as "that file didn't import."
 */
export function deserialise(s: string | null, fallback: AppData): AppData {
  if (!s) return fallback
  const parsed = migrate(JSON.parse(s))
  // shallow-merge so a file written by an older build still opens
  return { ...fallback, ...parsed, settings: { ...fallback.settings, ...parsed.settings } }
}

export const serialise = (d: AppData) => JSON.stringify(d)
