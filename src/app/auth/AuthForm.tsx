'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'

export default function AuthForm() {
  const searchParams = useSearchParams()
  const returnUrl = searchParams.get('return') ?? '/'
  const [error, setError] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(false)
    const form = e.currentTarget
    const token = (form.elements.namedItem('token') as HTMLInputElement).value

    const res = await fetch(`/api/auth?return=${encodeURIComponent(returnUrl)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      redirect: 'manual',
    })

    if (res.status === 0 || (res.status >= 300 && res.status < 400)) {
      // Redirect response — follow it
      const location = res.headers.get('location') ?? '/'
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
      <button type="submit" className="az-btn az-btn--primary az-btn--md az-btn--full">
        Sign in
      </button>
    </form>
  )
}
