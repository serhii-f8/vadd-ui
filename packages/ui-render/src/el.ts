import { safeHref } from '@vadd/ui-spec'

// §9, §15.1: the only way this package makes an element. Text goes through text nodes, and a
// tag or attribute outside these lists throws, which the node guard turns into an error card.

const TAGS = [
  'a',
  'b',
  'blockquote',
  'button',
  'caption',
  'code',
  'col',
  'colgroup',
  'dd',
  'del',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'ins',
  'kbd',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  's',
  'section',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
] as const

export type Tag = (typeof TAGS)[number]

const ALLOWED_TAGS: ReadonlySet<string> = new Set(TAGS)

const ATTRIBUTES: ReadonlySet<string> = new Set([
  'class',
  'colspan',
  'dir',
  'disabled',
  'hidden',
  'href',
  'id',
  'lang',
  'role',
  'rowspan',
  'scope',
  'start',
  'tabindex',
  'title',
  'type',
])

const OPEN_ATTRIBUTE = /^(?:aria-[a-z]+|data-vui-[a-z-]+)$/
const CLASS_LIST = /^vui(?:-[a-z0-9]+)*(?: vui(?:-[a-z0-9]+)*)*$/
const LINK_REL = 'noopener noreferrer'

export type AttributeValue = string | number | boolean | undefined

export interface Attributes {
  [name: string]: AttributeValue | Listeners
}

export type Listeners = {
  [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void
}

export type Child = Node | string | number | false | null | undefined

function setAttribute(
  element: Element,
  name: string,
  value: AttributeValue,
  allowed: ReadonlySet<string> = ATTRIBUTES,
): void {
  if (!allowed.has(name) && !OPEN_ATTRIBUTE.test(name)) {
    throw new Error(`el: attribute ${name} is not allowed`)
  }
  if (value === undefined || value === false) return
  const text = value === true ? '' : String(value)
  if (name === 'class' && !CLASS_LIST.test(text)) throw new Error('el: class is not internal')
  if (name === 'href' && safeHref(text) === undefined) return
  element.setAttribute(name, text)
}

/** A DOM element from internal constants and document text (§15.1). */
export function el<T extends Tag>(
  tag: T,
  attributes: Attributes & { on?: Listeners } = {},
  children: Child | Child[] = [],
): HTMLElementTagNameMap[T] {
  if (!ALLOWED_TAGS.has(tag)) throw new Error(`el: tag ${tag} is not allowed`)
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'on') continue
    setAttribute(element, name, value as AttributeValue)
  }
  if (tag === 'a') element.setAttribute('rel', LINK_REL)
  const { on } = attributes
  if (on !== undefined) {
    for (const [type, listener] of Object.entries(on)) {
      element.addEventListener(type, listener as EventListener)
    }
  }
  return fill(element, children)
}

function fill<T extends Element>(element: T, children: Child | Child[]): T {
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined || child === false) continue
    if (typeof child !== 'object') element.append(String(child))
    else if (child instanceof Node) element.append(child)
    else throw new Error('el: child is not a node')
  }
  return element
}

// §8.2: no `fill` or `stroke`, so a chart cannot hold a color. Paint comes from the stylesheet.
const SVG_TAGS: ReadonlySet<string> = new Set([
  'circle',
  'desc',
  'g',
  'path',
  'svg',
  'text',
  'title',
])

const SVG_ATTRIBUTES: ReadonlySet<string> = new Set(
  'class cx cy d height pathLength preserveAspectRatio r role stroke-dasharray stroke-dashoffset stroke-width text-anchor transform viewBox width x y'.split(
    ' ',
  ),
)

/** `el` for the chart elements: the same rule, in the SVG namespace. */
export function svg(
  tag: string,
  attributes: { [name: string]: AttributeValue } = {},
  children: Child | Child[] = [],
): SVGElement {
  if (!SVG_TAGS.has(tag)) throw new Error(`el: tag ${tag} is not allowed`)
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [name, value] of Object.entries(attributes)) {
    setAttribute(element, name, value, SVG_ATTRIBUTES)
  }
  return fill(element, children)
}
