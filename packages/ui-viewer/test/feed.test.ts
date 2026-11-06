import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { feedHtml, readFeed } from '../src/feed.js'
import { tempDir } from './helpers.js'

describe('feedHtml', () => {
  it('loads its script as a file, since the §15.3 CSP blocks an inline one (VD-006)', () => {
    expect(feedHtml).toContain('<script src="app.js" defer></script>')
    expect(feedHtml.match(/<script/g)).toHaveLength(1)
  })

  it('declares an inline data: favicon (§4.1)', () => {
    expect(feedHtml).toMatch(/<link rel="icon" href="data:image\/svg\+xml,[^"]+">/)
  })

  it('lays out at the device width (VD-098)', () => {
    expect(feedHtml).toContain('<meta name="viewport" content="width=device-width,initial-scale=1">')
  })

  it('offers both schemes, so a dark OS gets a dark canvas before the script runs', () => {
    expect(feedHtml).toContain('<meta name="color-scheme" content="light dark">')
  })
})

describe('readFeed', () => {
  it('pairs the page with the bundle it finds', () => {
    const file = join(tempDir(), 'app.js')
    writeFileSync(file, 'bundle()')
    expect(readFeed(pathToFileURL(file))).toEqual({ html: feedHtml, script: 'bundle()' })
  })
})
