/**
 * Längengrenzen für Freitext — dieselben Zahlen wie die CHECK-Constraints der
 * Migration 20261102120000. Die `maxlength`-Attribute der Eingabefelder lesen
 * von hier; wer eine Zahl ändert, ändert den CHECK per neuer Migration mit.
 */
export const TASK_TITLE_MAX_LENGTH = 200
export const NOTE_CONTENT_MAX_LENGTH = 10000
export const COMPLETION_NOTE_MAX_LENGTH = 1000
export const SHOPPING_ITEM_NAME_MAX_LENGTH = 200
export const HOUSEHOLD_NAME_MAX_LENGTH = 100
export const DISPLAY_NAME_MAX_LENGTH = 50
/** Topf-Ausgaben, CHECKs der Migration 20261120110224. */
export const POT_EXPENSE_DESCRIPTION_MAX_LENGTH = 200
export const POT_AMOUNT_MAX_CENTS = 99999999
/** Topfname und Teilnehmername, CHECKs der Migration 20261120110224. */
export const POT_NAME_MAX_LENGTH = 100
export const POT_PARTICIPANT_NAME_MAX_LENGTH = 50
