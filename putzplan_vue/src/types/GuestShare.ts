/**
 * Was ein **Gastlink** öffnet (→ CONTEXT.md § Gastlink): eine der drei
 * Listenarten oder einen Topf für einen Anlass (nie den Haushaltstopf).
 */
export type GuestShareKind = 'shopping_list' | 'packing_list' | 'todo_list' | 'pot'

/**
 * Freigabe eines Ziels per Gastlink. Tabelle `guest_shares`, Migration
 * 20261120110040. `secret` ist der Schlüssel im Link; Erneuern tauscht ihn.
 */
export interface GuestShare {
  share_id: string
  household_id: string
  target_kind: GuestShareKind
  target_id: string
  secret: string
  created_at: string
  renewed_at: string | null
}

/** Antwort von `redeem_guest_link`: was der Gast sieht und von wem. */
export interface RedeemedGuestLink {
  target_kind: GuestShareKind
  target_id: string
  household_id: string
  household_name: string
}
