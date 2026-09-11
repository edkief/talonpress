import { describe, expect, it } from 'vitest'
import { injectTitleMetadata } from '../src/lib/html/titleMetadata'

describe('injectTitleMetadata', () => {
  it('adds Open Graph and Twitter titles inside an existing head', () => {
    const output = injectTitleMetadata(
      '<!doctype html><html><head><title>Page</title></head><body></body></html>',
      'Package title',
    )

    expect(output).toContain('<meta property="og:title" content="Package title">')
    expect(output).toContain('<meta name="twitter:title" content="Package title">')
    expect(output.indexOf('og:title')).toBeLessThan(output.indexOf('</head>'))
    expect(output).toContain('<title>Page</title>')
  })

  it('creates a head when the supplied page has none', () => {
    const output = injectTitleMetadata('<html><body>Hello</body></html>', 'Package title')
    expect(output).toContain('<html>\n<head>')
    expect(output.indexOf('og:title')).toBeLessThan(output.indexOf('<body>'))
  })

  it('escapes package names before placing them in attributes', () => {
    const output = injectTitleMetadata('<body>Hello</body>', '\"><script>alert(1)</script> & docs')
    expect(output).not.toContain('<script>')
    expect(output).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; docs')
  })
})
