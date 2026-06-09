import { marked } from 'marked'

export function renderMarkdown(source: string, title?: string): string {
  const body = marked.parse(source) as string
  const pageTitle = title ?? 'Document'
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(pageTitle)}</title>
<style>
*,*::before,*::after{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1a1a1a;max-width:800px;margin:0 auto;padding:2rem 1.5rem}
h1,h2,h3,h4,h5,h6{line-height:1.25;margin-top:1.75em;margin-bottom:.5em;font-weight:600}
h1{font-size:2em;border-bottom:1px solid #e5e7eb;padding-bottom:.3em}
h2{font-size:1.5em;border-bottom:1px solid #e5e7eb;padding-bottom:.3em}
p{margin:0 0 1em}
a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}
code{font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:.875em;background:#f3f4f6;border-radius:3px;padding:.2em .4em}
pre{background:#f3f4f6;border-radius:6px;padding:1em 1.25em;overflow-x:auto;margin:0 0 1.25em}
pre code{background:none;padding:0;font-size:.875em}
blockquote{border-left:4px solid #d1d5db;margin:0 0 1em;padding:.25em 1em;color:#6b7280}
table{border-collapse:collapse;width:100%;margin-bottom:1em}
th,td{border:1px solid #d1d5db;padding:.5em .75em;text-align:left}
th{background:#f9fafb;font-weight:600}
img{max-width:100%;height:auto}
ul,ol{padding-left:1.5em;margin:0 0 1em}
li{margin:.25em 0}
hr{border:none;border-top:1px solid #e5e7eb;margin:2em 0}
</style>
</head>
<body>
${body}
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
