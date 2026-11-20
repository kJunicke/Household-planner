// Ein Durchlauf der Offline-Warteschlange und die Entscheidung, was ein
// gescheiterter Versuch bedeutet. Gemeinsam für den Einkauf und die
// Checklisten; ohne Vue und ohne Supabase, damit es sich ohne Browser prüfen
// lässt. Was eine einzelne Mutation tut, bleibt Sache des Stores (`process`).

import type { PendingMutation } from '@/types/PendingMutation'
import { isRetryLater } from './networkError'

/**
 * Fehlversuche, die kürzer als dieser Abstand nach dem letzten gezählten
 * liegen, zählen nicht noch einmal. Jede Nutzeraktion stößt einen Sync an:
 * ohne Abstand verbrauchen fünf schnelle Antipper während einer kurzen
 * Serverstörung alle Versuche, und die Änderung wird verworfen.
 */
export const COUNT_GAP_MS = 30_000

/**
 * Ein Serverfehler 5xx kann eine Störung sein, die sich von selbst legt, oder
 * ein Fehler, der bei jedem Versuch wiederkommt. Er zählt deshalb in einem
 * eigenen, langsamen Budget: höchstens einmal je Abstand, verworfen erst nach
 * der letzten Zählung — rund eine Stunde Störung übersteht eine Änderung, ein
 * dauerhafter Fehler hält die Warteschlange nicht für immer an.
 */
export const SERVER_COUNT_GAP_MS = 10 * 60_000
export const MAX_SERVER_RETRIES = 6
/** Ab dieser Zählung sagt die App einmal, dass Änderungen auf den Server warten. */
const SERVER_NOTICE_AT = 2

/**
 * SQLSTATEs, die PostgREST mit 5xx meldet, obwohl ein zweiter Versuch genauso
 * scheitert (fehlende Zeile im RPC, Rekursion in einer Policy, Limits, interner
 * Fehler, abgebrochene Transaktion, Trigger, fehlendes JWT-Secret). Sie zählen
 * sofort im normalen Budget statt eine Stunde zu warten.
 */
const PERMANENT_CODES = new Set(['P0002', 'P0003', 'P0004', '42P17', 'XX000', '25P02', 'PGRST300'])
const PERMANENT_CLASSES = ['54', '09']

function isPermanentCode(code: string): boolean {
  return PERMANENT_CODES.has(code) || PERMANENT_CLASSES.some((c) => code.startsWith(c))
}

function isServerStatus(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' && status >= 500 && status <= 599
}

/** 'later' = Durchlauf abbrechen · 'retry' = liegen lassen · 'discard' = aufgeben. */
type FailureVerdict = 'later' | 'retry' | 'discard'

type FailureCounters = Pick<
  PendingMutation,
  'retries' | 'lastFailedAt' | 'serverRetries' | 'lastServerFailedAt'
>

export interface FailureJudgement extends FailureCounters {
  verdict: FailureVerdict
  /** true genau bei der Zählung, ab der die App einmal auf den Server hinweist. */
  serverNotice: boolean
}

export function judgeFailure(
  m: FailureCounters,
  error: unknown,
  now: number,
  maxRetries: number,
): FailureJudgement {
  const unchanged = {
    retries: m.retries,
    lastFailedAt: m.lastFailedAt,
    serverRetries: m.serverRetries,
    lastServerFailedAt: m.lastServerFailedAt,
    serverNotice: false,
  }
  if (isRetryLater(error)) return { verdict: 'later', ...unchanged }

  const code = String((error as { code?: unknown }).code ?? '')
  if (isServerStatus(error) && !isPermanentCode(code)) {
    const last = m.lastServerFailedAt
    if (last !== undefined && now - last < SERVER_COUNT_GAP_MS) {
      return { verdict: 'later', ...unchanged }
    }
    const serverRetries = (m.serverRetries ?? 0) + 1
    return {
      ...unchanged,
      // Abbrechen hält die Reihenfolge: was danach wartet, trifft denselben Server.
      verdict: serverRetries >= MAX_SERVER_RETRIES ? 'discard' : 'later',
      serverRetries,
      lastServerFailedAt: now,
      serverNotice: serverRetries === SERVER_NOTICE_AT,
    }
  }

  const counts = m.lastFailedAt === undefined || now - m.lastFailedAt >= COUNT_GAP_MS
  const retries = counts ? m.retries + 1 : m.retries
  const lastFailedAt = counts ? now : m.lastFailedAt
  return {
    ...unchanged,
    verdict: retries >= maxRetries ? 'discard' : 'retry',
    retries,
    lastFailedAt,
  }
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
  /**
   * Direkt schreiben statt warten (Gäste, CONTEXT.md § Gast): jeder Fehlschlag,
   * auch ein Netzfehler, verwirft die Mutation sofort. Nichts wartet auf
   * später, nichts spielt nach einem Wiederverbinden noch einmal ab.
   */
  direct?: boolean
}

export interface QueuePassResult {
  /** Aufgegebene Mutationen samt ihren temp-ID-Folgemutationen, schon entfernt. */
  discarded: PendingMutation[]
  /** Mutationen, die gescheitert sind und es beim nächsten Sync erneut versuchen. */
  failed: number
  /** Abgebrochen (Netz weg, Server gestört oder Sitzung gewechselt) — der Rest wartet. */
  interrupted: boolean
  /** Der Server scheitert schon länger; einmal Bescheid geben, nicht bei jedem Lauf. */
  serverNotice: boolean
}

export async function runQueuePass(io: QueuePassIO): Promise<QueuePassResult> {
  const now = io.now ?? Date.now
  const attempted = new Set<string>()
  const result: QueuePassResult = {
    discarded: [],
    failed: 0,
    interrupted: false,
    serverNotice: false,
  }

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
      const judged = judgeFailure(m, error, now(), io.maxRetries)
      const j = io.direct ? { ...judged, verdict: 'discard' as const, serverNotice: false } : judged
      m.retries = j.retries
      m.lastFailedAt = j.lastFailedAt
      m.serverRetries = j.serverRetries
      m.lastServerFailedAt = j.lastServerFailedAt
      if (j.serverNotice) result.serverNotice = true
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

/** Kategorie-Zeilen mit wartender Umbenennung oder Löschung (für den Neuabgleich). */
export function pendingCategoryIds(queue: readonly PendingMutation[]): Set<string> {
  const ids = new Set<string>()
  for (const m of queue) {
    if (m.payload.entity === 'category' && m.payload.categoryId) ids.add(m.payload.categoryId)
  }
  return ids
}
