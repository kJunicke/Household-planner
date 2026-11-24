import { describe, expect, it } from 'vitest'

import { type NotesToolStore } from './notesTools'
import type { ShoppingToolStore } from './shoppingTools'
import { assistantTools } from './tools'

type Note = NotesToolStore['notes'][number]

/** A stand-in for the notes store; `fail` makes every write report failure, as the real store does when logged out. */
function fakeStore(notes: Partial<Note>[] = [], { fail = false } = {}) {
  const store = {
    notes: notes.map((n) => ({ created_at: '2026-11-01T10:00:00Z', ...n }) as Note),
    loadNotes: async () => {},
    createNote: async (content: string) => {
      if (fail) return null
      const note = { note_id: `new-${store.notes.length}`, content: content.trim() } as Note
      store.notes.unshift(note)
      return note
    },
    updateNote: async (noteId: string, content: string) => {
      if (fail) return false
      store.notes.find((n) => n.note_id === noteId)!.content = content.trim()
      return true
    },
    deleteNote: async (noteId: string) => {
      if (fail) return false
      store.notes = store.notes.filter((n) => n.note_id !== noteId)
      return true
    },
    restoreNote: async (note: Note) => {
      if (fail) return null
      store.notes.push({ ...note })
      return note
    },
  }
  return store
}

const executeNotesTool = (
  store: ReturnType<typeof fakeStore>,
  name: string,
  input: Record<string, unknown>,
) =>
  assistantTools({
    shopping: { lists: [], items: [] } as unknown as ShoppingToolStore,
    notes: store as unknown as NotesToolStore,
    goToPage: () => {},
  }).execute(name, input)

const contentOf = (store: ReturnType<typeof fakeStore>, id: string) =>
  store.notes.find((n) => n.note_id === id)?.content

describe('create_note', () => {
  it('writes a new note, tells the user by its beginning and leads to the notes page', async () => {
    const store = fakeStore()
    const outcome = await executeNotesTool(store, 'create_note', {
      content: 'Handwerker\nElektriker kommt am Montag',
    })
    expect(store.notes.map((n) => n.content)).toEqual(['Handwerker\nElektriker kommt am Montag'])
    expect(outcome.isError).toBeFalsy()
    expect(outcome.summary).toBe('✓ neue Notiz: Handwerker')
    expect(outcome.changed).toEqual([{ id: 'new-0', page: { area: 'notes' } }])
    expect(outcome.changes).toHaveLength(1)
  })

  it('can be taken back: the new note is gone again', async () => {
    const store = fakeStore()
    const outcome = await executeNotesTool(store, 'create_note', { content: 'Handwerker' })
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(store.notes).toEqual([])
  })

  it('reports a note the store refused as an error, not as written', async () => {
    const outcome = await executeNotesTool(fakeStore([], { fail: true }), 'create_note', {
      content: 'Handwerker',
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.changes).toBeUndefined()
  })

  it('rejects an empty note', async () => {
    const store = fakeStore()
    const outcome = await executeNotesTool(store, 'create_note', { content: '  ' })
    expect(outcome.isError).toBe(true)
    expect(store.notes).toEqual([])
  })
})

describe('read_note', () => {
  it('shows the whole text of a note and changes nothing', async () => {
    const store = fakeStore([{ note_id: 'n1', content: 'Handwerker\nElektriker Montag' }])
    const outcome = await executeNotesTool(store, 'read_note', { note_id: 'n1' })
    expect(outcome.result).toContain('Handwerker\nElektriker Montag')
    expect(outcome.result).toContain('n1')
    expect(outcome.summary).toBeUndefined()
    expect(outcome.changes).toBeUndefined()
  })

  it('rejects an unknown note id', async () => {
    const outcome = await executeNotesTool(fakeStore(), 'read_note', { note_id: 'x' })
    expect(outcome.isError).toBe(true)
  })
})

describe('append_to_note', () => {
  const notes = () => [
    { note_id: 'n1', content: 'Handwerker\nElektriker kommt am Montag' },
    { note_id: 'n2', content: 'Urlaub' },
  ]

  it('adds the text at the end and leaves the rest as it was', async () => {
    const store = fakeStore(notes())
    const outcome = await executeNotesTool(store, 'append_to_note', {
      note_id: 'n1',
      text: 'Maler kommt am Freitag',
    })
    expect(contentOf(store, 'n1')).toBe(
      'Handwerker\nElektriker kommt am Montag\nMaler kommt am Freitag',
    )
    expect(contentOf(store, 'n2')).toBe('Urlaub')
    expect(outcome.summary).toBe('✓ ergänzt: Handwerker')
    expect(outcome.changed).toEqual([{ id: 'n1', page: { area: 'notes' } }])
  })

  it('can be taken back: the note has its earlier text again', async () => {
    const store = fakeStore(notes())
    const outcome = await executeNotesTool(store, 'append_to_note', {
      note_id: 'n1',
      text: 'Maler kommt am Freitag',
    })
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(contentOf(store, 'n1')).toBe('Handwerker\nElektriker kommt am Montag')
  })

  it('cannot take back once the note is gone', async () => {
    const store = fakeStore(notes())
    const outcome = await executeNotesTool(store, 'append_to_note', { note_id: 'n1', text: 'x' })
    await store.deleteNote('n1')
    expect(await outcome.changes![0]!.undo()).toBe(false)
  })

  it('reports a change the store refused as an error', async () => {
    const store = fakeStore(notes(), { fail: true })
    const outcome = await executeNotesTool(store, 'append_to_note', { note_id: 'n1', text: 'x' })
    expect(outcome.isError).toBe(true)
    expect(outcome.changes).toBeUndefined()
  })

  it('rejects an unknown note id and empty text', async () => {
    const store = fakeStore(notes())
    expect(
      (await executeNotesTool(store, 'append_to_note', { note_id: 'x', text: 'y' })).isError,
    ).toBe(true)
    expect(
      (await executeNotesTool(store, 'append_to_note', { note_id: 'n1', text: ' ' })).isError,
    ).toBe(true)
    expect(contentOf(store, 'n1')).toBe('Handwerker\nElektriker kommt am Montag')
  })
})

describe('rewrite_note', () => {
  it('replaces the whole text and names the note by its earlier beginning', async () => {
    const store = fakeStore([{ note_id: 'n1', content: 'Handwerker\nElektriker Montag' }])
    const outcome = await executeNotesTool(store, 'rewrite_note', {
      note_id: 'n1',
      content: 'Handwerker\nElektriker Dienstag',
    })
    expect(contentOf(store, 'n1')).toBe('Handwerker\nElektriker Dienstag')
    expect(outcome.summary).toBe('✓ umgeschrieben: Handwerker')
    expect(outcome.changed).toEqual([{ id: 'n1', page: { area: 'notes' } }])
  })

  it('can be taken back: the note has its earlier text again', async () => {
    const store = fakeStore([{ note_id: 'n1', content: 'Handwerker\nElektriker Montag' }])
    const outcome = await executeNotesTool(store, 'rewrite_note', { note_id: 'n1', content: 'Neu' })
    expect(await outcome.undo!()).toBe(true)
    expect(contentOf(store, 'n1')).toBe('Handwerker\nElektriker Montag')
  })

  it('rejects empty text; a note is deleted with delete_note', async () => {
    const store = fakeStore([{ note_id: 'n1', content: 'Handwerker' }])
    const outcome = await executeNotesTool(store, 'rewrite_note', { note_id: 'n1', content: '' })
    expect(outcome.isError).toBe(true)
    expect(contentOf(store, 'n1')).toBe('Handwerker')
  })
})

describe('delete_note', () => {
  const notes = () => [
    { note_id: 'n1', content: 'Handwerker\nElektriker Montag', created_at: '2026-10-01T08:00:00Z' },
  ]

  it('deletes nothing itself but lays a card naming the note by its beginning', async () => {
    const store = fakeStore(notes())
    const outcome = await executeNotesTool(store, 'delete_note', { note_id: 'n1' })
    expect(outcome.deleteCard!.what).toBe('Notiz „Handwerker“')
    expect(store.notes).toHaveLength(1)
  })

  it('deletes once the card is confirmed, and tells Claude and the user', async () => {
    const store = fakeStore(notes())
    const done = await (
      await executeNotesTool(store, 'delete_note', { note_id: 'n1' })
    ).deleteCard!.confirm()
    expect(store.notes).toEqual([])
    expect(done.isError).toBeFalsy()
    expect(done.summary).toBe('✓ Notiz gelöscht: Handwerker')
    expect(done.changes).toHaveLength(1)
  })

  it('can be taken back: the note returns with its id, text and date', async () => {
    const store = fakeStore(notes())
    const done = await (
      await executeNotesTool(store, 'delete_note', { note_id: 'n1' })
    ).deleteCard!.confirm()
    expect(await done.changes![0]!.undo()).toBe(true)
    expect(store.notes).toEqual([expect.objectContaining(notes()[0])])
  })

  it('reports a delete the store refused as an error', async () => {
    const store = fakeStore(notes(), { fail: true })
    const done = await (
      await executeNotesTool(store, 'delete_note', { note_id: 'n1' })
    ).deleteCard!.confirm()
    expect(done.isError).toBe(true)
    expect(done.changes).toBeUndefined()
  })

  it('rejects an unknown id without a card', async () => {
    const outcome = await executeNotesTool(fakeStore(notes()), 'delete_note', { note_id: 'x' })
    expect(outcome.isError).toBe(true)
    expect(outcome.deleteCard).toBeUndefined()
  })
})
