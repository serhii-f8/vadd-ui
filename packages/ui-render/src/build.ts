import {
  clip,
  type Diagnostic,
  type DiagnosticCode,
  type FormatContext,
  type Formatted,
  formatValue,
  hasOwn,
  isJsonObject,
  type JsonObject,
  type JsonValue,
  type PathMap,
  parseInline,
  TONES,
  type Tone,
} from '@vadd/ui-spec'
import { errorCard, placeholderCard } from './cards.js'
import type { NodeContext, Registry } from './context.js'
import { type Child, el } from './el.js'
import { foldable } from './fold.js'
import { type LinkHandler, renderInline, renderValue, toneClass } from './inline.js'
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
    titleDrawn,
    format,
    value: (value, name, at) => renderValue(format(value, name, at), linkHandler),
    inline,
    heading: (text) => el(headingTag(level), { class: 'vui-node-title' }, inline(text)),
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

function isTone(value: string | undefined): value is Tone {
  return (TONES as readonly (string | undefined)[]).includes(value)
}

function frame(node: JsonObject, id: string | undefined, content: Child[]): HTMLElement {
  const tone = stringField(node, 'tone')
  const span = hasOwn(node, 'span') ? (node.span as number) : undefined
  const type = stringField(node, 'type')
  const attributes = {
    id,
    class: isTone(tone) ? `vui-node ${toneClass(tone)}` : 'vui-node',
    'data-vui-span': span,
    'data-vui-type': type,
  }
  return el('div', attributes, content)
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
        label: context.inline(title as string),
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
  return errorCard({
    message,
    ...(type === undefined ? {} : { type }),
    ...(free ? { id: id as string } : {}),
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
  let element: HTMLElement
  watchdog.enter()
  try {
    const body = component.render(node, context)
    element = frame(node, id, chrome(node, body, context, level, component.ownsTitle === true))
  } catch (error) {
    watchdog.leave()
    if (id !== undefined) build.ids.delete(id)
    if (error instanceof BudgetExceeded) {
      return failedCard(build, node, pointer, 'render-budget', overBudget(type))
    }
    return failedCard(build, node, pointer, 'render-failed', `${type} failed while rendering`)
  }
  if (watchdog.leave() > BUDGET_MS) {
    if (id !== undefined) build.ids.delete(id)
    return failedCard(build, node, pointer, 'render-budget', overBudget(type))
  }
  return element
}

function overBudget(type: string): string {
  return `${type} took longer than ${BUDGET_MS} ms`
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
  return buildComponent(build, node, type, pointer, level)
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
