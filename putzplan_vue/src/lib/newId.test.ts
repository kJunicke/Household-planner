import { describe, expect, it } from 'vitest'

import { newId } from './newId'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newId', () => {
  it('nimmt randomUUID, wo es das gibt', () => {
    const id = newId({
      randomUUID: () => '11111111-1111-4111-8111-111111111111',
    } as unknown as Crypto)
    expect(id).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('baut ohne randomUUID (http im LAN) eine gültige UUID v4 aus getRandomValues', () => {
    const fake = {
      getRandomValues: <T extends ArrayBufferView | null>(array: T) => {
        const bytes = array as unknown as Uint8Array
        for (let i = 0; i < bytes.length; i++) bytes[i] = 0xff
        return array
      },
    } as unknown as Crypto
    const id = newId(fake)
    expect(id).toMatch(UUID_V4)
    expect(id).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
  })

  it('liefert im Testlauf verschiedene UUIDs', () => {
    const a = newId()
    const b = newId()
    expect(a).toMatch(UUID_V4)
    expect(a).not.toBe(b)
  })
})
