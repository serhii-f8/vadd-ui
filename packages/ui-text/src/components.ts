import {
  type CheckItem,
  type ComponentType,
  compareBest,
  compareWinner,
  diffEntries,
  hasOwn,
  isIsoTime,
  isJsonObject,
  type JsonValue,
  type ListItem,
  type ListNode,
  type PlanItem,
  parseInline,
  planCounts,
  statDeltaFormat,
  type TreeItem,
  tailLines,
  treeSource,
  type VuiNode,
} from '@vadd/ui-spec'
import {
  type Block,
  bold,
  code,
  codeBlock,
  type Entry,
  type Inline,
  led,
  list,
  muted,
  para,
  statusMark,
  text,
  toneMark,
  trailed,
} from './blocks.js'
import { chartBlocks, sparkline } from './chart.js'
import { mdBlocks } from './md-block.js'
import { tableBlocks } from './table.js'
import { type Context, format, tokensOf } from './value.js'

type Renderers = {
  [Type in ComponentType]: (node: Extract<VuiNode, { type: Type }>, context: Context) => Block[]
}

const MAX_LEVEL = 6
const CHECK_OUTPUT_LINES = 20

function deeper(context: Context): Context {
  return { ...context, level: Math.min(context.level + 1, MAX_LEVEL) }
}

function heading(title: string, context: Context): Block {
  return { kind: 'heading', level: context.level, text: parseInline(title) }
}

const withNote = (tokens: Inline, note: string | undefined): Inline =>
  note === undefined ? tokens : [...tokens, text(' — '), ...parseInline(note)]

function detail(label: string, tokens: Inline): Entry {
  return { text: [text(`${label}: `), ...tokens] }
}

function checkEntry(item: CheckItem, context: Context): Entry {
  const tokens: Inline = led(statusMark(item.status), [text(item.name)])
  if (item.cmd !== undefined) tokens.push(text(' '), code(item.cmd))
  if (item.ms !== undefined) tokens.push(text(` — ${format(item.ms, 'ms', context).text}`))
  if (item.output === undefined) return { text: tokens }
  const { earlier, last } = tailLines(item.output, CHECK_OUTPUT_LINES)
  const hidden = earlier.length
  const shown = hidden > 0 ? [`… ${hidden} earlier line${hidden === 1 ? '' : 's'}`, ...last] : last
  return { text: tokens, blocks: [codeBlock(shown.join('\n'))] }
}

function planEntries(items: PlanItem[]): Entry[] {
  return items.map((item) => {
    const entryText = led(statusMark(item.status), withNote(parseInline(item.text), item.note))
    return item.children === undefined || item.children.length === 0
      ? { text: entryText }
      : { text: entryText, blocks: [list(planEntries(item.children))] }
  })
}

function treeEntries(items: TreeItem[]): Entry[] {
  return items.map((item) => {
    const entryText = led(statusMark(item.status), withNote([text(item.name)], item.note))
    return item.children === undefined || item.children.length === 0
      ? { text: entryText }
      : { text: entryText, blocks: [list(treeEntries(item.children))] }
  })
}

function listEntry(item: ListNode['items'][number]): Entry {
  if (typeof item === 'string') return { text: parseInline(item) }
  const { text: value, status, note } = item as ListItem
  return { text: led(statusMark(status), withNote(parseInline(value), note)) }
}

function kvEntry(key: string, value: JsonValue, name: string | undefined, context: Context): Entry {
  return { text: [bold(text(`${key}:`)), text(' '), ...tokensOf(format(value, name, context))] }
}

function decisionEntry(
  option: Extract<VuiNode, { type: 'decision' }>['options'][number],
  picked: boolean,
): Entry {
  const details: Entry[] = []
  if (option.pros !== undefined) details.push(detail('Pros', [text(option.pros.join('; '))]))
  if (option.cons !== undefined) details.push(detail('Cons', [text(option.cons.join('; '))]))
  if (option.effort !== undefined) details.push(detail('Effort', [text(option.effort)]))
  if (option.reversible !== undefined) {
    details.push(detail('Reversible', [text(option.reversible ? 'yes' : 'no')]))
  }
  if (option.risk !== undefined) details.push(detail('Risk', [text(option.risk)]))
  if (option.verify !== undefined) details.push(detail('Verify', parseInline(option.verify)))
  const label: Inline = [bold(text(option.label))]
  if (picked) label.push(text(' ✓ recommended'))
  return details.length > 0 ? { text: label, blocks: [list(details)] } : { text: label }
}

function codeLines({ text: value, lines, mark }: Extract<VuiNode, { type: 'code' }>): string {
  if (lines !== true && (mark === undefined || mark.length === 0)) return value
  const all = value.replace(/\n$/, '').split('\n')
  const size = String(all.length).length
  const marked = new Set(mark ?? [])
  return all
    .map((line, index) => {
      const number = lines === true ? `${String(index + 1).padStart(size)}  ` : ''
      const flag = marked.size === 0 ? '' : marked.has(index + 1) ? '> ' : '  '
      return `${flag}${number}${line}`.trimEnd()
    })
    .join('\n')
}

function flowEntries({ nodes, edges }: Extract<VuiNode, { type: 'flow' }>): Entry[] {
  const known = new Map<string, { label: string; status?: string }>()
  for (const node of nodes) {
    const { id, ...rest } = typeof node === 'string' ? { id: node, label: node } : node
    known.set(id, rest)
  }
  for (const [from] of edges) {
    if (!known.has(from)) known.set(from, { label: from })
  }
  return Array.from(known, ([id, { label, status }]) => {
    const out = edges
      .filter(([from]) => from === id)
      .map(([, to, note]): Entry => {
        const target = `→ ${known.get(to)?.label ?? to}`
        return { text: [text(note === undefined ? target : `${target} (${note})`)] }
      })
    const entryText = led(statusMark(status), [text(label)])
    return out.length > 0 ? { text: entryText, blocks: [list(out)] } : { text: entryText }
  })
}

const RENDERERS: Renderers = {
  stack: (node, context) => renderNodes(node.children, context),
  grid: (node, context) => renderNodes(node.children, context),
  section: (node, context) => renderNodes(node.children, context),
  card: (node, context) => renderNodes(node.children, context),
  tabs: (node, context) =>
    node.tabs.flatMap((tab) => [
      { kind: 'heading', level: context.level, text: [text(tab.label)] },
      ...renderNodes(tab.children, deeper(context)),
    ]),
  divider: (node) => [
    { kind: 'rule' },
    ...(node.label === undefined ? [] : [muted([text(node.label)])]),
  ],
  md: (node) => mdBlocks(node.text),
  callout: (node) => {
    const title = node.title === undefined ? [] : [para([bold(...parseInline(node.title))])]
    // B8: a leading status token is the icon already, so the tone's mark would double it.
    const tokens = parseInline(node.text)
    const mark = parseInline(node.text.trimStart())[0]?.type === 'status' ? '' : toneMark(node.tone)
    const blocks = [...title, para(led(mark, tokens))]
    return [{ kind: 'quote', blocks }]
  },
  code: (node) => [codeBlock(codeLines(node), node.lang)],
  table: tableBlocks,
  kv: (node, context) => {
    const entries: Entry[] = isJsonObject(node.pairs)
      ? Object.entries(node.pairs).map(([key, value]) =>
          kvEntry(key, value as JsonValue, undefined, context),
        )
      : (node.pairs as [string, JsonValue, string?][]).map(([key, value, name]) =>
          kvEntry(key, value, name, context),
        )
    return [list(entries)]
  },
  stats: (node, context) => [
    list(
      node.items.map((item) => {
        const value = tokensOf(format(item.value, item.format, context))
        const tokens = [bold(text(`${item.label}:`)), text(' '), ...value]
        const marked = trailed(tokens, toneMark(item.tone))
        if (item.delta !== undefined) {
          const delta = format(item.delta, statDeltaFormat(item), context).text
          marked.push(text(` (${delta})`))
        }
        if (item.spark !== undefined && item.spark.length > 0) {
          marked.push(text(` ${sparkline(item.spark)}`))
        }
        return { text: marked }
      }),
    ),
  ],
  list: (node) => [list(node.items.map(listEntry), node.ordered === true)],
  progress: (node, context) => {
    const value = format(node.value, 'num', context).text
    const max = format(node.max, 'num', context).text
    const percent = node.max > 0 ? ` (${format(node.value / node.max, 'pct:0', context).text})` : ''
    const label = node.label === undefined ? [] : [bold(text(`${node.label}:`)), text(' ')]
    const line = para([...label, text(`${value} of ${max}${percent}`)])
    if (node.segments === undefined) return [line]
    const segments = node.segments.map((segment) => ({
      text: led(toneMark(segment.tone), [
        text(`${segment.label}: ${format(segment.value, 'num', context).text}`),
      ]),
    }))
    return [line, list(segments)]
  },
  compare: (node, context) => {
    // The same winner and best values as the renderer draws (VD-183).
    const winner = compareWinner(node)
    const count = node.options.length
    return [
      {
        kind: 'table',
        header: [
          [],
          ...node.options.map((option, index) =>
            trailed([text(option)], index === winner ? '✓' : ''),
          ),
        ],
        aligns: ['left', ...node.options.map(() => 'left' as const)],
        rows: node.criteria.map((criterion) => {
          const best = compareBest(criterion.values, criterion.better, count)
          return [
            trailed(
              [text(criterion.label)],
              criterion.better === 'high' ? '↑' : criterion.better === 'low' ? '↓' : '',
            ),
            ...node.options.map((_, index) => {
              const tokens = tokensOf(format(criterion.values[index], criterion.format, context))
              return best.has(index) ? [bold(...tokens)] : tokens
            }),
          ]
        }),
      },
    ]
  },
  chart: chartBlocks,
  checks: (node, context) => [list(node.items.map((item) => checkEntry(item, context)))],
  plan: (node) => {
    const [done, total] = planCounts(node.items)
    return [para([text(`${done}/${total} done`)]), list(planEntries(node.items))]
  },
  diff: (node) => [
    list(
      diffEntries(node.files, node.hunks).map(({ path, added, removed, change, hunk }): Entry => {
        const tokens: Inline = [
          ...(change === undefined ? [] : [text(`${change} `)]),
          code(path),
          ...(added === undefined ? [] : [text(` +${added} −${removed}`)]),
        ]
        return hunk === undefined
          ? { text: tokens }
          : { text: tokens, blocks: [codeBlock(hunk, 'diff')] }
      }),
    ),
  ],
  tree: (node) => [
    list(
      treeEntries(
        treeSource(
          (node.items ?? []) as unknown as JsonValue[],
          node.paths ?? [],
        ) as unknown as TreeItem[],
      ),
    ),
  ],
  timeline: (node, context) => [
    list(
      node.items.map((item) => ({
        text: [
          bold(text(isIsoTime(item.at) ? format(item.at, 'date:datetime', context).text : item.at)),
          text(' '),
          ...led(statusMark(item.status), parseInline(item.text)),
        ],
      })),
    ),
  ],
  decision: (node) => [
    para([bold(text(node.question))]),
    ...(node.context === undefined ? [] : [para(parseInline(node.context))]),
    list(node.options.map((option, index) => decisionEntry(option, index === node.pick))),
  ],
  log: (node) => [codeBlock(node.text, 'log')],
  flow: (node) => [list(flowEntries(node))],
}

/** Title, body, note: the §5.4 fields every component shares. */
function framed(node: VuiNode, context: Context): Block[] {
  const render = RENDERERS[node.type] as (node: VuiNode, context: Context) => Block[]
  const titled = node.title !== undefined && node.type !== 'callout'
  const body = render(node, titled ? deeper(context) : context)
  return [
    ...(titled ? [heading(node.title as string, context)] : []),
    ...body,
    ...(node.note === undefined ? [] : [muted(parseInline(node.note))]),
  ]
}

function renderNode(node: VuiNode, context: Context): Block[] {
  // Only a string names a component: `String` throws on some values and reads `["md"]` as "md".
  const type =
    isJsonObject(node as unknown as JsonValue) && typeof node.type === 'string'
      ? node.type
      : 'unknown'
  if (!hasOwn(RENDERERS, type)) return [muted([text(`Unsupported component: ${type}`)])]
  try {
    return framed(node, context)
  } catch {
    // §9.3: one bad node costs one line, and nothing about it reaches a log.
    return [muted([text(`Could not render ${type}`)])]
  }
}

/** Nodes in order, with a chart's caption after a table that follows it (VD-050). */
export function renderNodes(nodes: VuiNode[], context: Context): Block[] {
  const blocks: Block[] = []
  let captions: Block[] = []
  const flush = () => {
    blocks.push(...captions)
    captions = []
  }
  for (const node of nodes) {
    const rendered = renderNode(node, context)
    if (node?.type === 'chart') {
      captions.push(...rendered)
    } else if (node?.type === 'table') {
      blocks.push(...rendered)
      flush()
    } else {
      flush()
      blocks.push(...rendered)
    }
  }
  flush()
  return blocks
}
