import type { Diagnostic, JsonObject, VuiDocument } from '@vadd/ui-spec'
import { type Build, buildHeader, buildNode } from './build.js'
import { documentErrorCard } from './cards.js'
import type { Registry } from './context.js'
import { type DiagnosticsMode, diagnosticsView } from './diagnostics.js'
import { el } from './el.js'
import { type Prepared, prepare } from './prepare.js'
import { type Clock, createWatchdog } from './watchdog.js'

const DEFAULT_LOCALE = 'en-US'
const ROOT_CLASS = 'vui-root'
const DENSITY = 'data-vui-density'
const DIAGNOSTICS_KEY = '\0diagnostics'

/** §9.1. */
export interface RenderOptions {
  diagnostics?: DiagnosticsMode
  now?: Date
  linkHandler?: (url: string) => void
}

/** §9.1. */
export interface RenderHandle {
  diagnostics: Diagnostic[]
  update(doc: string | VuiDocument): void
  destroy(): void
}

export type Render = (
  input: string | VuiDocument,
  target: HTMLElement,
  options?: RenderOptions,
) => RenderHandle

function failure(message: string): Diagnostic {
  return { severity: 'error', path: '', code: 'render-failed', message }
}

function nowOf(document: JsonObject, now: Date | undefined): string | number | undefined {
  const time = now instanceof Date ? now.getTime() : Number.NaN
  if (!Number.isNaN(time)) return time
  return typeof document.generatedAt === 'string' ? document.generatedAt : undefined
}

function formatContext(document: JsonObject, now: Date | undefined): Build['format'] {
  const locale = typeof document.locale === 'string' ? document.locale : DEFAULT_LOCALE
  const time = nowOf(document, now)
  return time === undefined ? { locale } : { locale, now: time }
}

function buildBody(document: JsonObject, build: Build): HTMLElement[] {
  const { body } = document
  if (!Array.isArray(body)) return [documentErrorCard('The document has no body.')]
  return body.map((node, index) => buildNode(build, node, `/body/${index}`))
}

interface Mounted {
  density: string | undefined
  nodes: Node[]
  diagnostics: Diagnostic[]
}

function assemble(
  prepared: Prepared,
  registry: Registry,
  clock: Clock | undefined,
  options: RenderOptions,
  memory: Build['memory'],
  cleanups: Build['cleanups'],
): Mounted {
  const { document, paths, failed, failure: parseFailure } = prepared
  const diagnostics = [...prepared.diagnostics]
  let density: string | undefined
  const content: (Node | null)[] = []
  if (document === undefined || paths === undefined) {
    content.push(documentErrorCard(parseFailure?.message ?? '', parseFailure?.raw))
  } else {
    const root = document as unknown as JsonObject
    density = typeof root.density === 'string' ? root.density : undefined
    const build: Build = {
      registry,
      failed,
      paths,
      format: formatContext(root, options.now),
      linkHandler: options.linkHandler,
      memory,
      watchdog: createWatchdog(clock),
      diagnostics,
      told: new Set(diagnostics.map(({ code, path }) => `${code}\0${path}`)),
      ids: new Set(),
      cleanups,
    }
    content.push(buildHeader(root, build), ...buildBody(root, build))
  }
  const state = memory.get(DIAGNOSTICS_KEY) ?? new Map<string, unknown>()
  memory.set(DIAGNOSTICS_KEY, state)
  content.push(diagnosticsView(diagnostics, options.diagnostics ?? 'badge', state))
  return {
    density,
    nodes: [el('div', { class: 'vui-doc' }, content)],
    diagnostics,
  }
}

function runAll(cleanups: (() => void)[]): void {
  for (const cleanup of cleanups.splice(0)) {
    try {
      cleanup()
    } catch {
      // One cleanup must not stop the others, and a host never sees it (§9.3).
    }
  }
}

/** A `render` over `registry`. `clock` is a seam for the watchdog's tests. */
export function createRenderer(registry: Registry, clock?: Clock): Render {
  return (input, target, options = {}) => {
    const memory: Build['memory'] = new Map()
    const cleanups: (() => void)[] = []
    let destroyed = false
    const inert = typeof target?.replaceChildren !== 'function'
    const ownsClass = !inert && !target.classList.contains(ROOT_CLASS)

    const mount = (doc: string | VuiDocument): Diagnostic[] => {
      if (inert) return [failure('render needs a target element')]
      try {
        target.classList.add(ROOT_CLASS)
        const prepared = prepare(doc)
        const { density, nodes, diagnostics } = assemble(
          prepared,
          registry,
          clock,
          options ?? {},
          memory,
          cleanups,
        )
        if (density === undefined) target.removeAttribute(DENSITY)
        else target.setAttribute(DENSITY, density)
        target.replaceChildren(...nodes)
        return diagnostics
      } catch {
        return fallback(target)
      }
    }

    const handle: RenderHandle = {
      diagnostics: mount(input),
      update(doc) {
        if (destroyed) return
        runAll(cleanups)
        handle.diagnostics = mount(doc)
      },
      destroy() {
        if (destroyed) return
        destroyed = true
        runAll(cleanups)
        memory.clear()
        if (inert) return
        target.replaceChildren()
        target.removeAttribute(DENSITY)
        if (ownsClass) target.classList.remove(ROOT_CLASS)
      },
    }
    return handle
  }
}

function fallback(target: HTMLElement): Diagnostic[] {
  const message = 'The document could not be rendered.'
  try {
    target.replaceChildren(documentErrorCard(message))
  } catch {
    // The target itself is what failed, so there is nowhere left to draw.
  }
  return [failure(message)]
}
