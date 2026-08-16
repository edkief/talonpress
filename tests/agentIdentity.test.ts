import { describe, it, expect } from 'vitest'
import { normalizeIdentity } from '../src/lib/agent/identity'

describe('agent/identity', () => {
  it('accepts ordinary names and lowercases them', () => {
    expect(normalizeIdentity('ed')).toBe('ed')
    expect(normalizeIdentity('Ed')).toBe('ed')
    expect(normalizeIdentity('  Ed.Kieffer  ')).toBe('ed.kieffer')
    expect(normalizeIdentity('ops-team_2')).toBe('ops-team_2')
  })

  // Case folding is what makes "Ed" and "ed" the same conversation rather than two.
  it('folds case so one person gets one conversation', () => {
    expect(normalizeIdentity('ED')).toBe(normalizeIdentity('ed'))
  })

  it('rejects anything that would be awkward inside a chatId or a label', () => {
    for (const bad of [
      '',
      ' ',
      'a', // too short
      'x'.repeat(33), // too long
      '.leading',
      '-leading',
      'has space',
      'has/slash',
      'quote"',
      'emoji😀',
      'new\nline',
      null,
      undefined,
      42,
      {},
    ]) {
      expect(normalizeIdentity(bad), String(bad)).toBeNull()
    }
  })
})
