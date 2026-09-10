/**
 * App-lock: encrypts the whole AppData payload at rest behind a passphrase.
 *
 * Off by default. Nothing here runs unless the user opts in from Settings —
 * an app with no lock set behaves exactly as before, reading/writing plain
 * JSON under storage.KEY. Once a lock is set, the plaintext under KEY is
 * removed and a `LockRecord` (salt + iterations + AES-GCM ciphertext) lives
 * under LOCK_KEY instead. There is no recovery path for a forgotten
 * passphrase by design — the key is derived, never stored.
 *
 * Platform-free: only talks to StorageAdapter and crypto.ts, so it ports
 * with the rest of core/.
 */
import { KEY, type StorageAdapter } from './storage'
import { deriveKey, encryptString, decryptString, newSalt, toB64, fromB64, PBKDF2_ITERATIONS } from './crypto'

export const LOCK_KEY = 'jarvis.lock.v1'

export type LockKind = 'pin' | 'passphrase'

interface LockRecord {
  salt: string
  iterations: number
  iv: string
  ciphertext: string
  /** Set at Settings' own "Use a short PIN instead" checkbox — plain, unencrypted, alongside salt/iterations (which are already stored in the clear; you need them to derive the key before you can decrypt anything). Only ever used to pick the right on-screen keyboard; a missing value (a record from before this field existed) reads as 'passphrase', which is the safe default — worst case an old PIN user keeps seeing the full keyboard until they reset the lock. */
  kind?: LockKind
}

/** The live, in-memory result of a successful unlock. Never persisted. */
export interface UnlockedSession {
  key: CryptoKey
  salt: Uint8Array
  iterations: number
  /** Carried for the life of the session so every subsequent re-encrypt (on every store.update — see encryptRecord) keeps writing it back; without this, the first edit after unlock would silently drop it from the record. */
  kind: LockKind
}

export function isLockEnabled(adapter: StorageAdapter): boolean {
  return adapter.load(LOCK_KEY) !== null
}

/** Which on-screen keyboard the lock screen should show — readable while still locked, since it's plaintext metadata, not the passphrase itself. Null when no lock is set. */
export function lockKind(adapter: StorageAdapter): LockKind | null {
  const rec = readRecord(adapter)
  if (!rec) return null
  return rec.kind ?? 'passphrase'
}

function readRecord(adapter: StorageAdapter): LockRecord | null {
  const raw = adapter.load(LOCK_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Wrong passphrase and a corrupted record both come back as `{ ok: false }` — AES-GCM fails closed. */
export async function unlock(
  adapter: StorageAdapter,
  passphrase: string,
): Promise<{ ok: true; plaintext: string; session: UnlockedSession } | { ok: false }> {
  const rec = readRecord(adapter)
  if (!rec) return { ok: false }
  const salt = fromB64(rec.salt)
  try {
    const key = await deriveKey(passphrase, salt, rec.iterations)
    const plaintext = await decryptString({ iv: rec.iv, ciphertext: rec.ciphertext }, key)
    return { ok: true, plaintext, session: { key, salt, iterations: rec.iterations, kind: rec.kind ?? 'passphrase' } }
  } catch {
    return { ok: false }
  }
}

/** Turns the lock on: derives a fresh key from `passphrase`, encrypts `plaintext`, clears the plaintext slot. */
export async function enable(adapter: StorageAdapter, passphrase: string, plaintext: string, kind: LockKind = 'passphrase'): Promise<UnlockedSession> {
  const salt = newSalt()
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS)
  await writeRecord(adapter, { key, salt, iterations: PBKDF2_ITERATIONS, kind }, plaintext)
  adapter.clear(KEY)
  return { key, salt, iterations: PBKDF2_ITERATIONS, kind }
}

/** Turns the lock off: writes `plaintext` back to the plain slot, deletes the lock record. */
export function disable(adapter: StorageAdapter, plaintext: string): void {
  adapter.save(KEY, plaintext)
  adapter.clear(LOCK_KEY)
}

/** New passphrase, same data: fresh salt + key, re-encrypt, overwrite the record. */
export async function changePassphrase(
  adapter: StorageAdapter,
  newPassphrase: string,
  plaintext: string,
  kind: LockKind = 'passphrase',
): Promise<UnlockedSession> {
  return enable(adapter, newPassphrase, plaintext, kind)
}

/**
 * Encrypts `plaintext` under `session`'s key and returns the record as a
 * JSON string, without writing it. Split out so callers that fire off many
 * writes in quick succession (the store, on every update) can await the
 * encrypt and decide for themselves whether the result is still current
 * before saving it — AES-GCM's own ordering isn't the store's.
 */
export async function encryptRecord(session: UnlockedSession, plaintext: string): Promise<string> {
  const enc = await encryptString(plaintext, session.key)
  const rec: LockRecord = { salt: toB64(session.salt), iterations: session.iterations, kind: session.kind, ...enc }
  return JSON.stringify(rec)
}

async function writeRecord(adapter: StorageAdapter, session: UnlockedSession, plaintext: string): Promise<void> {
  adapter.save(LOCK_KEY, await encryptRecord(session, plaintext))
}
