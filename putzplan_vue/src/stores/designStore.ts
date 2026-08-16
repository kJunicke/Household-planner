import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
    applyDesign,
    readStoredDesign,
    storeDesign,
    type DesignMode,
} from '../lib/design'

/**
 * Aussehen-Umschalter. Reine Geräte-Einstellung — kein Netzwerk, kein Supabase.
 * Das Attribut wird bereits in main.ts gesetzt; der Store hält den Zustand nur
 * reaktiv für die UI und schreibt ihn bei jeder Änderung sofort durch.
 */
export const useDesignStore = defineStore('design', () => {
    const design = ref<DesignMode>(readStoredDesign())

    function setDesign(mode: DesignMode) {
        if (design.value === mode) return
        design.value = mode
        applyDesign(mode)
        storeDesign(mode)
    }

    return { design, setDesign }
})
