'use client'

import { useState, useTransition, useId } from 'react'
import { updateDefaultPageAction } from '@/app/actions'

interface Props {
  id: string
  defaultPage: string
  files: string[]
}

export function DefaultPageEditor({ id, defaultPage, files }: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(defaultPage)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const listId = useId()

  function validate(v: string): string | null {
    const trimmed = v.trim()
    if (!trimmed) return 'Required'
    if (!files.includes(trimmed)) return `"${trimmed}" is not in the file manifest`
    return null
  }

  function handleSave() {
    const err = validate(value)
    if (err) { setError(err); return }
    startTransition(async () => {
      await updateDefaultPageAction(id, value.trim())
      setEditing(false)
      setError(null)
    })
  }

  function handleCancel() {
    setValue(defaultPage)
    setError(null)
    setEditing(false)
  }

  if (!editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
        <span className="az-tag az-mono">{defaultPage}</span>
        <button
          onClick={() => setEditing(true)}
          className="az-btn az-btn--ghost az-btn--sm"
          style={{ fontSize: '0.75rem', padding: '0.1rem 0.5rem' }}
        >
          Edit
        </button>
      </span>
    )
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.375rem' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
        <input
          type="text"
          list={listId}
          value={value}
          onChange={e => { setValue(e.target.value); setError(null) }}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') handleCancel()
          }}
          disabled={isPending}
          autoFocus
          className="az-mono"
          style={{
            fontSize: '0.8125rem',
            padding: '0.2rem 0.5rem',
            background: 'var(--surface2)',
            border: `1px solid ${error ? 'var(--red-400, #f87171)' : 'var(--border)'}`,
            borderRadius: '4px',
            color: 'var(--fg1)',
            width: '16rem',
          }}
        />
        <datalist id={listId}>
          {files.map(f => <option key={f} value={f} />)}
        </datalist>
        <button
          onClick={handleSave}
          disabled={isPending || !value.trim()}
          className="az-btn az-btn--primary az-btn--sm"
          style={{ opacity: isPending ? 0.6 : 1 }}
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={handleCancel}
          disabled={isPending}
          className="az-btn az-btn--ghost az-btn--sm"
        >
          Cancel
        </button>
      </span>
      {error && (
        <span style={{ fontSize: '0.75rem', color: 'var(--red-400, #f87171)' }}>
          {error}
        </span>
      )}
    </span>
  )
}
