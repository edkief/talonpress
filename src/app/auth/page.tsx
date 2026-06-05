import { Suspense } from 'react'
import AuthForm from './AuthForm'

export default function AuthPage() {
  return (
    <div className="az-auth-bg">
      <div className="az-auth-card">
        <div className="az-auth-logo">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <path
              d="M20 4L34 11v9c0 9-6 17-14 20C12 37 6 29 6 20v-9L20 4z"
              fill="#4f46e5"
            />
            <path d="M15 20l3 3 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="az-auth-title">TalonPress</h1>
        <p className="az-auth-subtitle">Enter your access token to continue</p>
        <Suspense>
          <AuthForm />
        </Suspense>
      </div>
    </div>
  )
}
