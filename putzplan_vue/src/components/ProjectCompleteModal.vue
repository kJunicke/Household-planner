<script setup lang="ts">
interface Props {
  projectTitle: string
  isLoading: boolean
}

interface Emits {
  (e: 'close'): void
  (e: 'confirm'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const handleConfirm = () => {
  if (!props.isLoading) {
    emit('confirm')
  }
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
          <h3 class="modal-title">Projekt abschließen</h3>
          <button class="btn-close" @click="handleClose" aria-label="Schließen">×</button>
        </div>

        <div class="modal-body">
          <p class="project-name">{{ projectTitle }}</p>
          <p class="confirmation-text">
            Projekt wirklich abschließen? Es wird unter "Erledigt" archiviert und kann nicht mehr bearbeitet werden.
          </p>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" :disabled="isLoading" @click="handleClose">
            Abbrechen
          </button>
          <button class="btn btn-success" :disabled="isLoading" @click="handleConfirm">
            <span v-if="isLoading" class="spinner-border spinner-border-sm me-1"></span>
            {{ isLoading ? 'Schließt ab...' : 'Projekt abschließen' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Component-specific styles only */

.project-name {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 1rem;
}

.confirmation-text {
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-bottom: 0;
}
</style>
