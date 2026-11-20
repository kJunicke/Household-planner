<script setup lang="ts">
/**
 * Übersicht der **Gastlinks** des Haushalts (→ CONTEXT.md § Gastlink): was
 * gerade geteilt ist, mit Kopieren und Beenden. Erzeugen und Erneuern sitzen
 * am Ziel selbst (Liste bearbeiten, Topf).
 */
import { onMounted, ref } from 'vue'
import type { GuestShare, GuestShareKind } from '@/types/GuestShare'
import { useGuestShareStore } from '@/stores/guestShareStore'
import { useNetworkStatus } from '@/composables/useNetworkStatus'

const KIND_LABELS: Record<GuestShareKind, { icon: string; label: string }> = {
  shopping_list: { icon: 'bi-cart3', label: 'Einkauf' },
  packing_list: { icon: 'bi-bag-check', label: 'Packliste' },
  todo_list: { icon: 'bi-check2-square', label: 'To-do' },
  pot: { icon: 'bi-wallet2', label: 'Topf' },
}

const guestShareStore = useGuestShareStore()
const { isOnline } = useNetworkStatus()
const copiedId = ref<string | null>(null)
const confirmEndId = ref<string | null>(null)

onMounted(() => {
  void guestShareStore.load()
})

const copy = async (share: GuestShare) => {
  try {
    await navigator.clipboard.writeText(guestShareStore.linkFor(share))
    copiedId.value = share.share_id
    setTimeout(() => {
      if (copiedId.value === share.share_id) copiedId.value = null
    }, 2000)
  } catch {
    // Zwischenablage gesperrt — kopieren geht dann im Bearbeiten-Dialog der Liste.
  }
}

const end = async (share: GuestShare) => {
  confirmEndId.value = null
  await guestShareStore.end(share.share_id)
}
</script>

<template>
  <div>
    <p v-if="guestShareStore.shares.length === 0" class="text-muted mb-0">
      Nichts geteilt. Einen Gastlink erzeugst du im Bearbeiten-Dialog einer Liste oder im Topf.
    </p>
    <ul v-else class="share-list">
      <li v-for="share in guestShareStore.shares" :key="share.share_id" class="share-item">
        <i class="bi" :class="KIND_LABELS[share.target_kind].icon"></i>
        <span class="share-name">
          {{ guestShareStore.targetNames[share.target_id] ?? KIND_LABELS[share.target_kind].label }}
        </span>
        <template v-if="confirmEndId === share.share_id">
          <button class="btn btn-sm btn-danger" :disabled="!isOnline" @click="end(share)">
            Beenden
          </button>
          <button class="btn btn-sm btn-secondary" @click="confirmEndId = null">Nein</button>
        </template>
        <template v-else>
          <button
            class="copy-btn"
            :title="copiedId === share.share_id ? 'Kopiert!' : 'Link kopieren'"
            @click="copy(share)"
          >
            <i :class="copiedId === share.share_id ? 'bi bi-check-lg' : 'bi bi-clipboard'"></i>
          </button>
          <button
            class="copy-btn"
            title="Freigabe beenden"
            :disabled="!isOnline"
            @click="confirmEndId = share.share_id"
          >
            <i class="bi bi-x-circle"></i>
          </button>
        </template>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.share-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.share-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.share-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-btn {
  background: none;
  border: none;
  padding: 4px 6px;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.copy-btn:disabled {
  opacity: 0.4;
}
</style>
