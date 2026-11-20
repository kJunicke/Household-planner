import { describe, expect, it } from 'vitest'

import { createRecheckLimiter } from './recheckLimiter'

describe('createRecheckLimiter', () => {
  it('lässt die erste Nachfrage sofort durch', () => {
    expect(createRecheckLimiter(3000)(1000)).toBe(true)
  })

  it('fasst eine Salve von Anlässen zu einer Nachfrage zusammen', () => {
    const allow = createRecheckLimiter(3000)
    expect(allow(1000)).toBe(true)
    expect(allow(1500)).toBe(false)
    expect(allow(3999)).toBe(false)
    expect(allow(4000)).toBe(true)
  })
})
