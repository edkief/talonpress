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

function region(body: string, from: string, to: string): string {
  const start = body.indexOf(from)
  const end = body.indexOf(to)
  if (start === -1 || end === -1 || end < start) throw new Error(`no region ${from}..${to}`)
  return body.slice(start, end)
}

/* The markdown renderer builds DOM nodes, so exercising it needs a DOM. jsdom is not
   a dependency and the script as a whole mounts itself on load, so we run just the
   renderer against a stub that records what it was asked to build — which is also the
   sharpest way to assert the no-innerHTML rule: the stub has no innerHTML to assign. */
const VOID_TAGS = new Set(['br', 'hr'])

function serialize(node: any): string {
  if (node.tag === '#text') {
    return String(node.text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
  let attrs = ''
  if (node.className) attrs += ` class="${node.className}"`
  if (node.href !== undefined) attrs += ` href="${node.href}"`
  for (const [k, v] of Object.entries(node.attrs as Record<string, string>)) attrs += ` ${k}="${v}"`
  for (const [k, v] of Object.entries(node.style as Record<string, string>)) attrs += ` style-${k}="${v}"`
  if (VOID_TAGS.has(node.tag)) return `<${node.tag}${attrs}>`
  return `<${node.tag}${attrs}>${node.children.map(serialize).join('')}</${node.tag}>`
}

function makeElement(tag: string): any {
  const node: any = {
    tag,
    attrs: {} as Record<string, string>,
    style: {} as Record<string, string>,
    children: [] as any[],
    appendChild(child: any) {
      node.children.push(child)
      return child
    },
    setAttribute(key: string, value: string) {
      node.attrs[key] = value
    },
  }
  Object.defineProperty(node, 'textContent', {
    set(value: string) {
      node.children = [{ tag: '#text', text: String(value) }]
    },
    get() {
      return node.children.map((c: any) => (c.tag === '#text' ? c.text : '')).join('')
    },
  })
  return node
}

/** Renders `text` as the given role and returns the resulting markup. */
function renderChat(text: string, role: 'agent' | 'user' | 'error' = 'agent'): string {
  const body = scriptBody(injectBubble(PAGE, { packageId: 'p-1', metaUrl: '/m', chat: CHAT }))
  const src =
    region(body, 'function el(', 'function svg(') +
    region(body, 'var MD_FENCE=', 'function addMessage') +
    'renderMessageText'

  const document = {
    createElement: makeElement,
    createTextNode: (text: string) => ({ tag: '#text', text: String(text) }),
  }
  const render = vm.runInNewContext(src, { document })
  const root = makeElement('div')
  render(root, text, role)
  return root.children.map(serialize).join('')
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

    // A failed turn arrives as a message event with kind 'error', not on the SSE
    // error event, because it is written to the durable outbox like any other
    // output. Clearing the indicator only for kind 'message' would leave it
    // spinning until the watchdog.
    it('clears the thinking indicator for any message, including a failed turn', () => {
      const body = scriptBody(injectBubble(PAGE, { packageId: 'p-1', metaUrl: '/m', chat: CHAT }))
      const ingest = body.slice(body.indexOf('function ingest'), body.indexOf('function closeStream'))

      expect(ingest).toContain("msg.kind==='error'?'error':'agent'")
      // Keyed on "not the user's own echo", so no message kind can miss it.
      expect(ingest).toContain("if(role!=='user')setThinking(false)")
      expect(ingest).not.toContain("if(role==='agent')setThinking(false)")
    })

    // There is no terminal or idle status by design — `done` fires per step, so
    // mapping it to idle would flicker the indicator between steps.
    it('never treats a status event as the end of a turn', () => {
      const body = scriptBody(injectBubble(PAGE, { packageId: 'p-1', metaUrl: '/m', chat: CHAT }))
      const listener = body.slice(body.indexOf("addEventListener('status'"))
      expect(listener.slice(0, listener.indexOf('});'))).not.toContain('setThinking(false)')
    })

    it('labels the indicator from kind and tool, not the prose status', () => {
      const body = scriptBody(injectBubble(PAGE, { packageId: 'p-1', metaUrl: '/m', chat: CHAT }))
      const fn = body.slice(body.indexOf('function statusLabel'), body.indexOf('function ingest'))

      expect(fn).toContain("d.kind==='tool'")
      expect(fn).toContain("d.kind==='responding'")
      expect(fn).toContain("d.kind==='thinking'")
      // `status` is a convenience label upstream does not treat as a stable
      // contract, so it must not be what we render.
      expect(fn).not.toContain('d.status')
      // An unrecognised kind means the turn is still running, so the fallback
      // returns no label and leaves the indicator saying whatever it already said.
      const fnBody = fn.slice(0, fn.indexOf('\n}'))
      expect(fnBody.trimEnd().endsWith('return null;')).toBe(true)
    })

    // Model output is rendered with textContent; an innerHTML on it would be an XSS
    // sink, since there is no CSP on served pages.
    it('never assigns model output through innerHTML', () => {
      const body = scriptBody(injectBubble(PAGE, { packageId: 'p-1', metaUrl: '/m', chat: CHAT }))
      expect(region(body, 'var MD_FENCE=', 'function addMessage')).not.toContain('innerHTML')
    })
  })

  describe('markdown in agent replies', () => {
    it('renders headings, emphasis and inline code', () => {
      expect(renderChat('## Setup')).toBe('<h4>Setup</h4>')
      expect(renderChat('**bold** and *italic* and ~~gone~~')).toBe(
        '<p><strong>bold</strong> and <em>italic</em> and <s>gone</s></p>',
      )
      expect(renderChat('run `npm test` first')).toBe('<p>run <code>npm test</code> first</p>')
      // Page headings outrank the widget's, so `#` starts at h3.
      expect(renderChat('# Top')).toBe('<h3>Top</h3>')
      expect(renderChat('##### Deep\n###### Deeper')).toBe('<h6>Deep</h6><h6>Deeper</h6>')
    })

    it('renders fenced code verbatim, markdown and all', () => {
      expect(renderChat('```js\nif (a && b) **x**;\n```')).toBe(
        '<pre><code data-lang="js">if (a &amp;&amp; b) **x**;</code></pre>',
      )
      // An unterminated fence still closes at the end of the message.
      expect(renderChat('```\nabc')).toBe('<pre><code>abc</code></pre>')
    })

    it('renders lists, including nested ones and code inside an item', () => {
      expect(renderChat('- one\n- two')).toBe('<ul><li><p>one</p></li><li><p>two</p></li></ul>')
      expect(renderChat('3. three\n4. four')).toBe(
        '<ol start="3"><li><p>three</p></li><li><p>four</p></li></ol>',
      )
      expect(renderChat('- outer\n  - inner')).toBe(
        '<ul><li><p>outer</p><ul><li><p>inner</p></li></ul></li></ul>',
      )
      expect(renderChat('- item\n  ```\n  code\n  ```')).toBe(
        '<ul><li><p>item</p><pre><code>code</code></pre></li></ul>',
      )
    })

    it('renders quotes, rules and tables', () => {
      expect(renderChat('> quoted\n> still')).toBe('<blockquote><p>quoted<br>still</p></blockquote>')
      expect(renderChat('---')).toBe('<hr>')
      expect(renderChat('| a | b |\n| --- | --:|\n| 1 | 2 |')).toBe(
        '<table><thead><tr><th>a</th><th style-textAlign="right">b</th></tr></thead>' +
          '<tbody><tr><td>1</td><td style-textAlign="right">2</td></tr></tbody></table>',
      )
    })

    it('keeps the line breaks the agent wrote, and splits paragraphs on blanks', () => {
      expect(renderChat('one\ntwo\n\nthree')).toBe('<p>one<br>two</p><p>three</p>')
    })

    // The renderer is the one place agent output reaches an attribute rather than a
    // text node, so the scheme allowlist is what stops a link being an XSS sink.
    it('links only to schemes it can vouch for', () => {
      expect(renderChat('[docs](https://example.com/a)')).toBe(
        '<p><a href="https://example.com/a" target="_blank" rel="noopener noreferrer nofollow">docs</a></p>',
      )
      expect(renderChat('[here](./page2.html)')).toBe(
        '<p><a href="./page2.html" target="_blank" rel="noopener noreferrer nofollow">here</a></p>',
      )
      // A scheme we don't vouch for keeps its text and loses its link.
      expect(renderChat('[click](javascript:alert)')).toBe('<p><span>click</span></p>')
      expect(renderChat('[click](data:text/html,hi)')).toBe('<p><span>click</span></p>')
      // A URL with parens is not link syntax at all, so it stays inert text.
      expect(renderChat('[click](javascript:alert(1))')).toBe(
        '<p>[click](javascript:alert(1))</p>',
      )
      // An image is shown as a link: the agent should not be able to make a served
      // page fetch an arbitrary remote URL on render.
      expect(renderChat('![alt](https://evil.example/pixel.png)')).toBe(
        '<p><a href="https://evil.example/pixel.png" target="_blank" rel="noopener noreferrer nofollow">alt</a></p>',
      )
    })

    it('renders HTML in agent output as text, never as markup', () => {
      expect(renderChat('<img src=x onerror=alert(1)>')).toBe(
        '<p>&lt;img src=x onerror=alert(1)&gt;</p>',
      )
      expect(renderChat('**<b>hi</b>**')).toBe('<p><strong>&lt;b&gt;hi&lt;/b&gt;</strong></p>')
      expect(renderChat('`<script>alert(1)</script>`')).toBe(
        '<p><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></p>',
      )
    })

    it('leaves what the user typed and what we wrote alone', () => {
      // Their asterisks are theirs; pre-wrap keeps the shape of what they typed.
      expect(renderChat('**not bold**', 'user')).toBe('**not bold**')
      expect(renderChat('# 1 * 2', 'error')).toBe('# 1 * 2')
    })

    it('survives malformed markdown without throwing', () => {
      for (const text of ['', '***', '| a |', '- ', '```', '[x](', '_a', '#'.repeat(9), '>']) {
        expect(() => renderChat(text)).not.toThrow()
      }
    })
  })
})
