'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  /** Number of packages currently older than `days`. */
  count: number
  days: number
}

export function CleanupOldPackages({ count, days }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleCleanup() {
    setError(null)
    startTransition(async () => {
      const res = await fetch(`/api/packages/cleanup?days=${days}`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `Cleanup failed (${res.status})`)
        return
      }
      setShowModal(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={count === 0 || isPending}
        className="az-btn az-btn--danger az-btn--sm"
        style={{ opacity: count === 0 ? 0.5 : 1 }}
      >
        Clean up
      </button>

      {showModal && (
        <div className="az-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="az-modal" onClick={e => e.stopPropagation()}>
            <h2 className="az-modal-title">Delete stale packages?</h2>
            <div className="az-modal-body">
              <p>
                This will permanently delete{' '}
                <strong style={{ color: 'var(--fg1)' }}>
                  {count} {count === 1 ? 'package' : 'packages'}
                </strong>{' '}
                not updated in over {days} days, including all files and registry
                history. This action cannot be undone.
              </p>
              {error && (
                <p style={{ marginTop: '0.75rem', color: 'var(--red-400, #f87171)' }}>{error}</p>
              )}
            </div>
            <div className="az-modal-actions">
              <button
                onClick={() => setShowModal(false)}
                disabled={isPending}
                className="az-btn az-btn--ghost az-btn--sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCleanup}
                disabled={isPending}
                className="az-btn az-btn--danger az-btn--sm"
                style={{ opacity: isPending ? 0.6 : 1 }}
              >
                {isPending ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
