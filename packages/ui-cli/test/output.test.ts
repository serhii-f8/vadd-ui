import type { VuiDocument } from '@vadd/ui-spec'
import { describe, expect, it } from 'vitest'
import { renderOutput } from '../src/output.js'

const doc = (body: unknown[]): VuiDocument => ({ vui: 1, body }) as VuiDocument

describe('renderOutput picks the bundle by tier (VD-182)', () => {
  const readBundle = (ext?: boolean) => (ext === true ? '/*ext*/' : '/*core*/')

  it('inlines the ext bundle for a document with an ext node, however deep', () => {
    const nested = doc([{ type: 'section', title: 's', children: [{ type: 'compare' }] }])
    const html = renderOutput(nested, { format: 'html', readBundle })
    expect(html).toContain('<script>/*ext*/</script>')
    const scatter = doc([{ type: 'chart', kind: 'scatter', points: [[1, 2]] }])
    expect(renderOutput(scatter, { format: 'html', readBundle })).toContain('/*ext*/')
  })

  it('inlines the core bundle otherwise', () => {
    const html = renderOutput(doc([{ type: 'md', text: 'hi' }]), { format: 'html', readBundle })
    expect(html).toContain('<script>/*core*/</script>')
    expect(html).not.toContain('/*ext*/')
  })
})
