-- =================================================================
-- SOFT DELETE für Tasks
-- =================================================================
-- Statt Tasks wirklich zu löschen, setzen wir deleted_at.
-- Vorteile:
-- 1. Task-Namen bleiben in der Historie sichtbar
-- 2. Completions bleiben intakt (FK bleibt CASCADE, aber nichts wird gelöscht)
-- 3. Theoretisch wiederherstellbar
-- =================================================================

-- 1. deleted_at Column hinzufügen
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Index für Performance bei WHERE deleted_at IS NULL Queries
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at
  ON public.tasks(deleted_at)
  WHERE deleted_at IS NULL;

-- 3. Kommentar für Dokumentation
COMMENT ON COLUMN public.tasks.deleted_at IS
  'Soft Delete: NULL = aktiv, Timestamp = gelöscht. Gelöschte Tasks bleiben für Historie erhalten.';
