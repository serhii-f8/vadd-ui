import { describe, expect, it } from 'vitest'
import * as viewer from '../src/index.js'

describe('@vadd/ui-viewer', () => {
  it('exports its package name', () => {
    expect(viewer.packageName).toBe('@vadd/ui-viewer')
  })

  it('exports the mountable handler and the store it needs (VD-004)', () => {
    expect(viewer.createViewerHandler).toBeTypeOf('function')
    expect(viewer.DocStore).toBeTypeOf('function')
    expect(viewer.feedHtml).toContain('app.js')
    expect(viewer.readFeedScript).toBeTypeOf('function')
  })
})
