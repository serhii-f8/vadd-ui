import { clip, type JsonValue } from '@vadd/ui-spec'
import { el } from './el.js'
import { foldable } from './fold.js'

const MAX_NAME = 60
const MAX_JSON = 2_000

export interface ErrorCard {
  /** The component type, when the node has one. */
  type?: string
  message: string
  /** The node's `id`, so `#id` links still land here. */
  id?: string
  /** The node's grid span, so its neighbors keep their places. */
  span?: number
}

export function errorCard({ type, message, id, span }: ErrorCard): HTMLElement {
  const name = type === undefined ? 'this node' : clip(type, MAX_NAME)
  return el('div', { class: 'vui-card vui-card-error', id, 'data-vui-span': span }, [
    el('p', { class: 'vui-card-title' }, `Could not render ${name}`),
    el('p', { class: 'vui-card-detail' }, message),
  ])
}

export function documentErrorCard(message: string, raw?: string): HTMLElement {
  return el('div', { class: 'vui-card vui-card-error' }, [
    el('p', { class: 'vui-card-title' }, 'Could not read this document'),
    el('p', { class: 'vui-card-detail' }, message),
    raw === undefined ? null : el('pre', { class: 'vui-pre' }, raw),
  ])
}

function toJson(node: JsonValue): string {
  return clip(JSON.stringify(node, null, 2), MAX_JSON)
}

/** The bundle that draws the §6 `ext` tier (VD-182), named where the core one cannot. */
export const EXT_BUNDLE = 'vui-ext.min.js'

/**
 * §9.3: a muted card with the type name and the raw node as folded JSON. `title` says why it
 * is not drawn: an unknown type, or an `ext` one in the core bundle (VD-219). `hint` is the
 * validator's, so the browser says what the CLI says.
 */
export function placeholderCard(
  title: string,
  node: JsonValue,
  open: boolean,
  onToggle: (open: boolean) => void,
  hint?: string,
): HTMLElement {
  const body = el('pre', { class: 'vui-pre' }, toJson(node))
  return el('div', { class: 'vui-card vui-card-placeholder' }, [
    el('p', { class: 'vui-card-title' }, title),
    hint === undefined ? null : el('p', { class: 'vui-card-detail' }, hint),
    ...foldable({ label: 'Raw node', body, open, onToggle }),
  ])
}
