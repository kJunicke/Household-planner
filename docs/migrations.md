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

## Regeln

- **Append-only**: nie gepushte Migrations editieren
- **Security**: RLS für alle Tabellen, SECURITY DEFINER für Helper-Functions (`get_user_household_id()`)
- `.env` nicht committen
