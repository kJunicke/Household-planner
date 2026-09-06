// ShoppingCategory Type Definition
// Matches Supabase shopping_categories table schema.
// Kategorien existieren je Liste eigenständig — auch ohne Items.
// Die drei Kategorientabellen (shopping/packing/todo) haben dieselben Spalten;
// der Zeilentyp liegt deshalb als CategoryRow zentral. Dieser Alias bleibt, damit
// die Einkaufs-Konsumenten weiter von „ShoppingCategory" sprechen können.

import type { CategoryRow } from './CategoryRow'

export type ShoppingCategory = CategoryRow
