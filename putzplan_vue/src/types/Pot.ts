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
  /**
   * Ganze Gruppe (CONTEXT.md § ganze Gruppe): ein Haushaltsmitglied hat
   * bestätigt, dass er auch die Ausgaben „ganze Gruppe“ von vor seinem
   * Beitritt mitträgt (`confirmed`), oder das abgelehnt (`rejected`). Beide
   * falsch: noch offen. Migration 20261120114704.
   */
  confirmed: boolean
  rejected: boolean
  /**
   * Austritt aus dem Haushalt, nur im Haushaltstopf: setzt die Datenbank, wenn
   * das Mitglied geht, und leert ihn bei der Rückkehr. Bis dahin angelegte
   * Ausgaben „ganze Gruppe“ trägt der Ehemalige weiter, spätere nicht.
   * Migration 20261120135616.
   */
  left_at: string | null
  created_at: string
}

/**
 * Ausgabe (→ CONTEXT.md § Ausgabe) mit den Rohwerten ihrer Aufteilung:
 * `split_values` bildet Teilnehmer-Kennungen auf Rohwerte ab.
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
   * `whole_group`: gleich auf die ganze Gruppe, `split_values` leer;
   * `ratio`: Gewicht, `percent`: Prozent, `exact`: Cent je Teilnehmer.
   */
  split_kind: 'equal' | 'whole_group' | 'ratio' | 'percent' | 'exact'
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
  /**
   * Der Ausgleich, mit dem diese Rückzahlung verrechnet wurde (CONTEXT.md
   * § Ausgleich). Solche Rückzahlungen ändert und löscht nur ihr Ausgleich;
   * frisch eingetragene haben das Feld noch nicht.
   */
  settlement_id?: string | null
  created_at: string
  updated_at: string
}
