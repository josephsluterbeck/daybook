import { useEffect, useRef, useState, type FormEvent } from 'react'
import { store, useLockKind } from '../core/store'
import { Icons } from './components/kit'

const PIN_LENGTH = 4

/**
 * Shown instead of the tab shell — not a <Sheet> — while the store's data is
 * still encrypted on disk. Nothing under App's tabs mounts until this
 * resolves, so nothing sensitive touches the DOM before unlock.
 */
export default function LockScreen() {
  const kind = useLockKind()
  const isPin = kind === 'pin'
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const attempt = async (value: string) => {
    if (!value || busy) return
    setBusy(true)
    setError(null)
    const ok = await store.unlock(value)
    if (!ok) {
      setBusy(false)
      setError(isPin ? 'Wrong PIN — try again.' : 'Wrong passphrase — try again.')
      setPassphrase('')
      inputRef.current?.focus()
    }
    // on success the component unmounts as App re-renders, nothing left to do
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    attempt(passphrase)
  }

  // A PIN has one right length — submit the instant it's reached instead of
  // making a 4-digit unlock still need an extra tap on the keyboard's own
  // Done/Go button, which the numeric pad doesn't always show prominently.
  useEffect(() => {
    if (isPin && passphrase.length === PIN_LENGTH) attempt(passphrase)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPin, passphrase])

  return (
    <div className="lockscreen">
      <form className="lockcard" onSubmit={submit}>
        <span className="lockicon" aria-hidden="true">
          <Icons.lock size={22} />
        </span>
        <h1>Daybook is locked</h1>
        <p>{isPin ? `Enter your ${PIN_LENGTH}-digit PIN to open it.` : 'Enter your passphrase to open it.'}</p>
        <input
          ref={inputRef}
          type="password"
          autoFocus
          autoComplete="current-password"
          // A PIN is short and numeric, so it should pull up the phone's
          // number pad instead of the full keyboard — inputMode is what
          // decides that, independent of `type`, so this still masks input.
          inputMode={isPin ? 'numeric' : undefined}
          pattern={isPin ? '[0-9]*' : undefined}
          maxLength={isPin ? PIN_LENGTH : undefined}
          value={passphrase}
          onChange={(e) => setPassphrase(isPin ? e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH) : e.target.value)}
          placeholder={isPin ? 'PIN' : 'Passphrase'}
          aria-label={isPin ? 'PIN' : 'Passphrase'}
        />
        {error && <p className="lockerror">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy || !passphrase}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
        <p className="lockhint">
          There's no reset for a forgotten {isPin ? 'PIN' : 'passphrase'} — the data is encrypted with it, not
          recoverable without it. An exported backup is the only way back in if it's lost.
        </p>
      </form>
    </div>
  )
}
