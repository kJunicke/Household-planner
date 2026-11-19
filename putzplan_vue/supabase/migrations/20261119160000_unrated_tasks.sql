-- =================================================================
-- PUNKTE: unbewertete Aufgaben
-- =================================================================
-- Spec „Punkte und Ausgleich“ (CONTEXT.md § Standardpunkte, § unbewertet):
-- Standardpunkte (`tasks.effort`) dürfen fehlen. NULL heißt unbewertet; eine
-- solche Aufgabe wird beim ersten Erledigen bewertet (Edge Function
-- `complete-task`, Parameter `standardPoints`).
--
-- Nur das Schema. Bestehende Zeilen bleiben unverändert — alle Aufgaben auf
-- NULL zu setzen ist eine eigene Migration (Umstellung im Haushalt).
-- Neue Aufgaben entstehen weiter bewertet: das verlangt der Client beim Anlegen.
-- =================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

ALTER TABLE public.tasks ALTER COLUMN effort DROP NOT NULL;

-- `tasks_effort_check` (Migration 20261119120000) bleibt `effort BETWEEN 1 AND
-- 999`: ein CHECK mit NULL ist nicht verletzt. Explizit neu gesetzt, damit die
-- Absicht im Schema steht.
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_effort_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_effort_check CHECK (effort IS NULL OR effort BETWEEN 1 AND 999);

COMMIT;
