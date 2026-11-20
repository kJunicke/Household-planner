import { describe, expect, it, vi } from 'vitest'

// `optimistic.ts` zieht den Supabase-Client nur für `revertRows` heran; ohne
// diesen Ersatz bräche der Import ohne .env ab.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { isInFlight, runOptimistic } from './optimistic'

describe('runOptimistic', () => {
  it('meldet einen bestätigten Commit als bestätigt, auch wenn onSuccess wirft', async () => {
    const revert = vi.fn()
    const onError = vi.fn()

    const { applied, settled } = runOptimistic({
      entityId: 'opt-onsuccess-throws',
      apply: () => ({ before: 1 }),
      commit: async () => {},
      onSuccess: async () => {
        throw new Error('Nachlader kaputt')
      },
      revert,
      onError,
    })

    expect(applied).toBe(true)
    await expect(settled).resolves.toBe(true)
    expect(revert).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(isInFlight('opt-onsuccess-throws')).toBe(false)
  })

  it('nimmt bei gescheitertem Commit zurück und meldet den Fehler', async () => {
    const revert = vi.fn()
    const onError = vi.fn()
    const onSuccess = vi.fn()

    const { settled } = runOptimistic({
      entityId: 'opt-commit-throws',
      apply: () => ({ before: 1 }),
      commit: async () => {
        throw new Error('Server sagt nein')
      },
      onSuccess,
      revert,
      onError,
    })

    await expect(settled).resolves.toBe(false)
    expect(revert).toHaveBeenCalledWith({ before: 1 }, expect.any(Error))
    expect(onError).toHaveBeenCalledOnce()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(isInFlight('opt-commit-throws')).toBe(false)
  })

  it('hält die ID bis nach onSuccess in Flug', async () => {
    let seenDuringOnSuccess: boolean | null = null
    const { settled } = runOptimistic({
      entityId: 'opt-inflight',
      apply: () => ({}),
      commit: async () => {},
      onSuccess: () => {
        seenDuringOnSuccess = isInFlight('opt-inflight')
      },
      revert: () => {},
    })

    await settled
    expect(seenDuringOnSuccess).toBe(true)
    expect(isInFlight('opt-inflight')).toBe(false)
  })

  it('bricht ohne Serveraufruf ab, wenn apply null liefert', async () => {
    const commit = vi.fn(async () => {})
    const { applied, settled } = runOptimistic({
      entityId: 'opt-abort',
      apply: () => null,
      commit,
      revert: () => {},
    })

    expect(applied).toBe(false)
    await expect(settled).resolves.toBe(false)
    expect(commit).not.toHaveBeenCalled()
  })

  it('nimmt keinen Schnappschuss an, der selbst null sein kann', async () => {
    // `null` aus `apply` heißt „abbrechen“. Ein Schnappschuss wie ein offenes
    // `closed_at` (null) bräche sonst still ab, obwohl lokal schon geändert ist.
    const commit = vi.fn(async () => {})
    // @ts-expect-error — Schnappschüsse müssen Objekte sein; `{ before }` einpacken.
    const { applied, settled } = runOptimistic<string | null>({
      entityId: 'opt-nullable',
      apply: () => null,
      commit,
      revert: () => {},
    })
    expect(applied).toBe(false)
    await settled

    const wrapped = runOptimistic<{ before: string | null }>({
      entityId: 'opt-wrapped-null',
      apply: () => ({ before: null }),
      commit,
      revert: () => {},
    })
    expect(wrapped.applied).toBe(true)
    await expect(wrapped.settled).resolves.toBe(true)
    expect(commit).toHaveBeenCalledOnce()
  })
})
