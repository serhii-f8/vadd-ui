import { STATUSES, TONES } from '@vadd/ui-spec'
import type { Component, Registry } from '../../packages/ui-render/src/context.js'
import { el } from '../../packages/ui-render/src/el.js'
import { statusBadge, toneClass } from '../../packages/ui-render/src/inline.js'

// Just enough components to exercise the core. Real ones with these names win (see `entry.ts`).

const md: Component = {
  render: (node, ctx) => el('p', { class: 'vui-note' }, ctx.inline(String(node.text))),
}

const stack: Component = {
  render: (node, ctx) =>
    el(
      'div',
      { class: 'vui-doc' },
      ctx.children(node.children as never, `${ctx.pointer}/children`),
    ),
}

const tones: Component = {
  render: () =>
    el('div', { class: 'vui-node' }, [
      el(
        'p',
        { class: 'vui-doc' },
        TONES.map((tone) => el('span', { class: toneClass(tone) }, `Tone ${tone} text`)),
      ),
      el(
        'p',
        {},
        STATUSES.flatMap((status) => [statusBadge(status), ' ']),
      ),
    ]),
}

const VALUES: [number | string, string][] = [
  [1234.5, 'num'],
  [0.874, 'pct'],
  [1234.5, 'money:PLN'],
  [-0.012, 'delta:pct'],
  [48200, 'ms'],
  [1500000, 'bytes'],
  ['packages/ui-render/src/renderer.ts', 'path'],
  ['https://example.test/a', 'link'],
  ['4f2c1a9d3e', 'sha'],
  ['fail', 'status'],
  ['not a number', 'num'],
]

const values: Component = {
  render: (_, ctx) =>
    el(
      'div',
      { class: 'vui-doc vui-num' },
      VALUES.map(([value, format], index) =>
        el('div', {}, ctx.value(value, format, `${ctx.pointer}/values/${index}`)),
      ),
    ),
}

const tall: Component = {
  render: (node) =>
    el(
      'div',
      {},
      Array.from({ length: Number(node.lines) }, (_, index) => el('p', {}, `Line ${index + 1}`)),
    ),
}

const boom: Component = {
  render: () => {
    throw new Error('fixture failure')
  },
}

export const FIXTURES: Registry = new Map([
  ['md', md],
  ['stack', stack],
  ['x-tones', tones],
  ['x-values', values],
  ['x-tall', tall],
  ['x-boom', boom],
])
