<script setup lang="ts">
// Nur auf dem Dev-Server: LoginView lädt diese Datei hinter
// `import.meta.env.DEV`, im Produktions-Build fällt sie samt Modul weg.
import devLogins from 'virtual:dev-logins'
import type { DevLogin } from '@/lib/devLogins'

defineProps<{ disabled: boolean }>()
const emit = defineEmits<{ login: [login: DevLogin] }>()
</script>

<template>
  <div v-if="devLogins.length" class="dev-logins">
    <span class="dev-logins-title">Testkonten (nur Dev-Server)</span>
    <button
      v-for="login in devLogins"
      :key="login.email"
      type="button"
      class="btn btn-outline-secondary btn-sm"
      :disabled="disabled"
      @click="emit('login', login)"
    >
      Als {{ login.label }} anmelden
    </button>
  </div>
</template>

<style scoped>
.dev-logins {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs, 0.25rem);
  margin-top: var(--spacing-md, 1rem);
  padding-top: var(--spacing-md, 1rem);
  border-top: 1px dashed var(--color-border, #ccc);
}

.dev-logins-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.6;
}
</style>
