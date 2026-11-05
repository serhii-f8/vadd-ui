import { TONES } from '../../packages/ui-spec/src/index.js'

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

const callout = (text: string) => ({ type: 'callout', text })
const paragraph = { type: 'md', text: 'Some text in a paragraph, long enough to show how it sits.' }
const cards = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    type: 'card',
    title: `Card ${index + 1}`,
    children: [],
  }))

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
  {
    name: 'stack',
    input: [
      { type: 'stack', title: 'Small gap', gap: 'sm', children: [callout('One'), callout('Two')] },
      { type: 'stack', title: 'Default gap', children: [callout('One'), callout('Two')] },
      { type: 'stack', title: 'Large gap', gap: 'lg', children: [callout('One'), callout('Two')] },
    ],
  },
  {
    name: 'grid',
    input: [
      { type: 'grid', title: 'Auto, three children', children: cards(3) },
      { type: 'grid', title: 'Auto, four children', children: cards(4) },
      { type: 'grid', title: 'Auto, seven children', children: cards(7) },
      {
        type: 'grid',
        title: 'Four columns with spans',
        cols: 4,
        children: [
          { type: 'card', title: 'Span 3', span: 3, children: [] },
          { type: 'card', title: 'One', children: [] },
          { type: 'card', title: 'Past the end', span: 12, children: [] },
        ],
      },
      {
        type: 'grid',
        title: 'Nested',
        cols: 2,
        children: [
          { type: 'grid', cols: 2, children: cards(2) },
          { type: 'card', title: 'Neighbor', children: [] },
        ],
      },
    ],
  },
  {
    name: 'section',
    input: [
      {
        type: 'section',
        title: 'Rollout',
        note: 'Updated by the agent.',
        children: [
          { type: 'md', text: 'A section holds **content**.' },
          {
            type: 'section',
            title: 'A nested section',
            children: [{ type: 'md', text: 'One level down.' }],
          },
        ],
      },
      { type: 'section', title: 'Closed', fold: 'closed', children: [callout('Hidden')] },
      { type: 'section', title: 'Open', fold: 'open', children: [callout('Shown')] },
    ],
  },
  {
    name: 'card',
    input: [
      { type: 'card', title: 'Plain card', note: 'With a note.', children: [paragraph] },
      ...TONES.map((tone) => ({
        type: 'card',
        title: `Tone ${tone}`,
        tone,
        children: [paragraph],
      })),
      { type: 'md', title: 'Tone on another node', tone: 'err', text: 'Any node has a bar.' },
      { type: 'md', title: 'Muted', tone: 'muted', text: 'A bar and no mark.' },
    ],
  },
  {
    name: 'tabs',
    input: [
      {
        type: 'tabs',
        title: 'First tab open',
        tabs: [
          { label: 'Summary', children: [paragraph] },
          { label: 'Details', children: [callout('Second panel')] },
          { label: 'A rather long tab label', children: [] },
        ],
      },
      {
        type: 'tabs',
        title: 'Starts on the second',
        active: 1,
        tabs: [
          { label: 'One', children: [paragraph] },
          { label: 'Two', children: [callout('Second panel')] },
        ],
      },
    ],
  },
  {
    name: 'divider',
    input: [
      paragraph,
      { type: 'divider' },
      paragraph,
      { type: 'divider', label: 'Earlier runs' },
      paragraph,
    ],
  },
  {
    name: 'md',
    input: [
      {
        type: 'md',
        text: [
          '### Heading three',
          'A paragraph with **bold**, *italic*, `code`, ~~strike~~, a [link](https://example.test/) and :warn: a status.',
          '#### Heading four',
          '- First\n- Second\n  1. Nested one\n  2. Nested two\n- Third',
          '> A quote keeps its *inline* text.\n>\n> And its paragraphs.',
          '```ts\nconst answer = 42\n```',
          'Not markup: <b>tags</b> and ## two hashes.',
        ].join('\n\n'),
      },
    ],
  },
  {
    name: 'callout',
    input: [
      callout('Info by default, with a [link](https://example.test/) and `code`.'),
      {
        type: 'callout',
        title: 'With a title',
        note: 'And a note.',
        tone: 'warn',
        text: 'Check the *rollout* first.',
      },
      ...TONES.map((tone) => ({ type: 'callout', tone, text: `Tone ${tone}.` })),
    ],
  },
  {
    name: 'code',
    input: [
      {
        type: 'code',
        title: 'Lines and marks',
        lang: 'ts',
        lines: true,
        mark: [2],
        text: 'const a = 1\nconst b = a + 1\n\nexport { a, b } // and a long comment that has to wrap on the narrowest width we support\n',
      },
      { type: 'code', text: 'plain text, no label' },
      { type: 'code', lang: 'log', maxLines: 3, text: 'l1\nl2\nl3\nl4\nl5' },
      { type: 'code', lines: true, mark: [2], text: LONG_TOKEN },
    ],
  },
]
