-- =================================================================
-- PUNKTE: Umstellung — alle Aufgaben unbewertet
-- =================================================================
-- Spec „Punkte und Ausgleich“, ADR-0005 (Skalenwechsel per Stichtag, ohne
-- Umrechnung): die Standardpunkte (`tasks.effort`) jeder Aufgabe werden geleert.
-- Jede Aufgabe ist danach unbewertet und bekommt ihre Punkte auf der neuen
-- Skala beim nächsten Erledigen oder im Bearbeiten-Dialog.
--
-- ⚠️ NICHT ANWENDEN, BEVOR
--   1. der Haushalt die alte Bilanz einmal ausgeglichen hat (ADR-0005: ein
--      gewöhnlicher Ausgleich auf der alten Skala, außerhalb der App-Logik);
--   2. der Client aus feature/punkte-und-ausgleich live ist (er kennt
--      unbewertete Aufgaben: Bewerten-Dialog vor dem Erledigen, `effort: null`);
--   3. die Edge Function `complete-task` mit `standardPoints` deployt ist.
-- Ein alter Client oder eine alte Function kann eine unbewertete Aufgabe nicht
-- erledigen. Angewendet wird sie bei der Umstellung im Haushalt.
--
-- Betroffen: alle Zeilen in `tasks` — Hauptaufgaben jedes Typs (recurring,
-- daily, one-time, project), Unteraufgaben (auch „Am Projekt arbeiten“) und
-- gelöschte Aufgaben (deleted_at gesetzt); gelöschte, damit ein Wiederherstellen
-- keine Punkte der alten Skala zurückbringt.
-- Unverändert: `task_completions` (effort_override bleibt Historie) und
-- `settlements`.
--
-- Setzt 20261119160000_unrated_tasks.sql voraus (effort nullable). Fehlt die,
-- bricht die Migration mit einer klaren Meldung ab und ändert nichts.
-- Die Trigger auf `tasks` feuern nur bei UPDATE OF task_type,
-- subtask_points_mode, parent_task_id bzw. assigned_to, also nicht hier.
-- Wiederholbar: ein zweiter Lauf findet nichts mehr.
-- =================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

DO $$
DECLARE
  cleared integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tasks'
      AND column_name = 'effort'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'tasks.effort ist noch NOT NULL'
      USING DETAIL = 'Erst 20261119160000_unrated_tasks.sql anwenden.';
  END IF;

  UPDATE public.tasks
  SET effort = NULL
  WHERE effort IS NOT NULL;

  GET DIAGNOSTICS cleared = ROW_COUNT;
  RAISE NOTICE 'Standardpunkte geleert: % Aufgaben', cleared;
END;
$$;

COMMIT;
