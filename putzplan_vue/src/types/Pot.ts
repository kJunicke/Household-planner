/**
 * Topf (→ CONTEXT.md § Topf): ein Kreis von Teilnehmern mit eigenen Ausgaben,
 * Rückzahlungen und Saldo. Tabellen `pots`, `pot_participants`, `pot_expenses`,
 * `pot_repayments`, Migration 20261120110224. Beträge in ganzen Cent.
 */
export interface Pot {
  pot_id: string
  household_id: string
  name: string
  /** Der Haushaltstopf (genau einer je Haushalt) oder ein Topf für einen Anlass. */
  kind: 'household' | 'event'
  closed_at: string | null
  created_at: string
}

export interface PotParticipant {
  participant_id: string
  pot_id: string
  household_id: string
  name: string
  /** Das Haushaltsmitglied hinter dem Teilnehmer; `null` bei Gästen. */
  user_id: string | null
  /** Zählt bei Ausgaben auf die ganze Gruppe mit. */
  confirmed: boolean
  created_at: string
}

/**
 * Ausgabe (→ CONTEXT.md § Ausgabe) mit den Rohwerten ihrer Aufteilung:
 * `split_values` bildet Teilnehmer-Kennungen auf Rohwerte ab. Die Datenbank
 * kennt zusätzlich die ganze Gruppe; der Client führt hier nur die Arten, die
 * er rechnen kann.
 */
export interface PotExpense {
  expense_id: string
  pot_id: string
  household_id: string
  payer_participant_id: string
  amount_cents: number
  /** 'YYYY-MM-DD' */
  spent_on: string
  description: string
  /**
   * `equal`: gleich auf die Teilnehmer in `split_values` (Wert 1);
   * `ratio`: Gewicht, `percent`: Prozent, `exact`: Cent je Teilnehmer.
   */
  split_kind: 'equal' | 'ratio' | 'percent' | 'exact'
  split_values: Record<string, number>
  updated_by_participant_id: string | null
  created_at: string
  updated_at: string
}

/** Rückzahlung (→ CONTEXT.md § Rückzahlung). */
export interface PotRepayment {
  repayment_id: string
  pot_id: string
  household_id: string
  from_participant_id: string
  to_participant_id: string
  amount_cents: number
  /** 'YYYY-MM-DD' */
  paid_on: string
  updated_by_participant_id: string | null
  created_at: string
  updated_at: string
}
