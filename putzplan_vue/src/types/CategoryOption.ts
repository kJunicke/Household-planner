// Ein Eintrag der Kategorie-Combobox.
// Eigener Typ statt eines Exports aus der Komponente: den Store soll keine
// Ansicht importieren müssen, und die Packliste nutzt dieselbe Liste in Etappe 2.

export interface CategoryOption {
  name: string
  /** Herkunftsliste — nur gesetzt, wenn die Kategorie zu einer anderen Liste gehört. */
  sourceListName?: string
}
