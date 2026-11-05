import type { Component, Registry } from '../../packages/ui-render/src/context.js'
import { el } from '../../packages/ui-render/src/el.js'
import { statusBadge, toneClass } from '../../packages/ui-render/src/inline.js'
import { STATUSES, TONES } from '../../packages/ui-spec/src/index.js'

// Components only the harness has, to exercise the core.

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
  ['x-tones', tones],
  ['x-values', values],
  ['x-tall', tall],
  ['x-boom', boom],
])
