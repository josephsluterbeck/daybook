/**
 * Encryption primitives, built on the standard Web Crypto API
 * (`crypto.subtle` / `crypto.getRandomValues`). Both exist as a bare global
 * in every target this app runs on — browsers, Node 19+, and React Native
 * once a `crypto` polyfill (e.g. `react-native-quick-crypto`) is installed —
 * so this file has no DOM/window dependency and moves to the native build
 * untouched, same as the rest of `core/`.
 *
 * Base64 is hand-rolled rather than `btoa`/`atob` for the same reason: those
 * are DOM globals with no guaranteed RN equivalent, and dates.ts already
 * sets the precedent of a few dependency-free lines over a library.
 */

const PBKDF2_ITERATIONS = 250_000 // BACKLOG #41a's explicit floor for PBKDF2-HMAC-SHA256 (above OWASP's 2023 210k minimum)
const AES_KEY_LENGTH = 256 // AES-256-GCM
const IV_BYTES = 12 // recommended IV length for AES-GCM
const SALT_BYTES = 16

function webcrypto(): Crypto {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto
  if (!c?.subtle) throw new Error('Web Crypto is not available in this environment')
  return c
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n)
  webcrypto().getRandomValues(bytes)
  return bytes
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function toB64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    out += B64_CHARS[b0 >> 2]
    out += B64_CHARS[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)]
    out += b1 === undefined ? '=' : B64_CHARS[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)]
    out += b2 === undefined ? '=' : B64_CHARS[b2 & 63]
  }
  return out
}

export function fromB64(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '')
  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  for (const ch of clean) {
    const val = B64_CHARS.indexOf(ch)
    if (val === -1) continue
    buffer = (buffer << 6) | val
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }
  return new Uint8Array(bytes)
}

export interface EncryptedString {
  iv: string // base64
  ciphertext: string // base64
}

async function deriveKeyFromPassphrase(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const subtle = webcrypto().subtle
  const base = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false, // not extractable — the raw key never leaves the CryptoKey object
    ['encrypt', 'decrypt'],
  )
}

export function newSalt(): Uint8Array {
  return randomBytes(SALT_BYTES)
}

export async function deriveKey(passphrase: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  return deriveKeyFromPassphrase(passphrase, salt, iterations)
}

/** A fresh random IV is generated per call, as AES-GCM requires. */
export async function encryptString(plaintext: string, key: CryptoKey): Promise<EncryptedString> {
  const iv = randomBytes(IV_BYTES)
  const buf = await webcrypto().subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(plaintext))
  return { iv: toB64(iv), ciphertext: toB64(new Uint8Array(buf)) }
}

/** Throws if `key` is wrong or the ciphertext was tampered with — AES-GCM's auth tag check fails closed. */
export async function decryptString(e: EncryptedString, key: CryptoKey): Promise<string> {
  const buf = await webcrypto().subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(e.iv) as BufferSource },
    key,
    fromB64(e.ciphertext) as BufferSource,
  )
  return new TextDecoder().decode(buf)
}

export { PBKDF2_ITERATIONS }
