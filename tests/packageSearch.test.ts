import { describe, expect, it } from 'vitest'
import { filterPackagesByName } from '../src/lib/packages/search'

const packages = [
  { id: '1', name: 'Marketing Site' },
  { id: '2', name: 'Admin Dashboard' },
  { id: '3', name: 'Customer Portal' },
]

describe('filterPackagesByName', () => {
  it('matches part of a package name without regard to case', () => {
    expect(filterPackagesByName(packages, 'DASH')).toEqual([
      { id: '2', name: 'Admin Dashboard' },
    ])
  })

  it('trims the search query', () => {
    expect(filterPackagesByName(packages, '  portal  ')).toEqual([
      { id: '3', name: 'Customer Portal' },
    ])
  })

  it('returns all packages for an empty query', () => {
    expect(filterPackagesByName(packages, '   ')).toBe(packages)
  })

  it('returns an empty list when there are no matches', () => {
    expect(filterPackagesByName(packages, 'storefront')).toEqual([])
  })
})
