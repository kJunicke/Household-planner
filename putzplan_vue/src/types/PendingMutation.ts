// Pending Mutation Type für Offline-Sync Queue
// Beschreibt eine Operation die noch nicht mit Supabase synchronisiert wurde

export type MutationOperation = 'create' | 'update' | 'delete'

export interface PendingMutation {
  // Eindeutige ID für Queue-Item (timestamp + random)
  queueId: string

  // Art der Operation
  operation: MutationOperation

  // Daten für die Operation
  payload: {
    itemId?: string // Für update/delete
    name?: string // Für create
    updates?: Record<string, unknown> // Für update (purchased, is_priority, etc.)
  }

  // Metadaten für Retry-Logik
  timestamp: number // Unix timestamp
  retries: number // Anzahl bisheriger Versuche
  lastError?: string // Fehler vom letzten Versuch
}
