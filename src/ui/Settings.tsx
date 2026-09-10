import { useRef, useState } from 'react'
import { store, useData, useProtected } from '../core/store'
import { looksEncrypted } from '../core/backup'
import { toIcs } from '../core/ics'
import { checkDataHealth, type HealthIssue } from '../core/health'
import { todayKey } from '../core/dates'
import type { Theme } from '../core/types'
import { DEFAULT_PALETTE, PALETTES } from '../core/theme'
import { Empty, Field, Icons, Segmented, Sheet } from './components/kit'
import { effectiveTodayOrder, TODAY_PANELS, type TodayPanelKey } from './nav'

const MIN_PASSPHRASE = 6

/**
 * Local-first means the export file IS the backup, the sync mechanism, and the
 * migration path into the future iOS build. Keep it boring and human-readable
 * by default — encryption is opt-in, for both the app itself (the passcode
 * lock below) and for a given export (a passphrase prompt at export time).
 */
export default function Settings({ onClose }: { onClose: () => void }) {
  const data = useData()
  const locked = useProtected()
  const [name, setName] = useState(data.settings.name)
  const [currency, setCurrency] = useState(data.settings.currency)
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const save = () => {
    store.update((d) => {
      d.settings.name = name.trim() || 'you'
      d.settings.currency = currency.trim().toUpperCase() || 'USD'
    })
    onClose()
  }

  const counts = [
    ['movies', data.movies.length],
    ['games', data.games.length],
    ['bills', data.bills.length],
    ['expenses', data.expenses.length],
    ['tasks', data.tasks.length],
    ['notes', data.notes.length],
  ] as const

  return (
    <Sheet title="Settings" onClose={onClose} onSubmit={save}>
      <div className="formgrid">
        <Field label="Name">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Currency">
          <input type="text" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="USD" />
        </Field>
      </div>

      <ThemePanel />

      <HomeScreenNamePanel />

      <LockPanel locked={locked} />

      <BackupPanel counts={counts} fileRef={fileRef} message={message} setMessage={setMessage} />

      <CalendarExportPanel />

      <SnapshotsPanel onRestore={onClose} />

      <DataHealthPanel />

      <TodayLayoutPanel />

      <div className="field">
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            if (confirm('Erase everything and start with an empty app? Export first if you want a copy.')) {
              store.reset(false)
              onClose()
            }
          }}
        >
          Start fresh
        </button>
      </div>

      <p className="fieldnote" style={{ textAlign: 'center' }}>
        Build {new Date(__BUILD_TIME__).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
    </Sheet>
  )
}

/* ── Appearance ────────────────────────────────────────────────────────── */

/** Changes the instant you tap it — an appearance toggle shouldn't wait for the Sheet's Save button. */
function ThemePanel() {
  const data = useData()
  const theme: Theme = data.settings.theme ?? 'dark'
  const setTheme = (t: Theme) => store.update((d) => { d.settings.theme = t })
  const palette = data.settings.palette ?? DEFAULT_PALETTE
  const setPalette = (p: typeof palette) => store.update((d) => { d.settings.palette = p })

  return (
    <div className="field">
      <label>Appearance</label>
      <Segmented<Theme>
        value={theme}
        onChange={setTheme}
        options={[
          { value: 'dark', label: 'Dark' },
          { value: 'light', label: 'Light' },
          { value: 'system', label: 'System' },
        ]}
      />
      <div className="palette-swatches" role="radiogroup" aria-label="Accent colour">
        {PALETTES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={p.id === palette}
            aria-label={p.label}
            className="palette-swatch"
            style={{ background: p.light.accent }}
            onClick={() => setPalette(p.id)}
          >
            {p.id === palette && <Icons.check size={14} />}
          </button>
        ))}
      </div>
      <p className="fieldnote">
        The home-screen icon changes to match — but only for the next "Add to Home Screen," not one already on your
        phone. Remove and re-add it to pick up a new colour or name.
      </p>
    </div>
  )
}

/** The label under the home-screen icon (#31) — same install-time caveat as the icon itself. */
function HomeScreenNamePanel() {
  const data = useData()
  const [name, setName] = useState(data.settings.homeScreenName ?? '')

  return (
    <Field label="Home screen name">
      <input
        type="text"
        value={name}
        placeholder="Jarvis"
        onChange={(e) => setName(e.target.value)}
        onBlur={() => store.update((d) => { d.settings.homeScreenName = name.trim() || undefined })}
      />
    </Field>
  )
}

/* ── App lock ──────────────────────────────────────────────────────────── */

const PIN_LENGTH = 4

function LockPanel({ locked }: { locked: boolean }) {
  const [editing, setEditing] = useState(false)
  const [pinMode, setPinMode] = useState(false)
  const [pass, setPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setEditing(false)
    setPinMode(false)
    setPass('')
    setConfirmPass('')
    setError(null)
  }

  const submit = async () => {
    if (pinMode ? !/^\d{4}$/.test(pass) : pass.length < MIN_PASSPHRASE) {
      setError(pinMode ? `Exactly ${PIN_LENGTH} digits.` : `At least ${MIN_PASSPHRASE} characters.`)
      return
    }
    if (pass !== confirmPass) {
      setError("Those don't match.")
      return
    }
    setBusy(true)
    const kind = pinMode ? 'pin' : 'passphrase'
    if (locked) await store.changeLockPassphrase(pass, kind)
    else await store.enableLock(pass, kind)
    setBusy(false)
    reset()
  }

  return (
    <div className="field">
      <label>App lock</label>
      {!editing ? (
        <>
          <p className="fieldnote">
            {locked
              ? 'A passphrase is required to open Jarvis. Data on this device is encrypted with it — there is no reset if it’s forgotten.'
              : 'Off. Anyone who opens this browser tab or app icon sees your data as-is.'}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              {locked ? 'Change passphrase' : 'Turn on lock'}
            </button>
            {locked && (
              <>
                <button type="button" className="btn" onClick={() => store.relock()}>
                  Lock now
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    if (confirm('Turn off the app lock? Data on this device goes back to being unencrypted.')) {
                      store.disableLock()
                    }
                  }}
                >
                  Turn off lock
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5 }}>
            <input
              type="checkbox"
              className="check"
              checked={pinMode}
              onChange={(e) => { setPinMode(e.target.checked); setPass(''); setConfirmPass(''); setError(null) }}
            />
            Use a short PIN instead
          </label>
          {pinMode && (
            <p className="fieldnote">
              A {PIN_LENGTH}-digit PIN is much weaker than a real passphrase — this is privacy from someone glancing
              at your phone, not real security. The data is only as safe as those {PIN_LENGTH} digits.
            </p>
          )}
          <input
            type={pinMode ? 'text' : 'password'}
            inputMode={pinMode ? 'numeric' : undefined}
            autoComplete="new-password"
            placeholder={pinMode ? `${PIN_LENGTH}-digit PIN` : 'New passphrase'}
            value={pass}
            maxLength={pinMode ? PIN_LENGTH : undefined}
            onChange={(e) => setPass(pinMode ? e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH) : e.target.value)}
            aria-label={pinMode ? 'New PIN' : 'New passphrase'}
          />
          <input
            type={pinMode ? 'text' : 'password'}
            inputMode={pinMode ? 'numeric' : undefined}
            autoComplete="new-password"
            placeholder={pinMode ? `Confirm PIN` : 'Confirm passphrase'}
            value={confirmPass}
            maxLength={pinMode ? PIN_LENGTH : undefined}
            onChange={(e) => setConfirmPass(pinMode ? e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH) : e.target.value)}
            aria-label={pinMode ? 'Confirm PIN' : 'Confirm passphrase'}
          />
          {error && <p className="fieldnote error">{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn ghost" onClick={reset}>
              Cancel
            </button>
            <button type="button" className="btn primary" disabled={busy} onClick={submit}>
              {busy ? 'Saving…' : 'Set passphrase'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Backup ────────────────────────────────────────────────────────────── */

function BackupPanel({
  counts,
  fileRef,
  message,
  setMessage,
}: {
  counts: readonly (readonly [string, number])[]
  fileRef: React.RefObject<HTMLInputElement | null>
  message: string | null
  setMessage: (m: string | null) => void
}) {
  const [exportPass, setExportPass] = useState('')
  const [showExportPass, setShowExportPass] = useState(false)
  const [pendingImport, setPendingImport] = useState<string | null>(null)
  const [importPass, setImportPass] = useState('')

  const downloadOrCopy = async (text: string, filename: string, copy: boolean) => {
    if (copy) {
      try {
        await navigator.clipboard.writeText(text)
        setMessage('Copied. Paste it somewhere safe.')
        store.update((d) => { d.settings.lastExportAt = new Date().toISOString() })
        return
      } catch {
        setMessage('Clipboard blocked — use Export instead.')
        return
      }
    }
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    store.update((d) => { d.settings.lastExportAt = new Date().toISOString() })
  }

  const exportEncrypted = async (copy: boolean) => {
    if (exportPass.length < MIN_PASSPHRASE) {
      setMessage(`Backup passphrase needs at least ${MIN_PASSPHRASE} characters.`)
      return
    }
    const envelope = await store.exportEncrypted(exportPass)
    await downloadOrCopy(envelope, `jarvis-${new Date().toISOString().slice(0, 10)}.backup.json`, copy)
    setShowExportPass(false)
    setExportPass('')
  }

  const exportPlain = (copy: boolean) => downloadOrCopy(store.export(), `jarvis-${new Date().toISOString().slice(0, 10)}.json`, copy)

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result)
      if (looksEncrypted(raw)) {
        setPendingImport(raw)
        return
      }
      const res = store.import(raw)
      setMessage(res.ok ? 'Imported.' : `Could not import that file: ${res.error}`)
    }
    reader.readAsText(file)
  }

  const finishEncryptedImport = async () => {
    if (!pendingImport) return
    const res = await store.importEncrypted(importPass, pendingImport)
    setMessage(res.ok ? 'Imported.' : `Could not import that file: ${res.error}`)
    if (res.ok || res.error !== 'wrong passphrase') {
      setPendingImport(null)
      setImportPass('')
    }
  }

  return (
    <div className="field">
      <label>Backup</label>
      <p className="fieldnote">
        Everything lives in this browser and nowhere else — {counts.map(([k, n]) => `${n} ${k}`).join(', ')}. Export
        before you clear your browser data, switch phones, or move to the native build.
      </p>

      {!showExportPass ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn primary" onClick={() => setShowExportPass(true)}>
            Export encrypted backup
          </button>
          <button type="button" className="btn" onClick={() => exportPlain(false)}>
            Export plain JSON
          </button>
          <button type="button" className="btn" onClick={() => exportPlain(true)}>
            Copy plain JSON
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Backup passphrase"
            value={exportPass}
            onChange={(e) => setExportPass(e.target.value)}
            aria-label="Backup passphrase"
          />
          <p className="fieldnote">
            You'll need this exact passphrase to import the file back later — write it down somewhere separate from
            the file itself.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setShowExportPass(false)
                setExportPass('')
              }}
            >
              Cancel
            </button>
            <button type="button" className="btn" onClick={() => exportEncrypted(true)}>
              Copy
            </button>
            <button type="button" className="btn primary" onClick={() => exportEncrypted(false)}>
              Download
            </button>
          </div>
        </div>
      )}

      {pendingImport && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="fieldnote">That file is an encrypted backup. Enter its passphrase to import it.</p>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Backup passphrase"
            value={importPass}
            onChange={(e) => setImportPass(e.target.value)}
            aria-label="Import passphrase"
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setPendingImport(null)
                setImportPass('')
              }}
            >
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={finishEncryptedImport}>
              Import
            </button>
          </div>
        </div>
      )}

      {message && <p style={{ margin: 0, fontSize: 13, color: 'var(--accent-ink)' }}>{message}</p>}
    </div>
  )
}

/* ── Calendar export ───────────────────────────────────────────────────── */

/**
 * A one-way snapshot into Apple Calendar (or anywhere else that reads .ics),
 * no server or account. Re-export when things change — nothing here syncs.
 */
function CalendarExportPanel() {
  const data = useData()
  const [includeTasks, setIncludeTasks] = useState(true)
  const [includeBills, setIncludeBills] = useState(true)
  const [includePeople, setIncludePeople] = useState(true)

  const exportIcs = () => {
    const ics = toIcs(data, { tasks: includeTasks, bills: includeBills, people: includePeople })
    const blob = new Blob([ics], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `jarvis-${todayKey()}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="field">
      <label>Export calendar</label>
      <p className="fieldnote">
        A snapshot of dated tasks and bill due dates as a .ics file — opening it on iOS offers to add the events to
        Apple Calendar. This doesn't sync: re-export whenever things change.
      </p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5 }}>
          <input type="checkbox" className="check" checked={includeTasks} onChange={(e) => setIncludeTasks(e.target.checked)} />
          Tasks
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5 }}>
          <input type="checkbox" className="check" checked={includeBills} onChange={(e) => setIncludeBills(e.target.checked)} />
          Bills
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5 }}>
          <input type="checkbox" className="check" checked={includePeople} onChange={(e) => setIncludePeople(e.target.checked)} />
          Birthdays
        </label>
      </div>
      <button type="button" className="btn" disabled={!includeTasks && !includeBills && !includePeople} onClick={exportIcs}>
        Export calendar (.ics)
      </button>
    </div>
  )
}

/* ── Rolling snapshots ─────────────────────────────────────────────────── */

/**
 * The last three states from right before a "Start fresh" or an import —
 * a bad import or a fat-fingered reset becomes recoverable instead of gone.
 * Nothing to configure: this just shows what's already sitting there.
 */
function SnapshotsPanel({ onRestore }: { onRestore: () => void }) {
  const [snapshots, setSnapshots] = useState(() => store.listSnapshots())

  const restore = (key: string, at: string) => {
    const when = new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    if (!confirm(`Restore the state from ${when}? Whatever's here now will be replaced.`)) return
    if (store.restoreSnapshot(key)) onRestore()
  }

  if (snapshots.length === 0) return null

  return (
    <div className="field">
      <label>Recent snapshots</label>
      <p className="fieldnote">
        Taken automatically right before an import or "Start fresh" — a way back if either one goes wrong.
      </p>
      <div className="rows" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
        {snapshots.map((s) => (
          <div key={s.key} className="row">
            <div className="grow title">
              {new Date(s.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
            <button type="button" className="btn sm ghost" onClick={() => restore(s.key, s.at)}>
              Restore
            </button>
          </div>
        ))}
      </div>
      {/* Re-reads the list after a restore, since restoring one doesn't
          itself take a new snapshot — the list otherwise wouldn't reflect it. */}
      <button type="button" className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => setSnapshots(store.listSnapshots())}>
        Refresh
      </button>
    </div>
  )
}

/* ── Data health ───────────────────────────────────────────────────────── */

/** Run on demand, not automatically — a deleted envelope an old expense still points to, a duplicate title, or unassigned spend worth a glance. */
function DataHealthPanel() {
  const data = useData()
  const [issues, setIssues] = useState<HealthIssue[] | null>(null)

  return (
    <div className="field">
      <label>Data health</label>
      <p className="fieldnote">Checked only when you ask — nothing runs in the background.</p>
      <button type="button" className="btn" onClick={() => setIssues(checkDataHealth(data))}>
        Check now
      </button>
      {issues && (
        <div className="rows" style={{ border: '1px solid var(--line)', borderRadius: 8, marginTop: 10 }}>
          {issues.length === 0 && <Empty>Nothing found.</Empty>}
          {issues.map((issue, i) => (
            <div key={i} className="row" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="title">{issue.label}</div>
                <div className="meta">{issue.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Today layout ──────────────────────────────────────────────────────── */

/** Reorder or hide Today's content panels (#12) — everyone's "today" is a different shape. */
function TodayLayoutPanel() {
  const data = useData()
  const order = effectiveTodayOrder(data.settings.todayOrder)
  const hidden = data.settings.todayHidden ?? []
  const labelFor = (key: TodayPanelKey) => TODAY_PANELS.find((p) => p.key === key)?.label ?? key

  const move = (key: TodayPanelKey, dir: -1 | 1) => {
    const idx = order.indexOf(key)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= order.length) return
    const next = [...order]
    ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
    store.update((d) => { d.settings.todayOrder = next })
  }

  const toggleHidden = (key: TodayPanelKey) => {
    store.update((d) => {
      const set = new Set(d.settings.todayHidden ?? [])
      if (set.has(key)) set.delete(key)
      else set.add(key)
      d.settings.todayHidden = [...set]
    })
  }

  return (
    <div className="field">
      <label>Today layout</label>
      <p className="fieldnote">Reorder or hide Today's panels.</p>
      <div className="rows" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
        {order.map((key, i) => (
          <div key={key} className="row">
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, cursor: 'pointer' }}>
              <input type="checkbox" className="check" checked={!hidden.includes(key)} onChange={() => toggleHidden(key)} />
              <span style={{ opacity: hidden.includes(key) ? 0.5 : 1 }}>{labelFor(key)}</span>
            </label>
            <button type="button" className="iconbtn" aria-label={`Move ${labelFor(key)} up`} disabled={i === 0} onClick={() => move(key, -1)}>
              <span style={{ display: 'inline-flex', transform: 'rotate(-90deg)' }}>
                <Icons.chevron size={14} />
              </span>
            </button>
            <button type="button" className="iconbtn" aria-label={`Move ${labelFor(key)} down`} disabled={i === order.length - 1} onClick={() => move(key, 1)}>
              <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}>
                <Icons.chevron size={14} />
              </span>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
