import {
  clip,
  type Diagnostic,
  type DiagnosticCode,
  type FormatContext,
  type Formatted,
  formatValue,
  hasOwn,
  inlineToPlain,
  isJsonObject,
  type JsonObject,
  type JsonValue,
  type PathMap,
  parseInline,
  type Tone,
} from '@vadd/ui-spec'
import { errorCard, placeholderCard } from './cards.js'
import type { NodeContext, Registry } from './context.js'
import { type Child, el } from './el.js'
import { foldable } from './fold.js'
import {
  type LinkHandler,
  renderInline,
  renderValue,
  tonedClass,
  toneMark,
  toneOf,
} from './inline.js'
import type { Failure } from './prepare.js'
import { BUDGET_MS, BudgetExceeded, type Watchdog } from './watchdog.js'

const FIRST_LEVEL = 3
const LAST_LEVEL = 6
const FOLD = 'fold'
const PLACEHOLDER_FOLD = 'raw'

/** What every node of one build shares. */
export interface Build {
  registry: Registry
  failed: Map<string, Failure>
  paths: PathMap
  format: FormatContext
  linkHandler: LinkHandler | undefined
  /** Node key to its memory. Lives on the handle, so it outlives the DOM. */
  memory: Map<string, Map<string, unknown>>
  watchdog: Watchdog
  diagnostics: Diagnostic[]
  /** `code` and path of each diagnostic, so a problem is told once. */
  told: Set<string>
  /** Document ids written so far. A repeat gets neither a DOM id nor shared state. */
  ids: Set<string>
  cleanups: (() => void)[]
}

function report(
  build: Build,
  severity: Diagnostic['severity'],
  pointer: string,
  code: DiagnosticCode,
  message: string,
  hint?: string,
): void {
  const path = build.paths.toInput(pointer)
  const key = `${code}\0${path}`
  if (build.told.has(key)) return
  build.told.add(key)
  const diagnostic: Diagnostic = { severity, path, code, message: clip(message, 120) }
  if (hint !== undefined) diagnostic.hint = hint
  build.diagnostics.push(diagnostic)
}

function memoryOf(build: Build, key: string): Map<string, unknown> {
  let memory = build.memory.get(key)
  if (memory === undefined) {
    memory = new Map()
    build.memory.set(key, memory)
  }
  return memory
}

function headingTag(level: number): 'h3' | 'h4' | 'h5' | 'h6' {
  return `h${Math.min(level, LAST_LEVEL)}` as 'h3' | 'h4' | 'h5' | 'h6'
}

function stringField(node: JsonObject, field: string): string | undefined {
  const value = hasOwn(node, field) ? node[field] : undefined
  return typeof value === 'string' ? value : undefined
}

/** The node's own memory, and its `id` if this is the first to claim it. */
function claim(build: Build, node: JsonObject, type: string, pointer: string) {
  const candidate = stringField(node, 'id')
  const id = candidate === undefined || build.ids.has(candidate) ? undefined : candidate
  if (id !== undefined) build.ids.add(id)
  const memory = memoryOf(build, `${type}\0${id === undefined ? `/${pointer}` : `#${id}`}`)
  return { id, memory }
}

function createContext(
  build: Build,
  pointer: string,
  level: number,
  memory: Map<string, unknown>,
  titleDrawn: boolean,
  inner: number,
): NodeContext {
  const { linkHandler, watchdog } = build
  const format = (value: JsonValue | undefined, name: string | undefined, at: string) => {
    const formatted: Formatted = formatValue(value, name, build.format)
    for (const issue of formatted.issues ?? []) {
      report(build, 'warn', at, issue.code, issue.message, issue.hint)
    }
    return formatted
  }
  const inline = (text: string) => renderInline(parseInline(text), linkHandler)
  const context: NodeContext = {
    pointer,
    locale: build.format.locale as string,
    state: memory,
    level: inner,
    titleDrawn,
    format,
    value: (value, name, at) => renderValue(format(value, name, at), linkHandler),
    inline,
    heading: (text, at = level) => el(headingTag(at), { class: 'vui-node-title' }, inline(text)),
    child: (node, at) => buildNode(build, node, at, inner),
    children: (nodes, at) => nodes.map((node, index) => context.child(node, `${at}/${index}`)),
    fold(name, label, body, open) {
      const key = `${FOLD}:${name}`
      const remembered = memory.get(key)
      return foldable({
        label,
        body,
        open: typeof remembered === 'boolean' ? remembered : open,
        onToggle: (opened) => memory.set(key, opened),
      })
    },
    checkpoint: () => watchdog.check(),
    onDestroy: (cleanup) => build.cleanups.push(cleanup),
  }
  return context
}

/** Unknown types are not validated (VD-033), so nothing here can be trusted to be a span. */
function spanOf(node: JsonObject): number | undefined {
  const span = hasOwn(node, 'span') ? node.span : undefined
  return typeof span === 'number' ? span : undefined
}

/** VD-068: a bar for any tone but `default`, and a mark for one that means something. */
function frame(
  node: JsonObject,
  id: string | undefined,
  content: Child[],
  fallbackTone?: Tone,
): HTMLElement {
  const tone = toneOf(stringField(node, 'tone')) ?? fallbackTone
  const mark = tone === undefined ? null : toneMark(tone)
  const span = spanOf(node)
  const type = stringField(node, 'type')
  const attributes = {
    id,
    class: tone === undefined ? 'vui-node' : `vui-node ${tonedClass(tone)}`,
    'data-vui-span': span,
    'data-vui-type': type,
  }
  return el('div', attributes, [mark, ...content])
}

function chrome(
  node: JsonObject,
  body: Child | Child[],
  context: NodeContext,
  level: number,
  ownsTitle: boolean,
): Child[] {
  const title = stringField(node, 'title')
  const note = stringField(node, 'note')
  const noteLine = note === undefined ? null : el('p', { class: 'vui-note' }, context.inline(note))
  const content = Array.isArray(body) ? body : [body]
  if (context.titleDrawn) {
    const remembered = context.state.get(FOLD)
    return [
      ...foldable({
        // Plain text: a link inside the toggle button would be invalid and would also fold.
        label: inlineToPlain(parseInline(title as string)),
        body: [...content, noteLine],
        open: typeof remembered === 'boolean' ? remembered : node.fold === 'open',
        onToggle: (opened) => context.state.set(FOLD, opened),
        heading: headingTag(level),
      }),
    ]
  }
  const heading = title === undefined || ownsTitle ? null : context.heading(title)
  return [heading, ...content, noteLine]
}

function failedCard(
  build: Build,
  node: JsonValue,
  pointer: string,
  code: DiagnosticCode,
  message: string,
): HTMLElement {
  report(build, 'error', pointer, code, message)
  const object = isJsonObject(node) ? node : {}
  const id = stringField(object, 'id')
  const free = id !== undefined && !build.ids.has(id)
  if (free) build.ids.add(id as string)
  const type = stringField(object, 'type')
  const span = spanOf(object)
  return errorCard({
    message,
    ...(type === undefined ? {} : { type }),
    ...(free ? { id: id as string } : {}),
    ...(span === undefined ? {} : { span }),
  })
}

function buildComponent(
  build: Build,
  node: JsonObject,
  type: string,
  pointer: string,
  level: number,
): HTMLElement {
  const component = build.registry.get(type)
  const { id, memory } = claim(build, node, type, pointer)
  if (component === undefined) {
    const open = memory.get(PLACEHOLDER_FOLD) === true
    const onToggle = (opened: boolean) => memory.set(PLACEHOLDER_FOLD, opened)
    return frame(node, id, [placeholderCard(type, node, open, onToggle)])
  }
  const folds = hasOwn(node, 'fold') && stringField(node, 'title') !== undefined
  const inner = hasOwn(node, 'title') ? level + 1 : level
  const context = createContext(build, pointer, level, memory, folds, inner)
  const { watchdog } = build
  watchdog.enter()
  let element: HTMLElement
  try {
    const body = component.render(node, context)
    const content = chrome(node, body, context, level, component.ownsTitle === true)
    element = frame(node, id, content, component.tone)
  } catch (error) {
    watchdog.leave()
    throw error
  }
  if (watchdog.leave() > BUDGET_MS) throw new BudgetExceeded()
  return element
}

/** Takes back the ids claimed since `size`, so a discarded subtree leaves none behind. */
function releaseIds(build: Build, size: number): void {
  for (const id of [...build.ids].slice(size)) build.ids.delete(id)
}

/** One node, whatever happens inside it (§9.3). */
export function buildNode(
  build: Build,
  node: JsonValue,
  pointer: string,
  level: number = FIRST_LEVEL,
): HTMLElement {
  const failure = build.failed.get(pointer)
  if (failure !== undefined) {
    return failedCard(build, node, pointer, failure.code, failure.message)
  }
  const type = isJsonObject(node) ? stringField(node, 'type') : undefined
  if (type === undefined || !isJsonObject(node)) {
    return failedCard(build, node, pointer, 'bad-type', 'expected a node')
  }
  const claimed = build.ids.size
  try {
    return buildComponent(build, node, type, pointer, level)
  } catch (error) {
    releaseIds(build, claimed)
    return error instanceof BudgetExceeded
      ? failedCard(
          build,
          node,
          pointer,
          'render-budget',
          `${type} took longer than ${BUDGET_MS} ms`,
        )
      : failedCard(build, node, pointer, 'render-failed', `${type} failed while rendering`)
  }
}

/** Title and subtitle (§5.2). */
export function buildHeader(document: JsonObject, build: Build): HTMLElement | null {
  const title = stringField(document, 'title')
  const subtitle = stringField(document, 'subtitle')
  if (title === undefined && subtitle === undefined) return null
  const inline = (text: string) => renderInline(parseInline(text), build.linkHandler)
  return el('div', { class: 'vui-header' }, [
    title === undefined ? null : el('h2', { class: 'vui-title' }, title),
    subtitle === undefined ? null : el('p', { class: 'vui-subtitle' }, inline(subtitle)),
  ])
}
