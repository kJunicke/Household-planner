# Views & Routes

Detailverhalten der einzelnen Views. Nur lesen, wenn du an der jeweiligen View arbeitest.

## `/` — CleaningView

Task-Liste, gefiltert über Kategorie-Chips (Alltag / Putzen / Projekte / Erledigt).

- **Filter-Chips**: Single-Select-Toggle. Ein Chip filtert exklusiv auf eine Kategorie;
  erneuter Klick (oder das ✕-Badge am aktiven Chip) hebt den Filter auf → alle sichtbar.
  Auswahl persistiert in `localStorage` (`putzplan_active_category`).
- **Vereinter FAB**: EIN Button (Lupe + kleines +-Badge) öffnet das Such-Overlay (suchen UND erstellen).
- **Cross-Tab Search**: Intelligente Suche über alle Kategorien mit Relevanz-Sortierung.
  Bei Eingabe erscheinen zwei Aktionen: **Aufgabe erstellen** (TaskCreateModal, Titel vorbefüllt)
  und **Quick-Aufgabe abschließen** (QuickTaskModal).
- **Quick-Aufgaben**: einmalig, sofort abgeschlossen + sofort soft-deleted → erscheinen NUR in der
  Historie (mit „Quick"-Badge), nicht in der Aufgabenliste. Punkte zählen in Stats/Ausgleich.
  Insert direkt via `taskStore.createQuickTask()` (keine Edge Function, RLS erlaubt Client-Insert).
- **„Jetzt dran"**: enthält **jede** offene wiederkehrende Aufgabe, nicht nur überfällige —
  ob eine Aufgabe dran ist, entscheidet allein `tasks.completed`
  ([ADR 0001](adr/0001-completed-ist-zustand-keine-ableitung.md)). Eine manuell als „wieder
  dreckig" markierte Aufgabe steht also auch dann hier, wenn ihre Kadenz noch läuft.
  Sortiert nach `urgency` aus `lib/taskSchedule.ts`, dringendste oben; nie erledigte zuerst.
  Sichtbar nur, solange die Kategorie „Putzen" im Filter steht. Warnfarbe und Warndreieck
  am Kopf erscheinen nur, wenn mindestens eine Aufgabe wirklich überfällig ist.
- **Keine eigene Putzaufgaben-Gruppe**: „Jetzt dran" ersetzt sie vollständig, eine zweite
  Gruppe wäre zwangsläufig leer. Gruppiert werden nur noch Alltag, Projekte und Erledigt.
- **Status-Zeile**: „Offen" zählt recurring + one-time, „N überfällig" nur gerissene Kadenzen
  und nie erledigte Aufgaben — deshalb ist diese Zahl kleiner als die Zahl am Sektionskopf.
- **Erledigt-Tab**: wiederkehrende Aufgaben nach nächster Fälligkeit, danach Aufgaben ohne
  Kadenz, ganz hinten abgeschlossene Projekte nach Abschlussdatum.

## `/history` — HistoryView

Chronologischer Verlauf aller Completions.

## `/stats` — StatsView

Gamification-Statistiken (Balken-/Tortendiagramm + Verlaufsgrafik mit Wochen-/Monatsansicht).

## `/shopping` — ListsView

Zwei Subtabs: **Einkauf** (ShoppingView) & **Packlisten** (PackingView).

### ShoppingView

Einkaufsliste, an das Packlisten-Redesign angeglichen (07/2026):

- **Kategorien** (`shopping_items.category`, nullable): nur „Zu kaufen" wird gruppiert,
  „Unkategorisiert" unten gepinnt. Farbe deterministisch aus `lib/categoryColor.ts`.
- **Menge** (`shopping_items.quantity`, >=1): reines ×N-Label (kein Stepper — Kauf ist ein
  einzelner Fertig-Flip).
- **Gekauft**: globaler Block unten mit Kauf-Historie (`times_purchased`, letzter Kauf/Käufer),
  NICHT per Kategorie gruppiert. Grace (~6 s, `useGraceWindow`): frisch Gekauftes bleibt
  durchgestrichen in seiner Kategorie, wandert erst nach Ablauf in den Gekauft-Block.
- **Priorität**: ⭐ inline als reines Highlight (kein Hochsortieren). Sortierung nach Name.
- **Add-Wege**: Top-Suchleiste (→ Unkategorisiert, mit Autocomplete) + per-Sektion-Add-Line.
  Long-Press / Rechtsklick öffnet `ShoppingItemEditModal` (Name · Kategorie · Menge · Löschen).
- **Kategorie-Reuse**: `CategorySearchModal` mit `importItems:false` — übernimmt nur den
  NAMEN aus anderen Listen (keine Items, die könnten anderswo schon abgehakt sein).
  Rename/Löschen via `CategoryEditModal`.
- **Voll offline**: optimistische Updates + Mutation-Queue (`shopping_mutation_queue`).
  Offline angelegte Items sind sofort abhak-/editierbar — nach dem Create-Sync werden ihre
  Folge-Mutationen per Temp-ID-Verkettung (`reconcileTempId`) auf die echte ID umgehängt.
  `loadItems` merged Server-Rows ohne in-flight-optimistische Items zu überschreiben.
- Store: `useShoppingStore` — Getter `itemsByCategory`, `categoryLabels`; Actions
  `createItem(name, category, quantity)`, `updateItem`, `addCategory`, `renameCategory`/
  `deleteCategory`, `categoryImportCandidates`, `togglePriority`, `markPurchased`/`markUnpurchased`.

**Geteilte Bausteine** (auch von PackingView genutzt): `components/ListItemRow.vue`
(Zeilen-Shell + Trailing-Slot), `components/CategoryRail.vue` (Rail mit Bubble-Redesign:
höher, farbig, 4-Buchstaben-Label, ab >8 Kategorien dichter), `components/CategoryEditModal.vue`,
`components/CategorySearchModal.vue` (Prop `importItems`), `composables/useLongPress.ts`,
`composables/useGraceWindow.ts`, `composables/useCategoryRail.ts`.

### PackingView

Nach Kategorien gruppierte Packlisten (Redesign 07/2026):

- **Kategorien**: frei definierbare Textlabels pro Liste (keine Kategorie-Tabelle), Farbe
  deterministisch aus Namens-Hash (`lib/categoryColor.ts`, feste 12er-Palette). „Unkategorisiert"
  (`category = null`) ist immer vorhanden, muted, unten angepinnt. Fertige Kategorien sinken
  nach unten + klappen zu; offene manuell zuklappbar (Session-State, kein DB-Feld).
- **Entkoppeltes Modell**: `packed` (Fertig-Flag) ist unabhängig von `packed_count` (0..`quantity`).
  Körper-Tap togglet nur `packed`; Stepper `[–] X/N [＋]` (nur qty>1) ändert `packed_count`
  (Voll → auto-fertig, drunter → wieder offen). Long-Press / Rechtsklick öffnet Edit-Modal.
- **Add-Zeile pro Sektion** klappt ein, sobald in der Sektion etwas gepackt ist
  (`packedCount > 0`), „+ hinzufügen" öffnet wieder (`forcedAddOpen`-Set).
- **Wiederverwendung**: „+ Kategorie"-Schnellsuche (`CategorySearchModal`) verschmilzt Neu-Erstellen
  + Import distinct (Kategorie × Quell-Liste) über den Haushalt; Import überspringt Namens-Dubletten.
  „Neue Liste" kann leer oder als Kopie einer bestehenden Liste (`copyList`) erstellt werden.
- **Reise-Notizen** (`packing_lists.notes`, Freitext, einklappbar oben).
- Store: `usePackingStore` — Getter `itemsByCategory`, `overallProgress`; Actions `togglePacked`,
  `incrementPacked`/`decrementPacked`, `updateItem`, `addItem(name, category)`, `importCategory`,
  `copyList`, `updateNotes`. Optimistische Updates mit Revert.

## Weitere Routes

- `/notes` — **NotesView** — Haushalt-Notizen (alle Mitglieder können erstellen/bearbeiten/löschen)
- `/login` — LoginView
- `/register` — RegisterView
- `/household-setup` — HouseholdSetupView
