<script setup lang="ts">
import { ref } from 'vue'
import type { HouseholdMember } from '@/types/households'

interface Props {
  currentAssignedTo: string | null // user_id of currently assigned member
  currentPermanent: boolean
  householdMembers: HouseholdMember[]
}

interface Emits {
  (e: 'close'): void
  (e: 'confirm', userId: string | null, permanent: boolean): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const selectedUserId = ref<string | null>(props.currentAssignedTo)
const isPermanent = ref(props.currentPermanent)

const handleConfirm = () => {
  emit('confirm', selectedUserId.value, isPermanent.value)
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
          <h5 class="modal-title">Task zuweisen</h5>
          <button class="btn-close" @click="handleClose" aria-label="Schließen">×</button>
        </div>

        <div class="modal-body">
          <div class="assignment-selection">
            <label class="selection-label">Wer soll diese Task erledigen?</label>

            <!-- Unassigned Option -->
            <div class="member-option">
              <input
                type="radio"
                id="unassigned"
                :value="null"
                v-model="selectedUserId"
                class="member-radio"
              />
              <label for="unassigned" class="member-label">
                <div class="member-avatar empty">?</div>
                <span class="member-name">Niemand (keine Zuweisung)</span>
              </label>
            </div>

            <!-- Household Members -->
            <div
              v-for="member in householdMembers"
              :key="member.user_id"
              class="member-option"
            >
              <input
                type="radio"
                :id="`member-${member.user_id}`"
                :value="member.user_id"
                v-model="selectedUserId"
                class="member-radio"
              />
              <label :for="`member-${member.user_id}`" class="member-label">
                <div class="member-avatar" :style="{ backgroundColor: member.user_color }">
                  {{ member.display_name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() }}
                </div>
                <span class="member-name">{{ member.display_name }}</span>
              </label>
            </div>
          </div>

          <!-- Permanent Assignment Checkbox -->
          <div class="permanent-option">
            <input
              type="checkbox"
              id="permanent"
              v-model="isPermanent"
              class="form-check-input"
              :disabled="selectedUserId === null"
            />
            <label for="permanent" class="form-check-label">
              Zuweisung dauerhaft beibehalten
              <small class="text-muted d-block">
                Wenn aktiviert, bleibt die Zuweisung auch nach dem Putzen bestehen
              </small>
            </label>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="handleClose">
            Abbrechen
          </button>
          <button
            class="btn btn-primary"
            @click="handleConfirm"
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Component-specific styles */

.assignment-selection {
  margin-bottom: 1.5rem;
}

.selection-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 1rem;
}

.member-option {
  position: relative;
  margin-bottom: 0.75rem;
}

.member-radio {
  position: absolute;
  opacity: 0;
  cursor: pointer;
}

.member-label {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
  cursor: pointer;
  transition: all var(--transition-base);
}

.member-radio:checked + .member-label {
  border-color: var(--color-primary);
  background: rgba(79, 70, 229, 0.05);
}

.member-label:hover {
  border-color: var(--color-primary);
}

.member-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.875rem;
  flex-shrink: 0;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.member-avatar.empty {
  background: var(--color-background-muted);
  color: var(--color-text-secondary);
  border: 2px dashed var(--color-border);
}

.member-name {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--color-text-primary);
}

.permanent-option {
  padding: 1rem;
  background: var(--color-background);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.form-check-input {
  margin-right: 0.5rem;
  cursor: pointer;
}

.form-check-input:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.form-check-label {
  cursor: pointer;
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--color-text-primary);
}

.form-check-input:disabled + .form-check-label {
  cursor: not-allowed;
  opacity: 0.5;
}

.text-muted {
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
  font-weight: 400;
  margin-top: 0.25rem;
}

/* Mobile optimizations */
@media (max-width: 576px) {
  .member-avatar {
    width: 36px;
    height: 36px;
    font-size: 0.8125rem;
  }

  .member-name {
    font-size: 0.875rem;
  }
}
</style>
