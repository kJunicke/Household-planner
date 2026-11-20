<script setup lang="ts">
import { computed, ref } from 'vue'
import { useHouseholdStore } from '@/stores/householdStore'
import { participantNameProblem, participantNameProblemText } from '@/lib/potRules'
import { POT_NAME_MAX_LENGTH, POT_PARTICIPANT_NAME_MAX_LENGTH } from '@/lib/limits'

const emit = defineEmits<{
  submit: [payload: { name: string; memberIds: string[]; guestNames: string[] }]
  close: []
}>()

defineProps<{ saving: boolean }>()

const householdStore = useHouseholdStore()

const name = ref('')
// Beide (alle) Mitglieder sind vorgeschlagen und lassen sich abwählen.
const memberIds = ref<string[]>(householdStore.householdMembers.map((m) => m.user_id))
const guestNames = ref<string[]>([])
const newGuest = ref('')

const takenNames = computed(() => [
  ...householdStore.householdMembers
    .filter((m) => memberIds.value.includes(m.user_id))
    .map((m) => m.display_name),
  ...guestNames.value,
])

const guestProblem = computed(() =>
  newGuest.value.trim() === '' ? null : participantNameProblem(newGuest.value, takenNames.value),
)

/** Wie der doppelte Name hier erklärt wird; leer und zu lang klingen überall gleich. */
const DUPLICATE_NAME_TEXT = 'Den Namen gibt es schon'

const addGuest = () => {
  if (newGuest.value.trim() === '' || guestProblem.value) return
  guestNames.value.push(newGuest.value.trim())
  newGuest.value = ''
}

const removeGuest = (index: number) => {
  guestNames.value.splice(index, 1)
}

// Ein Name, der zweimal vorkommt (etwa ein wieder angehaktes Mitglied mit
// dem Namen eines Gasts), ließe die Datenbank das Anlegen abweisen.
const hasDuplicate = computed(
  () => new Set(takenNames.value.map((n) => n.trim().toLowerCase())).size < takenNames.value.length,
)

const isValid = computed(
  () =>
    name.value.trim().length > 0 &&
    memberIds.value.length + guestNames.value.length > 0 &&
    !hasDuplicate.value,
)

const handleSubmit = () => {
  if (!isValid.value) return
  emit('submit', {
    name: name.value.trim(),
    memberIds: [...memberIds.value],
    guestNames: [...guestNames.value],
  })
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal-content pot-create-modal" @click.stop>
        <div class="modal-header">
          <h5 class="modal-title">Neuer Topf</h5>
          <button class="btn-close" @click="emit('close')" aria-label="Schließen"></button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Anlass</label>
            <input
              v-model="name"
              type="text"
              class="form-control"
              placeholder="z.B. Urlaub Sylt, Geburtstag..."
              :maxlength="POT_NAME_MAX_LENGTH"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Teilnehmer</label>
            <div class="participant-box">
              <label
                v-for="m in householdStore.householdMembers"
                :key="m.user_id"
                class="member-row"
              >
                <input
                  v-model="memberIds"
                  type="checkbox"
                  class="form-check-input"
                  :value="m.user_id"
                />
                <span>{{ m.display_name }}</span>
              </label>
              <div v-for="(g, i) in guestNames" :key="g" class="member-row">
                <i class="bi bi-person"></i>
                <span class="flex-grow-1">{{ g }}</span>
                <button
                  type="button"
                  class="btn btn-sm btn-link text-muted p-0"
                  :aria-label="`${g} entfernen`"
                  @click="removeGuest(i)"
                >
                  <i class="bi bi-x-lg"></i>
                </button>
              </div>
            </div>
            <div class="add-guest">
              <input
                v-model="newGuest"
                type="text"
                class="form-control"
                :class="{ 'is-invalid': guestProblem }"
                placeholder="Weitere Person per Namen"
                :maxlength="POT_PARTICIPANT_NAME_MAX_LENGTH"
                @keyup.enter="addGuest"
              />
              <button
                type="button"
                class="btn btn-outline-primary"
                :disabled="newGuest.trim() === '' || !!guestProblem"
                @click="addGuest"
              >
                <i class="bi bi-plus-lg"></i>
              </button>
            </div>
            <div v-if="guestProblem" class="invalid-hint">
              {{ participantNameProblemText(guestProblem, DUPLICATE_NAME_TEXT) }}
            </div>
            <div v-else-if="hasDuplicate" class="invalid-hint">
              Ein Name steht doppelt in der Liste
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="emit('close')">Abbrechen</button>
          <button class="btn btn-primary" @click="handleSubmit" :disabled="!isValid || saving">
            <i class="bi bi-check-lg me-1"></i> Anlegen
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pot-create-modal {
  max-width: 480px;
}

.participant-box {
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-sm);
}

.member-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 4px 0;
}

.member-row .form-check-input {
  margin: 0;
}

.add-guest {
  display: flex;
  gap: var(--spacing-sm);
}

.invalid-hint {
  font-size: 0.85rem;
  color: var(--color-danger, #dc3545);
  margin-top: 4px;
}
</style>
