import { pageCss, render, stylesheet } from '@vadd/ui-render'

const STYLE_ID = 'vui-style'
const DOCUMENTS = 'script[type="application/vui+json"]'
const ROOT_CLASS = 'vui-root'
/** Lives on the script, so a second copy of the bundle sees it too. */
const MOUNTED = 'data-vui-mounted'

/** A root background stops `body`'s reaching the canvas, so this must run before `pageCss`. */
function unpainted(element: Element): boolean {
  const { backgroundColor, backgroundImage } = getComputedStyle(element)
  return backgroundColor === 'rgba(0, 0, 0, 0)' && backgroundImage === 'none'
}

function injectStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  const bare = unpainted(doc.documentElement) && unpainted(doc.body)
  style.textContent = bare ? stylesheet + pageCss : stylesheet
  doc.head.append(style)
}

function mount(script: Element, doc: Document, start: ChildNode | null): void {
  if (script.hasAttribute(MOUNTED)) return
  script.setAttribute(MOUNTED, '')
  const root = doc.createElement('div')
  root.className = ROOT_CLASS
  // §10.2 has no `<body>` tag, so its document parses into `<head>`, which is never shown.
  if (script.closest('body')) script.after(root)
  else doc.body.insertBefore(root, start)
  render(script.textContent ?? '', root)
}

/** §9.2 steps 2 to 4. Safe to run again: a mounted document is left as it is. */
export function boot(doc: Document = document): void {
  injectStyle(doc)
  const start = doc.body.firstChild
  for (const script of doc.querySelectorAll(DOCUMENTS)) mount(script, doc, start)
}

/** §9.2 step 1. */
export function start(doc: Document = document): void {
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', () => boot(doc), { once: true })
  } else boot(doc)
}
