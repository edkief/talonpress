export function filterPackagesByName<T extends { name: string }>(
  packages: T[],
  query: string,
): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()

  if (!normalizedQuery) return packages

  return packages.filter(pkg => (
    pkg.name.toLocaleLowerCase().includes(normalizedQuery)
  ))
}
