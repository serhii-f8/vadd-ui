import {
  cleanText,
  type DiffEntry,
  type DiffFile,
  diffEntries,
  hasOwn,
  isIsoTime,
  isJsonObject,
  type JsonObject,
  type JsonValue,
  type PlanItem,
  planCounts,
  type Tone,
  tailLines,
  treeSource,
} from '@vadd/ui-spec'
import type { Component, NodeContext } from '../context.js'
import { type Child, el } from '../el.js'
import { toneClass } from '../inline.js'
import { codeBlock, maxLinesOf } from './code.js'
import { badgeOf } from './data.js'
import { field, lineCount, nodeList, objects, text, whole } from './fields.js'

const CHECK_OUTPUT_LINES = 20

/** What `draw` makes of each object in `list`, with the VD-008 checkpoint. */
function drawn<T>(
  list: JsonValue[],
  context: NodeContext,
  draw: (item: JsonObject, index: number) => T,
): T[] {
  return objects(list).map(({ item, index }) => {
    context.checkpoint()
    return draw(item, index)
  })
}

const statusLabel = (label: string) =>
  el('span', { class: `vui-status vui-pick ${toneClass('ok')}` }, [
    el('span', { 'aria-hidden': 'true' }, '✓'),
    label,
  ])

function note(item: JsonObject, context: NodeContext): HTMLElement | null {
  const value = text(item, 'note')
  return value === '' ? null : el('p', { class: 'vui-note' }, context.inline(value))
}

const pre = (content: Child | Child[]) =>
  el('pre', { class: 'vui-code-pre vui-codeblock' }, content)

function checkOutput(item: JsonObject, context: NodeContext): HTMLElement[] {
  const output = cleanText(text(item, 'output')).trimEnd()
  if (output === '') return []
  const name = text(item, 'name')
  const { earlier, last } = tailLines(output, CHECK_OUTPUT_LINES)
  const before =
    earlier.length === 0
      ? []
      : context.fold(
          `earlier ${name}`,
          lineCount(earlier.length, 'earlier'),
          pre(earlier.join('\n')),
          false,
        )
  const label = ['Output', el('span', { class: 'vui-sr-only' }, `, ${name}`)]
  return context.fold(`output ${name}`, label, [...before, pre(last.join('\n'))], false)
}

export const checks: Component = {
  render(node, context) {
    const rows = drawn(nodeList(node, 'items'), context, (item, index) => {
      const cmd = text(item, 'cmd')
      const ms = field(item, 'ms')
      return el('li', {}, [
        el('div', { class: 'vui-row vui-check-head' }, [
          badgeOf(item),
          text(item, 'name'),
          cmd === '' ? null : el('code', { class: 'vui-code' }, cmd),
          typeof ms === 'number'
            ? el(
                'span',
                { class: 'vui-row-end' },
                context.format(ms, 'ms', `${context.pointer}/items/${index}/ms`).text,
              )
            : null,
        ]),
        ...checkOutput(item, context),
      ])
    })
    return el('ul', { class: 'vui-rows' }, rows)
  },
}

/** A list that nests, for the items of `plan` and `tree`. */
function rows(
  items: JsonValue[],
  context: NodeContext,
  label: (item: JsonObject) => Child[],
  className: string,
): HTMLElement {
  const entries = drawn(items, context, (item) => {
    const children = nodeList(item, 'children')
    return el('li', {}, [
      el('div', { class: 'vui-row' }, [badgeOf(item), el('span', {}, label(item))]),
      note(item, context),
      children.length === 0 ? null : rows(children, context, label, 'vui-rows'),
    ])
  })
  return el('ul', { class: className }, entries)
}

export const plan: Component = {
  render(node, context) {
    const items = nodeList(node, 'items')
    const [done, total] = planCounts(items as unknown as PlanItem[])
    return [
      el('p', { class: 'vui-note' }, `${done}/${total} done`),
      rows(items, context, (item) => context.inline(text(item, 'text')), 'vui-rows'),
    ]
  },
}

export const tree: Component = {
  render(node, context) {
    const source = treeSource(nodeList(node, 'items'), nodeList(node, 'paths'))
    return rows(source, context, (item) => [text(item, 'name')], 'vui-rows vui-tree')
  },
}

const CHANGES: { [change: string]: [Tone, string] } = {
  A: ['ok', 'added'],
  M: ['info', 'modified'],
  D: ['err', 'deleted'],
  R: ['warn', 'renamed'],
}

/** Tones line by line. Before the first `@@`, `---` and `+++` name files and change nothing. */
function hunkTones(): (line: string) => Tone | undefined {
  let inHunk = false
  return (line) => {
    if (line.startsWith('@@')) {
      inHunk = true
      return 'info'
    }
    if (!inHunk && /^(---|\+\+\+)/.test(line)) return undefined
    return line[0] === '+' ? 'ok' : line[0] === '-' ? 'err' : undefined
  }
}

/** One node per run of a tone, so a long plain stretch stays one text node. */
function runs(lines: string[], toneOf: (line: string) => Tone | undefined): Child[] {
  const nodes: Child[] = []
  let run: string[] = []
  let tone: Tone | undefined
  const flush = () => {
    if (run.length === 0) return
    const content = run.join('')
    nodes.push(tone === undefined ? content : el('span', { class: toneClass(tone) }, content))
    run = []
  }
  for (const line of lines) {
    const next = toneOf(line)
    if (next !== tone) flush()
    tone = next
    run.push(`${line}\n`)
  }
  flush()
  return nodes
}

function fileRow({ path, added, removed, change }: DiffEntry): HTMLElement {
  // A warn-level change can be any value, and `hasOwn` would read `["M"]` as `"M"`.
  const mark = typeof change === 'string' && hasOwn(CHANGES, change) ? CHANGES[change] : undefined
  return el('span', { class: 'vui-row' }, [
    mark === undefined
      ? null
      : el('span', { class: `vui-status vui-diff-mark ${toneClass(mark[0])}` }, [
          change,
          el('span', { class: 'vui-sr-only' }, mark[1]),
        ]),
    el('code', { class: 'vui-code' }, path),
    // Past VD-066's cap a count can be anything, and a template throws on some (VD-187).
    typeof added !== 'number' || typeof removed !== 'number'
      ? null
      : el('span', { class: 'vui-row-end' }, [
          el('span', { class: toneClass('ok') }, `+${added}`),
          ' ',
          el('span', { class: toneClass('err') }, `−${removed}`),
        ]),
  ])
}

export const diff: Component = {
  render(node, context) {
    // A path is a key and a label: one that is not a string cannot be either (VD-187).
    const files = nodeList(node, 'files').filter(
      (file) => Array.isArray(file) && typeof file[0] === 'string',
    ) as unknown as DiffFile[]
    const hunks = field(node, 'hunks')
    const entries = diffEntries(files, isJsonObject(hunks) ? (hunks as never) : undefined)
    const items = entries.map((entry) => {
      context.checkpoint()
      const hunk = typeof entry.hunk === 'string' ? cleanText(entry.hunk).trimEnd() : ''
      return el(
        'li',
        {},
        hunk === ''
          ? fileRow(entry)
          : context.fold(
              `hunk ${entry.path}`,
              fileRow(entry),
              () => pre(runs(hunk.split('\n'), hunkTones())),
              false,
            ),
      )
    })
    return el('ul', { class: 'vui-rows vui-diff' }, items)
  },
}

const DEFAULT_LOG_LINES = 40
// A level after anything but letters, or the `T` and `Z` of a timestamp. Each character can
// match one way only, so a long line cannot backtrack.
const LOG_LEVEL = /^(?:[^a-zA-Z]|[TZ](?=[\d\s]))*(ERROR|FATAL|CRITICAL|PANIC|WARN(?:ING)?|INFO|DEBUG)\b/
// §6 names four levels; the three that end a process are at least as strong as ERROR (VD-191).
const LEVEL_TONES: { [level: string]: Tone } = {
  ERROR: 'err',
  FATAL: 'err',
  CRITICAL: 'err',
  PANIC: 'err',
  WARN: 'warn',
  WARNING: 'warn',
  INFO: 'info',
  DEBUG: 'muted',
}

const levelTone = (line: string) => LEVEL_TONES[LOG_LEVEL.exec(line)?.[1] as string]

export const log: Component = {
  render(node, context) {
    const options = {
      text: cleanText(text(node, 'text')),
      lang: '',
      lines: false,
      mark: new Set<number>(),
      maxLines: maxLinesOf(node, DEFAULT_LOG_LINES),
      draw: (lines: string[]) => runs(lines, levelTone),
    }
    return codeBlock(context, options, 'log')
  },
}

export const timeline: Component = {
  render(node, context) {
    const entries = drawn(nodeList(node, 'items'), context, (item, index) => {
      const at = text(item, 'at')
      const pointer = `${context.pointer}/items/${index}/at`
      return el('li', {}, [
        el(
          'span',
          { class: 'vui-time' },
          isIsoTime(at) ? context.format(at, 'date:datetime', pointer).text : at,
        ),
        el('div', { class: 'vui-row' }, [
          badgeOf(item),
          el('span', {}, context.inline(text(item, 'text'))),
        ]),
      ])
    })
    return el('ol', { class: 'vui-rows vui-timeline' }, entries)
  },
}

/** An option with nothing to list draws no `<dl>`, so it reserves no height (VD-190). */
function optionFields(option: JsonObject, context: NodeContext): HTMLElement | null {
  const strings = (name: string) => {
    const items = nodeList(option, name).filter((item) => typeof item === 'string')
    if (items.length === 0) return null
    return el(
      'ul',
      { class: 'vui-list' },
      items.map((item) => el('li', {}, item)),
    )
  }
  const reversible = field(option, 'reversible')
  const fields: [string, Child | Child[]][] = [
    ['Pros', strings('pros')],
    ['Cons', strings('cons')],
    ['Effort', text(option, 'effort')],
    ['Reversible', typeof reversible === 'boolean' ? (reversible ? 'yes' : 'no') : null],
    ['Risk', text(option, 'risk')],
    ['Verify', context.inline(text(option, 'verify'))],
  ]
  const shown = fields.filter(([, value]) => (Array.isArray(value) ? value.length : value))
  if (shown.length === 0) return null
  return el(
    'dl',
    { class: 'vui-kv', 'data-vui-cols': 1 },
    shown.map(([label, value]) =>
      el('div', { class: 'vui-kv-item' }, [el('dt', {}, label), el('dd', {}, value)]),
    ),
  )
}

export const decision: Component = {
  render(node, context) {
    const pick = whole(node, 'pick')
    const details = text(node, 'context')
    const cards = drawn(nodeList(node, 'options'), context, (item, index) =>
      el('li', { class: `vui-card${index === pick ? ' vui-option-pick' : ''}` }, [
        index === pick ? statusLabel('Recommended') : null,
        el('p', { class: 'vui-card-title' }, text(item, 'label')),
        optionFields(item, context),
      ]),
    )
    return [
      el('p', { class: 'vui-node-title' }, text(node, 'question')),
      details === '' ? null : el('p', { class: 'vui-decision-context' }, context.inline(details)),
      el('div', { class: 'vui-grid-box' }, el('ul', { class: 'vui-options' }, cards)),
    ]
  },
}
