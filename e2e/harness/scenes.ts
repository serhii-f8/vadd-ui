// Every core component adds a scene here (tasks 07 to 10). Each runs in `visual.spec.ts` at
// each width and scheme, against a committed baseline.

export interface Scene {
  name: string
  input: unknown
  /** Fixes `rel` and any other now-relative output. */
  now?: string
  /** Default `hidden`, since fixture types are unknown to the validator. */
  diagnostics?: 'hidden' | 'badge' | 'panel'
}

export const WIDTHS = [360, 720, 1100] as const

const LONG_TOKEN = 'a-long-unbroken-token-'.repeat(12)

export const SCENES: Scene[] = [
  {
    name: 'document',
    input: {
      title: 'Objective #14 — refresh-token rotation',
      subtitle: 'branch `vadd/obj-14` @ 4f2c1a9, :ok: ready',
      body: [
        {
          type: 'md',
          title: 'Summary',
          note: 'Measured on *main*.',
          text: '**Bold**, *italic*, `code`, ~~strike~~ and a [link](https://example.test/). :fail: :run:',
        },
        { type: 'md', title: 'Overflow', tone: 'warn', text: LONG_TOKEN },
      ],
    },
  },
  {
    name: 'comfortable',
    input: {
      title: 'Comfortable density',
      density: 'comfortable',
      body: [{ type: 'stack', title: 'Stack', children: ['First', 'Second'] }],
    },
  },
  { name: 'tones', input: [{ type: 'x-tones', title: 'Tones and statuses' }] },
  { name: 'values', input: [{ type: 'x-values', title: 'Formatted values' }] },
  {
    name: 'cards',
    input: [
      { type: 'hologram', depth: 3 },
      { type: 'md', id: 'broken' },
      { type: 'x-boom', title: 'A failing component' },
      { type: 'md', text: 'A healthy neighbor.', tone: 'neon' },
    ],
    diagnostics: 'panel',
  },
  {
    name: 'badge',
    input: [{ type: 'md', text: 'One warning.', tone: 'neon' }],
    diagnostics: 'badge',
  },
  { name: 'parse-error', input: "{title: 'Unclosed\nbody: [" },
  {
    name: 'folds',
    input: [
      { type: 'md', title: 'Closed fold', fold: 'closed', text: 'Hidden.' },
      { type: 'md', title: 'Open fold', fold: 'open', text: 'Shown.', note: 'With a note.' },
    ],
  },
]
