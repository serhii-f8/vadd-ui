import { isJsonObject, type JsonValue, LIMITS } from '@vadd/ui-spec'

// §6.5 `flow`: a layered layout with no dependency (VD-185). Longest-path layers over the
// graph with its back edges turned around, then barycenter sweeps to untangle each layer.
// Pure and deterministic: the same nodes and edges always give the same layout (§9.3).

const SWEEPS = 4

export interface FlowBox {
  id: string
  label: string
  status: string | undefined
  /** Named only by an edge, not declared in `nodes`. */
  implicit: boolean
  layer: number
  /** Order within the layer, from 0. */
  row: number
}

export interface FlowLink {
  from: number
  to: number
  label: string
  /** Closes a cycle, so it runs against the layers. */
  back: boolean
}

export interface FlowLayout {
  nodes: FlowBox[]
  edges: FlowLink[]
  layers: number
  /** Rows of the largest layer. */
  rows: number
}

const str = (value: JsonValue | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined

/** Index of each edge's ends, adding nodes an edge names, up to the limit. */
function readGraph(nodes: JsonValue[], edges: JsonValue[]) {
  const boxes: FlowBox[] = []
  const index = new Map<string, number>()
  const add = (id: string, label: string, status: string | undefined, implicit: boolean) => {
    index.set(id, boxes.length)
    boxes.push({ id, label, status, implicit, layer: 0, row: 0 })
  }
  for (const node of nodes) {
    const object = isJsonObject(node) ? node : undefined
    const id = object ? str(object.id) : str(node)
    if (id === undefined || index.has(id) || boxes.length >= LIMITS.flowNodes) continue
    add(id, (object && str(object.label)) ?? id, object && str(object.status), false)
  }
  const links: FlowLink[] = []
  for (const edge of edges) {
    if (!Array.isArray(edge)) continue
    const ends = [str(edge[0]), str(edge[1])]
    if (ends[0] === undefined || ends[1] === undefined) continue
    for (const end of ends as string[]) {
      if (!index.has(end) && boxes.length < LIMITS.flowNodes) add(end, end, undefined, true)
    }
    const from = index.get(ends[0])
    const to = index.get(ends[1])
    if (from === undefined || to === undefined) continue
    links.push({ from, to, label: str(edge[2]) ?? '', back: false })
  }
  return { boxes, links }
}

/** Marks the edges a depth-first walk in document order finds closing a cycle. */
function markBackEdges(size: number, links: FlowLink[]): void {
  const out: FlowLink[][] = Array.from({ length: size }, () => [])
  for (const link of links) out[link.from]?.push(link)
  const state = new Array<number>(size).fill(0) // 0 new, 1 on the path, 2 done
  for (let root = 0; root < size; root += 1) {
    if (state[root] !== 0) continue
    const stack: [number, number][] = [[root, 0]]
    state[root] = 1
    while (stack.length > 0) {
      const top = stack[stack.length - 1] as [number, number]
      const [node, next] = top
      const link = out[node]?.[next]
      if (link === undefined) {
        state[node] = 2
        stack.pop()
        continue
      }
      top[1] = next + 1
      if (state[link.to] === 1) link.back = true
      else if (state[link.to] === 0) {
        state[link.to] = 1
        stack.push([link.to, 0])
      }
    }
  }
}

/** Longest path from a source, over the edges that run forward. */
function assignLayers(boxes: FlowBox[], links: FlowLink[]): void {
  const forward = links.filter((link) => !link.back)
  const incoming = new Array<number>(boxes.length).fill(0)
  for (const { to } of forward) incoming[to] = (incoming[to] as number) + 1
  const ready = boxes.flatMap((_, index) => (incoming[index] === 0 ? [index] : []))
  for (let at = 0; at < ready.length; at += 1) {
    const node = ready[at] as number
    for (const { from, to } of forward) {
      if (from !== node) continue
      const box = boxes[to] as FlowBox
      box.layer = Math.max(box.layer, (boxes[node] as FlowBox).layer + 1)
      incoming[to] = (incoming[to] as number) - 1
      if (incoming[to] === 0) ready.push(to)
    }
  }
}

/** Barycenter sweeps, down then up: a stable sort by the mean row of each node's neighbors. */
function orderRows(boxes: FlowBox[], links: FlowLink[], layers: number): number {
  const columns: number[][] = Array.from({ length: layers }, () => [])
  for (const [index, box] of boxes.entries()) columns[box.layer]?.push(index)
  const place = () => {
    for (const column of columns)
      column.forEach((node, row) => ((boxes[node] as FlowBox).row = row))
  }
  place()
  for (let sweep = 0; sweep < SWEEPS; sweep += 1) {
    const down = sweep % 2 === 0
    const order = down ? columns.slice(1) : columns.slice(0, -1).reverse()
    for (const column of order) {
      const center = (node: number) => {
        let sum = 0
        let count = 0
        for (const { from, to } of links) {
          const other = down ? (to === node ? from : -1) : from === node ? to : -1
          const box = boxes[other]
          if (box === undefined || other === node) continue
          sum += box.row
          count += 1
        }
        return count === 0 ? (boxes[node] as FlowBox).row : sum / count
      }
      const keyed = column.map((node) => ({
        node,
        key: center(node),
        row: (boxes[node] as FlowBox).row,
      }))
      keyed.sort((a, b) => a.key - b.key || a.row - b.row)
      keyed.forEach(({ node }, row) => {
        column[row] = node
        ;(boxes[node] as FlowBox).row = row
      })
    }
  }
  return columns.reduce((most, column) => Math.max(most, column.length), 0)
}

export function layoutFlow(nodes: JsonValue[], edges: JsonValue[]): FlowLayout {
  const { boxes, links } = readGraph(nodes, edges)
  markBackEdges(boxes.length, links)
  assignLayers(boxes, links)
  const layers = boxes.reduce((most, box) => Math.max(most, box.layer + 1), 0)
  const rows = orderRows(boxes, links, layers)
  return { nodes: boxes, edges: links, layers, rows }
}
