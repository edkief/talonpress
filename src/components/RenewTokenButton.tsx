'use client'

import { useState, useTransition } from 'react'
import { renewTokenAction } from '@/app/actions'

interface Props {
  id: string
}

export function RenewTokenButton({ id }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleRenew() {
    startTransition(async () => {
      await renewTokenAction(id)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        disabled={isPending}
        className="az-btn az-btn--ghost az-btn--sm"
        style={{ opacity: isPending ? 0.6 : 1 }}
      >
        Renew
      </button>

      {showModal && (
        <div className="az-modal-overlay" onClick={() => !isPending && setShowModal(false)}>
          <div className="az-modal" onClick={e => e.stopPropagation()}>
            <h2 className="az-modal-title">Renew access token?</h2>
            <div className="az-modal-body">
              <p>
                A new token will be generated and replace the current one.
                Anyone with the current token will lose access immediately.
              </p>
              <p style={{ marginTop: '0.5rem', color: 'var(--fg3)' }}>
                Use this when you suspect the token has leaked. The package URL
                and any links that embed the old token will need to be reshared.
              </p>
            </div>
            <div className="az-modal-actions">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={isPending}
                className="az-btn az-btn--ghost az-btn--sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRenew}
                disabled={isPending}
                className="az-btn az-btn--primary az-btn--sm"
                style={{ opacity: isPending ? 0.6 : 1 }}
              >
                {isPending ? 'Renewing…' : 'Renew token'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}