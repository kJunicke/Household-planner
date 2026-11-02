// Ein Durchlauf der Offline-Warteschlange und die Entscheidung, was ein
// gescheiterter Versuch bedeutet. Gemeinsam für den Einkauf und die
// Checklisten; ohne Vue und ohne Supabase, damit es sich ohne Browser prüfen
// lässt. Was eine einzelne Mutation tut, bleibt Sache des Stores (`process`).

import type { PendingMutation } from '@/types/PendingMutation'
import { isNetworkMessage } from './networkError'

/**
 * Fehlversuche, die kürzer als dieser Abstand nach dem letzten gezählten
 * liegen, zählen nicht noch einmal. Jede Nutzeraktion stößt einen Sync an:
 * ohne Abstand verbrauchen fünf schnelle Antipper während einer kurzen
 * Serverstörung alle Versuche, und die Änderung wird verworfen.
 */
export const COUNT_GAP_MS = 30_000

/**
 * Fehler, nach denen ein späterer Versuch sicher anders ausgeht: kein Netz
 * (auch bei `navigator.onLine === true`, z. B. Funkloch, Captive Portal) oder
 * ein abgelaufenes Token, das supabase-js gleich erneuert. Sie verbrauchen
 * keinen Versuch — sonst verwirft die Warteschlange gerade die Änderungen,
 * für die es sie gibt.
 *
 * Bewusst nur über den Fehltext und nicht über `name === 'TypeError'` wie in
 * `isNetworkError`: supabase-js liefert Netzfehler als Objekt mit „TypeError:
 * Failed to fetch" im Text. Ein echter TypeError aus einem Programmfehler muss
 * zählen, sonst hielte er die Warteschlange für immer an.
 */
export function isTransientError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (!error) return false
  const message = String((error as { message?: unknown }).message ?? error)
  if (isNetworkMessage(message)) return true
  const code = String((error as { code?: unknown }).code ?? '')
  return code === 'PGRST301' || code === 'PGRST303' || message.toLowerCase().includes('jwt expired')
}

/** 'later' = Durchlauf abbrechen, nichts zählen · 'retry' = liegen lassen · 'discard' = aufgeben. */
type FailureVerdict = 'later' | 'retry' | 'discard'

export interface FailureJudgement {
  verdict: FailureVerdict
  retries: number
  lastFailedAt: number | undefined
}

export function judgeFailure(
  m: Pick<PendingMutation, 'retries' | 'lastFailedAt'>,
  error: unknown,
  now: number,
  maxRetries: number,
): FailureJudgement {
  if (isTransientError(error)) {
    return { verdict: 'later', retries: m.retries, lastFailedAt: m.lastFailedAt }
  }
  const counts = m.lastFailedAt === undefined || now - m.lastFailedAt >= COUNT_GAP_MS
  const retries = counts ? m.retries + 1 : m.retries
  const lastFailedAt = counts ? now : m.lastFailedAt
  return { verdict: retries >= maxRetries ? 'discard' : 'retry', retries, lastFailedAt }
}

/**
 * Wartende Mutationen, die über eine temp-ID an `m` hängen. Wird ein Anlegen
 * verworfen, kommen sie nie an ihre echte ID — sie fallen mit.
 */
export function dependentsOf(queue: PendingMutation[], m: PendingMutation): PendingMutation[] {
  const ids = [m.payload.tempId, m.payload.tempCategoryId].filter(Boolean) as string[]
  if (ids.length === 0) return []
  return queue.filter(
    (q) =>
      q.queueId !== m.queueId &&
      ((q.payload.itemId !== undefined && ids.includes(q.payload.itemId)) ||
        (q.payload.categoryId !== undefined && ids.includes(q.payload.categoryId))),
  )
}

/**
 * Nächste in diesem Durchlauf noch nicht versuchte Mutation. Liest die
 * Warteschlange jedes Mal neu: Was während des Laufs dazukommt, wird mit
 * abgearbeitet, statt bis zur nächsten Aktion liegen zu bleiben.
 */
function nextPending(
  queue: PendingMutation[],
  attempted: Set<string>,
): PendingMutation | undefined {
  return queue.find((m) => !attempted.has(m.queueId))
}

const describeError = (error: unknown) =>
  error instanceof Error
    ? error.message
    : String((error as { message?: unknown } | null)?.message ?? error)

export interface QueuePassIO {
  /** Die aktuelle Warteschlange — darf während des Laufs wachsen oder ersetzt werden. */
  current(): PendingMutation[]
  /** true = erledigt, false = liegen lassen ohne Fehlversuch, Wurf = Fehlversuch. */
  process(m: PendingMutation): Promise<boolean>
  remove(queueIds: string[]): void
  maxRetries: number
  now?: () => number
  /** true = sofort aufhören (z. B. die Sitzung hat gewechselt). */
  shouldStop?: () => boolean
}

export interface QueuePassResult {
  /** Aufgegebene Mutationen samt ihren temp-ID-Folgemutationen, schon entfernt. */
  discarded: PendingMutation[]
  /** Mutationen, die gescheitert sind und es beim nächsten Sync erneut versuchen. */
  failed: number
  /** Abgebrochen (Netz weg oder Sitzung gewechselt) — der Rest wartet. */
  interrupted: boolean
}

export async function runQueuePass(io: QueuePassIO): Promise<QueuePassResult> {
  const now = io.now ?? Date.now
  const attempted = new Set<string>()
  const result: QueuePassResult = { discarded: [], failed: 0, interrupted: false }

  for (;;) {
    if (io.shouldStop?.()) {
      result.interrupted = true
      break
    }
    const m = nextPending(io.current(), attempted)
    if (!m) break
    attempted.add(m.queueId)

    let done: boolean
    try {
      done = await io.process(m)
    } catch (error) {
      m.lastError = describeError(error)
      const j = judgeFailure(m, error, now(), io.maxRetries)
      m.retries = j.retries
      m.lastFailedAt = j.lastFailedAt
      if (j.verdict === 'later') {
        // Ohne Netz scheitert auch alles Folgende; abbrechen hält die Reihenfolge.
        result.interrupted = true
        break
      }
      if (j.verdict === 'discard') {
        const batch = [m, ...dependentsOf(io.current(), m)]
        batch.forEach((b) => attempted.add(b.queueId))
        io.remove(batch.map((b) => b.queueId))
        result.discarded.push(...batch)
      } else {
        result.failed++
      }
      continue
    }
    if (done) io.remove([m.queueId])
  }

  return result
}
