/**
 * Encrypted export/import envelope. Independent of app-lock (lock.ts) — you
 * can encrypt a backup file even with the app itself unlocked, and the two
 * passphrases don't have to match. Pure string transforms, no storage.
 */
import { deriveKey, encryptString, decryptString, newSalt, toB64, fromB64, PBKDF2_ITERATIONS } from './crypto'

const ENVELOPE_VERSION = 1

interface Envelope {
  daybookBackup: number // presence + shape of this field is how looksEncrypted() tells envelope from plain AppData JSON
  /** Legacy field name from backups made before the Jarvis → Daybook rename (2026-09) — still recognized on import, never written. */
  jarvisBackup?: number
  salt: string
  iterations: number
  iv: string
  ciphertext: string
}

export async function encryptBackup(passphrase: string, plaintextJson: string): Promise<string> {
  const salt = newSalt()
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS)
  const enc = await encryptString(plaintextJson, key)
  const env: Envelope = { daybookBackup: ENVELOPE_VERSION, salt: toB64(salt), iterations: PBKDF2_ITERATIONS, ...enc }
  return JSON.stringify(env, null, 2)
}

/** Distinguishes an encrypted envelope from a plain AppData export at a glance, before parsing further. */
export function looksEncrypted(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      (typeof parsed.daybookBackup === 'number' || typeof parsed.jarvisBackup === 'number') &&
      typeof parsed.ciphertext === 'string'
    )
  } catch {
    return false
  }
}

export async function decryptBackup(passphrase: string, raw: string): Promise<{ ok: true; json: string } | { ok: false }> {
  let env: Envelope
  try {
    env = JSON.parse(raw)
  } catch {
    return { ok: false }
  }
  try {
    const key = await deriveKey(passphrase, fromB64(env.salt), env.iterations)
    const json = await decryptString({ iv: env.iv, ciphertext: env.ciphertext }, key)
    return { ok: true, json }
  } catch {
    return { ok: false }
  }
}
