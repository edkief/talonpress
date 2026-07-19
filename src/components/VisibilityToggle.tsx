'use client'

import { useTransition } from 'react'
import { setVisibilityAction } from '@/app/actions'
import type { Visibility } from '@/lib/storage/types'

interface Props {
  id: string
  visibility: Visibility
}

function IconGlobe({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 1.5c-2 2-3 4-3 6.5s1 4.5 3 6.5M8 1.5c2 2 3 4 3 6.5s-1 4.5-3 6.5M1.5 8h13" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
}
function IconLock({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

export function VisibilityToggle({ id, visibility }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    const next: Visibility = visibility === 'public' ? 'private' : 'public'
    startTransition(async () => {
      await setVisibilityAction(id, next)
    })
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      title={`Make ${visibility === 'public' ? 'private' : 'public'}`}
      className={`az-badge az-badge--${visibility} az-badge--toggle`}
      style={{ cursor: isPending ? 'default' : 'pointer', opacity: isPending ? 0.6 : 1 }}
    >
      {visibility === 'public' ? <IconGlobe /> : <IconLock />}
      {visibility}
    </button>
  )
}
