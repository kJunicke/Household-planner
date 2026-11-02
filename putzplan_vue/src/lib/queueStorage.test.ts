import { describe, expect, it } from 'vitest'

import type { PendingMutation } from '@/types/PendingMutation'

import {
  ownedKey,
  queueOwner,
  readOwnedQueue,
  removeFromOwnedQueue,
  removeKeysWithPrefix,
  writeOwnedQueue,
} from './queueStorage'

/** localStorage-Ersatz mit derselben Schnittstelle, soweit die Funktionen sie brauchen. */
const fakeStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    },
  }
}

const mutation = (queueId: string): PendingMutation => ({
  queueId,
  operation: 'update',
  payload: { itemId: 'x', updates: { purchased: true } },
  timestamp: 0,
  retries: 0,
})

const BASE = 'shopping_mutation_queue'
const A = queueOwner('userA', 'house1')!
const B = queueOwner('userB', 'house1')!

describe('queueOwner', () => {
  it('braucht Nutzer und Haushalt', () => {
    expect(queueOwner('u', 'h')).toBe('u:h')
    expect(queueOwner('u', null)).toBeNull()
    expect(queueOwner(undefined, 'h')).toBeNull()
  })
})

describe('gebundene Warteschlange', () => {
  it('ein anderer Nutzer liest die Warteschlange des Vorgängers nicht', () => {
    const s = fakeStorage()
    writeOwnedQueue(s, BASE, A, [mutation('a1')])
    expect(readOwnedQueue(s, BASE, B)).toEqual([])
  })

  it('derselbe Nutzer bekommt sie nach erneutem Anmelden zurück', () => {
    const s = fakeStorage()
    writeOwnedQueue(s, BASE, A, [mutation('a1')])
    expect(readOwnedQueue(s, BASE, B)).toEqual([])
    expect(readOwnedQueue(s, BASE, A).map((m) => m.queueId)).toEqual(['a1'])
  })

  it('derselbe Nutzer in einem anderen Haushalt spielt sie nicht ab', () => {
    const s = fakeStorage()
    writeOwnedQueue(s, BASE, A, [mutation('a1')])
    expect(readOwnedQueue(s, BASE, queueOwner('userA', 'house2')!)).toEqual([])
  })

  it('der ungebundene Altbestand geht an den ersten Leser und nur an ihn', () => {
    const s = fakeStorage({ [BASE]: JSON.stringify([mutation('old')]) })
    expect(readOwnedQueue(s, BASE, A).map((m) => m.queueId)).toEqual(['old'])
    expect(s.getItem(BASE)).toBeNull()
    expect(readOwnedQueue(s, BASE, B)).toEqual([])
  })

  it('eine leere Warteschlange hinterlässt keinen Schlüssel', () => {
    const s = fakeStorage()
    writeOwnedQueue(s, BASE, A, [mutation('a1')])
    writeOwnedQueue(s, BASE, A, [])
    expect(s.data.has(ownedKey(BASE, A))).toBe(false)
  })

  it('kaputtes JSON ergibt eine leere Warteschlange statt eines Wurfs', () => {
    const s = fakeStorage({ [ownedKey(BASE, A)]: '{nope' })
    expect(readOwnedQueue(s, BASE, A)).toEqual([])
  })

  it('streicht Erledigtes beim abgemeldeten Besitzer', () => {
    const s = fakeStorage()
    writeOwnedQueue(s, BASE, A, [mutation('a1'), mutation('a2')])
    removeFromOwnedQueue(s, BASE, A, ['a1'])
    expect(readOwnedQueue(s, BASE, A).map((m) => m.queueId)).toEqual(['a2'])
  })
})

describe('removeKeysWithPrefix', () => {
  it('räumt gebundene Caches und den Altbestand, sonst nichts', () => {
    const s = fakeStorage({
      shopping_items_cache: '[]',
      [`shopping_items_cache:${A}`]: '[]',
      [`shopping_items_cache:${B}`]: '[]',
      [ownedKey(BASE, A)]: '[]',
      other: '1',
    })
    removeKeysWithPrefix(s, 'shopping_items_cache')
    expect([...s.data.keys()].sort()).toEqual([ownedKey(BASE, A), 'other'].sort())
  })
})
