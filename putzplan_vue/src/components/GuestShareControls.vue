<script setup lang="ts">
/**
 * **Gastlink** eines Ziels (→ CONTEXT.md § Gastlink): erzeugen, kopieren,
 * teilen, erneuern, beenden. Nur für Mitglieder; Gäste sehen das nie.
 * Verwaltet wird nur online — die Datenbank-Funktionen haben keine Warteschlange.
 */
import { computed, onMounted, ref } from 'vue'
import type { GuestShareKind } from '@/types/GuestShare'
import { useGuestShareStore } from '@/stores/guestShareStore'
import { useToastStore } from '@/stores/toastStore'
import { useNetworkStatus } from '@/composables/useNetworkStatus'

const props = withDefaults(
  defineProps<{
    kind: GuestShareKind
    targetId: string
    targetName: string
    /** Neu erzeugen erlaubt? Ein abgeschlossener Topf bekommt keinen neuen Link. */
    creatable?: boolean
  }>(),
  { creatable: true },
)

const guestShareStore = useGuestShareStore()
const { isOnline } = useNetworkStatus()

const share = computed(() => guestShareStore.shareFor(props.kind, props.targetId))
const link = computed(() => (share.value ? guestShareStore.linkFor(share.value) : ''))
const busy = ref(false)
const copied = ref(false)
const confirming = ref<'renew' | 'end' | null>(null)
/** „an dieser Liste“ bzw. „in diesem Topf“ — die Hinweise nennen das Ziel. */
const isPot = computed(() => props.kind === 'pot')
const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

onMounted(() => {
  void guestShareStore.load()
})

const run = async (action: () => Promise<unknown>) => {
  busy.value = true
  try {
    await action()
  } finally {
    busy.value = false
    confirming.value = null
  }
}

const create = () => run(() => guestShareStore.create(props.kind, props.targetId, props.targetName))
const renew = () => run(() => guestShareStore.renew(share.value!.share_id))
const end = () => run(() => guestShareStore.end(share.value!.share_id))

const copy = async () => {
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
    useToastStore().showToast('Gastlink kopiert', 'success', 2000)
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    // Zwischenablage gesperrt (unsicherer Kontext) — das Feld lässt sich markieren.
    useToastStore().showToast('Kopieren ging nicht — Link im Feld markieren', 'error')
  }
}

const shareLink = async () => {
  try {
    await navigator.share({ title: props.targetName, url: link.value })
  } catch {
    // Abgebrochen oder nicht erlaubt — nichts zu tun.
  }
}
</script>

<template>
  <div v-if="share || creatable" class="guest-share">
    <label class="form-label"><i class="bi bi-link-45deg me-1"></i>Gastlink</label>

    <template v-if="!share">
      <p class="guest-share-hint">
        <template v-if="isPot">
          Wer den Link hat, trägt ohne Konto Ausgaben und Rückzahlungen in diesen Topf ein — und
          sieht nichts sonst. Abschließen und Links verwalten bleibt bei euch.
        </template>
        <template v-else>
          Wer den Link hat, arbeitet ohne Konto an dieser Liste mit — und sieht nichts sonst.
        </template>
      </p>
      <button class="btn btn-outline-primary btn-sm" :disabled="busy || !isOnline" @click="create">
        <i class="bi bi-link-45deg me-1"></i> Gastlink erzeugen
      </button>
    </template>

    <template v-else>
      <input
        class="form-control form-control-sm guest-share-link"
        :value="link"
        readonly
        @focus="($event.target as HTMLInputElement).select()"
      />
      <div class="guest-share-actions">
        <button class="btn btn-primary btn-sm" @click="copy">
          <i :class="copied ? 'bi bi-check-lg' : 'bi bi-clipboard'"></i>
          {{ copied ? 'Kopiert' : 'Kopieren' }}
        </button>
        <button v-if="canShare" class="btn btn-outline-primary btn-sm" @click="shareLink">
          <i class="bi bi-share"></i> Teilen
        </button>
        <button
          class="btn btn-outline-secondary btn-sm"
          :disabled="busy || !isOnline"
          @click="confirming = 'renew'"
        >
          <i class="bi bi-arrow-repeat"></i> Erneuern
        </button>
        <button
          class="btn btn-outline-danger btn-sm"
          :disabled="busy || !isOnline"
          @click="confirming = 'end'"
        >
          <i class="bi bi-x-circle"></i> Beenden
        </button>
      </div>

      <div v-if="confirming" class="guest-share-confirm">
        <span>{{
          confirming === 'renew'
            ? 'Der bisherige Link geht danach nicht mehr. Erneuern?'
            : isPot
              ? 'Gäste kommen danach nicht mehr an den Topf. Beenden?'
              : 'Gäste kommen danach nicht mehr an die Liste. Beenden?'
        }}</span>
        <button
          class="btn btn-sm"
          :class="confirming === 'renew' ? 'btn-primary' : 'btn-danger'"
          :disabled="busy"
          @click="confirming === 'renew' ? renew() : end()"
        >
          Ja
        </button>
        <button class="btn btn-sm btn-secondary" @click="confirming = null">Nein</button>
      </div>
    </template>

    <p v-if="!isOnline" class="guest-share-hint">Gastlinks verwalten geht nur mit Netz.</p>
  </div>
</template>

<style scoped>
.guest-share {
  margin-top: var(--spacing-md, 16px);
  padding-top: var(--spacing-md, 16px);
  border-top: 1px solid var(--color-border);
}

.guest-share-hint {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.guest-share-link {
  font-family: monospace;
  font-size: 0.8rem;
  margin-bottom: 8px;
  user-select: text;
}

.guest-share-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.guest-share-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 0.85rem;
}
</style>
