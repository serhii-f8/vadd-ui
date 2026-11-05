import { describe, expect, it } from 'vitest'
import { validCases } from '../../../ui-spec/test/corpus/cases.js'
import { show } from '../helpers.js'

describe('the conformance corpus', () => {
  it.each(validCases.map((item) => [item.name, item.text ?? item.input] as const))(
    '%s',
    (_, input) => {
      const { box, handle } = show([])
      handle.update(input as never)
      expect(box.querySelector('.vui-card-error')).toBeNull()
    },
  )
})
