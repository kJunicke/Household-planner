/**
 * Die Werkzeuge des Assistenten für die Notizen, samt Beschreibung für Claude,
 * Ausführung und Rücknahme. Notizen haben nur einen Inhalt, keinen Titel: die
 * Übersicht und die Zeilen für den Nutzer nennen sie über ihren Anfang, den
 * ganzen Text holt Claude über `read_note`.
 *
 * Ausgeführt wird über den notesStore, wie beim Tippen auf der Notizen-Seite,
 * nur ohne dessen eigene Erfolgs-Toasts: den Toast mit Rückgängig zeigt der Chat.
 */
import type { useNotesStore } from '@/stores/notesStore'
import { NOTE_CONTENT_MAX_LENGTH } from '@/lib/limits'
import { noteTitle } from './overview'
import { undoAll, type AssistantTool, type Change, type ToolOutcome } from './tools'

/**
 * Der Teil des notesStore, den die Werkzeuge brauchen. Hereingereicht statt
 * selbst geholt, damit die Tests einen gefälschten Store geben können.
 */
export type NotesToolStore = Pick<
  ReturnType<typeof useNotesStore>,
  'notes' | 'createNote' | 'updateNote' | 'deleteNote' | 'restoreNote'
>

const QUIET = { quiet: true }
const PAGE = { area: 'notes' } as const

/** Ein Ergebnis aus genau einer rücknehmbaren Änderung an einer Notiz. */
function changedNote(id: string, result: string, change: Change): ToolOutcome {
  return {
    result,
    summary: change.summary,
    undo: undoAll([change.undo]),
    changed: [{ id, page: PAGE }],
    changes: [change],
  }
}

type Note = NotesToolStore['notes'][number]

/** Die Notiz zu `input.note_id`, oder das Fehlerergebnis für Claude. */
function findNote(store: NotesToolStore, input: Record<string, unknown>): Note | ToolOutcome {
  const id = String(input.note_id ?? '')
  return (
    store.notes.find((n) => n.note_id === id) ?? {
      result: `Unbekannte note_id ${id}`,
      isError: true,
    }
  )
}

function readNote(store: NotesToolStore, input: Record<string, unknown>): ToolOutcome {
  const note = findNote(store, input)
  if (!('note_id' in note)) return note
  return { result: `Notiz (id ${note.note_id}):\n${note.content}` }
}

async function createNote(store: NotesToolStore, input: Record<string, unknown>) {
  const content = String(input.content ?? '').trim()
  if (!content) return { result: 'Die Notiz ist leer', isError: true }
  const note = await store.createNote(content, QUIET)
  if (!note) {
    return {
      result: 'Notiz nicht angelegt',
      isError: true,
      summary: `✗ Notiz nicht angelegt: ${noteTitle(content)}`,
    }
  }
  const id = note.note_id
  // Ab der nächsten Frage steht sie in der Übersicht; ohne den Hinweis hielt
  // Claude sie dort für eine ältere Notiz, die er überschrieben hätte.
  const result = `Notiz neu angelegt (id ${id}). Ab der nächsten Frage steht sie auch in der Übersicht, als diese Notiz.`
  return changedNote(id, result, {
    summary: `✓ neue Notiz: ${noteTitle(content)}`,
    undo: () => store.deleteNote(id, QUIET),
  })
}

/**
 * Ersetzt den Text einer Notiz; die Rücknahme setzt den vorigen wieder ein.
 * `verb` steht in der Zeile für den Nutzer, z. B. „ergänzt“.
 */
async function editNote(
  store: NotesToolStore,
  note: Note,
  content: string,
  verb: string,
): Promise<ToolOutcome> {
  const id = note.note_id
  const previous = note.content
  if (content.length > NOTE_CONTENT_MAX_LENGTH) {
    return { result: `Zu lang: höchstens ${NOTE_CONTENT_MAX_LENGTH} Zeichen`, isError: true }
  }
  if (!(await store.updateNote(id, content, QUIET))) {
    return {
      result: 'Notiz nicht geändert',
      isError: true,
      summary: `✗ nicht ${verb}: ${noteTitle(previous)}`,
    }
  }
  return changedNote(id, `Notiz ${verb} (id ${id}).`, {
    summary: `✓ ${verb}: ${noteTitle(previous)}`,
    // Eine inzwischen gelöschte Notiz bekäme das Ändern nicht wieder her.
    undo: async () =>
      store.notes.some((n) => n.note_id === id) && store.updateNote(id, previous, QUIET),
  })
}

async function appendToNote(store: NotesToolStore, input: Record<string, unknown>) {
  const note = findNote(store, input)
  if (!('note_id' in note)) return note
  const text = String(input.text ?? '').trim()
  if (!text) return { result: 'Kein Text zum Ergänzen', isError: true }
  return editNote(store, note, `${note.content.trimEnd()}\n${text}`, 'ergänzt')
}

async function rewriteNote(store: NotesToolStore, input: Record<string, unknown>) {
  const note = findNote(store, input)
  if (!('note_id' in note)) return note
  const content = String(input.content ?? '').trim()
  if (!content)
    return { result: 'Die Notiz wäre leer; zum Löschen gibt es delete_note', isError: true }
  return editNote(store, note, content, 'umgeschrieben')
}

/**
 * Löscht erst nach der Karte im Chat. Die Rücknahme legt die Notiz mit ihrer
 * ID, ihrem Text und ihrem Datum wieder an, aber unter dem Namen dessen, der
 * fragt: die Datenbank lässt niemanden eine Notiz für einen anderen anlegen.
 * Bei der Notiz eines anderen sagt das die Karte.
 */
function deleteNote(
  store: NotesToolStore,
  currentUserId: () => string | null,
  input: Record<string, unknown>,
): ToolOutcome {
  const found = findNote(store, input)
  if (!('note_id' in found)) return found
  // Der Stand von jetzt: was die Karte nennt, wird gelöscht und zurückgeholt.
  const note = { ...found }
  const title = noteTitle(note.content)
  const someoneElses = note.created_by !== currentUserId()
  return {
    result: 'Wartet auf die Bestätigung des Nutzers.',
    deleteCard: {
      what: someoneElses
        ? `Notiz „${title}“ von einem anderen Mitglied; mit Rückgängig käme sie unter deinem Namen zurück`
        : `Notiz „${title}“`,
      confirm: async () => {
        if (!(await store.deleteNote(note.note_id, QUIET))) {
          return {
            result: 'Nichts gelöscht.',
            isError: true,
            summary: `✗ Notiz nicht gelöscht: ${title}`,
          }
        }
        const change: Change = {
          summary: `✓ Notiz gelöscht: ${title}`,
          undo: async () => !!(await store.restoreNote(note)),
        }
        return {
          result: `Notiz gelöscht (id ${note.note_id}).`,
          summary: change.summary,
          undo: change.undo,
          changes: [change],
        }
      },
    },
  }
}

const NOTE_ID = { type: 'string', description: 'ID der Notiz aus der Übersicht' }

export const notesTools = (
  store: NotesToolStore,
  currentUserId: () => string | null,
): AssistantTool[] => [
  {
    name: 'read_note',
    description:
      'Zeigt den ganzen Text einer Notiz; die Übersicht nennt nur ihren Anfang. Nutze es für ' +
      'Fragen nach dem Inhalt und bevor du eine Notiz umschreibst.',
    input_schema: { type: 'object', properties: { note_id: NOTE_ID }, required: ['note_id'] },
    execute: async (input) => readNote(store, input),
  },
  {
    name: 'create_note',
    description:
      'Legt eine neue Notiz an. Notizen haben keinen Titel; ihre erste Zeile nennt sie in der ' +
      'Übersicht. Gehört das Neue zu einer bestehenden Notiz, nimm append_to_note.',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Der Text der Notiz; die erste Zeile sagt, worum es geht.',
        },
      },
      required: ['content'],
    },
    execute: (input) => createNote(store, input),
  },
  {
    name: 'append_to_note',
    description:
      'Hängt Text unten an eine bestehende Notiz an, ohne den Rest anzutasten, z. B. bei ' +
      '„schreib in die Notiz mit …, dass …“. Den ganzen Text musst du dafür nicht lesen.',
    input_schema: {
      type: 'object',
      properties: {
        note_id: NOTE_ID,
        text: { type: 'string', description: 'Was dazukommt, als neue Zeile' },
      },
      required: ['note_id', 'text'],
    },
    execute: (input) => appendToNote(store, input),
  },
  {
    name: 'rewrite_note',
    description:
      'Ersetzt den ganzen Text einer Notiz, z. B. um etwas darin zu ändern oder zu streichen. ' +
      'Lies sie vorher mit read_note und gib den vollständigen neuen Text an. Kommt nur etwas ' +
      'dazu, nimm append_to_note.',
    input_schema: {
      type: 'object',
      properties: {
        note_id: NOTE_ID,
        content: { type: 'string', description: 'Der vollständige neue Text der Notiz' },
      },
      required: ['note_id', 'content'],
    },
    execute: (input) => rewriteNote(store, input),
  },
  {
    name: 'delete_note',
    description:
      'Löscht eine Notiz ganz. Soll nur ein Teil weg, nimm rewrite_note. Vor dem Löschen zeigt ' +
      'die App dem Nutzer eine Karte mit „Löschen“ und „Abbrechen“; frag darum nicht selbst ' +
      'nach, und melde das Löschen erst, wenn das Ergebnis es bestätigt.',
    input_schema: { type: 'object', properties: { note_id: NOTE_ID }, required: ['note_id'] },
    execute: async (input) => deleteNote(store, currentUserId, input),
  },
]
