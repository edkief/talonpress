import { describe, it, expect } from 'vitest'
import { injectBubble } from '../src/lib/pubBubble/inject'

const PAGE = '<html><body><h1>Hi</h1></body></html>'

describe('injectBubble', () => {
  describe('placement', () => {
    it('inserts before the last </body>', () => {
      const out = injectBubble('<body><p>a</p></body>', { packageId: 'p-1', metaUrl: '/m' })
      expect(out.indexOf('az-pb-style')).toBeLessThan(out.lastIndexOf('</body>'))
      expect(out).toContain('<p>a</p>')
    })

    it('falls back to </html>, then to appending', () => {
      const noBody = injectBubble('<html><p>a</p></html>', { packageId: 'p-1', metaUrl: '/m' })
      expect(noBody.indexOf('az-pb-style')).toBeLessThan(noBody.lastIndexOf('</html>'))

      const bare = injectBubble('<p>a</p>', { packageId: 'p-1', metaUrl: '/m' })
      expect(bare.startsWith('<p>a</p>')).toBe(true)
      expect(bare).toContain('az-pb-style')
    })
  })

  // Package ids are slugified, so these were unreachable until options started
  // carrying values that are not — a file path, for one.
  describe('script escaping', () => {
    it('does not let a value close the script block', () => {
      const out = injectBubble(PAGE, {
        packageId: 'p-1',
        metaUrl: '/api/pub/</script><img src=x onerror=alert(1)>/meta',
      })

      // The only </script> in the output is the template's own terminator, and no
      // `<` from the value survives as markup. The rest of the payload stays in the
      // output as an inert JS string literal, which is the point — it is data.
      expect(out.match(/<\/script>/gi) ?? []).toHaveLength(1)
      expect(out).not.toContain('<img')
      expect(out).toContain('\\u003c/script')
      expect(out).toContain('\\u003cimg')
    })

    it('leaves regex replacement patterns intact', () => {
      // $& and friends are only special in a string replacement, which is why the
      // substitution uses a replacer function.
      const out = injectBubble(PAGE, { packageId: 'pkg-$&-$`-$\'-x', metaUrl: '/m' })
      expect(out).toContain('pkg-$&-$`-$\'-x')
    })

    it('escapes every substituted placeholder, not just the first', () => {
      const out = injectBubble(PAGE, { packageId: '</script>a', metaUrl: '</script>b' })
      expect(out.match(/<\/script>/gi) ?? []).toHaveLength(1)
    })

    it('still produces a usable value for ordinary input', () => {
      const out = injectBubble(PAGE, { packageId: 'handbook-abc123', metaUrl: '/api/pub/handbook-abc123/meta' })
      expect(out).toContain('var PKG_ID="handbook-abc123"')
      expect(out).toContain('var META_URL="/api/pub/handbook-abc123/meta"')
    })
  })
})
