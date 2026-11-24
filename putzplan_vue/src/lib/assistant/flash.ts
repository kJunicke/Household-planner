/**
 * Das Aufleuchten nach dem Assistenten, an einer Stelle: wie lange, wie es
 * aussieht (Klasse `assistant-flash` in `src/assets/assistant-flash.css`) und
 * dass der erste Treffer in die Mitte scrollt. Die Ansichten (Einkauf, Pack-
 * und To-do-Listen, Notizen) binden nur die Klasse und rufen `useFlash`.
 */
import { nextTick, watch, type Ref } from 'vue'

/** Ein Puls; das Stylesheet liest ihn als `--assistant-flash-pulse`. */
const FLASH_PULSE_MS = 1200
const FLASH_PULSES = 3
/** So lange leuchten die Einträge, danach leert followApp die Mengen. */
export const FLASH_MS = FLASH_PULSE_MS * FLASH_PULSES

export const FLASH_CLASS = 'assistant-flash'

/**
 * Lässt eine Ansicht aufleuchten, sobald `ids` sich füllt. `reveal` klappt
 * vorher auf, was einen der Einträge verdeckt (eingeklappte Kategorie,
 * Block „erledigt“): was leuchten soll, muss zu sehen sein.
 */
export function useFlash(
  ids: Ref<ReadonlySet<string>>,
  reveal?: (ids: ReadonlySet<string>) => void,
) {
  const root = document.documentElement.style
  root.setProperty('--assistant-flash-pulse', `${FLASH_PULSE_MS}ms`)
  root.setProperty('--assistant-flash-pulses', String(FLASH_PULSES))
  watch(ids, async (now) => {
    if (now.size === 0) return
    reveal?.(now)
    await nextTick()
    document.querySelector(`.${FLASH_CLASS}`)?.scrollIntoView({ block: 'center' })
  })
}
