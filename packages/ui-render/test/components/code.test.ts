import { afterEach, describe, expect, it, vi } from 'vitest'
import { show } from '../helpers.js'

const numbered = (count: number) => Array.from({ length: count }, (_, i) => `l${i + 1}`).join('\n')
const code = (text: string, fields: object = {}) => ({ type: 'code', id: 'c', text, ...fields })
const toggleOf = (box: HTMLElement) => box.querySelector('.vui-fold-toggle') as HTMLElement
const copyOf = (box: HTMLElement) => box.querySelector('.vui-code-copy') as HTMLElement
const flush = () => vi.advanceTimersByTimeAsync(0)

function stubClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText === undefined ? undefined : { writeText },
  })
}

function stubExec(result: boolean | Error) {
  document.execCommand = (() => {
    if (result instanceof Error) throw result
    return result
  }) as never
}

afterEach(() => {
  vi.useRealTimers()
  stubClipboard(undefined)
  Reflect.deleteProperty(document, 'execCommand')
  document.getSelection()?.removeAllRanges()
})

describe('code body', () => {
  it('keeps plain text in one text node', () => {
    const { box } = show([code('a <b>\n  c')])
    const element = box.querySelector('pre code') as HTMLElement
    expect(element.childNodes).toHaveLength(1)
    expect(element.textContent).toBe('a <b>\n  c')
  })

  it('shows lang as a label', () => {
    const { box } = show([code('x', { lang: 'ts' })])
    expect(box.querySelector('.vui-code-lang')?.textContent).toBe('ts')
  })

  it('has no label without lang', () => {
    const { box } = show([code('x')])
    expect(box.querySelector('.vui-code-lang')).toBeNull()
  })

  it('numbers lines, out of reach of a screen reader', () => {
    const { box } = show([code('a\nb', { lines: true })])
    const numbers = [...box.querySelectorAll('.vui-code-no')]
    expect(numbers.map((item) => item.textContent)).toEqual(['1', '2'])
    expect(numbers[0]?.getAttribute('aria-hidden')).toBe('true')
    expect(box.querySelectorAll('.vui-code-text')[1]?.textContent).toBe('b')
  })

  it('marks lines with a mark element', () => {
    const { box } = show([code('a\nb\nc', { mark: [2] })])
    const marked = [...box.querySelectorAll('mark')]
    expect(marked.map((item) => item.textContent)).toEqual(['b'])
    expect(box.querySelectorAll('.vui-code-line')).toHaveLength(3)
  })

  it('counts a mark across the fold', () => {
    const { box } = show([code(numbered(45), { mark: [2, 40] })])
    const [head, tail] = box.querySelectorAll('pre')
    expect(head?.querySelector('mark')?.textContent).toBe('l2')
    expect(tail?.querySelector('mark')?.textContent).toBe('l40')
  })

  it('numbers on across the fold', () => {
    const { box } = show([code(numbered(32), { lines: true })])
    const tail = box.querySelectorAll('pre')[1]
    expect(tail?.querySelector('.vui-code-no')?.textContent).toBe('31')
  })

  it('ignores a mark that is not a line number', () => {
    const { box } = show([code('a\nb', { mark: ['x', 2] })])
    expect(box.querySelectorAll('mark')).toHaveLength(1)
  })

  it('does not count one trailing newline as a line', () => {
    const { box } = show([code('a\nb\n', { lines: true })])
    expect(box.querySelectorAll('.vui-code-no')).toHaveLength(2)
  })

  it('keeps a blank line in what a reader selects', () => {
    const { box } = show([code('a\n\nb', { lines: true })])
    expect(box.querySelectorAll('.vui-code-text')[1]?.textContent).toBe('\n')
  })

  it('takes a long mark list in its stride', () => {
    // Marks that miss make a linear lookup scan them all, and few lines keep the DOM's own cost
    // far from the budget, so this fails for that lookup and not for a busy machine.
    const lines = 1_500
    const mark = Array.from({ length: 500_000 }, (_, index) => index + lines - 1)
    const text = Array.from({ length: lines }, () => '').join('\n')
    const { box } = show([code(text, { mark, maxLines: lines })])
    expect(box.querySelector('.vui-card-error')).toBeNull()
    expect(box.querySelectorAll('mark')).toHaveLength(1)
  })

  it('renders empty text', () => {
    const { box } = show([code('', { lines: true })])
    expect(box.querySelectorAll('.vui-code-no')).toHaveLength(1)
  })
})

describe('code fold', () => {
  it('does not fold at 30 lines', () => {
    const { box } = show([code(numbered(30))])
    expect(toggleOf(box)).toBeNull()
    expect(box.querySelectorAll('pre')).toHaveLength(1)
  })

  it.each([
    [31, '1 more line'],
    [35, '5 more lines'],
  ])('folds %i lines behind "%s"', (count, label) => {
    const { box } = show([code(numbered(count))])
    const toggle = toggleOf(box)
    expect(toggle.textContent).toContain(label)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(box.querySelector('pre code')?.textContent?.split('\n')).toHaveLength(30)
    expect((box.querySelector('.vui-fold-body') as HTMLElement).hidden).toBe(true)
  })

  it('takes maxLines', () => {
    const { box } = show([code(numbered(5), { maxLines: 2 })])
    expect(toggleOf(box).textContent).toContain('3 more lines')
  })

  it('uses 30 when maxLines is dropped', () => {
    const { box } = show([code(numbered(31), { maxLines: 0 })])
    expect(toggleOf(box).textContent).toContain('1 more line')
  })

  it('keeps its state across update', () => {
    const { box, handle } = show([code(numbered(31))])
    toggleOf(box).click()
    handle.update({ vui: 1, body: [code(numbered(31))] } as never)
    expect(toggleOf(box).getAttribute('aria-expanded')).toBe('true')
  })
})

describe('copy (§9.3)', () => {
  it('writes the exact text, trailing newline and fold included', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(async () => {})
    stubClipboard(writeText)
    const text = `${numbered(40)}\n`
    const { box } = show([code(text, { lines: true })])
    copyOf(box).click()
    await flush()
    expect(writeText).toHaveBeenCalledWith(text)
    expect(copyOf(box).textContent).toBe('Copied')
  })

  it('goes back to Copy', async () => {
    vi.useFakeTimers()
    stubClipboard(async () => {})
    const { box } = show([code('x')])
    copyOf(box).click()
    await flush()
    await vi.advanceTimersByTimeAsync(1500)
    expect(copyOf(box).textContent).toBe('Copy')
  })

  it.each([
    ['is missing', undefined],
    ['rejects', () => Promise.reject(new Error('denied'))],
    [
      'throws',
      () => {
        throw new Error('denied')
      },
    ],
  ])('selects and uses execCommand when the API %s', async (_, writeText) => {
    vi.useFakeTimers()
    stubClipboard(writeText)
    stubExec(true)
    const { box } = show([code('hello')])
    copyOf(box).click()
    await flush()
    expect(copyOf(box).textContent).toBe('Copied')
    expect(document.getSelection()?.toString()).toContain('hello')
  })

  it.each([
    ['refuses', false],
    ['throws', new Error('denied')],
  ])('asks the reader to copy when execCommand %s', async (_, result) => {
    vi.useFakeTimers()
    stubClipboard(undefined)
    stubExec(result)
    const { box } = show([code('hello')])
    copyOf(box).click()
    await flush()
    expect(copyOf(box).textContent).toBe('Select text to copy')
    expect(document.getSelection()?.toString()).toContain('hello')
  })

  it('puts the exact text on the clipboard through the copy event', async () => {
    vi.useFakeTimers()
    stubClipboard(undefined)
    const text = 'a\n\n  b\n\n\nc\n'
    const setData = vi.fn()
    document.execCommand = (() => {
      const event = new Event('copy', { bubbles: true, cancelable: true })
      Object.assign(event, { clipboardData: { setData } })
      document.body.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      return true
    }) as never
    const { box } = show([code(text, { lines: true })])
    copyOf(box).click()
    await flush()
    expect(setData).toHaveBeenCalledWith('text/plain', text)
  })

  it('leaves later copy events alone', async () => {
    vi.useFakeTimers()
    stubClipboard(undefined)
    stubExec(true)
    const { box } = show([code('x')])
    copyOf(box).click()
    await flush()
    const event = new Event('copy', { bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('stays on the request while the text is selected', async () => {
    vi.useFakeTimers()
    stubClipboard(undefined)
    stubExec(false)
    const { box } = show([code('hello')])
    copyOf(box).click()
    await flush()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(copyOf(box).textContent).toBe('Select text to copy')
  })

  it('opens the fold first, so the selection has every line', async () => {
    vi.useFakeTimers()
    stubClipboard(undefined)
    stubExec(false)
    const { box } = show([code(numbered(31))])
    copyOf(box).click()
    await flush()
    expect(toggleOf(box).getAttribute('aria-expanded')).toBe('true')
    const selected = document.getSelection()?.toString() ?? ''
    expect(selected).toContain('l1\n')
    expect(selected).toContain('l31')
  })

  it('stops its timer on destroy', async () => {
    vi.useFakeTimers()
    stubClipboard(async () => {})
    const { box, handle } = show([code('x')])
    copyOf(box).click()
    await flush()
    expect(vi.getTimerCount()).toBe(1)
    handle.destroy()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('announces its label', () => {
    const { box } = show([code('x')])
    expect(copyOf(box).getAttribute('aria-live')).toBe('polite')
  })
})
