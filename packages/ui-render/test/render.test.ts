import type { VuiDocument } from '@vadd/ui-spec'
import { describe, expect, it, vi } from 'vitest'
import type { Registry } from '../src/context.js'
import { el } from '../src/el.js'
import { render as coreRender, stylesheet as coreStylesheet } from '../src/core.js'
import { render, stylesheet } from '../src/index.js'
import { createRenderer } from '../src/renderer.js'
import { target, testRegistry } from './helpers.js'

const show = createRenderer(testRegistry)
const doc = (body: unknown[], fields: object = {}) =>
  ({ body, ...fields }) as unknown as VuiDocument
const md = (text: string, fields: object = {}) => ({ type: 'md', text, ...fields })

describe('§9.1 API', () => {
  it('exports render and the stylesheet', () => {
    expect(typeof render).toBe('function')
    expect(stylesheet).toContain('.vui-root')
  })

  it('takes text or an object and returns a handle', () => {
    const box = target()
    const handle = show("[{type: 'md', text: 'hi'}]", box)
    expect(box.classList.contains('vui-root')).toBe(true)
    expect(box.textContent).toContain('hi')
    expect(handle.diagnostics).toEqual([])
    expect(typeof handle.update).toBe('function')
    expect(typeof handle.destroy).toBe('function')
    show(doc([md('object')]), box)
    expect(box.textContent).toContain('object')
  })

  it('draws an unregistered type as a placeholder through the public render', () => {
    const box = target()
    render(doc([{ type: 'gauge', value: 1 }]), box)
    expect(box.querySelector('.vui-card-placeholder')?.textContent).toContain('gauge')
  })

  it('draws the ext tier through the package root, and a placeholder through core (VD-182)', () => {
    const node = { type: 'compare', options: ['a'], criteria: [] }
    const full = target()
    render(doc([node]), full)
    expect(full.querySelector('.vui-compare')).not.toBeNull()
    const core = target()
    coreRender(doc([node]), core)
    expect(core.querySelector('.vui-card-placeholder')?.textContent).toContain('compare')
    expect(stylesheet.startsWith(coreStylesheet)).toBe(true)
    expect(stylesheet).toContain('.vui-compare')
    expect(coreStylesheet).not.toContain('.vui-compare')
  })

  it('draws the document title and subtitle', () => {
    const box = target()
    show(doc([], { title: 'T', subtitle: '**S**' }), box)
    expect(box.querySelector('h2.vui-title')?.textContent).toBe('T')
    expect(box.querySelector('.vui-subtitle strong')?.textContent).toBe('S')
  })

  it('sets density from the document', () => {
    const box = target()
    show(doc([], { density: 'comfortable' }), box)
    expect(box.getAttribute('data-vui-density')).toBe('comfortable')
  })

  it('defaults diagnostics to the badge', () => {
    const box = target()
    show(doc([md('x', { tone: 'neon' })]), box)
    expect(box.querySelector('.vui-diagnostics-badge')).not.toBeNull()
  })

  it.each(['hidden', 'panel'] as const)('honors diagnostics %s', (diagnostics) => {
    const box = target()
    show(doc([md('x', { tone: 'neon' })]), box, { diagnostics })
    expect(box.querySelector('.vui-diagnostics-badge')).toBeNull()
    expect(box.querySelector('.vui-diagnostics-panel') !== null).toBe(diagnostics === 'panel')
  })

  it('sends links to linkHandler', () => {
    const box = target()
    const linkHandler = vi.fn()
    show(doc([md('[a](https://a.test/)')]), box, { linkHandler })
    box.querySelector('a')?.click()
    expect(linkHandler).toHaveBeenCalledWith('https://a.test/')
  })

  it('renders a parse failure as a card with the raw lines', () => {
    const box = target()
    const handle = show('{oops', box)
    expect(box.querySelector('.vui-card-error')?.textContent).toContain('{oops')
    expect(handle.diagnostics[0]?.code).toBe('parse-error')
  })

  it('renders a document without a body as a card', () => {
    const box = target()
    expect(() => show(doc([], { body: 3 }), box)).not.toThrow()
    expect(box.querySelector('.vui-card-error')).not.toBeNull()
  })

  it('removes what it drew on destroy', () => {
    const box = target()
    const handle = show(doc([md('x')], { density: 'comfortable' }), box)
    handle.destroy()
    expect(box.childNodes).toHaveLength(0)
    expect(box.classList.contains('vui-root')).toBe(false)
    expect(box.hasAttribute('data-vui-density')).toBe(false)
  })

  it('leaves a .vui-root it did not add, as the boot script makes it', () => {
    const box = target()
    box.className = 'vui-root'
    show(doc([]), box).destroy()
    expect(box.classList.contains('vui-root')).toBe(true)
  })

  it('runs cleanups on update and destroy, surviving one that throws', () => {
    const cleanup = vi.fn()
    const registry: Registry = new Map([
      [
        'md',
        {
          render: (_, ctx) => {
            ctx.onDestroy(() => {
              throw new Error('no')
            })
            ctx.onDestroy(cleanup)
            return el('p')
          },
        },
      ],
    ])
    const handle = createRenderer(registry)(doc([md('x')]), target())
    handle.update(doc([md('y')]))
    expect(cleanup).toHaveBeenCalledTimes(1)
    handle.destroy()
    expect(cleanup).toHaveBeenCalledTimes(2)
  })
})

describe('Review Focus: bad calls', () => {
  it('tolerates a null target', () => {
    const handle = show(doc([]), null as never)
    expect(() => handle.update(doc([]))).not.toThrow()
    expect(() => handle.destroy()).not.toThrow()
    expect(handle.diagnostics[0]?.code).toBe('render-failed')
  })

  it('is inert after destroy', () => {
    const box = target()
    const handle = show(doc([md('x')]), box)
    handle.destroy()
    handle.update(doc([md('y')]))
    handle.destroy()
    expect(box.childNodes).toHaveLength(0)
  })

  it('ignores an invalid now', () => {
    const box = target()
    expect(() => show(doc([]), box, { now: new Date(Number.NaN) })).not.toThrow()
    expect(() => show(doc([]), box, { now: 'soon' as never })).not.toThrow()
  })

  it('keeps fold state across an update that fails to parse', () => {
    const box = target()
    const fold = doc([md('body', { id: 'a', title: 'T', fold: 'closed' })])
    const handle = show(fold, box)
    box.querySelector('button')?.click()
    handle.update('{broken')
    expect(box.querySelector('.vui-card-error')).not.toBeNull()
    expect(handle.diagnostics[0]?.code).toBe('parse-error')
    handle.update(fold)
    expect(box.querySelector('.vui-fold-toggle')?.getAttribute('aria-expanded')).toBe('true')
  })
})

describe('common node fields (§5.4)', () => {
  it('draws title and note', () => {
    const box = target()
    show(doc([md('x', { title: 'T', note: '*n*' })]), box)
    expect(box.querySelector('h3.vui-node-title')?.textContent).toBe('T')
    expect(box.querySelector('.vui-note em')?.textContent).toBe('n')
  })

  it('writes id and tone', () => {
    const box = target()
    show(doc([md('x', { id: 'part', tone: 'ok' })]), box)
    const node = box.querySelector('#part') as HTMLElement
    expect(node.classList.contains('vui-node')).toBe(true)
    expect(node.classList.contains('vui-tone-ok')).toBe(true)
  })

  it('writes span as a data attribute', () => {
    const box = target()
    show(doc([md('x', { span: 3 })]), box)
    expect(box.querySelector('.vui-node')?.getAttribute('data-vui-span')).toBe('3')
  })

  it('leaves a title to a component that owns it', () => {
    const registry: Registry = new Map([
      ['md', { ownsTitle: true, render: (node, ctx) => ctx.heading(String(node.title)) }],
    ])
    const box = target()
    createRenderer(registry)(doc([md('x', { title: 'Mine' })]), box)
    expect(box.querySelectorAll('.vui-node-title')).toHaveLength(1)
  })

  it('nests heading levels under titled nodes', () => {
    const box = target()
    show(doc([{ type: 'stack', title: 'A', children: [md('x', { title: 'B' })] }]), box)
    expect(box.querySelector('h3')?.textContent).toBe('A')
    expect(box.querySelector('h4')?.textContent).toBe('B')
  })

  it('caps heading levels at h6', () => {
    let node: object = md('x', { title: 'deep' })
    for (let index = 0; index < 8; index += 1) {
      node = { type: 'stack', title: `t${index}`, children: [node] }
    }
    const box = target()
    show(doc([node]), box)
    expect(box.querySelector('h6')).not.toBeNull()
  })
})

describe('fold', () => {
  const closed = md('body', { title: 'T', fold: 'closed' })

  it('starts as the document says', () => {
    const box = target()
    show(doc([closed]), box)
    const toggle = box.querySelector('button.vui-fold-toggle') as HTMLButtonElement
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.textContent).toContain('T')
    expect(box.querySelector<HTMLElement>('.vui-fold-body')?.hidden).toBe(true)
  })

  it('opens and closes on click', () => {
    const box = target()
    show(doc([md('body', { title: 'T', fold: 'open' })]), box)
    const toggle = box.querySelector('button.vui-fold-toggle') as HTMLButtonElement
    const body = box.querySelector('.vui-fold-body') as HTMLElement
    expect(body.hidden).toBe(false)
    toggle.click()
    expect(body.hidden).toBe(true)
    toggle.click()
    expect(body.hidden).toBe(false)
    expect(body.classList.contains('vui-fold-opening')).toBe(true)
  })

  it('needs a title, since the title is the toggle', () => {
    const box = target()
    show(doc([md('body', { fold: 'closed' })]), box)
    expect(box.querySelector('.vui-fold-toggle')).toBeNull()
    expect(box.textContent).toContain('body')
  })

  it('keeps fold state by id across update, even as the node moves', () => {
    const box = target()
    const first = md('one', { id: 'keep', title: 'T', fold: 'closed' })
    const handle = show(doc([first]), box)
    box.querySelector('button')?.click()
    handle.update(doc([md('new'), first]))
    expect(box.querySelector('.vui-fold-toggle')?.getAttribute('aria-expanded')).toBe('true')
  })

  it('keeps fold state by path without an id', () => {
    const box = target()
    const handle = show(doc([closed]), box)
    box.querySelector('button')?.click()
    handle.update(doc([closed]))
    expect(box.querySelector('.vui-fold-toggle')?.getAttribute('aria-expanded')).toBe('true')
  })

  it('offers components a named fold of their own', () => {
    const registry: Registry = new Map([
      [
        'md',
        {
          render: (_, ctx) => ctx.fold('log', 'Output', [el('p', {}, 'lines')], false),
        },
      ],
    ])
    const box = target()
    const handle = createRenderer(registry)(doc([md('x', { id: 'a' })]), box)
    box.querySelector('button')?.click()
    handle.update(doc([md('x', { id: 'a' })]))
    expect(box.querySelector('button')?.getAttribute('aria-expanded')).toBe('true')
  })
})

describe('a fold with a body built on demand', () => {
  const lazy = (calls: string[]): Registry =>
    new Map([
      [
        'md',
        {
          render: (_, ctx) =>
            ctx.fold(
              'hunk',
              'Hunk',
              () => {
                calls.push('built')
                return el('p', {}, 'lines')
              },
              false,
            ),
        },
      ],
    ])

  it('builds nothing while closed', () => {
    const calls: string[] = []
    const box = target()
    createRenderer(lazy(calls))(doc([md('x')]), box)
    expect(calls).toEqual([])
    expect(box.querySelector('.vui-fold-body')?.textContent).toBe('')
  })

  it('builds once, on the first open', () => {
    const calls: string[] = []
    const box = target()
    createRenderer(lazy(calls))(doc([md('x')]), box)
    const button = box.querySelector('button')
    button?.click()
    button?.click()
    button?.click()
    expect(calls).toEqual(['built'])
    expect(box.querySelector('.vui-fold-body')?.textContent).toBe('lines')
  })

  it('builds at render when a fold was left open', () => {
    const calls: string[] = []
    const box = target()
    const handle = createRenderer(lazy(calls))(doc([md('x', { id: 'a' })]), box)
    box.querySelector('button')?.click()
    handle.update(doc([md('x', { id: 'a' })]))
    expect(box.querySelector('.vui-fold-body')?.textContent).toBe('lines')
    expect(calls).toEqual(['built', 'built'])
  })
})

describe('component state', () => {
  const registry: Registry = new Map([
    [
      'md',
      {
        render: (_, ctx) =>
          el(
            'button',
            {
              on: {
                click: () => {
                  ctx.state.set('sort', 'desc')
                },
              },
            },
            String(ctx.state.get('sort') ?? 'none'),
          ),
      },
    ],
  ])

  it('survives update by id', () => {
    const box = target()
    const handle = createRenderer(registry)(doc([md('x', { id: 's' })]), box)
    box.querySelector('button')?.click()
    handle.update(doc([md('other'), md('x', { id: 's' })]))
    expect(box.querySelector('#s button')?.textContent).toBe('desc')
  })

  it('stays apart for a repeated or hostile id', () => {
    const box = target()
    const handle = createRenderer(registry)(
      doc([md('a', { id: '__proto__' }), md('b', { id: '__proto__' })]),
      box,
    )
    const buttons = box.querySelectorAll('button')
    buttons[0]?.click()
    handle.update(doc([md('a', { id: '__proto__' }), md('b', { id: '__proto__' })]))
    const after = box.querySelectorAll('button')
    expect(after[0]?.textContent).toBe('desc')
    expect(after[1]?.textContent).toBe('none')
    expect(box.querySelectorAll('[id="__proto__"]')).toHaveLength(1)
    expect(({} as { sort?: string }).sort).toBeUndefined()
  })

  it('does not hand one type the state of another at the same path', () => {
    const both: Registry = new Map([...registry, ['callout', registry.get('md') as never]])
    const box = target()
    const handle = createRenderer(both)(doc([md('x')]), box)
    box.querySelector('button')?.click()
    handle.update(doc([{ type: 'callout', text: 'y' }]))
    expect(box.querySelector('button')?.textContent).toBe('none')
  })
})

describe('formatting', () => {
  const registry: Registry = new Map([
    [
      'md',
      {
        render: (node, ctx) =>
          el(
            'p',
            {},
            ctx.value(node.value as never, node.format as string, `${ctx.pointer}/value`),
          ),
      },
    ],
  ])
  const rel = (fields: object, now?: Date) => {
    const box = target()
    const value = { type: 'md', text: 'x', value: '2026-01-01T00:00:00Z', format: 'rel' }
    const handle = createRenderer(registry)(doc([value], fields), box, now ? { now } : {})
    return { text: box.textContent, handle }
  }

  it('uses generatedAt as now', () => {
    expect(rel({ generatedAt: '2026-01-01T00:03:00Z' }).text).toContain('3 min ago')
  })

  it('lets the now option win', () => {
    const now = new Date('2026-01-01T02:00:00Z')
    expect(rel({ generatedAt: '2026-01-01T00:03:00Z' }, now).text).toContain('2 hr ago')
  })

  it('never reads a clock: no now means an absolute date and a warn', () => {
    const { text, handle } = rel({})
    expect(text).toContain('2026')
    expect(handle.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'warn', path: '/body/0/value' }),
    )
  })

  it('adds a pointer to a format issue, once', () => {
    const value = { type: 'md', text: 'x', value: 'abc', format: 'num' }
    const render2 = createRenderer(registry)
    const handle = render2(doc([value]), target())
    const issues = handle.diagnostics.filter(({ code }) => code === 'bad-value')
    expect(issues).toEqual([expect.objectContaining({ severity: 'warn', path: '/body/0/value' })])
    expect(issues).toHaveLength(1)
  })
})

describe('fold title (§15.2)', () => {
  it('nests no link in the toggle, keeping the text and marks plain', () => {
    const box = target()
    show(doc([md('t', { title: 'see **[x](https://a.test/)** now', fold: 'closed' })]), box)
    const toggle = box.querySelector('.vui-fold-toggle') as HTMLElement
    expect(toggle.querySelector('a')).toBeNull()
    expect(toggle.textContent).toContain('see x now')
  })
})
