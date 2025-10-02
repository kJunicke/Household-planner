-- =====================================================
-- STEP 1: PostgreSQL Function - is_task_completed
-- =====================================================
--
-- WAS MACHT DAS?
-- Diese Function berechnet ob eine Task aktuell "completed" ist.
-- Sie schaut sich die letzte completion an und prüft ob sie noch gültig ist.
--
-- WANN IST EINE TASK COMPLETED?
-- 1. Einmalige Task (recurrence_days = 0): Sobald einmal erledigt → immer completed
-- 2. Wiederkehrende Task (z.B. recurrence_days = 3): Nur completed wenn vor <3 Tagen erledigt
-- 3. Nie erledigt: Nicht completed
--
-- BEISPIEL:
-- Task "Küche putzen" mit recurrence_days = 3
-- - Erledigt am 1. Januar → Bis 4. Januar: completed = TRUE
-- - Am 5. Januar → completed = FALSE (mehr als 3 Tage her)
--
-- =====================================================

CREATE OR REPLACE FUNCTION is_task_completed(
  p_task_id UUID,              -- Welche Task prüfen wir?
  p_recurrence_days INTEGER    -- Wie viele Tage gilt die Task als erledigt?
) RETURNS BOOLEAN AS $$        -- Gibt TRUE oder FALSE zurück

DECLARE
  -- Variable zum Speichern der letzten Completion
  last_completion TIMESTAMPTZ; -- TIMESTAMPTZ = Zeitstempel mit Timezone

BEGIN
  -- ==========================================
  -- SCHRITT 1: Letzte Completion finden
  -- ==========================================
  -- Suche in task_completions die neueste completion für diese Task
  SELECT completed_at INTO last_completion
  FROM task_completions
  WHERE task_id = p_task_id      -- Nur für diese Task
  ORDER BY completed_at DESC     -- Sortiere: Neueste zuerst
  LIMIT 1;                       -- Nimm nur die neueste

  -- BEISPIEL: Für task_id = "abc123"
  -- task_completions Tabelle:
  --   completion_id | task_id | completed_at
  --   -----------------------------------------------
  --   xyz1         | abc123  | 2025-01-01 10:00:00
  --   xyz2         | abc123  | 2025-01-05 14:30:00  ← Diese wird gefunden!
  --   xyz3         | def456  | 2025-01-06 09:00:00


  -- ==========================================
  -- SCHRITT 2: Keine Completion gefunden?
  -- ==========================================
  IF last_completion IS NULL THEN
    RETURN FALSE;  -- Task wurde nie erledigt → nicht completed
  END IF;


  -- ==========================================
  -- SCHRITT 3: Einmalige Task?
  -- ==========================================
  -- recurrence_days = 0 bedeutet: Task wiederholt sich nicht
  IF p_recurrence_days = 0 THEN
    RETURN TRUE;   -- Einmal erledigt = für immer erledigt
  END IF;

  -- BEISPIEL:
  -- Task "Steuererklärung 2025" mit recurrence_days = 0
  -- Einmal erledigt am 1. März → Bleibt für immer completed


  -- ==========================================
  -- SCHRITT 4: Wiederkehrende Task prüfen
  -- ==========================================
  -- Prüfe: Ist die letzte completion noch "frisch" genug?
  --
  -- NOW() = Aktuelle Zeit (z.B. 5. Januar 2025)
  -- last_completion = z.B. 1. Januar 2025
  -- NOW() - last_completion = 4 Tage
  -- p_recurrence_days = 3 Tage
  -- → 4 Tage < 3 Tage? → FALSE → Task ist abgelaufen!

  RETURN (NOW() - last_completion) < (p_recurrence_days || ' days')::INTERVAL;

  -- ERKLÄRUNG:
  -- (p_recurrence_days || ' days')  → "3" + " days" = "3 days"
  -- ::INTERVAL                       → Konvertiere zu PostgreSQL Interval Type
  -- NOW() - last_completion          → Zeitdifferenz als Interval
  -- < Vergleich                      → Ist Differenz kleiner als recurrence_days?

  -- BEISPIELE:
  -- last_completion = vor 2 Tagen, recurrence_days = 3 → TRUE (noch gültig)
  -- last_completion = vor 5 Tagen, recurrence_days = 3 → FALSE (abgelaufen)

END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TEST (Optional - kannst du in Supabase ausführen)
-- =====================================================
-- Diese Query testet die Function für alle deine Tasks:
--
-- SELECT
--   task_id,
--   title,
--   recurrence_days,
--   completed as current_value,
--   is_task_completed(task_id, recurrence_days) as should_be
-- FROM tasks
-- LIMIT 5;
--
-- Wenn current_value ≠ should_be → Trigger muss noch fixen!