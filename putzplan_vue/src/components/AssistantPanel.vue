<script setup lang="ts">
/**
 * Chat mit dem Assistenten (erste Fassung: nur Einkaufslisten).
 *
 * Der Verlauf lebt in dieser Komponente. Sie hängt im Header, der beim
 * Seitenwechsel stehen bleibt, und Schließen blendet nur das Panel aus: so
 * überlebt der Verlauf Schließen und Wiederöffnen, ein Neuladen beginnt frisch.
 */
import { nextTick, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import {
  runAssistant,
  textOf,
  type AssistantReply,
  type Message,
} from '@/lib/assistant/runAssistant'
import { createHistoryExpiry } from '@/lib/assistant/historyExpiry'
import { ensureShoppingLoaded, shoppingContext } from '@/lib/assistant/shoppingTools'
import { assistantTools, type Change } from '@/lib/assistant/tools'
import { useShoppingStore } from '@/stores/shoppingStore'
import { useToastStore } from '@/stores/toastStore'

const open = defineModel<boolean>('open', { required: true })
const shoppingStore = useShoppingStore()
const tools = assistantTools({ shopping: shoppingStore })
const toastStore = useToastStore()

/** So lange bleibt ein Toast mit Rückgängig stehen; wie beim Löschen im Topf. */
const UNDO_TOAST_MS = 8000

/** Was der Nutzer seit der letzten Frage zurückgenommen hat; geht mit der nächsten Frage an Claude. */
const undone: string[] = []

/** Ein Toast je Änderung; sein Rückgängig-Symbol nimmt genau diese Änderung zurück. */
function toastChange(change: Change) {
  toastStore.showToast(change.summary.replace(/^✓\s*/, ''), 'success', UNDO_TOAST_MS, {
    label: 'Rückgängig',
    icon: 'bi-arrow-counterclockwise',
    run: async () => {
      if (!(await change.undo())) {
        toastStore.showToast(`Rücknahme fehlgeschlagen: ${change.summary}`, 'error')
        return
      }
      undone.push(change.summary)
      entries.value.push({ kind: 'action', text: `↶ zurückgenommen: ${change.summary}` })
    },
  })
}

interface Entry {
  kind: 'user' | 'assistant' | 'action' | 'error' | 'fresh'
  text: string
}

/** Mehr Verlauf kostet bei jeder Frage mit; ältere Runden fallen weg. */
const MAX_HISTORY = 24

const history = ref<Message[]>([])
const historyExpiry = createHistoryExpiry()
const entries = ref<Entry[]>([])
const draft = ref('')
const busy = ref(false)
const listEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)

/**
 * Kürzt von vorn, bis der Verlauf wieder mit einer getippten Nutzerfrage
 * beginnt — ein `tool_result` ohne seinen `tool_use` lehnt die API ab.
 */
function trimHistory(messages: Message[]): Message[] {
  let start = Math.max(0, messages.length - MAX_HISTORY)
  while (start < messages.length && typeof messages[start]!.content !== 'string') start++
  return messages.slice(start)
}

/**
 * `lists` ist der Stand VOR der Frage. Würde er bei jedem Schritt der Schleife
 * neu gelesen, sähe Claude nach dem Hinzufügen die neuen Artikel schon im Stand
 * und hielte sie für „stand schon drauf“ (beobachtet beim ersten Test).
 */
async function send(
  messages: Message[],
  lists: ReturnType<typeof shoppingContext>,
): Promise<AssistantReply> {
  const today = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const { data, error } = await supabase.functions.invoke('assistant', {
    body: { messages, lists, today, tools: tools.definitions },
  })
  if (error) {
    // FunctionsHttpError trägt die Antwort der Funktion; deren `error` ist aussagekräftiger.
    const body = await error.context?.json?.().catch(() => null)
    throw new Error(body?.error ?? error.message)
  }
  return data as AssistantReply
}

async function submit() {
  const question = draft.value.trim()
  if (!question || busy.value) return
  draft.value = ''
  busy.value = true
  const { history: kept, fresh } = historyExpiry.startQuestion(history.value)
  history.value = kept
  if (fresh)
    entries.value.push({
      kind: 'fresh',
      text: 'Neues Gespräch: nach 30 Minuten ohne Frage ist der Verlauf darüber vergessen.',
    })
  entries.value.push({ kind: 'user', text: question })
  // Der Verlauf meldet die zurückgenommenen Änderungen noch als erledigt; ohne
  // diesen Hinweis widerspräche er dem Stand, den Claude mit der Frage bekommt.
  const content = undone.length
    ? `(Inzwischen von mir zurückgenommen: ${undone.splice(0).join('; ')})\n\n${question}`
    : question

  try {
    await ensureShoppingLoaded(shoppingStore)
    const lists = shoppingContext(shoppingStore)
    const { messages, actions } = await runAssistant(
      trimHistory([...history.value, { role: 'user', content }]),
      {
        send: (m) => send(m, lists),
        executeTool: async (name, input) => {
          const outcome = await tools.execute(name, input)
          outcome.changes?.forEach(toastChange)
          return outcome
        },
      },
    )
    history.value = messages
    for (const action of actions) {
      entries.value.push({ kind: action.isError ? 'error' : 'action', text: action.summary })
    }
    const answer = textOf(messages[messages.length - 1]!)
    if (answer) entries.value.push({ kind: 'assistant', text: answer })
  } catch (error) {
    entries.value.push({
      kind: 'error',
      text: `Fehler: ${error instanceof Error ? error.message : String(error)}`,
    })
  } finally {
    busy.value = false
    // Das gesperrte Feld hat den Fokus verloren; zurückgeben, damit die nächste
    // Frage ohne erneutes Antippen getippt werden kann.
    await nextTick()
    inputEl.value?.focus()
  }
}

watch(
  () => entries.value.length,
  async () => {
    await nextTick()
    listEl.value?.scrollTo({ top: listEl.value.scrollHeight })
  },
)

watch(open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  inputEl.value?.focus()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="assistant-backdrop" @click.self="open = false">
      <section class="assistant-panel" aria-label="Assistent">
        <header class="assistant-head">
          <span class="assistant-title">Assistent</span>
          <button
            type="button"
            class="assistant-close"
            aria-label="Schließen"
            @click="open = false"
          >
            <i class="bi bi-x-lg" />
          </button>
        </header>

        <div ref="listEl" class="assistant-log">
          <p v-if="entries.length === 0" class="assistant-hint">
            Zum Beispiel: „Milch und zwei Packungen Eier auf die Einkaufsliste“ oder „Hab Brot
            gekauft“.
          </p>
          <p v-for="(entry, i) in entries" :key="i" :class="['assistant-entry', entry.kind]">
            {{ entry.text }}
          </p>
          <p v-if="busy" class="assistant-entry assistant">…</p>
        </div>

        <form class="assistant-input" @submit.prevent="submit">
          <input
            ref="inputEl"
            v-model="draft"
            type="text"
            enterkeyhint="send"
            placeholder="Was soll ich tun?"
            :disabled="busy"
          />
          <button type="submit" :disabled="busy || !draft.trim()" aria-label="Senden">
            <i class="bi bi-send" />
          </button>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.assistant-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1060;
  background: rgba(36, 31, 26, 0.35);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.assistant-panel {
  width: 100%;
  max-width: 560px;
  height: min(75dvh, 640px);
  display: flex;
  flex-direction: column;
  background: var(--pw-paper);
  color: var(--pw-ink);
  border: 2px solid var(--pw-line);
  border-bottom: none;
  border-radius: 12px 12px 0 0;
  padding-bottom: env(safe-area-inset-bottom);
}

.assistant-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 2px solid var(--pw-line);
}
.assistant-title {
  font-weight: 700;
}
.assistant-close {
  background: none;
  border: none;
  color: inherit;
  font-size: 1.1rem;
  min-width: var(--touch-target-min);
  min-height: var(--touch-target-min);
}

.assistant-log {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.assistant-hint {
  color: var(--pw-ink-soft);
  margin: 0;
}
.assistant-entry {
  margin: 0;
  max-width: 85%;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.assistant-entry.user {
  align-self: flex-end;
  background: var(--pw-tape);
  padding: 6px 10px;
  border-radius: 10px;
}
.assistant-entry.assistant {
  align-self: flex-start;
}
.assistant-entry.action {
  align-self: flex-start;
  color: var(--pw-accent);
  font-size: 0.9rem;
}
.assistant-entry.fresh {
  align-self: stretch;
  max-width: none;
  text-align: center;
  color: var(--pw-ink-soft);
  font-size: 0.85rem;
  border-top: 1px dashed var(--pw-line);
  padding-top: 6px;
}
.assistant-entry.error {
  align-self: flex-start;
  color: var(--color-danger-dark);
  font-size: 0.9rem;
}

.assistant-input {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  border-top: 2px solid var(--pw-line);
}
.assistant-input input {
  flex: 1;
  min-width: 0;
  /* 16px verhindert das automatische Hineinzoomen von iOS Safari. */
  font-size: 16px;
  padding: 8px 10px;
  border: 2px solid var(--pw-line);
  border-radius: 8px;
  background: #fff;
  color: inherit;
}
.assistant-input button {
  min-width: var(--touch-target-min);
  border: 2px solid var(--pw-line);
  border-radius: 8px;
  background: var(--pw-accent);
  color: #fff;
}
.assistant-input button:disabled {
  opacity: 0.5;
}
</style>
