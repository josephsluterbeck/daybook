/**
 * A ~60-line observable store. No dependency, no provider, no context.
 * `useSyncExternalStore` is React-only, so it lives at the bottom of this file
 * and everything above it is portable.
 */
import { useSyncExternalStore } from 'react'
import type { AppData } from './types'
import { deserialise, serialise, webStorage, KEY, RECOVERY_KEY, type StorageAdapter } from './storage'
import { emptyData, seedData } from './seed'
import { pruneOldCompletions } from './routines'
import {
  pushSnapshot,
  listSnapshots as listSnapshotsFrom,
  readSnapshot,
  type Snapshot,
} from './snapshots'
import {
  isLockEnabled,
  lockKind as lockKindOf,
  unlock as unlockRecord,
  enable as enableLockRecord,
  disable as disableLockRecord,
  changePassphrase as changeLockPassphraseRecord,
  encryptRecord,
  LOCK_KEY,
  type LockKind,
  type UnlockedSession,
} from './lock'
import { encryptBackup, decryptBackup } from './backup'

type Listener = () => void
export type LockState = 'unlocked' | 'locked'

/** How many mutations back undo() can reach. Not persisted — undo across app restarts isn't worth the storage. */
const UNDO_DEPTH = 10
/** How long a delete's "Undo" toast stays up before it's too late to use it. */
const UNDO_TOAST_MS = 5000

export class Store {
  private data: AppData
  private listeners = new Set<Listener>()
  private lockStateValue: LockState = 'unlocked'
  private protectedMode: boolean
  private session: UnlockedSession | null = null
  private persistSeq = 0
  private undoStack: string[] = []
  private toastMessage: string | null = null
  private toastListeners = new Set<Listener>()
  private toastTimer: ReturnType<typeof setTimeout> | null = null
  private highlightId: string | null = null
  private highlightListeners = new Set<Listener>()

  constructor(private adapter: StorageAdapter) {
    this.protectedMode = isLockEnabled(adapter)
    if (this.protectedMode) {
      // Data stays encrypted on disk until unlock() succeeds. This placeholder
      // is never rendered — App.tsx shows the lock screen instead of the tabs
      // for as long as lockState() is 'locked'.
      this.lockStateValue = 'locked'
      this.data = emptyData()
      return
    }
    const existing = adapter.load(KEY)
    if (!existing) {
      // First run gets example data so the app opens showing what it does.
      this.data = seedData()
      this.persist()
    } else {
      try {
        this.data = deserialise(existing, emptyData())
        pruneOldCompletions(this.data)
        // Commit a schema migration immediately rather than leaving the old
        // shape on disk until some unrelated edit happens to save next.
        if (this.data.schema !== JSON.parse(existing).schema) this.persist()
      } catch {
        // A file that won't parse or migrate is parked, not discarded — the
        // in-memory app still opens (to an empty shell) instead of crashing,
        // but the very next update() must not overwrite the recoverable bytes.
        adapter.save(RECOVERY_KEY, existing)
        this.data = emptyData()
      }
    }
  }

  get(): AppData {
    return this.data
  }

  lockState(): LockState {
    return this.lockStateValue
  }

  /** Whether a passphrase is set at all — distinct from lockState(), which also covers "no lock exists". */
  isProtected(): boolean {
    return this.protectedMode
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private notify() {
    this.listeners.forEach((l) => l())
  }

  private persist() {
    if (this.session) {
      // Re-encrypting is async; guard against a slow call finishing after a
      // newer one and clobbering it with stale ciphertext.
      const seq = ++this.persistSeq
      const session = this.session
      encryptRecord(session, serialise(this.data))
        .then((rec) => {
          if (seq === this.persistSeq) this.adapter.save(LOCK_KEY, rec)
        })
        .catch(() => {})
      return
    }
    this.adapter.save(KEY, serialise(this.data))
  }

  /** Every mutation goes through here: new object, persist, notify. */
  update(fn: (d: AppData) => AppData | void) {
    this.undoStack.push(serialise(this.data))
    if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift()

    const draft = structuredClone(this.data)
    const next = fn(draft)
    // fn normally mutates `draft` in place and returns nothing — fall back to
    // the draft itself, not the pre-mutation this.data, or every in-place
    // edit (the pattern every Sheet in the app uses) is silently discarded.
    this.data = (next ?? draft) as AppData
    this.persist()
    this.notify()
  }

  /**
   * Same as update(), plus a five-second "Undo" toast — for deletions
   * specifically, not every edit. A mis-tapped Delete on a goal with a year
   * of history in it should be reversible; a routine field edit doesn't need
   * the same ceremony.
   */
  remove(label: string, fn: (d: AppData) => void) {
    this.update(fn)
    this.announceToast(`Deleted "${label}".`)
  }

  /** A plain confirmation toast — for anything else worth surfacing briefly, like what a Shortcut deep link just added. */
  notice(msg: string) {
    this.announceToast(msg)
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  /** Restores the state from just before the most recent update()/remove(). False if there's nothing left to undo. */
  undo(): boolean {
    const prev = this.undoStack.pop()
    if (!prev) return false
    this.data = JSON.parse(prev) as AppData
    this.persist()
    this.notify()
    this.dismissToast()
    return true
  }

  subscribeToast = (fn: Listener) => {
    this.toastListeners.add(fn)
    return () => this.toastListeners.delete(fn)
  }

  getToast(): string | null {
    return this.toastMessage
  }

  dismissToast() {
    if (this.toastTimer) clearTimeout(this.toastTimer)
    this.toastMessage = null
    this.toastListeners.forEach((l) => l())
  }

  private announceToast(msg: string) {
    this.toastMessage = msg
    this.toastListeners.forEach((l) => l())
    if (this.toastTimer) clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => this.dismissToast(), UNDO_TOAST_MS)
  }

  /**
   * The "jump to this item" signal behind global search (#18) — an id that
   * some screen should scroll to and flash, once. Ephemeral like the toast:
   * not part of AppData, never persisted, cleared by whichever screen
   * actually displays it so switching tabs and back doesn't replay it.
   */
  setHighlight(id: string) {
    this.highlightId = id
    this.highlightListeners.forEach((l) => l())
  }

  getHighlight(): string | null {
    return this.highlightId
  }

  clearHighlight() {
    if (this.highlightId == null) return
    this.highlightId = null
    this.highlightListeners.forEach((l) => l())
  }

  subscribeHighlight = (fn: Listener) => {
    this.highlightListeners.add(fn)
    return () => this.highlightListeners.delete(fn)
  }

  replace(d: AppData) {
    this.data = d
    this.persist()
    this.notify()
  }

  reset(withSeed = false) {
    pushSnapshot(this.adapter, serialise(this.data))
    this.replace(withSeed ? seedData() : emptyData())
  }

  export(): string {
    return JSON.stringify(this.data, null, 2)
  }

  import(json: string): { ok: true } | { ok: false; error: string } {
    try {
      const parsed = JSON.parse(json)
      if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object')
      const next = deserialise(JSON.stringify(parsed), emptyData())
      pruneOldCompletions(next)
      pushSnapshot(this.adapter, serialise(this.data))
      this.replace(next)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'could not read that file' }
    }
  }

  /* ── Rolling snapshots ────────────────────────────────────────────────── */

  /** The last three states from right before a "Start fresh" or an import — newest first. */
  listSnapshots(): Snapshot[] {
    return listSnapshotsFrom(this.adapter)
  }

  /** Restores one snapshot as the current data. False if that slot is missing or unreadable. */
  restoreSnapshot(key: string): boolean {
    const raw = readSnapshot(this.adapter, key)
    if (!raw) return false
    try {
      const next = deserialise(raw, emptyData())
      pruneOldCompletions(next)
      this.replace(next)
      return true
    } catch {
      return false
    }
  }

  async exportEncrypted(passphrase: string): Promise<string> {
    return encryptBackup(passphrase, this.export())
  }

  async importEncrypted(passphrase: string, raw: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const res = await decryptBackup(passphrase, raw)
    if (!res.ok) return { ok: false, error: 'wrong passphrase' }
    return this.import(res.json)
  }

  /* ── App lock ─────────────────────────────────────────────────────────── */

  async unlock(passphrase: string): Promise<boolean> {
    const res = await unlockRecord(this.adapter, passphrase)
    if (!res.ok) return false
    try {
      // Parse before committing to "unlocked" — if the decrypted bytes don't
      // read, treat it like a failed unlock instead of showing an empty app
      // that the next edit would then persist over the real, still-encrypted data.
      this.data = deserialise(res.plaintext, emptyData())
      pruneOldCompletions(this.data)
    } catch {
      return false
    }
    this.session = res.session
    this.lockStateValue = 'unlocked'
    this.notify()
    return true
  }

  /** Turns the lock on for the first time. Call while already unlocked. */
  async enableLock(passphrase: string, kind: LockKind = 'passphrase'): Promise<void> {
    this.session = await enableLockRecord(this.adapter, passphrase, serialise(this.data), kind)
    this.protectedMode = true
    this.notify()
  }

  /** Which on-screen keyboard the lock screen should show — readable even while still locked, since it's plaintext metadata alongside the (also plaintext) salt. Null if no lock is set. */
  lockKind(): LockKind | null {
    return lockKindOf(this.adapter)
  }

  /** Turns the lock off. Requires an active unlocked session. */
  disableLock(): void {
    if (!this.session) return
    disableLockRecord(this.adapter, serialise(this.data))
    this.session = null
    this.protectedMode = false
    this.notify()
  }

  async changeLockPassphrase(newPassphrase: string, kind: LockKind = 'passphrase'): Promise<void> {
    if (!this.session) return
    this.session = await changeLockPassphraseRecord(this.adapter, newPassphrase, serialise(this.data), kind)
    this.notify()
  }

  /** Drops the in-memory key and data, and shows the lock screen again. No-op if no lock is set. */
  relock(): void {
    if (!this.protectedMode) return
    this.session = null
    this.data = emptyData()
    this.lockStateValue = 'locked'
    this.notify()
  }
}

export const store = new Store(webStorage)

export function useData(): AppData {
  return useSyncExternalStore(store.subscribe, () => store.get())
}

export function useLockKind(): LockKind | null {
  return useSyncExternalStore(store.subscribe, () => store.lockKind())
}

export function useLockState(): LockState {
  return useSyncExternalStore(store.subscribe, () => store.lockState())
}

export function useProtected(): boolean {
  return useSyncExternalStore(store.subscribe, () => store.isProtected())
}

/** The current "Deleted 'X'." toast message, or null when there isn't one. */
export function useUndoToast(): string | null {
  return useSyncExternalStore(store.subscribeToast, () => store.getToast())
}

/** The id a global search result asked some screen to scroll to and flash, or null. */
export function useHighlight(): string | null {
  return useSyncExternalStore(store.subscribeHighlight, () => store.getHighlight())
}

export const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
