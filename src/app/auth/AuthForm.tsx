'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { IDENTITY_HINT, IDENTITY_MAX_LENGTH, IDENTITY_STORAGE_KEY, normalizeIdentity } from '@/lib/agent/identity'

export default function AuthForm() {
  const searchParams = useSearchParams()
  const returnUrl = searchParams.get('return') ?? '/admin'
  const [error, setError] = useState(false)
  const [nameError, setNameError] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(false)
    setNameError(false)
    const form = e.currentTarget
    const token = (form.elements.namedItem('token') as HTMLInputElement).value
    const rawName = (form.elements.namedItem('displayName') as HTMLInputElement).value

    // Optional. It names the caller's agent conversation and nothing else — the
    // shared secret is what actually grants access — so a blank one just means the
    // chat bubble asks later.
    let identity: string | null = null
    if (rawName.trim()) {
      identity = normalizeIdentity(rawName)
      if (!identity) {
        setNameError(true)
        return
      }
    }

    const res = await fetch(`/api/auth?return=${encodeURIComponent(returnUrl)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      redirect: 'manual',
    })

    if (res.status === 0 || (res.status >= 300 && res.status < 400)) {
      // Store only once the secret has actually been accepted, so a failed sign-in
      // leaves nothing behind.
      if (identity) {
        try {
          window.localStorage.setItem(IDENTITY_STORAGE_KEY, identity)
        } catch {
          // Private browsing or a full quota — the chat bubble asks again instead.
        }
      }
      // Redirect response — follow it
      const location = res.headers.get('location') ?? '/admin'
      window.location.href = location
    } else {
      setError(true)
    }
  }

  return (
    <form className="az-auth-form" onSubmit={handleSubmit}>
      {error && (
        <div className="az-auth-error">
          Invalid token — please try again.
        </div>
      )}
      {nameError && (
        <div className="az-auth-error">
          Invalid name — {IDENTITY_HINT}
        </div>
      )}
      <div className="az-input-wrap">
        <input
          className="az-input"
          type="password"
          name="token"
          placeholder="Access token"
          autoComplete="current-password"
          required
        />
      </div>
      <div className="az-input-wrap">
        <input
          className="az-input"
          type="text"
          name="displayName"
          placeholder="Your name (optional)"
          autoComplete="nickname"
          maxLength={IDENTITY_MAX_LENGTH}
          aria-describedby="az-auth-name-hint"
        />
      </div>
      <p id="az-auth-name-hint" className="az-auth-hint">
        Everyone signing in with this token shares one identity. Adding a name keeps
        your agent chats separate from your colleagues&rsquo;.
      </p>
      <button type="submit" className="az-btn az-btn--primary az-btn--md az-btn--full">
        Sign in
      </button>
    </form>
  )
}
