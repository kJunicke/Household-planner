import { readonly, ref } from 'vue'
import { useTaskStore } from '@/stores/taskStore'

/**
 * Der Fetzen (Pinnwand-Redesign, Etappe 4, Ticket 11).
 *
 * Wer einen Zettel abreißt, hat ihn schon abgerissen, bevor er darüber
 * nachgedacht hat. Der abgerissene Zettel bleibt deshalb als **Fetzen** über der
 * Erledigt-Liste hängen; ein Tipp klebt ihn zurück.
 *
 * **Kein Toast.** Der Fetzen ist die Fortsetzung derselben Metapher und legt
 * sich nicht über die Wand.
 *
 * **Kein Zeitfenster.** Der Fetzen hängt, bis der Nutzer die Pinnwand verlässt
 * oder die Seite neu lädt — dann wird ohnehin alles neu angeordnet. Das ist
 * nicht nur bequemer, es beseitigt einen Fehler: ein Fetzen, der von selbst
 * verschwindet, verschiebt in genau diesem Moment das Layout unter einem
 * aufliegenden Finger. Der QC hat gemessen, dass die Erledigt-Liste dabei um
 * 81,4 px nach oben sprang und ein Tipp danach an drei von drei Punkten eine
 * ANDERE Zeile traf — deren Knopf „wieder dreckig" ist, der eine fremde Aufgabe
 * unumkehrbar wieder aufmacht und ihre Punkte verbucht lässt. Ausgelöst wurde
 * das nicht von der Fingerpräzision, sondern von einer Uhr, die von selbst
 * ablief. Ohne Uhr gibt es den Moment nicht mehr, in dem etwas verschwindet.
 *
 * **Ein Zustand für die ganze Seite**, nicht einer je Zettel — aus demselben
 * Grund wie beim Scroll-Wächter: der Fetzen hängt an der Erledigt-Liste,
 * gerissen wird aber im Zettel, und dazwischen liegt die ganze Wand.
 *
 * **Genau EIN Fetzen gleichzeitig** (Abnahmekriterium „keine überlappenden
 * Fetzen"): ein neuer Abriss ersetzt den vorherigen, dessen Fenster damit
 * endgültig zu ist. Das ist keine Sparmaßnahme, sondern die Bedingung, unter der
 * `taskStore.undoCompletion` die richtige Zeile findet — dort wird die **jüngste
 * eigene** Erledigung gelöscht, und nur der jüngste Abriss ist überhaupt
 * zurücknehmbar. Ein Stapel von Fetzen würde diese Zuordnung brechen.
 */

export interface TornScrap {
  taskId: string
  title: string
  /** Was beim Abreißen in die Leiste geflogen ist — 0 bei einem Abriss ohne Punkte. */
  points: number
}

const scrap = ref<TornScrap | null>(null)

/** Läuft gerade ein Zurückkleben? Dann ist der Fetzen unantastbar. */
const busy = ref(false)

/**
 * Fetzen weg. Der Fahrschein im Store wird dabei weggeworfen: ohne Fetzen gibt
 * es kein Rückgängig mehr, und ein liegengebliebener Fahrschein wäre eines, das
 * niemand sieht, aber noch auslösbar wäre.
 */
const close = () => {
  const current = scrap.value
  if (!current) return
  scrap.value = null
  useTaskStore().discardUndoTicket(current.taskId)
}

/**
 * Einen abgerissenen Zettel als Fetzen anbieten. Aufgerufen erst, wenn die
 * Erledigung **lokal angewendet** wurde — ein abgewiesener Doppelgriff darf
 * keinen Fetzen erzeugen, dessen Rückgängig es gar nicht gibt.
 *
 * Der vorherige Fetzen wird **ersetzt**, nicht daneben gehängt. Weil beide
 * dieselbe Form haben und der Titel nie umbricht (`nowrap` + Auslassung), ist
 * das ein Austausch des Inhalts an derselben Stelle: die Erledigt-Liste darunter
 * rührt sich dabei nicht.
 */
export const offerScrap = (torn: TornScrap) => {
  const previous = scrap.value
  // Nur der jüngste Abriss ist zurücknehmbar (siehe oben) — der Fahrschein des
  // vorherigen wird deshalb hier verworfen und nicht erst später.
  if (previous && previous.taskId !== torn.taskId) {
    useTaskStore().discardUndoTicket(previous.taskId)
  }
  scrap.value = torn
}

/**
 * Fenster von außen schließen. Zwei Fälle, und nur diese beiden:
 *
 * - die Pinnwand wird verlassen (bzw. die Seite neu geladen) — was man nicht
 *   sieht, darf man nicht auslösen können;
 * - die Aufgabe unter dem Fetzen ist weg, weil ein anderes Mitglied sie gelöscht
 *   hat — ein Fetzen, dessen Zettel es nicht mehr gibt, führt beim Tippen ins
 *   Leere.
 */
export const dropScrap = (taskId: string) => {
  if (scrap.value?.taskId === taskId) close()
}

/**
 * Zurückkleben. Der Riegel gegen den Doppeltipp ist das synchrone `busy` vor dem
 * ersten `await`; darauf ein `:disabled` zu setzen genügt nicht, weil Vue das
 * Attribut erst im nächsten Tick schreibt.
 *
 * Der Fetzen bleibt währenddessen stehen und zeigt, dass etwas läuft: der Zettel
 * kommt erst zurück an die Wand, wenn der Server bestätigt hat. Ein Fetzen, der
 * sofort verschwindet, behauptete ein Ergebnis, das noch aussteht.
 */
export const undoScrap = async (): Promise<void> => {
  const current = scrap.value
  if (!current || busy.value) return
  busy.value = true
  try {
    await useTaskStore().undoCompletion(current.taskId)
  } finally {
    busy.value = false
    // Unabhängig vom Ausgang: das Fenster ist verbraucht. Bei Erfolg hängt der
    // Zettel wieder an der Wand, bei Misserfolg steht der Fehler im Toast — in
    // beiden Fällen wäre ein weiterhin hängender Fetzen eine Einladung, dieselbe
    // Rücknahme ein zweites Mal auszulösen.
    close()
  }
}

/**
 * Nur lesend. Geändert wird ausschließlich über `offerScrap`, `undoScrap` und
 * `dropScrap`.
 */
export const tornScrapState = {
  scrap: readonly(scrap),
  busy: readonly(busy)
}
