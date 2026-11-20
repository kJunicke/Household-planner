<script setup lang="ts">
/**
 * Topf in der Gastansicht (CONTEXT.md § Gast, § Topf; ADR-0006). Beim ersten
 * Öffnen wählt der Gast seinen Namen aus der Teilnehmerliste oder trägt sich
 * mit „Ich bin neu“ ein; der Browser merkt sich die Wahl. Ist sie vergessen
 * (oder der Teilnehmer weg), fragt die Ansicht neu; „Wechseln“ fragt jederzeit.
 * Ein abgeschlossener Topf zeigt nur den Endstand, ohne Namenswahl.
 */
import { computed, ref } from 'vue'
import { usePotStore } from '@/stores/potStore'
import { participantNameProblem, participantNameProblemText } from '@/lib/potRules'
import { POT_PARTICIPANT_NAME_MAX_LENGTH } from '@/lib/limits'
import PotDetail from './PotDetail.vue'

const props = defineProps<{ potId: string }>()

const potStore = usePotStore()

const pot = computed(() => potStore.pots.find((p) => p.pot_id === props.potId) ?? null)
const isOpen = computed(() => !!pot.value && !pot.value.closed_at)
const myId = computed(() => potStore.myParticipantId(props.potId))

/** „Wechseln“ getippt: Namenswahl zeigen, auch wenn schon jemand gewählt ist. */
const switching = ref(false)
const showPicker = computed(() => isOpen.value && (switching.value || !myId.value))

const participants = computed(() => potStore.participantsOf(props.potId))

const choose = (participantId: string) => {
  potStore.chooseGuestParticipant(props.potId, participantId)
  switching.value = false
}

// ---------------------------------------------------------------
// „Ich bin neu“
// ---------------------------------------------------------------
const newName = ref('')
const joining = ref(false)
const joinError = ref<string | null>(null)

const nameProblem = computed(() =>
  newName.value.trim() === ''
    ? null
    : participantNameProblem(
        newName.value,
        participants.value.map((p) => p.name),
      ),
)
/** Wie der doppelte Name hier erklärt wird; leer und zu lang klingen überall gleich. */
const DUPLICATE_NAME_TEXT =
  'Den Namen gibt es in diesem Topf schon — wähl ihn oben aus, wenn du das bist'

const join = async () => {
  if (joining.value || newName.value.trim() === '' || nameProblem.value) return
  joining.value = true
  joinError.value = null
  try {
    const result = await potStore.joinPotAsGuest(props.potId, newName.value)
    if (result === 'ok') {
      newName.value = ''
      switching.value = false
    } else {
      joinError.value =
        result === 'duplicate'
          ? DUPLICATE_NAME_TEXT
          : result === 'closed'
            ? 'Der Topf ist inzwischen abgeschlossen'
            : 'Eintragen hat nicht geklappt. Versuch es noch einmal.'
    }
  } finally {
    joining.value = false
  }
}
</script>

<template>
  <div class="page-container">
    <div class="container-fluid">
      <div v-if="!potStore.loaded" class="text-center py-4">
        <span class="spinner-border spinner-border-sm me-2"></span> Lädt...
      </div>

      <div v-else-if="!pot" class="guest-pot-missing">
        Den Topf gibt es nicht mehr. Frag nach einem neuen Link.
      </div>

      <div v-else-if="showPicker" class="identity-picker">
        <h2 class="pot-title">{{ pot.name }}</h2>
        <h3 class="section-title">Wer bist du?</h3>
        <div class="participant-choices">
          <button
            v-for="p in participants"
            :key="p.participant_id"
            type="button"
            class="participant-choice"
            :class="{ active: p.participant_id === myId }"
            @click="choose(p.participant_id)"
          >
            <i class="bi bi-person"></i> {{ potStore.participantName(p.participant_id) }}
          </button>
        </div>

        <h3 class="section-title mt-4">Ich bin neu</h3>
        <div class="join-row">
          <input
            v-model="newName"
            type="text"
            class="form-control"
            :class="{ 'is-invalid': nameProblem || joinError }"
            placeholder="Dein Name"
            :maxlength="POT_PARTICIPANT_NAME_MAX_LENGTH"
            @input="joinError = null"
            @keyup.enter="join"
          />
          <button
            type="button"
            class="btn btn-primary"
            :disabled="joining || newName.trim() === '' || !!nameProblem"
            @click="join"
          >
            <i class="bi bi-person-plus me-1"></i> Eintragen
          </button>
        </div>
        <div v-if="nameProblem || joinError" class="invalid-hint">
          {{
            nameProblem ? participantNameProblemText(nameProblem, DUPLICATE_NAME_TEXT) : joinError
          }}
        </div>

        <button
          v-if="switching && myId"
          type="button"
          class="btn btn-link mt-3 px-0"
          @click="switching = false"
        >
          Abbrechen
        </button>
      </div>

      <PotDetail v-else :pot="pot" guest @switch-identity="switching = true" />
    </div>
  </div>
</template>

<style scoped>
.pot-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin: var(--spacing-md) 0;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: var(--spacing-sm);
}

.participant-choices {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.participant-choice {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-md);
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  text-align: left;
  color: inherit;
  font-weight: 500;
  -webkit-tap-highlight-color: transparent;
}

.participant-choice.active {
  border-color: var(--color-primary);
}

.join-row {
  display: flex;
  gap: var(--spacing-sm);
}

.invalid-hint {
  margin-top: 4px;
  font-size: 0.85rem;
  color: var(--color-danger, #dc3545);
}

.guest-pot-missing {
  margin-top: 48px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
