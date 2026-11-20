import { describe, expect, it } from 'vitest'

import type { PendingMutation } from '@/types/PendingMutation'

import {
  adoptLegacyQueue,
  isGuestOwner,
  legacyListsBelong,
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
    expect(readOwnedQueue(s, BASE, A, () => true).map((m) => m.queueId)).toEqual(['old'])
    expect(s.getItem(BASE)).toBeNull()
    expect(readOwnedQueue(s, BASE, B, () => true)).toEqual([])
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

describe('Altbestand nur in den eigenen Haushalt', () => {
  const create = (queueId: string, listId: string): PendingMutation => ({
    queueId,
    operation: 'create',
    payload: { name: 'Milch', listId },
    timestamp: 0,
    retries: 0,
  })
  const own = new Set(['list1', 'list2'])
  const belongs = (legacy: PendingMutation[]) => legacyListsBelong(legacy, own)

  it('Listen des aktuellen Haushalts: wird übernommen', () => {
    const s = fakeStorage({ [BASE]: JSON.stringify([create('c1', 'list1'), mutation('u1')]) })
    expect(readOwnedQueue(s, BASE, A, belongs).map((m) => m.queueId)).toEqual(['c1', 'u1'])
    expect(s.getItem(BASE)).toBeNull()
  })

  it('eine fremde Liste: bleibt liegen, unangetastet', () => {
    const raw = JSON.stringify([create('c1', 'list1'), create('c2', 'fremd')])
    const s = fakeStorage({ [BASE]: raw })
    expect(readOwnedQueue(s, BASE, A, belongs)).toEqual([])
    expect(s.getItem(BASE)).toBe(raw)
    expect(s.data.has(ownedKey(BASE, A))).toBe(false)
  })

  it('Listen noch nicht geladen: bleibt liegen, später übernommen', () => {
    const s = fakeStorage({ [BASE]: JSON.stringify([create('c1', 'list1')]) })
    expect(readOwnedQueue(s, BASE, A, (l) => legacyListsBelong(l, new Set()))).toEqual([])
    expect(readOwnedQueue(s, BASE, A, belongs).map((m) => m.queueId)).toEqual(['c1'])
  })

  it('ohne Prüfung wird nichts übernommen', () => {
    const s = fakeStorage({ [BASE]: JSON.stringify([create('c1', 'list1')]) })
    expect(readOwnedQueue(s, BASE, A)).toEqual([])
    expect(s.getItem(BASE)).not.toBeNull()
  })

  it('eine eigene Warteschlange hat Vorrang, der Altbestand bleibt liegen', () => {
    const s = fakeStorage({ [BASE]: JSON.stringify([create('c1', 'list1')]) })
    writeOwnedQueue(s, BASE, A, [mutation('a1')])
    expect(readOwnedQueue(s, BASE, A, belongs).map((m) => m.queueId)).toEqual(['a1'])
    expect(s.getItem(BASE)).not.toBeNull()
  })

  it('der zweite Anlauf liest nie die eigene Warteschlange, nur den Altbestand', () => {
    const s = fakeStorage({ [BASE]: JSON.stringify([create('c1', 'list1')]) })
    writeOwnedQueue(s, BASE, A, [mutation('stale')])
    expect(adoptLegacyQueue(s, BASE, A, belongs)).toEqual([])
    s.data.delete(ownedKey(BASE, A))
    expect(adoptLegacyQueue(s, BASE, A, belongs).map((m) => m.queueId)).toEqual(['c1'])
  })

  it('Mutationen ohne Liste (Abhaken, Löschen per ID) halten die Übernahme nicht auf', () => {
    expect(legacyListsBelong([mutation('u1')], own)).toBe(true)
    expect(legacyListsBelong([create('c1', 'list2'), mutation('u1')], own)).toBe(true)
    expect(legacyListsBelong([create('c1', 'x')], own)).toBe(false)
  })
})

describe('Gäste: keine Offline-Warteschlange', () => {
  const G = queueOwner('anon1', 'house1', true)!

  it('bekommen einen eigenen, als Gast erkennbaren Besitzer', () => {
    expect(G).toBe('guest:anon1:house1')
    expect(isGuestOwner(G)).toBe(true)
    expect(isGuestOwner(A)).toBe(false)
    expect(isGuestOwner(null)).toBe(false)
    expect(queueOwner('anon1', null, true)).toBeNull()
  })

  it('speichern nie etwas', () => {
    const s = fakeStorage()
    writeOwnedQueue(s, BASE, G, [mutation('g1')])
    expect(s.data.size).toBe(0)
  })

  it('lesen nichts und räumen einen alten Rest weg', () => {
    const s = fakeStorage({ [ownedKey(BASE, G)]: JSON.stringify([mutation('g1')]) })
    expect(readOwnedQueue(s, BASE, G)).toEqual([])
    expect(s.data.size).toBe(0)
  })

  it('übernehmen keinen Altbestand', () => {
    const legacy = JSON.stringify([mutation('old')])
    const s = fakeStorage({ [BASE]: legacy })
    expect(readOwnedQueue(s, BASE, G, () => true)).toEqual([])
    expect(adoptLegacyQueue(s, BASE, G, () => true)).toEqual([])
    expect(s.data.get(BASE)).toBe(legacy)
  })
})
