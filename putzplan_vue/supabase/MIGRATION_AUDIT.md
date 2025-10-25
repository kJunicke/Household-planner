# Migration Audit - Pre-Consolidation

**Date:** 2025-10-26
**Total Migrations:** 29
**Target:** 4 consolidated migrations

---

## Kategorien

### CORE (behalten, konsolidieren)

**20250108220000_create_base_schema.sql**
- Erstellt: households, household_members (mit member_id), tasks, task_completions
- Indexes: alle FK-Indexes
- **STATUS:** ✅ Basis für consolidated_schema.sql
- **Note:** Original hatte member_id als PK (später refactored)

**20251018131353_add_last_completed_at_with_trigger.sql**
- Fügt hinzu: tasks.last_completed_at column
- Trigger: update_task_last_completed_at (bei INSERT in task_completions)
- Function: update_task_last_completed_at()
- Index: idx_tasks_last_completed_at
- **STATUS:** ✅ In consolidated_schema.sql mergen

**20251024204719_remove_member_id_use_user_id_as_pk.sql**
- Refactoring: member_id raus, user_id = PK
- Recreates household_members table
- Recreates 4 RLS policies
- **STATUS:** ✅ Bereits in Base-Schema reflektiert (user_id als PK)

**20251022214351_add_display_name_to_household_members.sql**
- Fügt hinzu: display_name column
- **STATUS:** ✅ In consolidated_schema.sql mergen

**20251025123847_add_effort_override_to_completions.sql**
- Fügt hinzu: effort_override, override_reason columns
- Constraint: effort_override_requires_reason
- **STATUS:** ✅ In consolidated_schema.sql mergen

### RLS (alle konsolidieren → 1 Datei)

**20250108230002_task_completions_rls.sql**
- 3 Policies für task_completions
- **STATUS:** ⚠️ In rls_policies.sql

**20251018135010_add_rls_for_all_tables.sql**
- Initial RLS für alle 4 Tabellen
- **STATUS:** ⚠️ Überschrieben durch spätere Migrations

**20251018135459_fix_function_search_path_security.sql**
- Fügt search_path zu Functions hinzu
- **STATUS:** ⚠️ Best Practice - in consolidated übernehmen

**20251018135956_optimize_rls_performance.sql**
- Optimiert RLS mit (SELECT auth.uid())
- **STATUS:** ⚠️ In rls_policies.sql

**20251018140404_fix_household_members_select_circular_rls.sql**
- Fix: Household members SELECT recursion
- **STATUS:** ⚠️ Überschrieben durch spätere Migrations

**20251018140505_fix_household_members_rls_no_recursion.sql**
- Fix: RLS recursion attempt
- **STATUS:** ⚠️ Überschrieben durch spätere Migrations

**20251018140724_optimize_rls_architecture.sql**
- Weitere RLS Optimierung
- **STATUS:** ⚠️ Überschrieben durch spätere Migrations

**20251019140115_allow_join_by_invite_code.sql**
- Ändert households SELECT zu public
- **STATUS:** ⚠️ Überschrieben durch 20251019140500

**20251019140342_fix_households_select_policy.sql**
- **LEER!** (0 bytes)
- **STATUS:** ❌ Löschen

**20251019140500_fix_households_select_policy.sql**
- Final households SELECT policy (true)
- **STATUS:** ✅ In rls_policies.sql

**20251022215559_add_household_members_update_policy.sql**
- Fügt UPDATE policy für household_members hinzu
- **STATUS:** ✅ In rls_policies.sql

**20251024205154_fix_household_members_rls_infinite_recursion.sql**
- Weitere recursion fix attempt
- **STATUS:** ⚠️ Überschrieben durch 20251024205322

**20251024205322_fix_rls_no_subquery.sql**
- **FINAL FIX:** get_user_household_id() SECURITY DEFINER
- **STATUS:** ✅ In rls_policies.sql (finale Lösung!)

### REALTIME (separat)

**20251018142654_enable_realtime_tasks.sql**
- ALTER PUBLICATION für tasks
- **STATUS:** ✅ realtime.sql

**20251019154849_enable_realtime_completions.sql**
- ALTER PUBLICATION für task_completions
- **STATUS:** ✅ realtime.sql

### CRON (separat)

**20250108230000_task_recurrence_function.sql**
- Function: reset_recurring_tasks() (original version)
- **STATUS:** ⚠️ Überschrieben durch 20251019121735

**20250108230001_task_completion_triggers.sql**
- Trigger: update_last_completed_at
- **STATUS:** ⚠️ Duplicate mit 20251018131353 (gleicher Trigger)

**20251018161912_add_recurring_tasks_cron_job.sql**
- Cron: reset-recurring-tasks-daily (3:00 UTC)
- **STATUS:** ✅ cron_jobs.sql

**20251019121735_fix_recurrence_calendar_days.sql**
- **FINAL:** reset_recurring_tasks() mit Calendar Days Logic
- **STATUS:** ✅ cron_jobs.sql (finale Function!)

### ROLLBACKS (ignore)

**20251008222847_rollback_task_triggers.sql**
- Rollback von trigger-experiment
- **STATUS:** ❌ Nicht in Konsolidierung (war temporär)

### DIAGNOSTICS (löschen)

**20251019121112_check_cron_status.sql**
- Nur RAISE NOTICE für Debugging
- **STATUS:** ❌ Löschen (kein Schema-Change)

**20251019121214_check_task_status.sql**
- Nur RAISE NOTICE für Debugging
- **STATUS:** ❌ Löschen (kein Schema-Change)

### DATA-MIGRATIONS (separat wenn nötig)

**20251022215116_update_existing_members_display_names.sql**
- Data-Update für bestehende Members (display_name = 'Unbekannt')
- **STATUS:** ⚠️ Nicht nötig (neue Tabelle hat DEFAULT)

**20251022215810_fix_display_names_with_email_prefix.sql**
- Data-Fix
- **STATUS:** ⚠️ Nicht nötig (neue Tabelle, keine alte Daten)

---

## Zusammenfassung

### Konsolidierung Plan:
- **CORE:** 5 Migrations → 1x consolidated_schema.sql
- **RLS:** 13 Migrations → 1x rls_policies.sql
- **REALTIME:** 2 Migrations → 1x realtime.sql
- **CRON:** 4 Migrations → 1x cron_jobs.sql
- **DELETE:** 3 (2 Diagnostics + 1 Rollback + 1 leere)
- **SKIP:** 2 Data-Migrations (nicht nötig für neue DB)

**TOTAL:** 29 → 4 finale Migrations

---

## Wichtige Erkenntnisse

1. **RLS Evolution:** 13 Iterationen bis zur finalen Lösung (SECURITY DEFINER)
2. **member_id Refactoring:** Große Änderung - user_id = PK (20251024204719)
3. **Calendar Days Fix:** Wichtige Logic-Änderung für Cron (20251019121735)
4. **Public Households SELECT:** Bewusste Security-Entscheidung für Invite-Flow
5. **Leere Migration:** 20251019140342_fix_households_select_policy.sql ist leer!

---

## Validierung Checkpoints

- [ ] Alle 4 konsolidierten Migrations erstellt
- [ ] Lokaler db reset erfolgreich
- [ ] Schema lint ohne Fehler
- [ ] RLS Tests bestanden
- [ ] Frontend funktioniert
