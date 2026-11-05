import { describe, expect, it } from 'vitest'
import { el } from '../src/el.js'

describe('el', () => {
  it('builds an element with attributes and text children', () => {
    const node = el('div', { class: 'vui-a vui-b', role: 'note' }, ['hello ', el('b', {}, ['x'])])
    expect(node.tagName).toBe('DIV')
    expect(node.getAttribute('class')).toBe('vui-a vui-b')
    expect(node.getAttribute('role')).toBe('note')
    expect(node.textContent).toBe('hello x')
  })

  it('keeps markup in text as text', () => {
    const node = el('p', {}, ['<img src=x onerror=alert(1)>'])
    expect(node.children).toHaveLength(0)
    expect(node.textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it('accepts one child, skips null and false, and numbers become text', () => {
    expect(el('p', {}, 'one').textContent).toBe('one')
    expect(el('p', {}, ['a', null, undefined, false, 2]).textContent).toBe('a2')
    expect(el('p').childNodes).toHaveLength(0)
  })

  it.each([
    'script',
    'style',
    'iframe',
    'object',
    'embed',
    'form',
    'base',
    'meta',
    'link',
    'img',
    'SCRIPT',
  ])('refuses the tag %s', (tag) => {
    expect(() => el(tag as 'div')).toThrow(/tag/)
  })

  it.each([
    'style',
    'onclick',
    'onerror',
    'src',
    'srcset',
    'formaction',
    'action',
    'background',
    'data-x',
    'xlink:href',
    'ping',
    'target',
  ])('refuses the attribute %s', (name) => {
    expect(() => el('div', { [name]: 'x' })).toThrow(/attribute/)
  })

  it('takes aria and data-vui attributes', () => {
    const node = el('button', { 'aria-expanded': 'false', 'data-vui-type': 'x' })
    expect(node.getAttribute('aria-expanded')).toBe('false')
    expect(node.getAttribute('data-vui-type')).toBe('x')
  })

  it('renders booleans as presence and skips undefined', () => {
    const node = el('button', { hidden: true, disabled: false, title: undefined, tabindex: 0 })
    expect(node.hasAttribute('hidden')).toBe(true)
    expect(node.hasAttribute('disabled')).toBe(false)
    expect(node.hasAttribute('title')).toBe(false)
    expect(node.getAttribute('tabindex')).toBe('0')
  })

  it('refuses a class that is not an internal vui name', () => {
    expect(() => el('div', { class: 'evil' })).toThrow(/class/)
    expect(() => el('div', { class: 'vui-a" onclick="x' })).toThrow(/class/)
  })

  it('stores a hostile id as data', () => {
    expect(el('div', { id: '"><script>' }).id).toBe('"><script>')
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,x',
    'vbscript:x',
    'file:///etc/passwd',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    '//evil.test',
  ])('never sets the href %j', (href) => {
    const node = el('a', { href }, ['x'])
    expect(node.hasAttribute('href')).toBe(false)
  })

  it.each([
    'https://a.test/',
    'http://a.test/x?y=1',
    'mailto:a@b.test',
    '#section',
  ])('sets the href %s', (href) => {
    expect(el('a', { href }).getAttribute('href')).toBe(href)
  })

  it('gives every anchor the §15.1 rel', () => {
    expect(el('a', { href: 'https://a.test/' }).getAttribute('rel')).toBe('noopener noreferrer')
    expect(() => el('a', { rel: 'opener' })).toThrow(/attribute/)
  })

  it('attaches listeners through `on`', () => {
    let clicks = 0
    const node = el('button', {
      on: {
        click: () => {
          clicks += 1
        },
      },
    })
    node.click()
    expect(clicks).toBe(1)
    expect(node.getAttributeNames()).toEqual([])
  })
})
