-- =================================================================
-- SECURITY STUFE 2b — Querbezüge (nur der kleine Teil)
-- =================================================================
-- Dritte Stufe. Unabhängig von 20261102120100,
-- aber erst danach ausrollen (eine Stufe nach der anderen prüfen).
-- Das heutige Frontend ist nicht betroffen: es weist nur Mitglieder zu,
-- gleicht nur zwischen Mitgliedern aus und setzt settlements.created_at nie.
--
-- Bewusst NICHT hier (größer, eigenes Vorhaben): Composite-FKs list_id ↔
-- household_id, created_by-Prüfung auf *_lists/*_items, Realtime-DELETE-
-- Ereignisse ungefilterter Item-Kanäle.
--
-- Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- Rückroll-SQL: am Dateiende.
-- =================================================================

SET search_path = public, pg_temp;

-- -----------------------------------------------------------------
-- 1. tasks.assigned_to muss Mitglied des Haushalts der Aufgabe sein
-- -----------------------------------------------------------------
-- Nur geprüft, wenn sich die Zuweisung wirklich ändert — eine Aufgabe, deren
-- Zugewiesene den Haushalt verlassen hat, bleibt erledig- und bearbeitbar.
-- SECURITY DEFINER, weil die Prüfung die Mitgliederliste unabhängig von der
-- SELECT-Policy des Aufrufers lesen muss; sie liest nur, setzt nichts.
CREATE OR REPLACE FUNCTION public.guard_task_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
     AND NOT EXISTS (
       SELECT 1 FROM public.household_members m
       WHERE m.user_id = NEW.assigned_to AND m.household_id = NEW.household_id
     ) THEN
    RAISE EXCEPTION 'assignee_not_in_household' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_task_assignee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_task_assignee ON public.tasks;
CREATE TRIGGER trg_guard_task_assignee
  BEFORE INSERT OR UPDATE OF assigned_to ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_task_assignee();

-- -----------------------------------------------------------------
-- 2. settlements: Beteiligte sind Mitglieder, created_at ist Serverzeit
-- -----------------------------------------------------------------
-- created_at trägt das 5-Minuten-Löschfenster der DELETE-Policy; ein vom
-- Client gesetztes Zukunftsdatum hielte es beliebig lange offen. Der Client
-- sendet created_at heute nicht (settlementStore) — es greift nur der Default.
-- settled_at bleibt frei wählbar (das Formular lässt ein Datum eintragen).
-- Settlements haben kein UPDATE (keine Policy), daher nur INSERT.
CREATE OR REPLACE FUNCTION public.guard_settlement_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.created_at := now();
  IF NOT EXISTS (
       SELECT 1 FROM public.household_members m
       WHERE m.user_id = NEW.from_user_id AND m.household_id = NEW.household_id)
     OR NOT EXISTS (
       SELECT 1 FROM public.household_members m
       WHERE m.user_id = NEW.to_user_id AND m.household_id = NEW.household_id) THEN
    RAISE EXCEPTION 'settlement_party_not_in_household' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_settlement_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_settlement_insert ON public.settlements;
CREATE TRIGGER trg_guard_settlement_insert
  BEFORE INSERT ON public.settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_settlement_insert();

-- =================================================================
-- RÜCKROLL (manuell):
--
-- DROP TRIGGER IF EXISTS trg_guard_settlement_insert ON public.settlements;
-- DROP FUNCTION IF EXISTS public.guard_settlement_insert();
-- DROP TRIGGER IF EXISTS trg_guard_task_assignee ON public.tasks;
-- DROP FUNCTION IF EXISTS public.guard_task_assignee();
--
-- Danach: `npx supabase migration repair --status reverted 20261102120200`
-- =================================================================
