import type { Frame, Page } from '@playwright/test'
import { cleanText } from '../../packages/ui-spec/src/index.js'

// §15.1 and §16 Security: a corpus of hostile strings, a document that carries one in every
// text field, and the DOM oracle that says whether a rendered page let any of it through.

/** Every payload that could run calls `alert(1)`. */
export const PAYLOADS: readonly string[] = [
  '<script>alert(1)</script>',
  '</script><script>alert(1)</script>',
  '</SCRIPT ><script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)><circle r=9 /></svg>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '"><b onmouseover=alert(1)>x</b>',
  "'-alert(1)-'",
  '<!--<script>alert(1)</script>-->',
  ']]><script>alert(1)</script>',
  '\u2028alert(1)\u2029//',
  '<a href="javascript:alert(1)">x</a><style>*{background:url(javascript:alert(1))}</style>',
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  ' javascript:alert(1)',
  'java\tscript:alert(1)',
  'java\u0000script:alert(1)',
  '&#106;avascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:alert(1)',
  '[a](javascript:alert(1)) [b](JaVaScRiPt:alert(1)) [c]( javascript:alert(1)) [d](java\tscript:alert(1)) [e](&#106;avascript:alert(1)) [f](data:text/html,<script>alert(1)</script>) [g](vbscript:alert(1))',
  '![a](javascript:alert(1)) ![b](JaVaScRiPt:alert(1)) ![c](data:text/html,<script>alert(1)</script>) ![d](vbscript:alert(1)) ![e](&#106;avascript:alert(1))',
  "{{constructor.constructor('alert(1)')()}}",
  // biome-ignore lint/suspicious/noTemplateCurlyInString: a template literal is the attack.
  '${alert(1)}',
  'x:expression(alert(1)); background:url("javascript:alert(1)")',
  '\u001b]8;;javascript:alert(1)\u0007link\u001b]8;;\u0007',
]

/** What a payload stands in for in `TEMPLATE`. */
const SLOT = '{p}'

const leaf = { type: 'progress', value: 1, max: 2 }

/**
 * All 24 components (`COMPONENT_TYPES`), with every string field of §6 and `types.ts` set.
 * `{p}` marks free text and every key that renders; a string with no `{p}` is an enum, a
 * format, `lang`, `locale` or an id. Text that must stay distinct (flow ids, record keys,
 * diff paths) carries a suffix, so the document stays valid with any payload in place.
 * Each top-level node has the id `x-<name>`, so the oracle can look inside each one.
 * Containers hold a `progress` with no label, so their own fields are all the text they show.
 */
export const TEMPLATE = {
  vui: 1,
  title: '{p}',
  subtitle: '{p}',
  density: 'compact',
  locale: 'en-US',
  meta: { branch: '{p}', cwd: '{p}' },
  body: [
    {
      type: 'stack',
      id: 'x-stack',
      title: '{p}',
      note: '{p}',
      tone: 'info',
      span: 12,
      fold: 'open',
      gap: 'sm',
      children: [leaf],
    },
    { type: 'grid', id: 'x-grid', title: '{p}', note: '{p}', cols: 2, children: [leaf, leaf] },
    { type: 'section', id: 'x-section', title: '{p}', note: '{p}', children: [leaf] },
    { type: 'card', id: 'x-card', title: '{p}', note: '{p}', tone: 'accent', children: [leaf] },
    {
      type: 'tabs',
      id: 'x-tabs',
      title: '{p}',
      note: '{p}',
      active: 0,
      tabs: [
        { label: '{p}', children: [leaf] },
        { label: '{p} 2', children: [leaf] },
      ],
    },
    { type: 'divider', id: 'x-divider', label: '{p}' },
    {
      type: 'md',
      id: 'x-md',
      title: '{p}',
      note: '{p}',
      text: '### {p}\n\n#### {p}\n\n{p} [ok](https://example.com/{p}) ![img](https://example.com/i.png)\n\n- {p}\n- [ ] {p}\n\n1. {p}\n\n> {p}\n\n```\n{p}\n```',
    },
    { type: 'callout', id: 'x-callout', title: '{p}', note: '{p}', tone: 'warn', text: '{p}' },
    {
      type: 'code',
      id: 'x-code',
      title: '{p}',
      note: '{p}',
      lang: 'ts',
      lines: true,
      mark: [1],
      maxLines: 10,
      text: '{p}\n{p}',
    },
    {
      type: 'table',
      id: 'x-table',
      title: '{p}',
      note: '{p}',
      columns: [
        '{p}',
        '{p} 2:ms',
        {
          key: '{p} k',
          label: '{p}',
          format: 'text',
          align: 'left',
          cell: 'text',
          width: 'wide',
          wrap: true,
        },
        { key: '{p} b', label: '{p}', cell: 'badge', tones: { '{p} t': 'ok' } },
        '{p} 3:link',
        '{p} 4:path',
        { key: '{p} c', label: '{p}', cell: 'code' },
      ],
      rows: [
        ['{p}', 12, '{p}', '{p} t', '{p}', '{p}', '{p}', { tone: 'warn', note: '{p}' }],
        ['{p} r', 30, '{p}', '{p}', 'https://example.com/{p}', '{p}/a', '{p}'],
      ],
      totals: ['{p}', 42, '{p}', '{p}', '{p}', '{p}', '{p}'],
      sort: [1, 'asc'],
      pageSize: 10,
      sticky: true,
    },
    {
      type: 'table',
      id: 'x-table-group',
      title: '{p}',
      columns: ['{p}', '{p} 2'],
      rows: [
        ['{p}', '{p}'],
        ['{p}', '{p} 2'],
      ],
      group: 0,
    },
    {
      type: 'kv',
      id: 'x-kv',
      title: '{p}',
      note: '{p}',
      cols: 2,
      pairs: [
        ['{p}', '{p}'],
        ['{p} 2', '{p}', 'text'],
        ['{p} 3', '{p}', 'link'],
        ['{p} 4', '{p}', 'code'],
      ],
    },
    { type: 'kv', id: 'x-kv-object', title: '{p}', pairs: { '{p}': '{p}', '{p} 2': 3 } },
    {
      type: 'stats',
      id: 'x-stats',
      title: '{p}',
      note: '{p}',
      items: [
        {
          label: '{p}',
          value: '{p}',
          format: 'text',
          delta: 1,
          deltaFormat: 'num',
          tone: 'ok',
          spark: [1, 2, 3],
        },
        ['{p} 2', 3, 'num', -1, 'num', 'err'],
      ],
    },
    {
      type: 'list',
      id: 'x-list',
      title: '{p}',
      note: '{p}',
      ordered: true,
      items: ['{p}', { text: '{p}', status: 'ok', note: '{p}' }],
    },
    {
      type: 'progress',
      id: 'x-progress',
      title: '{p}',
      note: '{p}',
      value: 1,
      max: 2,
      label: '{p}',
      segments: [{ value: 1, tone: 'ok', label: '{p}' }],
    },
    {
      type: 'compare',
      id: 'x-compare',
      title: '{p}',
      note: '{p}',
      options: ['{p}', '{p} 2'],
      criteria: [{ label: '{p}', values: ['{p}', '{p}'], format: 'text', better: 'high' }],
      pick: 0,
    },
    {
      type: 'chart',
      id: 'x-chart-bar',
      title: '{p}',
      note: '{p}',
      kind: 'bar',
      x: ['{p}', '{p} 2'],
      series: { '{p}': [1, 2], '{p} 2': [2, 1] },
      yFormat: 'num',
      height: 'sm',
      legend: 'auto',
      refLines: [{ y: 1, label: '{p}', tone: 'warn' }],
    },
    {
      type: 'chart',
      id: 'x-chart-stacked',
      title: '{p}',
      kind: 'stacked',
      stackTotal: true,
      x: ['{p}', '{p} 2'],
      series: { '{p}': [1, 2], '{p} 2': [2, 1] },
    },
    {
      type: 'chart',
      id: 'x-chart-donut',
      title: '{p}',
      kind: 'donut',
      x: ['{p}', '{p} 2'],
      series: { '{p}': [1, 2] },
    },
    {
      type: 'chart',
      id: 'x-chart-line',
      title: '{p}',
      kind: 'line',
      x: [1, 2, 3],
      series: { '{p}': [1, 3, 2], '{p} 2': [2, 2, 1] },
      xFormat: 'num',
    },
    { type: 'chart', id: 'x-chart-spark', title: '{p}', kind: 'spark', values: [1, 3, 2] },
    {
      type: 'chart',
      id: 'x-chart-scatter',
      title: '{p}',
      kind: 'scatter',
      points: [
        [1, 2, '{p}'],
        [2, 3],
      ],
    },
    {
      type: 'checks',
      id: 'x-checks',
      title: '{p}',
      note: '{p}',
      items: [
        { name: '{p}', status: 'fail', cmd: '{p}', ms: 12, output: '{p}' },
        { name: '{p} 2', status: 'ok' },
      ],
    },
    {
      type: 'plan',
      id: 'x-plan',
      title: '{p}',
      note: '{p}',
      items: [
        {
          text: '{p}',
          status: 'run',
          note: '{p}',
          children: [{ text: '{p}', status: 'ok' }],
        },
      ],
    },
    {
      type: 'diff',
      id: 'x-diff',
      title: '{p}',
      note: '{p}',
      files: [
        ['{p}', 1, 2, 'M'],
        ['{p} 2', 3, 0],
      ],
      hunks: { '{p}': '@@ -1 +1 @@\n-{p}\n+{p}' },
    },
    {
      type: 'tree',
      id: 'x-tree',
      title: '{p}',
      note: '{p}',
      items: [{ name: '{p}', status: 'ok', note: '{p}', children: [{ name: '{p} 2' }] }],
    },
    { type: 'tree', id: 'x-tree-paths', title: '{p}', paths: ['{p} 1', '{p} 2'] },
    {
      type: 'timeline',
      id: 'x-timeline',
      title: '{p}',
      note: '{p}',
      items: [{ at: '{p}', text: '{p}', status: 'ok' }],
    },
    {
      type: 'decision',
      id: 'x-decision',
      title: '{p}',
      note: '{p}',
      question: '{p}',
      context: '{p}',
      options: [
        {
          label: '{p}',
          pros: ['{p}'],
          cons: ['{p}'],
          effort: 'S',
          reversible: true,
          risk: 'low',
          verify: '{p}',
        },
        { label: '{p} 2' },
      ],
      pick: 0,
    },
    { type: 'log', id: 'x-log', title: '{p}', note: '{p}', maxLines: 10, text: '{p}\n{p}' },
    {
      type: 'flow',
      id: 'x-flow',
      title: '{p}',
      note: '{p}',
      nodes: ['{p} 1', { id: '{p} 2', label: '{p}', status: 'ok' }],
      edges: [['{p} 1', '{p} 2', '{p}']],
    },
  ],
} as const

/** The ids `TEMPLATE` gives its top-level nodes. */
export const NODE_IDS: readonly string[] = TEMPLATE.body.map(({ id }) => id)

export type Mode = 'text' | 'all'

/** Node `type` stays, or every node would be the same unknown-type card. */
const KEPT = new Set(['type'])

function substitute(text: string, payload: string): string {
  return text.split(SLOT).join(payload)
}

function poisonValue(value: unknown, payload: string, mode: Mode, field?: string): unknown {
  if (typeof value === 'string') {
    if (value.includes(SLOT)) return substitute(value, payload)
    return mode === 'all' && !(field !== undefined && KEPT.has(field)) ? payload : value
  }
  if (Array.isArray(value)) return value.map((item) => poisonValue(item, payload, mode))
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      result[substitute(key, payload)] = poisonValue(item, payload, mode, key)
    }
    return result
  }
  return value
}

/**
 * `text`: every free-text string and rendered key carries the payload; enums stay valid.
 * `all`: also every other string but `type`, plus a node whose `type` is the payload.
 */
export function poison(document: object, payload: string, mode: Mode): Record<string, unknown> {
  const poisoned = poisonValue(document, payload, mode) as Record<string, unknown>
  if (mode === 'all' && Array.isArray(poisoned.body)) {
    poisoned.body = [...poisoned.body, { type: payload, id: payload, title: payload }]
  }
  return poisoned
}

/** How rendered text compares with a payload: controls gone, whitespace collapsed. */
export function comparable(text: string): string {
  return cleanText(text).replace(/\s+/g, ' ').trim()
}

/** What the oracle saw in one frame. */
export interface Scan {
  /** Every finding, as `<tag> <what>`. Empty when the frame is safe. */
  unsafe: string[]
  /** All text outside `script` and `style`, through open shadow roots. */
  text: string
  /** The text of each element with an id, in any shadow root. A repeated id keeps each. */
  byId: Record<string, string[]>
}

/**
 * The DOM oracle (§15.1). `ownScripts` is how many `script` elements the page itself holds.
 * A finding: one more `script`, or one inside a rendered root; an `iframe`, `frame`, `object`,
 * `embed`, `applet` or `form`; an `on*` attribute; `srcdoc`, `srcset`, `action` or
 * `formaction`; an `href`, `src` or `xlink:href` that is not `http:`, `https:`, `mailto:` or
 * a `#` fragment (Orca's `<base href="about:srcdoc">` and the feed's `data:` icon aside); a link to elsewhere without `rel="noopener"`; `alert(`, `url(` or
 * `expression(` in a `style` or `class`.
 */
export function scan(frame: Frame, ownScripts: number): Promise<Scan> {
  return frame.evaluate((own) => {
    const unsafe: string[] = []
    const byId: Record<string, string[]> = {}
    const elements: Element[] = []
    const visit = (root: Document | ShadowRoot) => {
      for (const element of root.querySelectorAll('*')) {
        elements.push(element)
        if (element.shadowRoot) visit(element.shadowRoot)
      }
    }
    visit(document)
    const textOf = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? ''
      if (node instanceof Element && ['script', 'style'].includes(node.localName)) return ''
      let text = ''
      if (node instanceof Element && node.shadowRoot) text += textOf(node.shadowRoot)
      for (const child of node.childNodes) text += textOf(child)
      return text
    }
    const URL_ATTRIBUTES = ['href', 'src', 'xlink:href']
    const BANNED_ATTRIBUTES = ['srcdoc', 'srcset', 'action', 'formaction']
    const BANNED_TAGS = ['iframe', 'frame', 'object', 'embed', 'applet', 'form']
    const SAFE_SCHEMES = ['http:', 'https:', 'mailto:']
    let scripts = 0
    for (const element of elements) {
      const tag = element.localName
      if (tag === 'script') {
        scripts += 1
        const root = element.getRootNode()
        if (root instanceof ShadowRoot || element.closest('.vui-root, .vui-doc')) {
          unsafe.push('script inside a rendered root')
        }
      }
      if (BANNED_TAGS.includes(tag)) unsafe.push(`${tag} element`)
      if (element.id !== '') {
        byId[element.id] ??= []
        byId[element.id]?.push(textOf(element))
      }
      for (const { name, value } of element.attributes) {
        const shown = `${tag} ${name}=${JSON.stringify(value.slice(0, 60))}`
        if (name.startsWith('on')) unsafe.push(shown)
        if (BANNED_ATTRIBUTES.includes(name)) unsafe.push(shown)
        if ((name === 'style' || name === 'class') && /alert\(|url\(|expression\(/i.test(value)) {
          unsafe.push(shown)
        }
        // Orca's shell sets this base itself, before its CSP (`INERT_BASE`), and the feed
        // page has an inline icon, so no favicon request goes out.
        const ownBase = tag === 'base' && name === 'href' && value === 'about:srcdoc'
        const ownIcon =
          tag === 'link' &&
          element.getAttribute('rel') === 'icon' &&
          value.startsWith('data:image/')
        const checked = URL_ATTRIBUTES.includes(name) && tag !== 'script' && !ownBase && !ownIcon
        if (checked && !value.startsWith('#')) {
          let scheme = 'unparsable'
          try {
            scheme = new URL(value, document.baseURI).protocol
          } catch {}
          if (!SAFE_SCHEMES.includes(scheme)) unsafe.push(shown)
          else if (tag === 'a' && !/\bnoopener\b/.test(element.getAttribute('rel') ?? '')) {
            unsafe.push(`${shown} without rel=noopener`)
          }
        }
      }
    }
    if (scripts !== own) unsafe.push(`${scripts} script elements, expected ${own}`)
    return { unsafe, text: textOf(document), byId }
  }, ownScripts)
}

/** The console line the init script prints when any dialog function runs in any frame. */
export const RAN = 'vui-xss-ran'

/** Records every dialog and every call of a dialog function, in every frame. */
export async function watchExecution(page: Page): Promise<string[]> {
  const ran: string[] = []
  page.on('dialog', (dialog) => {
    ran.push(`dialog ${dialog.type()}: ${dialog.message()}`)
    void dialog.dismiss()
  })
  page.on('console', (message) => {
    if (message.text().startsWith(RAN)) ran.push(message.text())
  })
  page.on('pageerror', () => undefined)
  // A sandboxed frame without `allow-modals` drops `alert` silently, so the call itself
  // must tell. Runs in every frame before its own scripts.
  await page.addInitScript((marker) => {
    const target = window as unknown as Record<string, unknown>
    for (const name of ['alert', 'confirm', 'prompt', 'print']) {
      const original = target[name]
      target[name] = function (this: unknown, ...args: unknown[]) {
        console.log(`${marker} ${name}(${args.map(String).join(', ')})`)
        return typeof original === 'function' ? original.apply(this, args) : undefined
      }
    }
  }, RAN)
  return ran
}
