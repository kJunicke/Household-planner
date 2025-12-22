# Bug Patterns & Solutions

Dokumentation häufiger Bugs und deren Lösungen zur Vermeidung wiederkehrender Probleme.

---

## 🐛 Bug #1: PostgREST Schema Cache nach Column Rename (15.12.2025)

### Problem
Nach Umbenennung einer Spalte (`override_reason` → `completion_note`) in einer Migration funktionierte die Edge Function nicht mehr. Fehler:
```
"Could not find the 'completion_note' column of 'task_completions' in the schema cache"
```

### Root Cause
- **PostgREST cached das DB-Schema** und aktualisiert es nicht automatisch bei `ALTER TABLE ... RENAME COLUMN`
- DDL-Änderungen (DROP/ADD) triggern Schema-Reload, aber RENAME nicht zuverlässig

### Symptome
- Edge Function wirft 500-Error
- Frontend-Requests mit neuen Spaltennamen schlagen fehl
- Migration läuft erfolgreich durch, aber Schema Cache ist veraltet
- Logs zeigen: "Column not found in schema cache"

### Lösung (Professionell)
**NIE Spalten umbenennen in Production!** Stattdessen:

```sql
-- ❌ FALSCH (verursacht Schema Cache Issues)
ALTER TABLE task_completions RENAME COLUMN override_reason TO completion_note;

-- ✅ RICHTIG (3-Step Migration)
-- Step 1: Add new column
ALTER TABLE task_completions ADD COLUMN IF NOT EXISTS completion_note TEXT;

-- Step 2: Migrate data
UPDATE task_completions
SET completion_note = override_reason
WHERE override_reason IS NOT NULL;

-- Step 3: Drop old column (triggers schema reload!)
ALTER TABLE task_completions DROP COLUMN IF EXISTS override_reason;
```

### Warum funktioniert das?
- `DROP COLUMN` triggert DDL-Change-Event → PostgREST reloads schema
- `ADD COLUMN` ist safe (neue Spalte ist sofort verfügbar)
- Zero-Downtime: Frontend kann während Migration weiterlaufen

### Prävention
- **CLAUDEMD-Regel**: "Nie `RENAME COLUMN` in Production-Migrations verwenden"
- **Alternative**: Wenn rename nötig → 3-Step-Migration (ADD → MIGRATE → DROP)
- **Testing**: Nach Migration Edge Function deployen UND testen, nicht nur Migration pushen

### Verwandte Patterns
- Schema Cache gilt auch für PostgREST REST API
- Bei RLS-Policy-Änderungen ähnliches Problem möglich
- `NOTIFY pgrst, 'reload schema'` funktioniert nur bei direktem DB-Access, nicht über Supabase-Dashboard

---

## 🐛 Bug #2: Unified Effort System - Unvollständige Migration (15.12.2025)

### Problem
Nach Implementierung des "Unified Effort Systems" (effort_override immer setzen) funktionierten Frontend-Berechnungen nicht mehr korrekt.

### Root Cause
**Inkonsistente Migration über 3 Layer:**
1. ✅ **DB**: Migration `effort_override NOT NULL` lief durch
2. ❌ **Edge Function**: Code aktualisiert, aber **nicht deployed**
3. ❌ **Frontend**: Noch alte Fallback-Logik (`effort_override ?? task.effort`)

### Symptome
- Tasks lassen sich nicht completieren (Edge Function Fehler)
- StatsView zeigt falsche Punktzahlen
- Type-Errors in Frontend (wegen `number | null` vs `number`)

### Lösung
**Alle 3 Layer synchron aktualisieren:**

```bash
# 1. Migration pushen
npx supabase db push

# 2. Edge Function deployen (WICHTIG!)
npx supabase functions deploy complete-task

# 3. Frontend-Code updaten (alle Views!)
# - TaskStore: completeTask() Parameter
# - HistoryView: Fallback-Logik entfernen
# - StatsView: Fallback-Logik entfernen
# - Types: effort_override: number (nicht number | null)
```

### Warum passiert das?
- **DB Migrations** und **Edge Function Deployments** sind getrennte Befehle
- Supabase CLI pusht Migrations automatisch, aber deployed Functions NICHT automatisch
- Frontend-Type-Änderungen müssen manuell in allen betroffenen Files gemacht werden

### Prävention
- **Checklist für DB-Schema-Änderungen:**
  1. [ ] Migration schreiben
  2. [ ] Edge Function Code anpassen
  3. [ ] Frontend Types updaten
  4. [ ] Alle Views mit betroffenen Queries updaten
  5. [ ] Migration pushen (`db push`)
  6. [ ] Edge Function deployen (`functions deploy`)
  7. [ ] Type-Check + Lint (`npm run type-check && npm run lint`)
  8. [ ] E2E-Tests (Playwright)

### Related Pattern
- **Parameter-Renames** (z.B. `reason` → `note`): IMMER alle Call-Sites im Frontend suchen (Glob/Grep)
- **Type-Änderungen** (`number | null` → `number`): IMMER TypeScript errors checken

---

## 🐛 Bug #3: Deduct-Subtask Overflow blockiert Parent-Task-Completion (22.12.2025)

### Problem
Wenn die Summe der abgeschlossenen Deduct-Subtasks größer war als der Parent-Task-Effort, konnte der Parent-Task nicht mehr abgeschlossen werden. Die Edge Function gab einen 400-Error zurück.

### Root Cause
Die Edge Function hatte eine strenge Validation, die negative Punkte komplett blockierte:
```typescript
// VORHER: Blockierte den Task komplett
if (finalEffort < 0) {
  return new Response(
    JSON.stringify({ error: 'Nicht genug Punkte!' }),
    { status: 400, ... }
  )
}
```

### Symptome
- Console-Error: `FunctionsHttpError: Edge Function returned a non-2xx status code`
- POST zu `complete-task` gibt 400 Bad Request
- Parent-Task mit abgeschlossenen Deduct-Subtasks kann nicht completed werden
- Problem tritt bei recurring Tasks (nicht daily) auf

### Lösung
Graceful Handling statt Blocking:
```typescript
// NACHHER: Gibt minimum 0 Punkte statt zu blocken
finalEffort = Math.max(0, taskDetails.effort - deductSum)

// Warnung wird geloggt für Debugging
if (taskDetails.effort - deductSum < 0) {
  console.warn(`[Deduct Overflow] Parent effort exceeded...`)
}
```

### Prävention
- Bei Subtask-Erstellung könnte Frontend validieren, dass Deduct-Sum ≤ Parent-Effort
- Edge Function sollte graceful sein und Edge Cases behandeln statt zu blocken
- User bekommt 0 Punkte für Parent wenn Deducts übersteigen (mathematisch korrekt)

---

## 📝 Template für neue Bug-Einträge

```markdown
## 🐛 Bug #X: [Kurze Beschreibung] (DD.MM.YYYY)

### Problem
[Was ist kaputt gegangen?]

### Root Cause
[Warum ist es kaputt gegangen?]

### Symptome
[Wie erkennt man das Problem?]
- Symptom 1
- Symptom 2

### Lösung
[Wie wurde es gefixt?]

### Prävention
[Wie vermeidet man das in Zukunft?]

### Related Patterns
[Ähnliche Probleme, die damit zusammenhängen]
```

---

## 🎯 Lessons Learned

### PostgREST / Supabase Specifics
- Schema Cache wird bei `RENAME` nicht zuverlässig aktualisiert
- Edge Functions müssen separat deployed werden (nicht Teil von `db push`)
- RLS-Policies cached PostgREST auch (bei Changes immer testen!)

### Migration Best Practices
- Column Renames: 3-Step-Migration (ADD → MIGRATE → DROP)
- NOT NULL Constraints: Erst Default-Werte setzen, dann Constraint
- Backfill-Scripts: Immer mit korrekten Daten (nicht 1 als Fallback)

### Full-Stack Consistency
- DB + Edge Function + Frontend müssen synchron sein
- Type-Änderungen: Alle Files mit Grep durchsuchen
- Parameter-Renames: Alle Call-Sites finden (nicht nur Type-Definitionen)
