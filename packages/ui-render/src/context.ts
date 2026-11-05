import type { Formatted, JsonObject, JsonValue, Tone } from '@vadd/ui-spec'
import type { Child } from './el.js'

/** What a component gets besides its node. Tasks 07 to 10 build on this. */
export interface NodeContext {
  /** The node's canonical JSON Pointer. */
  readonly pointer: string
  readonly locale: string
  /** Memory that outlives `update`, keyed by node `id` or path (§9.1, §9.3). */
  readonly state: Map<string, unknown>
  /** The heading level of this node's content: one below its title, if it has one. */
  readonly level: number
  /** True when the wrapper already drew `title`, as the toggle of a fold. */
  readonly titleDrawn: boolean
  /** §7, reporting any issue as a `warn` at `pointer`. */
  format(value: JsonValue | undefined, format: string | undefined, pointer: string): Formatted
  /** `format`, as nodes. */
  value(value: JsonValue | undefined, format: string | undefined, pointer: string): Node[]
  /** §5.5 inline text, as nodes. */
  inline(text: string): Node[]
  /** The heading for inline text, at `level`, or at this node's own by default. */
  heading(text: string, level?: number): HTMLElement
  /** One child node, isolated like any other. */
  child(node: JsonValue, pointer: string): HTMLElement
  /** The nodes of a list at `pointer`. */
  children(nodes: JsonValue[], pointer: string): HTMLElement[]
  /** A fold whose open state lives under `name` in `state`. `label` sits in a button: no links. */
  fold(name: string, label: Child | Child[], body: Child | Child[], open: boolean): HTMLElement[]
  /** The VD-008 checkpoint. Call it in loops over document data. */
  checkpoint(): void
  /** Runs on `update` and `destroy`. */
  onDestroy(cleanup: () => void): void
}

export interface Component {
  /** Reads fields that passed `prepare`. It must still accept what the types do not promise. */
  render(node: JsonObject, context: NodeContext): Child | Child[]
  /** The component draws `title` itself, as a `table` caption. */
  ownsTitle?: boolean
  /** The tone of a node with none, as a `callout`'s `info` (VD-060: a drop can remove it). */
  tone?: Tone
}

export type Registry = ReadonlyMap<string, Component>
