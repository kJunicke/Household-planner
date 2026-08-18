/**
 * PROTOTYP — WEGWERFCODE. Nicht nach `main` mergen.
 *
 * **Zweite Runde.** Die Varianten der ersten Runde sind weg; entschieden ist:
 *
 * - Der Bearbeiten-Stift sitzt **unten rechts neben dem Eselsohr**. Dort ist
 *   ohnehin die Ecke für Griffe reserviert, und der Titel gewinnt die ganze
 *   obere Kante — bisher hat der Stift oben rechts 36 px davon weggenommen.
 * - Punkte, Rückstand und Fortschritt stehen unten in der Fußzeile.
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
import { setMinNoteWidth } from './wallLayout'

export interface ProtoConfig {
  /** Faktor auf alle Schriftgrößen des Zettels. 1 = Ist-Zustand. */
  scale: number
  /** `MIN_NOTE_WIDTH` — Untergrenze der Zettelbreite. */
  minWidth: number
  /** Kantenlänge der Trefferfläche des Stifts in px. */
  editHit: number
  /** Fußzeile teilt sich die untere Zeile mit dem Stift (spart Höhe). */
  footInline: boolean
}

/** Der Ist-Zustand — nur noch als Vergleichspunkt. */
export const IST: ProtoConfig = {
  scale: 1,
  minWidth: 96,
  editHit: 40,
  footInline: false
}

/** Der besprochene Entwurf. */
export const ENTWURF: ProtoConfig = {
  scale: 1.3,
  minWidth: 150,
  editHit: 48,
  footInline: true
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
    if (key === 'footInline') config.footInline = value === 'true'
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
  s.setProperty('--proto-edit-hit', `${config.editHit}px`)
  // Wie viel Platz die Griffzeile unten braucht, und ob die Fusszeile ihr
  // ausweichen muss. Der Eselsohr-Griff ist 44 px breit und sitzt ganz rechts.
  const EAR = 44
  if (config.footInline) {
    s.setProperty('--proto-foot-reserve', `${EAR + config.editHit - 4}px`)
    s.setProperty('--proto-bottom', `${Math.round(config.editHit * 0.55)}px`)
  } else {
    s.setProperty('--proto-foot-reserve', '0px')
    s.setProperty('--proto-bottom', `${config.editHit + 2}px`)
  }
}

// Einmal beim Laden: sonst misst der erste Layout-Lauf noch die alten
// Schriftgroessen und die Wand bleibt zu niedrig, bis etwas sie neu anstoesst.
applyProtoConfig()
