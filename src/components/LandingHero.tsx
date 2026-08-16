import Link from 'next/link'
import { config } from '@/lib/config'

const REPO_URL = 'https://github.com/edkief/talonpress'

function IconShield({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M20 4L34 11v9c0 9-6 17-14 20C12 37 6 29 6 20v-9L20 4z" fill="#4f46e5" />
      <path d="M15 20l3 3 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconGithub({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 014 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function IconPlug({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 1.5v4M10 1.5v4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M3.5 5.5h9v2a4.5 4.5 0 01-9 0v-2z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M8 12v2.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

function IconLayers({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5L14.5 5 8 8.5 1.5 5 8 1.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M1.5 8L8 11.5 14.5 8M1.5 11L8 14.5 14.5 11" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  )
}

function IconKey({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="5.5" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 8l6 6M11.5 11.5l-1.5 1.5M13 10l-1.5 1.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

function IconBolt({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M9 1.5L3.5 9H7.5l-.5 5.5L12.5 7H8.5l.5-5.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  )
}

const FEATURES = [
  {
    icon: IconPlug,
    title: 'MCP-native',
    body: 'Agents publish, update, and retire packages through standard Model Context Protocol tools and resources — no bespoke API client to write.',
  },
  {
    icon: IconLayers,
    title: 'Zero-dependency storage',
    body: 'No database, object store, or key-value service. Packages live on the local filesystem, which makes a deployment a single container and a volume.',
  },
  {
    icon: IconKey,
    title: 'Token-gated privacy',
    body: 'Every private package gets a cryptographically secure token. Share the link; the first visit promotes it to an HttpOnly cookie so it drops out of the URL.',
  },
  {
    icon: IconBolt,
    title: 'Streamed static delivery',
    body: 'HTML, CSS, JS, images, and Markdown are served straight from disk through the Next.js App Router, with Markdown rendered on the fly.',
  },
] as const

const STEPS = [
  { n: '01', title: 'Agent bundles', body: 'An agent calls publish_package with the files it generated.' },
  { n: '02', title: 'TalonPress stores', body: 'Contents are written to disk and assigned an ID and, if private, a token.' },
  { n: '03', title: 'Share the URL', body: 'The package is live at /pub/<id> — public, or token-gated for a chosen audience.' },
] as const

/**
 * Public landing page shown at `/` to anyone without management access. Replaces
 * what would otherwise be a bare 401/403 body — visitors get an explanation of
 * what this host is, while the dashboard stays gated behind the same admin check.
 */
export default function LandingHero({
  authenticated,
  username,
  isAdmin,
}: {
  authenticated: boolean
  username: string | null
  isAdmin: boolean
}) {
  return (
    <div className="az-hero-bg">
      <main className="az-hero">
        <header className="az-hero-head">
          <div className="az-hero-logo">
            <IconShield />
          </div>
          <div className="az-hero-eyebrow">Model Context Protocol server</div>
          <h1 className="az-hero-title">TalonPress</h1>
          <p className="az-hero-tagline">
            A publishing endpoint for autonomous agents. TalonPress turns generated
            HTML, CSS, and JavaScript into a live, shareable web package — public or
            token-gated — without a database or an object store behind it.
          </p>

          <div className="az-hero-actions">
            {isAdmin && (
              <Link className="az-hero-btn" href="/admin">
                Open dashboard
              </Link>
            )}
            <a
              className={`az-hero-btn${isAdmin ? ' az-hero-btn--ghost' : ''}`}
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconGithub size={16} />
              View on GitHub
            </a>
            {!authenticated && config.sharedSecretEnabled && (
              <Link className="az-hero-btn az-hero-btn--ghost" href="/auth">
                Sign in
              </Link>
            )}
          </div>

          {!isAdmin && (
            <div className={`az-hero-note${authenticated ? ' az-hero-note--warn' : ''}`}>
              {authenticated ? (
                <>
                  Signed in{username ? <> as <strong>{username}</strong></> : ''}, but the{' '}
                  <code>{config.authzAdminRole}</code> role is required to manage this
                  instance. Ask an administrator to grant it.
                </>
              ) : (
                <>The management dashboard on this host is restricted to administrators.</>
              )}
            </div>
          )}
        </header>

        <section className="az-hero-section" aria-label="Features">
          <div className="az-hero-cards">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <article key={title} className="az-hero-card">
                <div className="az-hero-card-icon">
                  <Icon size={18} />
                </div>
                <h2 className="az-hero-card-title">{title}</h2>
                <p className="az-hero-card-body">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="az-hero-section" aria-label="How it works">
          <h2 className="az-hero-section-title">How it works</h2>
          <ol className="az-hero-steps">
            {STEPS.map(({ n, title, body }) => (
              <li key={n} className="az-hero-step">
                <span className="az-hero-step-n">{n}</span>
                <div>
                  <div className="az-hero-step-title">{title}</div>
                  <div className="az-hero-step-body">{body}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className="az-hero-foot">
          TalonPress v0.1 · built on the OpenTalon agentic framework ·{' '}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            source
          </a>
        </footer>
      </main>
    </div>
  )
}
