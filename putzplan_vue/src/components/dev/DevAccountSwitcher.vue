<script setup lang="ts">
// Nur auf dem Dev-Server: App.vue lädt diese Datei hinter
// `import.meta.env.DEV`, im Produktions-Build fällt sie samt Modul weg.
//
// Wechselt das Konto ohne Abmelden: eine neue Anmeldung ersetzt die Sitzung,
// das Session-Ende räumt die Stores des alten Kontos, und der Watcher in
// main.ts lädt den Haushalt des neuen und geht auf `/`.
import { computed, ref } from 'vue'
import devLogins from 'virtual:dev-logins'
import type { DevLogin } from '@/lib/devLogins'
import { useAuthStore } from '@/stores/authStore'

const authStore = useAuthStore()
const open = ref(false)
const switching = ref(false)

const currentLabel = computed(() => {
  const email = authStore.user?.email
  if (!email) return authStore.isGuest ? 'Gast' : '–'
  return devLogins.find((login) => login.email === email)?.label ?? email
})

async function switchTo(login: DevLogin) {
  if (switching.value) return
  switching.value = true
  await authStore.login(login.email, login.password)
  switching.value = false
  open.value = false
}
</script>

<template>
  <div v-if="devLogins.length && authStore.user" class="dev-switcher">
    <div v-if="open" class="dev-switcher-menu">
      <button
        v-for="login in devLogins"
        :key="login.email"
        type="button"
        class="dev-switcher-item"
        :class="{ current: login.email === authStore.user.email }"
        :disabled="switching || login.email === authStore.user.email"
        @click="switchTo(login)"
      >
        {{ login.label }}
      </button>
    </div>
    <button type="button" class="dev-switcher-chip" @click="open = !open">
      Dev: {{ currentLabel }}
    </button>
  </div>
</template>

<style scoped>
.dev-switcher {
  position: fixed;
  left: 8px;
  bottom: calc(72px + env(safe-area-inset-bottom));
  z-index: 1070;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  font-size: 0.75rem;
}

.dev-switcher-chip,
.dev-switcher-item {
  border: 1px dashed #888;
  border-radius: 999px;
  padding: 2px 10px;
  background: rgba(255, 255, 255, 0.9);
  color: #333;
}

.dev-switcher-chip {
  opacity: 0.7;
}

.dev-switcher-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dev-switcher-item.current {
  font-weight: 600;
  border-style: solid;
}
</style>
