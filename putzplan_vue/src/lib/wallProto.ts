/**
 * PROTOTYP — WEGWERFCODE. Nicht nach `main` mergen.
 *
 * **Zweite Runde.** Die Varianten der ersten Runde sind weg; entschieden ist:
 *
 * - Der Bearbeiten-Stift sitzt **unten rechts neben dem Eselsohr**. Dort ist
 *   ohnehin die Ecke für Griffe reserviert, und der Titel gewinnt die ganze
 *   obere Kante — bisher hat der Stift oben rechts 36 px davon weggenommen.
 * - Die Fußzeile ist die Griffzeile: Punkte und Fälligkeit links, Stift und
 *   Eselsohr rechts — beide gleich groß.
 * - Alle Schriften wachsen um rund 30 %.
 *
 * Diese Datei hält nur noch, was **offen** ist (→ `WallProtoBar.vue`):
 * Skalierung, Mindestbreite, Trefferfläche des Stifts und die Frage, ob die
 * Fußzeile eine eigene Zeile bekommt oder sich die Zeile mit dem Stift teilt.
 *
 * **Referenzwerte der Branche** (daher die Regler-Enden):
 * - Trefferfläche: Material Design 3 fordert 48×48 dp, mindestens 24×24 dp;
 *   Apple HIG 44×44 pt.
 * - Schrift: Material Body-Large 16 sp, Label-Large 14 sp, Label-Small 11 sp;
 *   Apple Body 17 pt.
 * - Der Ist-Zustand liegt mit 13 px Titel und 10 px Fußzeile unter allem
 *   davon; ×1.3 bringt ihn auf 16,9 px / 13 px — also genau auf Body-Niveau.
 */
import { reactive, watch } from 'vue'
import { setLeftIndent, setMinNoteWidth } from './wallLayout'

export interface ProtoConfig {
  /** Faktor auf alle Schriftgrößen des Zettels. 1 = Ist-Zustand. */
  scale: number
  /** `MIN_NOTE_WIDTH` — Untergrenze der Zettelbreite. */
  minWidth: number
  /** Kantenlänge BEIDER Griffe — Stift und Eselsohr sind gleich groß. */
  hit: number
  /** Kantenlänge des Punkte-Stickers. */
  sticker: number
  /** Wie weit ein Zettel an der linken Kante eingerückt werden darf (px). */
  indent: number
  /** Wie die Dringlichkeit gezeigt wird. */
  due: 'aus' | 'zwecke' | 'stempel' | 'beides'
  /**
   * Wo Punktwert und Rückstand stehen. `auto` heißt: oben rechts nur dann,
   * wenn die Fußzeile sonst breiter als der Titel wäre.
   */
  metaTop: 'auto' | 'oben' | 'unten'
}

/** Der Ist-Zustand — nur noch als Vergleichspunkt. */
export const IST: ProtoConfig = {
  scale: 1,
  minWidth: 96,
  hit: 44,
  sticker: 34,
  indent: 0,
  due: 'aus',
  metaTop: 'unten'
}

/** Der besprochene Entwurf. */
export const ENTWURF: ProtoConfig = {
  scale: 1.2,
  minWidth: 96,
  hit: 44,
  sticker: 34,
  indent: 26,
  due: 'zwecke',
  metaTop: 'auto'
}

export const config = reactive<ProtoConfig>({ ...ENTWURF })

// --- URL: Einstellung teilbar und neuladefest ---------------------------------

const KEYS = Object.keys(IST) as Array<keyof ProtoConfig>

function readUrl(): void {
  const raw = new URLSearchParams(window.location.search).get('proto')
  if (!raw) return
  for (const part of raw.split(',')) {
    const [key, value] = part.split(':') as [keyof ProtoConfig, string]
    if (!KEYS.includes(key) || value === undefined) continue
    if (key === 'due') config.due = value as ProtoConfig['due']
    else if (key === 'metaTop') config.metaTop = value as ProtoConfig['metaTop']
    else (config[key] as number) = Number(value)
  }
}

watch(config, () => {
  const url = new URL(window.location.href)
  url.searchParams.set('proto', KEYS.map((key) => `${key}:${config[key]}`).join(','))
  window.history.replaceState({}, '', url)
})

readUrl()

/** Vor jedem Layout-Lauf: Untergrenze und CSS-Variablen setzen. */
export function applyProtoConfig(): void {
  setMinNoteWidth(config.minWidth)
  const s = document.documentElement.style
  s.setProperty('--proto-scale', String(config.scale))
  s.setProperty('--proto-hit', `${config.hit}px`)
  s.setProperty('--proto-sticker', `${config.sticker}px`)
  setLeftIndent(config.indent)
  document.documentElement.dataset.protoDue = config.due
  // Der Knick des Eselsohrs waechst mit seiner Flaeche, damit er neben dem
  // Stift-Patch nicht verloren wirkt.
  s.setProperty('--proto-knick', `${Math.round(config.hit * 0.62)}px`)
}

// Einmal beim Laden: sonst misst der erste Layout-Lauf noch die alten
// Schriftgroessen und die Wand bleibt zu niedrig, bis etwas sie neu anstoesst.
applyProtoConfig()
