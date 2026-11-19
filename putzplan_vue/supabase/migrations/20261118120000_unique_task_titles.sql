-- Keine zwei aktiven Hauptaufgaben mit demselben Titel je Haushalt (→ CONTEXT.md „Duplikat").
--
-- "Derselbe Titel" = ASCII-Leerraum am Rand entfernt und innen zu einem Leerzeichen
-- zusammengezogen, Groß-/Kleinschreibung über eine feste Tabelle (A–Z, Ä, Ö, Ü) statt
-- `lower()`, das an der Locale der Datenbank hängt. Dieselbe Regel steht im Frontend in
-- `src/lib/taskDuplicates.ts` (`normalizeTaskTitle`); wer eine ändert, ändert beide.
-- Unteraufgaben ("Am Projekt arbeiten" an jedem Projekt) und gelöschte Zeilen (darunter
-- alle Quick-Aufgaben) sind ausgenommen.
--
-- Vorher müssen bestehende Duplikate weg, sonst ließe sich der Index nicht anlegen.
--
-- A) Gleicher Titel, GLEICHER Typ → zusammenführen. Je Gruppe bleibt eine Aufgabe:
--      1. eine offene (dran) vor einer erledigten — sonst verschwände eine fällige
--         Aufgabe von der Wand;
--      2. dann die mit den meisten Erledigungen, die zuletzt erledigte, die älteste.
--    Die übrigen gehen in ihr auf:
--      - ihre Erledigungen werden auf die bleibende umgehängt — der Verlauf zeigt sie
--        weiter als aktive Aufgabe, Punkte und Projektsummen bleiben;
--      - `last_completed_at` der bleibenden wird das jüngste der Gruppe;
--      - ihre Unteraufgaben wandern zur bleibenden; hat die schon eine mit demselben
--        Titel, gehen nur deren Erledigungen dorthin und die doppelte wird gelöscht;
--      - die Aufgabe selbst wird SOFT gelöscht (deleted_at).
--
-- B) Gleicher Titel, VERSCHIEDENER Typ (etwa Projekt "Garten" und wiederkehrend
--    "Garten") → nicht zusammenführen: Projekt und Zeitplan folgen verschiedenen Regeln,
--    eine Verschmelzung nähme einer Seite stillschweigend Daten. Stattdessen bekommt jede
--    außer der ersten (Reihenfolge wie in A) ihren Typ in Klammern angehängt.
--
-- Jede Änderung wird vorher im Schema `backup` festgehalten (→ RÜCKROLL unten).
-- Idempotent: ein zweiter Lauf findet keine Duplikate mehr und ändert nichts.
--
-- Läuft als EINE Transaktion, ausdrücklich: `supabase db push` öffnet selbst keine,
-- und `LOCK TABLE` geht nur in einer. Die Sperre hält Schreibzugriffe der App an, bis
-- der Index steht — sonst könnte zwischen Aufräumen und Index ein neues Duplikat
-- entstehen und der Index scheitern. Lesen bleibt möglich. Scheitert etwas, rollt alles
-- zurück.

BEGIN;

LOCK TABLE public.tasks, public.task_completions IN SHARE ROW EXCLUSIVE MODE;

-- Kein Teil der API: PostgREST liefert nur `public` aus; die Rechte sind trotzdem zu.
CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS backup.dedup_20261118_completions (
  completion_id uuid PRIMARY KEY,
  old_task_id uuid NOT NULL
);
CREATE TABLE IF NOT EXISTS backup.dedup_20261118_tasks (
  task_id uuid PRIMARY KEY,
  old_title text NOT NULL,
  old_parent_task_id uuid,
  old_deleted_at timestamptz,
  old_last_completed_at timestamptz
);

CREATE TEMP TABLE dedup_norm AS
SELECT
  t.task_id,
  t.household_id,
  t.parent_task_id,
  t.task_type,
  t.completed,
  t.last_completed_at,
  t.created_at,
  translate(
    regexp_replace(regexp_replace(t.title, '[ \t\n\r\f\v]+', ' ', 'g'), '^ | $', '', 'g'),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ',
    'abcdefghijklmnopqrstuvwxyzäöü'
  ) AS norm,
  (SELECT count(*) FROM public.task_completions c WHERE c.task_id = t.task_id) AS n_completions
FROM public.tasks t
WHERE t.deleted_at IS NULL;

-- A) Je Duplikat gleichen Typs die Aufgabe, in der es aufgeht.
CREATE TEMP TABLE dedup_parent AS
WITH ranked AS (
  SELECT
    n.*,
    row_number() OVER (
      PARTITION BY n.household_id, n.norm, n.task_type
      ORDER BY n.completed ASC, n.n_completions DESC, n.last_completed_at DESC NULLS LAST,
               n.created_at ASC, n.task_id
    ) AS rn
  FROM dedup_norm n
  WHERE n.parent_task_id IS NULL
)
SELECT d.task_id AS dropped_id, k.task_id AS keeper_id
FROM ranked d
JOIN ranked k
  ON k.household_id = d.household_id AND k.norm = d.norm AND k.task_type = d.task_type AND k.rn = 1
WHERE d.rn > 1;

-- Unteraufgaben der wegfallenden Aufgaben; `twin_id` = gleichnamige an der bleibenden.
CREATE TEMP TABLE dedup_sub AS
SELECT
  s.task_id AS sub_id,
  p.keeper_id,
  (
    SELECT ks.task_id
    FROM dedup_norm ks
    WHERE ks.parent_task_id = p.keeper_id AND ks.norm = s.norm
    ORDER BY ks.created_at, ks.task_id
    LIMIT 1
  ) AS twin_id
FROM dedup_norm s
JOIN dedup_parent p ON p.dropped_id = s.parent_task_id;

-- B) Nach A verbleibende Namensgleiche verschiedenen Typs: alle außer der ersten umbenennen.
CREATE TEMP TABLE dedup_rename AS
WITH remaining AS (
  SELECT
    n.*,
    row_number() OVER (
      PARTITION BY n.household_id, n.norm
      ORDER BY n.completed ASC, n.n_completions DESC, n.last_completed_at DESC NULLS LAST,
               n.created_at ASC, n.task_id
    ) AS rn
  FROM dedup_norm n
  WHERE n.parent_task_id IS NULL
    AND n.task_id NOT IN (SELECT dropped_id FROM dedup_parent)
)
SELECT
  r.task_id,
  CASE r.task_type
    WHEN 'project' THEN ' (Projekt)'
    WHEN 'daily' THEN ' (täglich)'
    WHEN 'one-time' THEN ' (einmalig)'
    ELSE ' (wiederkehrend)'
  END AS suffix
FROM remaining r
WHERE r.rn > 1;

-- Sicherung — vor jeder Änderung.
INSERT INTO backup.dedup_20261118_completions (completion_id, old_task_id)
SELECT c.completion_id, c.task_id
FROM public.task_completions c
WHERE c.task_id IN (SELECT dropped_id FROM dedup_parent)
   OR c.task_id IN (SELECT sub_id FROM dedup_sub WHERE twin_id IS NOT NULL)
ON CONFLICT DO NOTHING;

INSERT INTO backup.dedup_20261118_tasks
  (task_id, old_title, old_parent_task_id, old_deleted_at, old_last_completed_at)
SELECT t.task_id, t.title, t.parent_task_id, t.deleted_at, t.last_completed_at
FROM public.tasks t
WHERE t.task_id IN (SELECT dropped_id FROM dedup_parent)
   OR t.task_id IN (SELECT keeper_id FROM dedup_parent)
   OR t.task_id IN (SELECT sub_id FROM dedup_sub)
   OR t.task_id IN (SELECT task_id FROM dedup_rename)
ON CONFLICT DO NOTHING;

-- A, Unteraufgaben mit Zwilling: Erledigungen zum Zwilling, die doppelte löschen.
UPDATE public.task_completions c
SET task_id = s.twin_id
FROM dedup_sub s
WHERE c.task_id = s.sub_id AND s.twin_id IS NOT NULL;

UPDATE public.tasks t
SET deleted_at = now()
FROM dedup_sub s
WHERE t.task_id = s.sub_id AND s.twin_id IS NOT NULL;

-- A, Unteraufgaben ohne Zwilling: zur bleibenden umhängen. Gleicher Typ, also hält
-- auch der Trigger `guard_task_type` still (kein `deduct` unter ein Projekt).
UPDATE public.tasks t
SET parent_task_id = s.keeper_id
FROM dedup_sub s
WHERE t.task_id = s.sub_id AND s.twin_id IS NULL;

-- A, Hauptaufgaben: Erledigungen umhängen, jüngste Erledigung übernehmen, löschen.
UPDATE public.task_completions c
SET task_id = p.keeper_id
FROM dedup_parent p
WHERE c.task_id = p.dropped_id;

UPDATE public.tasks k
SET last_completed_at = g.latest
FROM (
  SELECT p.keeper_id, max(t.last_completed_at) AS latest
  FROM dedup_parent p
  JOIN public.tasks t ON t.task_id = p.dropped_id
  GROUP BY p.keeper_id
) g
WHERE k.task_id = g.keeper_id
  AND g.latest IS NOT NULL
  AND (k.last_completed_at IS NULL OR k.last_completed_at < g.latest);

UPDATE public.tasks t
SET deleted_at = now()
WHERE t.task_id IN (SELECT dropped_id FROM dedup_parent);

-- B) Umbenennen. Kollidiert auch der neue Name, scheitert unten der Index und die ganze
-- Migration rollt zurück — lieber gar nicht als halb.
UPDATE public.tasks t
SET title = t.title || r.suffix
FROM dedup_rename r
WHERE t.task_id = r.task_id;

DROP TABLE dedup_rename;
DROP TABLE dedup_sub;
DROP TABLE dedup_parent;
DROP TABLE dedup_norm;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_unique_active_title
  ON public.tasks (
    household_id,
    translate(
      regexp_replace(regexp_replace(title, '[ \t\n\r\f\v]+', ' ', 'g'), '^ | $', '', 'g'),
      'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ',
      'abcdefghijklmnopqrstuvwxyzäöü'
    )
  )
  WHERE deleted_at IS NULL AND parent_task_id IS NULL;

COMMIT;

-- =================================================================
-- RÜCKROLL (manuell im SQL-Editor, in dieser Reihenfolge)
-- =================================================================
-- DROP INDEX IF EXISTS public.tasks_unique_active_title;
--
-- UPDATE public.task_completions c SET task_id = b.old_task_id
-- FROM backup.dedup_20261118_completions b WHERE c.completion_id = b.completion_id;
--
-- UPDATE public.tasks t
-- SET title = b.old_title,
--     parent_task_id = b.old_parent_task_id,
--     deleted_at = b.old_deleted_at,
--     last_completed_at = b.old_last_completed_at
-- FROM backup.dedup_20261118_tasks b WHERE t.task_id = b.task_id;
--
-- DROP SCHEMA backup CASCADE;  -- erst, wenn nichts mehr zurückzuholen ist
