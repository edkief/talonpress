import Link from 'next/link'

function IconGrid({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="5.5" height="5.5" rx="1" fill="currentColor" opacity="0.9" />
      <rect x="9.5" y="1" width="5.5" height="5.5" rx="1" fill="currentColor" opacity="0.9" />
      <rect x="1" y="9.5" width="5.5" height="5.5" rx="1" fill="currentColor" opacity="0.9" />
      <rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1" fill="currentColor" opacity="0.9" />
    </svg>
  )
}

function IconPackage({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M13.5 4.5l-5.5-3-5.5 3v7l5.5 3 5.5-3v-7z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M2.5 4.5L8 7.5l5.5-3M8 7.5V14.5" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  )
}

function IconShield({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5L2 4v4c0 3.5 2.5 6.5 6 7.5 3.5-1 6-4 6-7.5V4L8 1.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  )
}

export default function Sidebar({ active }: { active?: 'dashboard' | 'packages' }) {
  return (
    <aside className="az-sidebar">
      <div className="az-sidebar-head">
        <div className="az-sidebar-logo">
          <IconShield size={18} />
        </div>
        <span className="az-sidebar-name">TalonPress</span>
      </div>

      <nav className="az-nav">
        <div className="az-nav-group">
          <div className="az-nav-label">Management</div>
          <Link href="/" className={`az-nav-item${active === 'dashboard' ? ' is-active' : ''}`}>
            <IconGrid size={16} />
            Dashboard
          </Link>
          <Link href="/packages" className={`az-nav-item${active === 'packages' ? ' is-active' : ''}`}>
            <IconPackage size={16} />
            Packages
          </Link>
        </div>
      </nav>

      <div className="az-sidebar-foot">
        <div style={{ fontSize: '0.75rem', color: 'var(--fg3)' }}>
          TalonPress v0.1
        </div>
      </div>
    </aside>
  )
}
