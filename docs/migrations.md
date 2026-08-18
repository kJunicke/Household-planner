# Database Migrations (Supabase CLI)

**Status:** ✅ Konsolidiert (26.10.2025) — 4 strukturierte Migrations (war: 29),
alte Migrations archiviert in `supabase/migrations/archive/`.

## Struktur

```
supabase/migrations/
├── 20251026000000_consolidated_schema.sql  # Tables, Indexes, Triggers
├── 20251026000001_rls_policies.sql         # RLS Policies (documented)
├── 20251026000002_realtime.sql             # Realtime config
├── 20251026000003_cron_jobs.sql            # Recurring tasks cron
├── 20260103202609_soft_delete_tasks.sql    # Soft Delete (deleted_at Column)
└── archive/                                 # Old migrations (reference)
```

## Workflow

WICHTIG: CLI über `npx` ausführen (kein globales Supabase-CLI, kein Docker).

```bash
# Migration erstellen und bearbeiten
npx supabase migration new my_feature_name
# → SQL in supabase/migrations/[timestamp]_my_feature_name.sql schreiben

# Migration pushen
npx supabase db push

# Remote-Schema-Änderungen pullen (optional)
npx supabase db pull

# Migration-Status checken (optional)
npx supabase migration list --linked
```

## Edge Functions deployen — eigener Schritt, eigener Haken

`npx supabase db push` deployt **keine** Edge Functions. Wer `supabase/functions/`
anfasst, muss zusätzlich:

```bash
npx supabase functions deploy complete-task

# Welche Fassung laeuft gerade? Version und Datum gegen den letzten Commit halten:
npx supabase functions list
```

**Das ist keine Formalie.** Am 18.08.2026 fand ein QC, dass `complete-task` seit dem
22.12.2025 nicht deployt worden war: Repo-Code korrekt, Migration gepusht, Ticket
committet — und der ausgelieferte Funktionsrumpf enthielt **null** Vorkommen des
neuen Feldes. Mit deployt wurde dann auch ein acht Monate alter Commit vom
02.01.2026, der nie live gegangen war. Es war also kein Ausrutscher, sondern ein
fehlender Schritt in dieser Datei.

Der Fehler ist **still**: die Function antwortet weiter mit `HTTP 200`, schreibt
alles Alte korrekt und lässt nur das Neue weg. Im Zusammenspiel mit einer
optimistischen Anzeige sieht es kurz sogar richtig aus, bis das Nachladen den
alten Serverwert zurückholt.

**Prüfen statt hoffen:** nach dem Deploy die Versionsnummer aus
`npx supabase functions list` gegen das Commit-Datum halten. Ein Deploy, der
durchlief, ist nicht dasselbe wie eine Function, die das Neue enthält.

## Regeln

- **Append-only**: nie gepushte Migrations editieren
- **Edge Functions gehören zum selben Ticket wie ihre Migration** — und werden
  getrennt deployt (siehe oben)
- **Security**: RLS für alle Tabellen, SECURITY DEFINER für Helper-Functions (`get_user_household_id()`)
- `.env` nicht committen
