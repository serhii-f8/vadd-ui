import { version } from 'react'
import { version as domVersion } from 'react-dom'
import { expect, it } from 'vitest'

// Each Vitest project names the React major it means to run (VD-143), so an alias that
// stopped working fails here instead of testing React 19 twice.
it('runs on the React this project names', () => {
  const wanted = process.env.VUI_REACT_MAJOR
  expect(wanted).toMatch(/^\d+$/)
  expect(version.split('.')[0]).toBe(wanted)
  expect(domVersion).toBe(version)
})
