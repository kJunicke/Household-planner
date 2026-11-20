import { describe, expect, it } from 'vitest'

import { entryChangeLine } from './potEntryChange'

describe('entryChangeLine', () => {
  it('nennt bei einem nie geänderten Eintrag, wer ihn eingetragen hat', () => {
    expect(
      entryChangeLine({
        createdAt: '2026-11-20T10:00:00.123456+00:00',
        updatedAt: '2026-11-20T10:00:00.123456+00:00',
        changedByName: 'Kim',
      }),
    ).toBe('eingetragen von Kim')
  })

  it('nennt nach einer Änderung, wer zuletzt geändert hat', () => {
    expect(
      entryChangeLine({
        createdAt: '2026-11-20T10:00:00.123456+00:00',
        updatedAt: '2026-11-20T11:30:00.5+00:00',
        changedByName: 'Lou',
      }),
    ).toBe('zuletzt geändert von Lou')
  })

  it('vergleicht Zeitpunkte, nicht Schreibweisen', () => {
    expect(
      entryChangeLine({
        createdAt: '2026-11-20T10:00:00+00:00',
        updatedAt: '2026-11-20T11:00:00+01:00',
        changedByName: 'Kim',
      }),
    ).toBe('eingetragen von Kim')
  })

  it('schweigt, wenn niemand bekannt ist', () => {
    expect(
      entryChangeLine({
        createdAt: '2026-11-20T10:00:00Z',
        updatedAt: '2026-11-20T12:00:00Z',
        changedByName: null,
      }),
    ).toBeNull()
  })
})
