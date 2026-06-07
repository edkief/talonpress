import Link from 'next/link'
import { notFound } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { PackageActions } from '@/components/PackageActions'
import { getPackageMeta } from '@/lib/storage/deployments'
import { config } from '@/lib/config'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td style={{ padding: '0.75rem 1.25rem', color: 'var(--fg3)', fontSize: '0.8125rem', width: '10rem', verticalAlign: 'top' }}>
        {label}
      </td>
      <td style={{ padding: '0.75rem 1.25rem', fontSize: '0.875rem' }}>
        {children}
      </td>
    </tr>
  )
}

export const dynamic = 'force-dynamic'

export default async function PackageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const meta = await getPackageMeta(id)
  if (!meta) notFound()

  const accessUrl = `${config.publicBaseUrl}/pub/${meta.id}${meta.secure_token ? `?token=${meta.secure_token}` : ''}`

  return (
    <div className="az-shell">
      <Sidebar active="packages" />
      <main className="az-main">
        <header className="az-topbar">
          <Link
            href="/packages"
            style={{ color: 'var(--fg3)', fontSize: '0.875rem', marginRight: '0.5rem' }}
          >
            Packages
          </Link>
          <span style={{ color: 'var(--fg3)', marginRight: '0.5rem' }}>/</span>
          <h1 className="az-topbar-title">{meta.name}</h1>
          <span className={`az-badge az-badge--${meta.visibility}`} style={{ marginLeft: '0.5rem' }}>
            {meta.visibility}
          </span>
          {meta.disabled && (
            <span className="az-badge az-badge--disabled" style={{ marginLeft: '0.25rem' }}>
              disabled
            </span>
          )}
          <div style={{ display: 'flex', gap: '0.375rem', marginLeft: 'auto' }}>
            <PackageActions
              id={meta.id}
              name={meta.name}
              fileCount={meta.files.length}
              disabled={meta.disabled}
            />
          </div>
        </header>

        <div className="az-content" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Metadata panel */}
          <div className="az-panel">
            <div className="az-panel-header">
              <h2 className="az-panel-title">Package details</h2>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <Row label="ID">
                  <span className="az-tag az-mono">{meta.id}</span>
                </Row>
                <Row label="Name">{meta.name}</Row>
                <Row label="Visibility">
                  <span className={`az-badge az-badge--${meta.visibility}`}>{meta.visibility}</span>
                </Row>
                {meta.disabled && (
                  <Row label="Status">
                    <span className="az-badge az-badge--disabled">disabled — users see 503</span>
                  </Row>
                )}
                <Row label="Access URL">
                  <a
                    href={accessUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--indigo-400)', wordBreak: 'break-all' }}
                    className="az-mono az-text-sm"
                  >
                    {accessUrl}
                  </a>
                </Row>
                {meta.secure_token && (
                  <Row label="Token">
                    <span className="az-tag az-mono" style={{ wordBreak: 'break-all' }}>
                      {meta.secure_token}
                    </span>
                  </Row>
                )}
                <Row label="Build hash">
                  <span className="az-tag az-mono">{meta.hash}</span>
                </Row>
                <Row label="Created">{formatDate(meta.createdAt)}</Row>
                <Row label="Updated">{formatDate(meta.updatedAt)}</Row>
              </tbody>
            </table>
          </div>

          {/* File manifest */}
          <div className="az-panel">
            <div className="az-panel-header">
              <h2 className="az-panel-title">File manifest</h2>
              <span style={{ fontSize: '0.8125rem', color: 'var(--fg3)' }}>
                {meta.files.length} {meta.files.length === 1 ? 'file' : 'files'}
              </span>
            </div>
            <div className="az-table-wrap">
              {meta.files.length === 0 ? (
                <div className="az-empty">No files.</div>
              ) : (
                <table className="az-table">
                  <thead>
                    <tr>
                      <th>Path</th>
                      <th>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meta.files.map(file => (
                      <tr key={file}>
                        <td>
                          <span className="az-mono az-text-sm">{file}</span>
                        </td>
                        <td>
                          <a
                            href={`${config.publicBaseUrl}/pub/${meta.id}/${file}${meta.secure_token ? `?token=${meta.secure_token}` : ''}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--indigo-400)', fontSize: '0.8125rem' }}
                          >
                            Open ↗
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
