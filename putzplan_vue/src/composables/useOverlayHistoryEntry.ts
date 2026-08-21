import { onMounted, onUnmounted, ref, type Ref } from 'vue'

/**
 * Ein Overlay, das die **Rückgängig-Geste** (Zurück-Wischen bzw. Zurück-Taste)
 * verbraucht, statt sie an den Router durchzureichen.
 *
 * Warum überhaupt: ein rein lokales `ref` macht das offene Overlay zu keinem
 * Verlaufseintrag. Die Geste findet dann nichts zum Zurücknehmen und geht eine
 * **Route** zurück — gemessen: auf der Pinnwand schließt sie das Overlay (weil
 * die View verschwindet) und landet auf der zuvor besuchten Ansicht.
 *
 * Der Eintrag ist deshalb ein **roher `history.pushState`-Eintrag auf dieselbe
 * Adresse**, markiert im Verlaufszustand. Bewusst kein Abfrageparameter
 * (`/?suche=1`): der wäre teilbar und lesezeichenfähig, also ein Eintrag, den
 * wir nicht angelegt haben und nachträglich einfangen müssten. Der
 * Verlaufszustand hat diese Eigenschaften nicht.
 *
 * **Der markierte Eintrag *ist* das offene Overlay** — das ist die einzige
 * Wahrheit hier, und sie steht im Verlauf, nicht in dieser Komponente. Wer auf
 * einen markierten Eintrag kommt, sieht das Overlay: beim Öffnen, beim
 * Vorwärts-Sprung zurück hinein, nach dem Neuladen, nach der Rückkehr aus einer
 * fremden Seite. Es gibt deshalb **keine Besitzfrage** und keinen Aufräumschritt,
 * der einen markierten Eintrag einlösen müsste. Ein Vorgänger fragte stattdessen
 * `performance.getEntriesByType('navigation')` — also **wie das Dokument geladen
 * wurde** statt **was der Eintrag bedeutet**. Das ging bei `back_forward` daneben
 * (App verlassen und per Zurück wiederkommen: die Marke blieb liegen und die
 * nächste Geste tat sichtbar nichts) und fiel ohne die API still aus.
 *
 * **Zum Rücksprung auf dieselbe Adresse:** vue-router 4 führt in
 * `setupListeners` zwar ein `go(-1)` für fehlgeschlagene Pop-Navigationen
 * (`vue-router.mjs:1423`), aber dieser Fall tritt hier nicht ein —
 * `NAVIGATION_DUPLICATED` entsteht in `pushWithRedirect`, der Listener ruft
 * `navigate()` direkt. Gemessen: ein `back()` auf den markierten Eintrag ist
 * **genau ein** Schritt, `history.length` und `position` bleiben stabil.
 *
 * **Reguläres Schließen verbraucht den eigenen Eintrag** (`history.back()`).
 * Ohne das bliebe nach X oder „Aufgabe erstellen" ein toter Eintrag im Stapel
 * liegen, und die nächste Geste liefe sichtbar ins Leere.
 */

/** Schlüssel im Verlaufszustand; steht neben den Feldern von vue-router. */
const STATE_KEY = '__putzplanOverlay'

export function useOverlayHistoryEntry<R = string>(
    name: string,
    onClosed?: (reason?: R) => void,
): {
    isOpen: Ref<boolean>
    open: () => void
    close: (reason?: R) => void
} {
    const isMarked = () =>
        (window.history.state as Record<string, unknown> | null)?.[STATE_KEY] === name

    // Beim Aufbau der View gilt, was im Verlauf steht — die View kann auch auf
    // einem markierten Eintrag montiert werden (Rückkehr aus einer fremden
    // Seite, Neuladen, Sprung über die Verlaufsliste).
    const isOpen = ref(isMarked())

    /**
     * Der Grund des Schließens muss den Verlaufssprung überleben — `back()` ist
     * asynchron, gemeldet wird erst im `popstate`.
     */
    let pendingReason: R | undefined

    /**
     * Synchroner Riegel gegen zwei `close()`-Aufrufe im **selben** JS-Task:
     * `window.history.state` zieht erst im `popstate`-Task nach, beide Aufrufe
     * sähen sonst einen markierten Eintrag und stellten zwei `back()` in die
     * Schlange — der zweite verließe die Ansicht.
     */
    let closing = false

    const finishClose = (reason?: R) => {
        pendingReason = undefined
        closing = false
        isOpen.value = false
        onClosed?.(reason)
    }

    const open = () => {
        if (isOpen.value || closing) return
        // Zustand von vue-router mitnehmen (`position`, `scroll`, …) und nur
        // die Markierung ergänzen — die Adresse bleibt dieselbe.
        window.history.pushState({ ...window.history.state, [STATE_KEY]: name }, '')
        isOpen.value = true
    }

    const close = (reason?: R) => {
        if (!isOpen.value || closing) return
        if (isMarked()) {
            closing = true
            pendingReason = reason
            window.history.back()
            return
        }
        // Kein markierter Eintrag mehr da (z. B. schon weggesprungen): nur noch
        // lokal schließen, sonst nähme `back()` einen fremden Schritt mit.
        finishClose(reason)
    }

    /**
     * **Voraussetzung: die Marke ist eindeutig** — im Verlauf steht nie zweimal
     * `name` hintereinander. Nur dann bedeutet ein Sprung von einem markierten
     * auf einen unmarkierten Eintrag „Overlay zu", und nur dann ist der
     * Vergleich unten vollständig: landete ein `back()` auf einem **ebenfalls**
     * markierten Eintrag, wäre `marked === isOpen.value` erfüllt, `finishClose()`
     * liefe nie, ein Verlaufsschritt wäre verbraucht und sichtbar passierte
     * nichts — stumm.
     *
     * Getragen wird die Eindeutigkeit heute davon, dass es **genau eine**
     * Instanz je `name` gibt: `HomeView` rendert `WallView` **oder**
     * `CleaningView` (`v-if`/`v-else`, kein `keep-alive`), und `open()` steigt
     * aus, solange `isOpen` schon gilt. Wer daran rührt — zweites Overlay mit
     * demselben `name`, `keep-alive`, ein Umschalter, der beide Views kurz
     * gleichzeitig hält — nimmt diese Voraussetzung weg.
     */
    const onPopState = () => {
        closing = false
        const marked = isMarked()
        if (marked === isOpen.value) return
        if (marked) {
            isOpen.value = true
            return
        }
        finishClose(pendingReason)
    }

    onMounted(() => {
        window.addEventListener('popstate', onPopState)
    })

    onUnmounted(() => {
        window.removeEventListener('popstate', onPopState)
    })

    return { isOpen, open, close }
}
