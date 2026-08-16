import { describe, it, expect } from 'vitest'
import vm from 'vm'
import { injectBubble, type ChatOptions } from '../src/lib/pubBubble/inject'

const PAGE = '<html><body><h1>Hi</h1></body></html>'

const CHAT: ChatOptions = {
  base: '/api/pub/p-1/agent',
  path: 'docs/page1.html',
  title: 'Page One',
  identity: 'self-declared',
}

function scriptBody(html: string): string {
  const m = html.match(/<script id="az-pb-script">([\s\S]*?)<\/script>/)
  if (!m) throw new Error('no script block in output')
  return m[1]
}

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

    it('escapes a file path that tries to break out of the script', () => {
      const out = injectBubble(PAGE, {
        packageId: 'p-1',
        metaUrl: '/m',
        chat: { ...CHAT, path: '</script><script>alert(1)</script>.html' },
      })
      expect(out.match(/<\/script>/gi) ?? []).toHaveLength(1)
    })
  })

  // The script lives inside a template literal, so tsc never sees it and a stray
  // brace or bad escape would only surface in a browser, on a served package page.
  describe('the script itself', () => {
    it('parses as JavaScript, with and without chat', () => {
      for (const chat of [undefined, CHAT]) {
        const body = scriptBody(injectBubble(PAGE, { packageId: 'p-1', metaUrl: '/m', chat }))
        expect(() => new vm.Script(body)).not.toThrow()
      }
    })

    it('leaves the chat out entirely when it is not offered', () => {
      const out = injectBubble(PAGE, { packageId: 'p-1', metaUrl: '/m' })
      expect(out).toContain('var CHAT=null')
      expect(out).not.toContain('/agent')
    })

    it('passes the current page and identity mode through when it is', () => {
      const out = injectBubble(PAGE, { packageId: 'p-1', metaUrl: '/m', chat: CHAT })
      expect(out).toContain('"path":"docs/page1.html"')
      expect(out).toContain('"base":"/api/pub/p-1/agent"')
      expect(out).toContain('"identity":"self-declared"')
    })

    // Model output is rendered with textContent; an innerHTML on it would be an XSS
    // sink, since there is no CSP on served pages.
    it('never assigns model output through innerHTML', () => {
      const body = scriptBody(injectBubble(PAGE, { packageId: 'p-1', metaUrl: '/m', chat: CHAT }))
      const renderer = body.slice(body.indexOf('function renderMessageText'))
      expect(renderer.slice(0, renderer.indexOf('function addMessage'))).not.toContain('innerHTML')
      expect(body).toContain('node.appendChild(document.createTextNode(parts[i]))')
    })
  })
})
