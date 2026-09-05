# ADR-0004 — Kategorien als Entität je Liste, Kopplung über den Namen

Datum: 2026-09-06
Status: akzeptiert

## Kontext

Einkauf, Packliste und To-do bekommen mit Etappe 2 alle drei eine eigene Kategorientabelle
(`shopping_categories`, `packing_categories`, `todo_categories`). Naheliegend wäre, Einträge
über eine Fremdschlüsselspalte `category_id` an ihre Kategorie zu binden — das ist die
übliche Form einer 1:n-Beziehung.

Die Listen arbeiten aber **offline-first**: eine neu angelegte Kategorie bekommt zunächst
eine lokale `temp_`-ID, bis der Sync die echte ID liefert. Mit einer FK-Spalte müsste jeder
offline angelegte Eintrag seine `temp_`-ID mitschleppen und beim Sync auf die echte ID
umgeschrieben werden — inklusive des Falls, dass zwei Geräte offline dieselbe Kategorie
unter demselben Namen anlegen und der Server das erst beim Zusammenführen der Warteschlangen
merkt.

## Entscheidung

Einträge zeigen auf ihre Kategorie über den **Namen**, nicht über `category_id`. Der Name
wird getrimmt und groß-/kleinschreibungsunabhängig verglichen (`normalizeCategoryName`); ein
DB-Index erzwingt `lower(name)` eindeutig je Liste. `NULL` heißt „Unkategorisiert" und ist
keine Zeile.

## Begründung

- **Keine ID-Kette über die Warteschlange.** Ein Eintrag, der offline unter „Bad" angelegt
  wird, bleibt unter „Bad", ganz gleich, welche `category_id` die Kategorie am Ende bekommt.
  Es gibt nichts umzuschreiben.
- **Namenskollisionen lösen sich von selbst.** Legen zwei Geräte offline dieselbe Kategorie
  an, verschmelzen sie beim Sync zu einer Zeile (Fehlercode `23505` → Verschmelzen), weil
  Namensgleichheit ohnehin die Definition von Zugehörigkeit ist — keine Sonderbehandlung,
  keine zwei Zeilen mit vertauschten Einträgen.
- **Umbenennen ist unabhängig vom Sync-Zustand der Kategorie-Zeile selbst.** Weil Einträge
  nicht auf eine ID zeigen, ändert eine Umbenennung nur die eine Zeile in der
  Kategorientabelle; alle Einträge folgen automatisch über den (neuen) Namen.

## Verworfene Alternative

**Fremdschlüssel `category_id` auf jedem Eintrag.** Verworfen, weil die Offline-Warteschlange
dann für jede Kategorie-Erstellung eine ID-Versöhnung über alle wartenden Item-Mutationen
fahren müsste — genau die Klasse Fehler, die Temp-ID-Ketten in verteilten Warteschlangen
anfällig macht. Der Namensvergleich verschiebt das Problem auf einen einzigen Indexschutz
(`lower(name)` eindeutig je Liste) statt es über Item- und Kategorie-Mutationen zu verteilen.

## Konsequenzen

- Ein Eintrag „gehört" zu keiner Kategorie im Sinne einer harten Referenz — er gehört zu
  einem **Namen**. Löscht jemand die Kategorie-Zeile, aber nicht die Einträge, bleiben die
  Einträge mit ihrem alten Namensstring zurück, bis sie neu zugeordnet oder auf
  „Unkategorisiert" gesetzt werden (siehe Löschvarianten in `CategoryEditModal`).
- `normalizeCategoryName` (JS) und `lower()` (Postgres) müssen dieselbe Vergleichslogik
  approximieren; bekannte Abweichungen bei Sonderfällen (ß, türkisches İ) fängt der
  `23505`-Zweig beim Sync ab, nicht eine geteilte Normalisierungsfunktion über Sprachgrenzen.
- Umbenennen auf einen bereits vorhandenen Namen ist kein Fehler, sondern eine gültige
  Operation mit eigener Bedeutung (Verschmelzen) — Aufrufer dürfen das nicht als
  Ausnahmefall behandeln.
