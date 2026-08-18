/**
 * PROTOTYP — WEGWERFCODE. Nicht nach `main` mergen.
 *
 * Frage: „Wie werden die Zettel der Pinnwand lesbar, ohne die Paar-Packung
 * aufzugeben?" (→ `HANDOFF-kartengroesse.md`)
 *
 * Vier Varianten auf der bestehenden Route `/`, umschaltbar über `?variant=`
 * und die schwebende Leiste unten (`WallProtoBar.vue`).
 *
 * Jede Variante zieht an einer ANDEREN Stellschraube:
 *   A — der Ist-Zustand, als Vergleichspunkt.
 *   B — Untergrenze hoch + Schrift größer (der Kandidat aus dem Handoff).
 *   C — festes Zwei-Spalten-Raster: jeder Zettel ist halb oder ganz breit.
 *   D — Schrift groß, Fläche umverteilt: schmalerer Rand, leisere Fußzeile.
 */
import { ref } from 'vue'
import { setMinNoteWidth } from './wallLayout'

export interface ProtoVariant {
  key: string
  name: string
  /** Untergrenze der Zettelbreite; bekommt die nutzbare Wandbreite. */
  minWidth: (wallWidth: number) => number
  /** Alle Zettel auf halbe/ganze Wandbreite rasten. */
  snapColumns?: boolean
  /** CSS-Variablen, die `WallNote.vue` für Schrift und Innenabstand liest. */
  css: Record<string, string>
}

const PAIR_GAP = 12

export const PROTO_VARIANTS: ProtoVariant[] = [
  {
    key: 'A',
    name: 'Ist-Zustand',
    minWidth: () => 96,
    css: {}
  },
  {
    key: 'B',
    name: 'Untergrenze 150 + Schrift +2',
    minWidth: () => 150,
    css: {
      '--proto-title': '15px',
      '--proto-title-daily': '14.5px',
      '--proto-title-project': '17px',
      '--proto-foot': '12px',
      '--proto-sub': '14px',
      '--proto-sub-c3': '13.5px',
      '--proto-sub-foot': '11.5px'
    }
  },
  {
    key: 'C',
    name: 'Festes Zwei-Spalten-Raster',
    minWidth: (wall) => Math.floor((wall - PAIR_GAP) / 2),
    snapColumns: true,
    css: {
      '--proto-title': '16px',
      '--proto-title-daily': '15.5px',
      '--proto-title-project': '18px',
      '--proto-foot': '12px',
      '--proto-sub': '14px',
      '--proto-sub-c3': '13.5px',
      '--proto-sub-foot': '11.5px'
    }
  },
  {
    key: 'D',
    name: 'Schrift groß, Fläche umverteilt',
    minWidth: () => 120,
    css: {
      '--proto-title': '16px',
      '--proto-title-daily': '15.5px',
      '--proto-title-project': '18px',
      /* Fußzeile bleibt klein und tritt zurück — der Titel bekommt den Platz. */
      '--proto-foot': '9.5px',
      '--proto-pad': '5px 30px 4px 6px',
      '--proto-sub': '14px',
      '--proto-sub-c3': '13.5px',
      '--proto-sub-foot': '10px'
    }
  }
]

const initialKey = (): string => {
  const fromUrl = new URLSearchParams(window.location.search).get('variant')
  return PROTO_VARIANTS.some((v) => v.key === fromUrl) ? (fromUrl as string) : 'A'
}

export const protoKey = ref(initialKey())

export const protoVariant = (): ProtoVariant =>
  PROTO_VARIANTS.find((v) => v.key === protoKey.value) ?? PROTO_VARIANTS[0]

export function setProtoKey(key: string): void {
  protoKey.value = key
  const url = new URL(window.location.href)
  url.searchParams.set('variant', key)
  window.history.replaceState({}, '', url)
}

/** Vor jedem Layout-Lauf: Untergrenze und CSS-Variablen der Variante setzen. */
export function applyProtoVariant(wallWidth: number): ProtoVariant {
  const variant = protoVariant()
  setMinNoteWidth(variant.minWidth(wallWidth))
  const root = document.documentElement
  for (const v of PROTO_VARIANTS) {
    for (const name of Object.keys(v.css)) root.style.removeProperty(name)
  }
  for (const [name, value] of Object.entries(variant.css)) {
    root.style.setProperty(name, value)
  }
  return variant
}

/**
 * Variante C: alles auf halbe oder ganze Wandbreite rasten. Bewusst NACH dem
 * regulären Planen — der Prototyp fragt, wie ein Raster aussieht, nicht wie man
 * es sauber einbaut.
 */
export function snapToColumns(widths: Map<string, number>, wallWidth: number): void {
  const half = Math.floor((wallWidth - PAIR_GAP) / 2)
  for (const [id, width] of widths) {
    widths.set(id, width <= half ? half : wallWidth)
  }
}
