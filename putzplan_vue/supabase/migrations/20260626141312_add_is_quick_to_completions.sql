-- Quick-Aufgaben: einmalige Aufgaben, die direkt beim Erstellen abgeschlossen
-- werden und nur in der Historie erscheinen. Dieses Flag markiert die zugehörige
-- Completion, damit die Historie sie sichtbar als "Quick" kennzeichnen kann.
ALTER TABLE task_completions
ADD COLUMN IF NOT EXISTS is_quick BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN task_completions.is_quick IS
  'TRUE für Quick-Aufgaben (einmalig erstellt + sofort abgeschlossen, nur in Historie sichtbar).';
