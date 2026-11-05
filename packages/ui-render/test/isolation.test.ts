import type { JsonObject, VuiDocument } from '@vadd/ui-spec'
import { describe, expect, it, vi } from 'vitest'
import type { NodeContext, Registry } from '../src/context.js'
import { el } from '../src/el.js'
import { createRenderer } from '../src/renderer.js'
import { target, testRegistry } from './helpers.js'

const doc = (body: unknown[]) => ({ body }) as unknown as VuiDocument

const spin = (ms: number) => {
  const end = performance.now() + ms
  while (performance.now() < end);
}

function withBoom(render: Registry extends ReadonlyMap<string, infer C> ? C : never): Registry {
  return new Map([...testRegistry, ['callout', render]])
}

const good = { type: 'md', text: 'fine' }
const bad = { type: 'callout', text: 'boom', id: 'bad' }

describe('error isolation', () => {
  const thrower = withBoom({
    render: () => {
      throw new Error('component bug')
    },
  })

  it('turns a throwing component into a card for that node only', () => {
    const box = target()
    const handle = createRenderer(thrower)(doc([good, bad, good]), box)
    expect(box.querySelectorAll('.vui-card-error')).toHaveLength(1)
    expect(box.querySelectorAll('.vui-node p')).toHaveLength(2)
    expect(box.querySelector('#bad')?.classList.contains('vui-card-error')).toBe(true)
    expect(handle.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'render-failed', path: '/body/1' }),
    )
  })

  it('keeps siblings inside a parent', () => {
    const box = target()
    createRenderer(thrower)(doc([{ type: 'stack', children: [bad, good] }]), box)
    expect(box.querySelectorAll('.vui-card-error')).toHaveLength(1)
    expect(box.querySelector('[data-vui-type="md"] p')?.textContent).toBe('fine')
  })

  it('catches a non-Error throw', () => {
    const box = target()
    const registry = withBoom({
      render: () => {
        throw 'text'
      },
    })
    expect(() => createRenderer(registry)(doc([bad]), box)).not.toThrow()
    expect(box.querySelector('.vui-card-error')).not.toBeNull()
  })

  it('catches a banned tag from a component', () => {
    const box = target()
    const registry = withBoom({ render: () => el('script' as 'div') })
    createRenderer(registry)(doc([bad]), box)
    expect(box.querySelector('script')).toBeNull()
    expect(box.querySelector('.vui-card-error')).not.toBeNull()
  })

  it('catches a render that returns garbage', () => {
    const box = target()
    const registry = withBoom({ render: () => ({ nope: true }) as never })
    expect(() => createRenderer(registry)(doc([bad, good]), box)).not.toThrow()
    expect(box.querySelector('[data-vui-type="md"] p')?.textContent).toBe('fine')
    expect(box.querySelector('.vui-card-error')).not.toBeNull()
  })

  it('never throws to the host from a failure outside the node guard', () => {
    const box = target()
    const registry = {
      get() {
        throw new Error('registry')
      },
    } as unknown as Registry
    expect(() => createRenderer(registry)(doc([good]), box)).not.toThrow()
    expect(box.querySelector('.vui-card-error')).not.toBeNull()
  })

  it('never throws from a target that breaks', () => {
    const box = target()
    box.replaceChildren = () => {
      throw new Error('host')
    }
    const handle = createRenderer(testRegistry)(doc([good]), box)
    expect(handle.diagnostics[0]?.code).toBe('render-failed')
  })
})

describe('validator errors', () => {
  it('draws a node with an error as a card', () => {
    const box = target()
    const handle = createRenderer(testRegistry)(doc([{ type: 'md' }, good]), box)
    expect(box.querySelectorAll('.vui-card-error')).toHaveLength(1)
    expect(box.querySelector('.vui-card-error')?.textContent).toContain('missing required field')
    expect(box.querySelector('[data-vui-type="md"] p')?.textContent).toBe('fine')
    expect(handle.diagnostics[0]).toMatchObject({ severity: 'error', code: 'missing-field' })
  })

  it('draws a slot with no node as a card', () => {
    const box = target()
    createRenderer(testRegistry)(doc([42]), box)
    expect(box.querySelector('.vui-card-error')).not.toBeNull()
  })

  it('draws an unknown component as a muted placeholder with folded JSON', () => {
    const box = target()
    createRenderer(testRegistry)(doc([{ type: 'hologram', depth: 3 }]), box)
    const card = box.querySelector('.vui-card-placeholder') as HTMLElement
    expect(card.textContent).toContain('hologram')
    expect(card.querySelector('.vui-fold-toggle')?.getAttribute('aria-expanded')).toBe('false')
    expect(card.querySelector<HTMLElement>('.vui-fold-body')?.hidden).toBe(true)
    expect(card.querySelector('pre')?.textContent).toContain('"depth": 3')
  })

  it('keeps hostile text in a placeholder as text', () => {
    const box = target()
    createRenderer(testRegistry)(doc([{ type: '<img src=x onerror=y>' }]), box)
    expect(box.querySelector('img')).toBeNull()
  })
})

describe('watchdog', () => {
  const clockwork = (ms: number) => {
    let time = 0
    const clock = () => time
    const registry = withBoom({
      render: (_, ctx) => {
        for (let index = 0; index < 5; index += 1) {
          time += ms
          ctx.checkpoint()
        }
        return el('p', {}, 'done')
      },
    })
    return createRenderer(registry, clock)
  }

  it('stops a component at a checkpoint past 200 ms', () => {
    const box = target()
    const handle = clockwork(50)(doc([bad, good]), box)
    expect(box.querySelector('#bad')?.classList.contains('vui-card-error')).toBe(true)
    expect(box.querySelector('[data-vui-type="md"] p')?.textContent).toBe('fine')
    expect(handle.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'render-budget', path: '/body/0' }),
    )
  })

  it('leaves a component inside the budget alone', () => {
    const box = target()
    const handle = clockwork(10)(doc([bad]), box)
    expect(box.querySelector('.vui-card-error')).toBeNull()
    expect(handle.diagnostics).toEqual([])
  })

  it('catches a component with no checkpoints when it returns', () => {
    const box = target()
    const registry = withBoom({
      render: () => {
        spin(210)
        return el('p', {}, 'late')
      },
    })
    const handle = createRenderer(registry)(doc([bad, good]), box)
    expect(box.querySelector('#bad')?.classList.contains('vui-card-error')).toBe(true)
    expect(handle.diagnostics[0]?.code).toBe('render-budget')
  })

  it('does not blame a parent for its children', () => {
    const box = target()
    let time = 0
    const registry: Registry = new Map([
      [
        'stack',
        {
          render: (node: JsonObject, ctx: NodeContext) =>
            el('div', {}, ctx.children(node.children as never, `${ctx.pointer}/children`)),
        },
      ],
      [
        'md',
        {
          render: () => {
            time += 150
            return el('p', {}, 'ok')
          },
        },
      ],
    ])
    createRenderer(registry, () => time)(
      doc([{ type: 'stack', children: [good, good, good, good] }]),
      box,
    )
    expect(box.querySelector('.vui-card-error')).toBeNull()
    expect(box.querySelectorAll('p')).toHaveLength(4)
  })

  it('tells the reader what happened', () => {
    const box = target()
    clockwork(50)(doc([bad]), box)
    expect(box.querySelector('.vui-card-error')?.textContent).toMatch(/200 ms/)
  })

  it('runs no timer of its own', () => {
    const timer = vi.spyOn(globalThis, 'setTimeout')
    createRenderer(testRegistry)(doc([good]), target())
    expect(timer).not.toHaveBeenCalled()
    timer.mockRestore()
  })
})

describe('review findings', () => {
  const healthy = { type: 'md', text: 'healthy' }

  it('keeps a bad span on an unknown node away from its siblings', () => {
    const box = target()
    createRenderer(testRegistry)(doc([{ type: 'nope', span: { toString: 1 } }, healthy]), box)
    expect(box.textContent).toContain('healthy')
    expect(box.textContent).not.toContain('could not be rendered')
  })

  it.each([[{ a: 1 }], ['<x>'], [null]])('writes no span from %j', (span) => {
    const box = target()
    createRenderer(testRegistry)(doc([{ type: 'nope', span }]), box)
    expect(box.querySelector('[data-vui-span]')).toBeNull()
  })

  it('frees the ids of a failed subtree', () => {
    const registry: Registry = new Map([
      ...testRegistry,
      [
        'callout',
        {
          render: (node, ctx) => {
            ctx.children(node.children as never, `${ctx.pointer}/children`)
            throw new Error('after children')
          },
        },
      ],
    ])
    const box = target()
    const failing = { type: 'callout', text: 'x', children: [{ type: 'md', text: 'y', id: 'x' }] }
    createRenderer(registry)(doc([failing, { type: 'md', text: 'z', id: 'x' }]), box)
    expect(box.querySelector('#x')?.textContent).toBe('z')
  })

  it('keeps the grid span of a failed node', () => {
    const box = target()
    createRenderer(testRegistry)(doc([{ type: 'md', span: 3 }]), box)
    expect(box.querySelector('.vui-card-error')?.getAttribute('data-vui-span')).toBe('3')
  })

  it('hands components a locale that is safe to use', () => {
    let seen = ''
    const registry: Registry = new Map([
      [
        'md',
        {
          render: (_, ctx) => {
            seen = ctx.locale
            return el('p', {}, 'a'.localeCompare('b', ctx.locale))
          },
        },
      ],
    ])
    const box = target()
    const input = { locale: 'not a locale!!', body: [{ type: 'md', text: 'x' }] }
    createRenderer(registry)(input as unknown as VuiDocument, box)
    expect(seen).toBe('en-US')
    expect(box.querySelector('.vui-card-error')).toBeNull()
  })

  it('stays inert on a target that is no element', () => {
    const fragment = document.createDocumentFragment() as unknown as HTMLElement
    const handle = createRenderer(testRegistry)(doc([healthy]), fragment)
    expect(handle.diagnostics[0]?.code).toBe('render-failed')
  })
})
