import { describe, expect, it } from 'vitest'

import { createHistoryExpiry } from './historyExpiry'

const MINUTE = 60_000
const earlier = ['Milch auf die Liste', 'Erledigt.']

function askedAgainAfter(minutes: number) {
  let now = 0
  const expiry = createHistoryExpiry(() => now)
  expiry.startQuestion([])
  now = minutes * MINUTE
  return expiry.startQuestion(earlier)
}

describe('history expiry', () => {
  it('keeps the history 29 minutes after the last question', () => {
    expect(askedAgainAfter(29)).toEqual({ history: earlier, fresh: false })
  })

  it('drops the history 31 minutes after the last question', () => {
    expect(askedAgainAfter(31)).toEqual({ history: [], fresh: true })
  })
})
