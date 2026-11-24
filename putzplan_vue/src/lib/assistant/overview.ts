/**
 * Die kleine Übersicht, die mit jeder Frage an Claude geht: Datum, wer fragt,
 * die Mitglieder und Namen und IDs von Listen, Notizen und Töpfen. Inhalte
 * (Artikel, Notiztexte, Ausgaben) stehen nicht darin; die holt Claude über
 * Lese-Werkzeuge, wenn eine Frage sie braucht. So kostet nicht jede Frage
 * den ganzen Haushalt mit.
 *
 * Erfasst wird sie einmal je Frage, nicht je Runde der Werkzeugschleife:
 * sonst hielte Claude eben Hinzugefügtes für schon vorhanden.
 */

interface Named {
  list_id: string
  name: string
}

export interface OverviewSources {
  /** Langes deutsches Datum, z. B. „Dienstag, 24. November 2026“. */
  today: string
  askingUserId: string
  members: { user_id: string; display_name: string }[]
  shoppingLists: Named[]
  packingLists: Named[]
  todoLists: Named[]
  notes: { note_id: string; content: string }[]
  pots: { pot_id: string; name: string; kind: 'household' | 'event'; closed_at: string | null }[]
}

const TITLE_CHARS = 40

/** Die erste Zeile einer Notiz, gekürzt; Notizen haben keinen eigenen Titel. */
function noteTitle(content: string): string {
  const firstLine = content.trim().split('\n')[0]!.trim()
  if (firstLine.length <= TITLE_CHARS) return firstLine || '(leer)'
  return `${firstLine.slice(0, TITLE_CHARS).trimEnd()}…`
}

function section(title: string, lines: string[]): string {
  return lines.length ? `${title}:\n${lines.join('\n')}` : `${title}: keine`
}

const listLines = (lists: Named[]) => lists.map((l) => `- ${l.name} (id ${l.list_id})`)

export function buildOverview(s: OverviewSources): string {
  const me = s.members.find((m) => m.user_id === s.askingUserId)
  const others = s.members.filter((m) => m.user_id !== s.askingUserId)
  const potLines = s.pots.map((p) => {
    const marks = [
      p.kind === 'household' ? 'Haushaltstopf' : null,
      p.closed_at ? 'abgeschlossen' : null,
    ].filter(Boolean)
    return `- ${p.name} (id ${[p.pot_id, ...marks].join(', ')})`
  })
  return [
    `Heute ist ${s.today}.`,
    `Es fragt: ${me?.display_name ?? 'unbekannt'} (id ${s.askingUserId})`,
    section(
      'Weitere Mitglieder',
      others.map((m) => `- ${m.display_name} (id ${m.user_id})`),
    ),
    section('Einkaufslisten', listLines(s.shoppingLists)),
    section('Packlisten', listLines(s.packingLists)),
    section('To-do-Listen', listLines(s.todoLists)),
    section(
      'Notizen',
      s.notes.map((n) => `- ${noteTitle(n.content)} (id ${n.note_id})`),
    ),
    section('Töpfe', potLines),
  ].join('\n\n')
}
