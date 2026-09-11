/**
 * Add the title hints understood by link-preview crawlers.
 *
 * Package HTML is user-authored, so this deliberately adds metadata without
 * rewriting the document's own `<title>` (or any metadata the author supplied).
 */
export function injectTitleMetadata(html: string, title: string): string {
  const escapedTitle = escapeAttribute(title)
  const metadata = [
    `<meta property="og:title" content="${escapedTitle}">`,
    `<meta name="twitter:title" content="${escapedTitle}">`,
  ].join('\n')

  const headClose = html.search(/<\/head\s*>/i)
  if (headClose !== -1) {
    return `${html.slice(0, headClose)}${metadata}\n${html.slice(headClose)}`
  }

  const htmlOpen = /<html\b[^>]*>/i.exec(html)
  if (htmlOpen?.index !== undefined) {
    const insertAt = htmlOpen.index + htmlOpen[0].length
    return `${html.slice(0, insertAt)}\n<head>\n${metadata}\n</head>${html.slice(insertAt)}`
  }

  return `<head>\n${metadata}\n</head>\n${html}`
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
