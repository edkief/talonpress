import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { PackageActions } from '@/components/PackageActions'
import { VisibilityToggle } from '@/components/VisibilityToggle'
import { listPackages } from '@/lib/storage/deployments'
import { packageAccessUrl } from '@/lib/storage/urls'
import { formatBytes } from '@/lib/format'
import { filterPackagesByName } from '@/lib/packages/search'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>
}) {
  const packages = await listPackages()

  const { page: pageParam, q: queryParam } = await searchParams
  const query = queryParam?.trim() ?? ''
  const filteredPackages = filterPackagesByName(packages, query)
  const total = filteredPackages.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const requestedPage = Number.parseInt(pageParam ?? '1', 10)
  const currentPage = Number.isNaN(requestedPage)
    ? 1
    : Math.min(Math.max(requestedPage, 1), totalPages)
  const start = (currentPage - 1) * PAGE_SIZE
  const pageItems = filteredPackages.slice(start, start + PAGE_SIZE)
  const pageHref = (page: number) => {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    params.set('page', String(page))
    return `/admin/packages?${params.toString()}`
  }

  return (
    <div className="az-shell">
      <Sidebar active="packages" />
      <main className="az-main">
        <header className="az-topbar">
          <h1 className="az-topbar-title">Packages</h1>
          <span style={{ fontSize: '0.8125rem', color: 'var(--fg3)' }}>
            {query ? `${total} of ${packages.length}` : `${total} total`}
          </span>
        </header>
        <div className="az-content">
          <div className="az-panel">
            <div className="az-panel-header">
              <form className="az-package-search" method="get" role="search">
                <input
                  className="az-input"
                  type="search"
                  name="q"
                  defaultValue={query}
                  placeholder="Search package names…"
                  aria-label="Search package names"
                />
                <button className="az-btn az-btn--primary az-btn--sm" type="submit">
                  Search
                </button>
                {query && (
                  <Link className="az-btn az-btn--ghost az-btn--sm" href="/admin/packages">
                    Clear
                  </Link>
                )}
              </form>
            </div>
            <div className="az-table-wrap">
              {filteredPackages.length === 0 ? (
                <div className="az-empty">
                  {query ? `No packages match “${query}”.` : 'No packages found.'}
                </div>
              ) : (
                <table className="az-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Visibility</th>
                      <th>Files</th>
                      <th>Size</th>
                      <th>Build hash</th>
                      <th>Created</th>
                      <th>Updated</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(pkg => (
                      <tr key={pkg.id}>
                        <td style={{ fontWeight: 500 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Link href={`/admin/packages/${pkg.id}`} style={{ color: 'var(--indigo-400)' }}>
                              {pkg.name}
                            </Link>
                            {pkg.disabled && (
                              <span className="az-badge az-badge--disabled">disabled</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <VisibilityToggle id={pkg.id} visibility={pkg.visibility} />
                        </td>
                        <td className="az-text-muted">{pkg.files.length}</td>
                        <td className="az-text-muted az-text-sm">{formatBytes(pkg.sizeBytes)}</td>
                        <td>
                          <span className="az-tag az-mono">{pkg.hash.slice(0, 12)}</span>
                        </td>
                        <td className="az-text-muted az-text-sm">{formatDate(pkg.createdAt)}</td>
                        <td className="az-text-muted az-text-sm">{formatDate(pkg.updatedAt)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                            <a
                              href={packageAccessUrl(pkg.id, pkg.secure_token)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="az-btn az-btn--ghost az-btn--sm"
                            >
                              View
                            </a>
                            <a
                              href={`/api/packages/${pkg.id}/download`}
                              className="az-btn az-btn--ghost az-btn--sm"
                            >
                              Download
                            </a>
                            <PackageActions
                              id={pkg.id}
                              name={pkg.name}
                              fileCount={pkg.files.length}
                              disabled={pkg.disabled}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {totalPages > 1 && (
              <div className="az-pagination">
                <span className="az-text-muted az-text-sm">
                  {start + 1}–{Math.min(start + PAGE_SIZE, total)} of {total}
                </span>
                <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                  {currentPage > 1 ? (
                    <Link
                      href={pageHref(currentPage - 1)}
                      className="az-btn az-btn--ghost az-btn--sm"
                    >
                      Previous
                    </Link>
                  ) : (
                    <span className="az-btn az-btn--ghost az-btn--sm az-btn--disabled">
                      Previous
                    </span>
                  )}
                  <span className="az-text-muted az-text-sm" style={{ padding: '0 0.5rem' }}>
                    Page {currentPage} of {totalPages}
                  </span>
                  {currentPage < totalPages ? (
                    <Link
                      href={pageHref(currentPage + 1)}
                      className="az-btn az-btn--ghost az-btn--sm"
                    >
                      Next
                    </Link>
                  ) : (
                    <span className="az-btn az-btn--ghost az-btn--sm az-btn--disabled">
                      Next
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
