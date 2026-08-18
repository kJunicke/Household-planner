/**
 * PROTOTYP — WEGWERFCODE. Nicht nach `main` mergen.
 *
 * Frage: „Wie werden die Zettel der Pinnwand auf dem Handy lesbar und
 * bedienbar?" (→ `HANDOFF-kartengroesse.md`)
 *
 * Kein fester Variantensatz mehr, sondern **Regler**: Schriftgrößen,
 * Innenabstand, Mindestbreite und der Bearbeiten-Stift (Größe und Position)
 * lassen sich live drehen. Presets sind nur Sprungmarken in denselben Raum.
 *
 * Der ganze Zustand steckt in der URL (`?proto=`), damit eine Einstellung
 * teilbar und nach dem Neuladen noch da ist.
 *
 * **Referenzwerte** (dafür sind die Regler-Enden gewählt):
 * - Trefferfläche: iOS HIG 44×44 pt, Material Design 48×48 dp Minimum.
 * - Fließtext: iOS Body 17 pt, Material Body-Large 16 sp; unter 11–12 px gilt
 *   Text auf dem Telefon als grenzwertig.
 * - Der Zettel-Titel ist kein Fließtext, sondern fett und kurz — 15–17 px ist
 *   dort das Gegenstück zu 16 sp Fließtext.
 */
import { reactive, watch } from 'vue'
import { setMinNoteWidth } from './wallLayout'

/** Wo der Bearbeiten-Stift sitzt. */
export type EditPos = 'tr' | 'tl' | 'bl' | 'flow'

export const EDIT_POS_LABELS: Record<EditPos, string> = {
  tr: 'oben rechts (Ist)',
  tl: 'oben links',
  bl: 'unten links',
  flow: 'in der Fußzeile'
}

export interface ProtoConfig {
  /** Titelgröße in px. */
  title: number
  /** Fußzeile (Punkte, Rückstand) in px. */
  foot: number
  /** Schrift der Unteraufgaben-Zettelchen in px. */
  sub: number
  /** Innenabstand des Zettels in px (oben/unten bzw. links). */
  pad: number
  /** `MIN_NOTE_WIDTH` — Untergrenze der Zettelbreite. */
  minWidth: number
  /** Sichtbare Größe des Stift-Glyphs in px. */
  editGlyph: number
  /** Kantenlänge der Trefferfläche des Stifts in px. */
  editHit: number
  /** Position des Stifts. */
  editPos: EditPos
}

/** Der Ist-Zustand — Startpunkt und Vergleichspunkt. */
export const IST: ProtoConfig = {
  title: 13,
  foot: 10,
  sub: 12,
  pad: 6,
  minWidth: 96,
  editGlyph: 12,
  editHit: 40,
  editPos: 'tr'
}

export interface ProtoPreset {
  key: string
  name: string
  hint: string
  config: ProtoConfig
}

export const PRESETS: ProtoPreset[] = [
  {
    key: 'A',
    name: 'Ist-Zustand',
    hint: 'Vergleichspunkt',
    config: { ...IST }
  },
  {
    key: 'B',
    name: 'Nur Schrift größer',
    hint: 'Schrift +2, sonst nichts — zeigt, wo es allein daran hakt',
    config: { ...IST, title: 15, foot: 12, sub: 14 }
  },
  {
    key: 'C',
    name: 'Schrift + Untergrenze',
    hint: 'Kandidat aus dem Handoff: 150 px Untergrenze',
    config: { ...IST, title: 15, foot: 12, sub: 14, minWidth: 150 }
  },
  {
    key: 'D',
    name: 'Fläche umverteilt',
    hint: 'Titel groß, Fußzeile leise, Rand schmal',
    config: { ...IST, title: 16, foot: 9.5, sub: 14, pad: 5, minWidth: 120 }
  },
  {
    key: 'E',
    name: 'Daumen-tauglich',
    hint: '16 px Titel, Stift 20 px auf 48 px Fläche in der Fußzeile',
    config: {
      title: 16,
      foot: 12,
      sub: 14,
      pad: 8,
      minWidth: 150,
      editGlyph: 20,
      editHit: 48,
      editPos: 'flow'
    }
  }
]

export const config = reactive<ProtoConfig>({ ...IST })

// --- URL: Einstellung teilbar und neuladefest ---------------------------------

const KEYS = Object.keys(IST) as Array<keyof ProtoConfig>

function readUrl(): void {
  const raw = new URLSearchParams(window.location.search).get('proto')
  if (!raw) return
  for (const part of raw.split(',')) {
    const [key, value] = part.split(':') as [keyof ProtoConfig, string]
    if (!KEYS.includes(key) || value === undefined) continue
    if (key === 'editPos') config.editPos = value as EditPos
    else (config[key] as number) = Number(value)
  }
}

function writeUrl(): void {
  const raw = KEYS.map((key) => `${key}:${config[key]}`).join(',')
  const url = new URL(window.location.href)
  url.searchParams.set('proto', raw)
  window.history.replaceState({}, '', url)
}

readUrl()
watch(config, writeUrl, { deep: true })

export function applyPreset(preset: ProtoPreset): void {
  Object.assign(config, preset.config)
}

/** Stimmt die aktuelle Einstellung exakt mit einem Preset überein? */
export function matchingPreset(): ProtoPreset | null {
  return (
    PRESETS.find((p) => KEYS.every((key) => p.config[key] === config[key])) ?? null
  )
}

/**
 * Vor jedem Layout-Lauf: Untergrenze und CSS-Variablen setzen.
 *
 * Die Schriftgrößen der Unteraufgaben leiten sich von `sub` ab, statt eigene
 * Regler zu bekommen — drei Regler für dieselbe Frage machen den Prototypen
 * unbedienbar.
 */
export function applyProtoConfig(): void {
  setMinNoteWidth(config.minWidth)
  const s = document.documentElement.style
  s.setProperty('--proto-title', `${config.title}px`)
  s.setProperty('--proto-title-daily', `${config.title - 0.5}px`)
  s.setProperty('--proto-title-project', `${config.title + 2}px`)
  s.setProperty('--proto-foot', `${config.foot}px`)
  s.setProperty('--proto-sub', `${config.sub}px`)
  s.setProperty('--proto-sub-c3', `${config.sub - 0.5}px`)
  s.setProperty('--proto-sub-foot', `${config.sub - 2.5}px`)
  s.setProperty('--proto-edit-glyph', `${config.editGlyph}px`)
  s.setProperty('--proto-edit-hit', `${config.editHit}px`)

  // Der Innenabstand hängt an der Stift-Position: nur ein Stift OBEN RECHTS
  // braucht rechts einen Streifen frei.
  const side = config.pad + 2
  const reserve = config.editPos === 'tr' ? Math.max(28, config.editHit - 8) : side
  s.setProperty('--proto-pad', `${config.pad}px ${reserve}px ${config.pad - 1}px ${side}px`)

  document.documentElement.dataset.protoEdit = config.editPos
}
