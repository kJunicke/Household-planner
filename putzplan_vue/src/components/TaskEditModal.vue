<script setup lang="ts">
import type { Task } from '@/types/Task'
import { ref, computed } from 'vue'
import { canPostpone } from '@/lib/taskSchedule'

interface Props {
  task: Task
}

interface Emits {
  (e: 'close'): void
  (e: 'confirm', updates: Partial<Task>): void
  (e: 'delete'): void
  (e: 'assign'): void
  (e: 'manage-subtasks'): void
  (e: 'postpone'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Verschieben gibt es nur, wo es Sinn ergibt (nicht bei täglich und Projekt).
// Die Regel steht im Zeitplan-Modul, damit Karte und Modal dieselbe meinen.
//
// **Zusätzlich NICHT an einer wirklich erledigten Aufgabe** (`completed`,
// kein Verschiebe-Datum): „verschieben" räumt eine Aufgabe aus dem Weg, die
// noch dran ist (siehe CONTEXT.md, „verschieben" — „ohne dass jemand sie
// erledigt hat"). An einer erledigten Aufgabe ist die Frage „wann wieder
// dran?" sinnlos, weil die nächste Fälligkeit bereits aus
// `last_completed_at` und der Kadenz folgt. Ein Verschiebe-Datum ERSETZT
// diese Ableitung durch eine Handeingabe: `reset_recurring_tasks()`
// schaltet die Kadenz-Weckklausel ab, sobald `postponed_until` gesetzt ist,
// und macht das gewählte Datum zur ALLEINIGEN Weckquelle — an einer
// erledigten Aufgabe holt das die nächste Fälligkeit zu früh zurück
// (Ticket 04 / QC-Befund 1).
//
// **`task.completed` allein taugt dafür NICHT als Wächter**, weil
// `taskStore.postponeTask` es bei jeder Verschiebung selbst auf `true`
// setzt — auch bei einer, die von einer noch offenen (`dran`) Aufgabe
// ausgeht (muss es: sonst bliebe sie fälschlich „dran"). Eine bereits
// verschobene Aufgabe ist damit PER DEFINITION `completed`, und an dieser
// einen Spalte sind „wirklich erledigt" und „bereits verschoben"
// ununterscheidbar — dieselbe Falle wie in `WallDoneList.vue` (dortiger
// Kommentar zu `rows()`, QC-Befund 2), nur beim Schreiben statt beim Lesen.
// Das zweite Feld `postponed_until` trennt die beiden:
//
// - **wirklich erledigt** (`completed`, kein Datum) → verborgen. Befund 1
//   bleibt geschlossen.
// - **dran** (`!completed`) → sichtbar, unverändert.
// - **bereits verschoben** (`completed` UND `postponed_until` gesetzt) →
//   sichtbar. Ein neues Datum ist dort harmlos: die Aufgabe steht ohnehin
//   schon im Verschoben-Zustand, `postponed_until` ist bereits die alleinige
//   Weckquelle, und ein zweites Verschieben tauscht nur eine Handeingabe
//   gegen eine andere — es entsteht kein Zustand, den es vorher nicht gab.
//   (Eine Zeile mit ECHTER Erledigung UND gesetztem Verschiebe-Datum — die
//   Altdaten aus Befund 2 — zeigt den Knopf hier ebenfalls wieder. Das ist
//   kein neuer Fehler, sondern der Weg, genau diese Zeilen zu bereinigen.)
//
// **Betrifft auch das klassische Aussehen**, nicht nur die Pinnwand:
// `TaskCard.vue` rendert den Bearbeiten-Stift ohne `completed`-Bedingung,
// verschobene Aufgaben laufen dort unter der Kategorie „Erledigt" und nutzen
// dasselbe Modal. Ohne den `postponed_until`-Zweig ließe sich dort ein
// bereits gesetztes Verschiebe-Datum nicht mehr ändern oder aufheben, ohne
// den Umweg über „wieder dreckig" — das war vor diesem Kommentar kurzzeitig
// genau der Stand, und Ticket 04 nennt nur die Pinnwand. Wer diese Bedingung
// künftig anfasst, MUSS beide Ansichten im Kopf haben, nicht nur den
// Erledigt-Streifen.
//
// `canPostpone` prüft nur den `task_type` und kennt keinen der drei
// Zustände oben — dieser zweite Teil der Bedingung ist deshalb Pflicht,
// nicht optional.
const showPostpone = computed(
  () => canPostpone(props.task) && (!props.task.completed || props.task.postponed_until !== null)
)

// Der Typ „Projekt" steht in der Liste, ist aber KEIN Wechselziel — in keine
// Richtung. Ohne die Option stünde das Feld bei einem Projekt auf einem Wert, den
// es nicht gibt, und wäre leer (Ticket 03-4). Auswählbar darf sie trotzdem nicht
// sein, weil ein Typwechsel Zustand hinterlässt, den dieses Modal nicht mitzieht:
//
// - Ein Projekt bekommt seine Unteraufgabe „Am Projekt arbeiten" NUR beim Anlegen
//   (`taskStore.createTask`, Zweig `data.task_type === 'project'`). Eine nachträglich
//   zum Projekt gemachte Aufgabe hätte sie nie.
// - Die erlaubten Punktmodi hängen am Typ (`SubtaskManagementModal.availableModes`:
//   Projekt nur `checklist`/`bonus`). Bestehende `deduct`-Unteraufgaben würden beim
//   Wechsel zu „Projekt" nicht umgestellt, aber weiter abgezogen
//   (`taskStore` Punktberechnung filtert `deduct` ohne Blick auf den Parent-Typ).
// - Projekte sind an mehreren Stellen ausgenommen (Emphasis-Reset beim Erledigen,
//   Gruppierung in `useTaskBoard`) — ein Wechsel verschiebt eine Aufgabe samt
//   Erledigungen stillschweigend in ein anderes Regelwerk.
//
// Deshalb: bei einem Projekt sind die anderen Typen gesperrt, sonst ist „Projekt"
// gesperrt. Anzeigen ja, wechseln nein.
const isProject = computed(() => props.task.task_type === 'project')

const editForm = ref({
  title: props.task.title,
  effort: props.task.effort,
  task_type: props.task.task_type,
  recurrence_days: props.task.recurrence_days
})

const canConfirm = computed(() => {
  return editForm.value.title.trim().length > 0 && editForm.value.effort >= 1
})

const handleConfirm = () => {
  if (!canConfirm.value) return

  // Validierung: Wenn task_type !== 'recurring', setze recurrence_days = 0
  const updates = { ...editForm.value }
  if (updates.task_type !== 'recurring') {
    updates.recurrence_days = 0
  }

  emit('confirm', updates)
}

const handleClose = () => {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click="handleClose">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3 class="modal-title">Aufgabe bearbeiten</h3>
          <button class="btn-close" @click="handleClose" aria-label="Schließen">×</button>
        </div>

        <div class="modal-body">
          <form @submit.prevent="handleConfirm">
            <div class="mb-3">
              <label for="title" class="form-label">Titel</label>
              <input
                type="text"
                class="form-control"
                id="title"
                v-model="editForm.title"
                required
              />
            </div>

            <div class="mb-3">
              <label for="task-type" class="form-label">Typ</label>
              <select
                class="form-select"
                id="task-type"
                v-model="editForm.task_type"
                required
              >
                <option value="recurring" :disabled="isProject">Zeitbasiert</option>
                <option value="daily" :disabled="isProject">Täglich</option>
                <option value="one-time" :disabled="isProject">Einmalig</option>
                <option value="project" :disabled="!isProject">Projekt</option>
              </select>
            </div>

            <div class="mb-3">
              <label for="effort" class="form-label">Aufwand</label>
              <input
                type="number"
                class="form-control"
                id="effort"
                v-model.number="editForm.effort"
                min="1"
                required
              />
            </div>

            <div v-if="editForm.task_type === 'recurring'" class="mb-3">
              <label for="recurrence" class="form-label">Wiederholung (Tage)</label>
              <input
                type="number"
                class="form-control"
                id="recurrence"
                v-model.number="editForm.recurrence_days"
                min="1"
                required
              />
            </div>
          </form>
        </div>

        <div class="modal-footer">
          <!-- Zusätzliche Actions links -->
          <div class="footer-actions-left">
            <button
              v-if="showPostpone"
              class="btn btn-outline-warning btn-compact"
              @click="emit('postpone')"
              title="Aufgabe verschieben"
            >
              <i class="bi bi-calendar-plus"></i>
            </button>
            <button class="btn btn-outline-secondary btn-compact" @click="emit('assign')" title="Aufgabe zuweisen">
              <i class="bi bi-person"></i>
            </button>
            <button
              v-if="!task.parent_task_id"
              class="btn btn-outline-primary btn-compact"
              @click="emit('manage-subtasks')"
              title="Subtasks verwalten"
            >
              <i class="bi bi-list-nested"></i>
            </button>
            <button class="btn btn-outline-danger btn-compact" @click="emit('delete')" title="Aufgabe löschen">
              <i class="bi bi-trash"></i>
            </button>
          </div>

          <!-- Primary Actions rechts -->
          <div class="footer-actions-right">
            <button class="btn btn-secondary" @click="handleClose">
              Abbrechen
            </button>
            <button
              class="btn btn-primary"
              :disabled="!canConfirm"
              @click="handleConfirm"
            >
              Speichern
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Component-specific styles only */
.mb-3 {
  margin-bottom: 1rem;
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--color-text-primary);
}

.form-control,
.form-select {
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text-primary);
  transition: border-color var(--transition-base);
}

.form-control:focus,
.form-select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.15);
}

/* Footer Layout */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.footer-actions-left {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.footer-actions-right {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}

/* Kompakte Button-Variante für Action-Icons */
.btn-compact {
  padding: 0.5rem 0.75rem;
  font-size: 1.125rem;
  min-width: 44px;
}

@media (max-width: 640px) {
  .footer-actions-left,
  .footer-actions-right {
    width: 100%;
    justify-content: stretch;
  }

  .footer-actions-left .btn,
  .footer-actions-right .btn {
    flex: 1;
  }
}
</style>
