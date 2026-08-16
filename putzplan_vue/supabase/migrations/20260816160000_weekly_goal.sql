-- =================================================================
-- WOCHENZIEL AM HAUSHALT (Pinnwand-Redesign, Etappe 3 / Ticket 07)
-- =================================================================
-- Zwei Felder am Haushalt, nicht an der Person: das Wochenziel gehört
-- dem Haushalt, jedes Mitglied darf es ändern.
--
--   weekly_goal_points  Zielpunktzahl der laufenden Woche
--   week_start_day      Wochentag, an dem die Woche beginnt
--                       (0 = Sonntag … 6 = Samstag, JS-Konvention
--                        wie Date#getDay, damit im Frontend nicht
--                        umgerechnet werden muss)
--
-- BEWUSST KEINE HISTORIE: sichtbar ist immer nur die laufende Woche.
-- Eine geänderte Zielzahl gilt deshalb sofort; ein geänderter
-- Wochenstart wirkt erst ab der nächsten Woche — das ist eine Regel
-- der Anwendung, nicht des Schemas. Eine Tabelle mit `gültig_ab` wäre
-- eine spätere Nachrüstung, falls der Verlauf alte Wochen zeigen soll.
--
-- RLS: `households` hat bereits RLS aktiv, inklusive einer
-- UPDATE-Policy für alle Mitglieder des Haushalts
-- (20251026000001_rls_policies.sql). Neue Spalten sind davon
-- automatisch abgedeckt — Policies gelten je Zeile, nicht je Spalte.
-- Es braucht deshalb hier keine neue Policy, nur diese Notiz.
-- =================================================================

ALTER TABLE households
  ADD COLUMN IF NOT EXISTS weekly_goal_points INTEGER NOT NULL DEFAULT 30
    CHECK (weekly_goal_points > 0 AND weekly_goal_points <= 1000);

ALTER TABLE households
  ADD COLUMN IF NOT EXISTS week_start_day SMALLINT NOT NULL DEFAULT 1
    CHECK (week_start_day BETWEEN 0 AND 6);

COMMENT ON COLUMN households.weekly_goal_points IS
  'Gemeinsames Wochenziel in Punkten. Gilt sofort für die laufende Woche.';

COMMENT ON COLUMN households.week_start_day IS
  'Wochenstart, 0 = Sonntag … 6 = Samstag (JS Date#getDay). Wirkt erst ab der nächsten Woche.';
