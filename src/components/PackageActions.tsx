'use client'

import { useState, useTransition } from 'react'
import { disablePackageAction, enablePackageAction, deletePackageAction } from '@/app/actions'

interface Props {
  id: string
  name: string
  fileCount: number
  disabled?: boolean
}

export function PackageActions({ id, name, fileCount, disabled }: Props) {
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleToggleDisable() {
    startTransition(async () => {
      if (disabled) {
        await enablePackageAction(id)
      } else {
        await disablePackageAction(id)
      }
    })
  }

  function handleDelete() {
    startTransition(async () => {
      await deletePackageAction(id)
    })
  }

  return (
    <>
      <button
        onClick={handleToggleDisable}
        disabled={isPending}
        className="az-btn az-btn--ghost az-btn--sm"
        style={{ opacity: isPending ? 0.6 : 1 }}
      >
        {disabled ? 'Enable' : 'Disable'}
      </button>
      <button
        onClick={() => setShowDeleteModal(true)}
        disabled={isPending}
        className="az-btn az-btn--danger az-btn--sm"
        style={{ opacity: isPending ? 0.6 : 1 }}
      >
        Delete
      </button>

      {showDeleteModal && (
        <div className="az-modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="az-modal" onClick={e => e.stopPropagation()}>
            <h2 className="az-modal-title">Delete package?</h2>
            <div className="az-modal-body">
              <p>
                This will permanently delete <strong style={{ color: 'var(--fg1)' }}>{name}</strong> and all its data.
                This action cannot be undone.
              </p>
              <ul style={{ marginTop: '0.75rem', paddingLeft: '1.25rem', lineHeight: 1.8 }}>
                <li>Package metadata and configuration</li>
                <li>{fileCount} published {fileCount === 1 ? 'file' : 'files'}</li>
                <li>All registry history entries</li>
              </ul>
            </div>
            <div className="az-modal-actions">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isPending}
                className="az-btn az-btn--ghost az-btn--sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
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
