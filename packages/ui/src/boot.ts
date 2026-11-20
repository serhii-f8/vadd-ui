import { ext, pageCss, type RenderHandle, render, stylesheet } from '@vadd/ui-render'

const STYLE_ID = 'vui-style'
const DOCUMENTS = 'script[type="application/vui+json"]'
const ROOT_CLASS = 'vui-root'
/** Lives on the script, so a second copy of the bundle sees it too. */
const MOUNTED = 'data-vui-mounted'

/** What a bundle drew for one script. On the element, so every copy on the page reads it. */
interface Mount {
  ext: boolean
  root: HTMLElement
  handle: RenderHandle
}
type Embedded = Element & { vuiMount?: Mount }

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

/**
 * Draws one document, once per page: a copy of the same tier leaves it, and the `ext` bundle
 * redraws in place what the core one drew before it loaded (VD-211).
 */
function mount(script: Embedded, doc: Document, start: ChildNode | null): void {
  const prior = script.vuiMount
  if (prior ? prior.ext || !ext : script.hasAttribute(MOUNTED)) return
  script.setAttribute(MOUNTED, '')
  let root = prior?.root
  if (root === undefined) {
    root = doc.createElement('div')
    root.className = ROOT_CLASS
    // §10.2 has no `<body>` tag, so its document parses into `<head>`, which is never shown.
    if (script.closest('body')) script.after(root)
    else doc.body.insertBefore(root, start)
  }
  prior?.handle.destroy()
  script.vuiMount = { ext, root, handle: render(script.textContent ?? '', root) }
}

/** §9.2 steps 2 to 4. Safe to run again: a mounted document is left as it is. */
export function boot(doc: Document = document): void {
  injectStyle(doc)
  const start = doc.body.firstChild
  for (const script of doc.querySelectorAll(DOCUMENTS)) mount(script, doc, start)
}

/** §9.2 step 1. `owns` is asked at boot time, when every bundle on the page has run. */
export function start(doc: Document = document, owns: () => boolean = () => true): void {
  const run = () => {
    if (owns()) boot(doc)
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', run, { once: true })
  else run()
}
