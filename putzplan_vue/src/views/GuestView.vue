<script setup lang="ts">
/**
 * Gastansicht (CONTEXT.md § Gast, § Gastlink; ADR-0006): öffnet genau die
 * Liste oder den Topf, den der Gastlink teilt — ohne Konto, ohne Navigation,
 * mit der Kopfzeile „geteilt von <Haushaltsname>“.
 *
 * Ablauf: Geheimnis aus dem Anker lesen → anonym anmelden (falls noch keine
 * Sitzung) → in der Datenbank einlösen → den Haushalt der Liste als Rahmen
 * setzen, damit die Listen- und Topf-Stores wie für Mitglieder laden; RLS
 * liefert dem Gast nur das Geteilte. Ohne Netz ist die Ansicht gesperrt: Gäste
 * haben keine Offline-Warteschlange.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { GuestShareKind, RedeemedGuestLink } from '@/types/GuestShare'
import { supabase } from '@/lib/supabase'
import { guestFailure, secretFromHash, type GuestFailure } from '@/lib/guestLink'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import { useAuthStore } from '@/stores/authStore'
import { useHouseholdStore } from '@/stores/householdStore'
import { useShoppingStore } from '@/stores/shoppingStore'
import { usePackingStore } from '@/stores/packingStore'
import { useTodoStore } from '@/stores/todoStore'
import ShoppingView from './ShoppingView.vue'
import PackingView from './PackingView.vue'
import TodoView from './TodoView.vue'
import GuestPot from '@/components/GuestPot.vue'

type GuestState = 'opening' | 'ready' | 'no-link' | 'member' | GuestFailure

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const householdStore = useHouseholdStore()
const { isOnline } = useNetworkStatus()

const state = ref<GuestState>('opening')
const kind = ref<GuestShareKind | null>(null)
const targetId = ref('')
const householdName = ref('')

const MESSAGES: Record<Exclude<GuestState, 'opening' | 'ready'>, { icon: string; text: string }> = {
  'no-link': {
    icon: 'bi-link-45deg',
    text: 'Hier fehlt der Gastlink. Öffne den Link, den du bekommen hast, noch einmal ganz.',
  },
  'dead-link': {
    icon: 'bi-x-octagon',
    text: 'Dieser Link gilt nicht mehr — er wurde erneuert oder die Freigabe beendet. Frag nach dem neuen Link.',
  },
  member: {
    icon: 'bi-person-check',
    text: 'Du bist mit deinem Konto angemeldet. Gastlinks sind für Leute ohne Konto — deine Listen und Töpfe findest du in der App.',
  },
  unavailable: {
    icon: 'bi-slash-circle',
    text: 'Gastlinks sind gerade ausgeschaltet. Versuch es später noch einmal.',
  },
  busy: {
    icon: 'bi-hourglass-split',
    text: 'Gerade öffnen sehr viele Gäste aus diesem Netz einen Link. Versuch es in einer Stunde noch einmal.',
  },
  offline: {
    icon: 'bi-wifi-off',
    text: 'Kein Netz. Gäste arbeiten nur online — versuch es wieder, sobald du Verbindung hast.',
  },
  error: {
    icon: 'bi-exclamation-triangle',
    text: 'Der Link ließ sich gerade nicht öffnen.',
  },
}

const message = computed(() =>
  state.value === 'opening' || state.value === 'ready' ? null : MESSAGES[state.value],
)

const canRetry = (s: GuestState) => s === 'offline' || s === 'error' || s === 'busy'

const listStore = (k: Exclude<GuestShareKind, 'pot'>) =>
  k === 'shopping_list'
    ? useShoppingStore()
    : k === 'packing_list'
      ? usePackingStore()
      : useTodoStore()

/** Löst den Link ein; liefert die Freigabe oder setzt den Fehlerzustand. */
const redeem = async (secret: string): Promise<RedeemedGuestLink | null> => {
  const { data, error } = await supabase.rpc('redeem_guest_link', { p_secret: secret })
  const row = (data as RedeemedGuestLink[] | null)?.[0]
  if (error || !row) {
    state.value = error ? guestFailure(error) : 'dead-link'
    return null
  }
  return row
}

const open = async () => {
  const secret = secretFromHash(route.hash)
  if (!secret) {
    state.value = 'no-link'
    return
  }
  if (authStore.user && !authStore.isGuest) {
    // Nicht still als Gast anmelden: das ersetzte die Sitzung des Mitglieds.
    state.value = 'member'
    return
  }
  state.value = 'opening'
  if (!authStore.user) {
    try {
      await authStore.signInAsGuest()
    } catch (error) {
      state.value = guestFailure(error)
      return
    }
  }
  const row = await redeem(secret)
  if (!row) return

  householdStore.enterGuestHousehold(row.household_id, row.household_name)
  if (row.target_kind !== 'pot') listStore(row.target_kind).currentListId = row.target_id
  targetId.value = row.target_id
  householdName.value = row.household_name
  kind.value = row.target_kind
  state.value = 'ready'
}

// Erneuert oder beendet ein Mitglied die Freigabe, während die Seite offen
// ist, schreibt RLS schon nichts mehr. Beim Zurückkehren auf den Tab und wenn
// das Netz wiederkommt, fragt die Ansicht nach und zeigt dann die Meldung
// statt einer Liste, die nichts mehr annimmt.
const recheck = async () => {
  if (state.value !== 'ready' || document.visibilityState !== 'visible') return
  const secret = secretFromHash(route.hash)
  if (!secret) return
  const { error } = await supabase.rpc('redeem_guest_link', { p_secret: secret })
  if (error && guestFailure(error) === 'dead-link') state.value = 'dead-link'
}

const toLogin = async () => {
  if (authStore.isGuest) await authStore.leaveGuestSession()
  await router.push('/login')
}

onMounted(() => {
  void open()
  document.addEventListener('visibilitychange', recheck)
  window.addEventListener('online', recheck)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', recheck)
  window.removeEventListener('online', recheck)
})
</script>

<template>
  <div class="guest-page">
    <header class="guest-header">
      <i class="bi bi-link-45deg"></i>
      <span v-if="householdName">
        geteilt von <strong>{{ householdName }}</strong>
      </span>
      <span v-else>Gastlink</span>
    </header>

    <template v-if="state === 'ready' && kind">
      <!-- `inert` sperrt jede Eingabe in der Liste, solange das Netz fehlt.
           Dialoge hängen per Teleport am body, außerhalb davon — ein offener
           Dialog wird deshalb zusätzlich von einer Sperrfläche über allem
           abgedeckt (unter den Toasts, die bleiben lesbar); sie trägt auch
           den Hinweis, damit kein Dialog ihn verdeckt. -->
      <div :inert="!isOnline" :class="{ 'guest-locked': !isOnline }">
        <ShoppingView v-if="kind === 'shopping_list'" guest />
        <PackingView v-else-if="kind === 'packing_list'" guest />
        <TodoView v-else-if="kind === 'todo_list'" guest />
        <GuestPot v-else :pot-id="targetId" />
      </div>
      <Teleport to="body">
        <div v-if="!isOnline" class="guest-offline-blocker">
          <div class="guest-offline">
            <i class="bi bi-wifi-off me-1"></i>
            Kein Netz — {{ kind === 'pot' ? 'der Topf ist' : 'die Liste ist' }} gesperrt, bis die
            Verbindung zurück ist.
          </div>
        </div>
      </Teleport>
    </template>

    <div v-else-if="state === 'opening'" class="guest-message">
      <div class="spinner-border spinner-border-sm me-2" role="status"></div>
      Öffne Gastlink…
    </div>

    <div v-else-if="message" class="guest-message">
      <i class="bi guest-message-icon" :class="message.icon"></i>
      <p>{{ message.text }}</p>
      <button v-if="canRetry(state)" class="btn btn-primary" @click="open">
        <i class="bi bi-arrow-clockwise me-1"></i> Erneut versuchen
      </button>
      <button v-if="state === 'member'" class="btn btn-primary" @click="router.push('/')">
        Zur App
      </button>
      <button v-if="state === 'no-link'" class="btn btn-link" @click="toLogin">
        Mit Konto anmelden
      </button>
    </div>
  </div>
</template>

<style scoped>
.guest-page {
  min-height: 100vh;
}

.guest-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  padding-top: calc(12px + env(safe-area-inset-top));
  background: var(--color-background-elevated);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 0.95rem;
}

.guest-header strong {
  color: var(--color-text-primary);
}

.guest-offline {
  margin: calc(56px + env(safe-area-inset-top)) 16px 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  padding: 10px 12px;
  border-radius: var(--radius-md, 8px);
  background: var(--color-warning-bg, #fff3cd);
  color: var(--color-text-primary);
  font-size: 0.9rem;
}

.guest-offline-blocker {
  position: fixed;
  inset: 0;
  z-index: 1070;
}

.guest-locked {
  opacity: 0.55;
}

.guest-message {
  max-width: 420px;
  margin: 48px auto 0;
  padding: 0 24px;
  text-align: center;
  color: var(--color-text-secondary);
}

.guest-message-icon {
  display: block;
  font-size: 2.5rem;
  margin-bottom: 12px;
}
</style>
