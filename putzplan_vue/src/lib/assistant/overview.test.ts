import { describe, expect, it } from 'vitest'

import { buildOverview, type OverviewSources } from './overview'

const household = (patch: Partial<OverviewSources> = {}): OverviewSources => ({
  today: 'Dienstag, 24. November 2026',
  askingUserId: 'u1',
  members: [
    { user_id: 'u1', display_name: 'Kilian' },
    { user_id: 'u2', display_name: 'Anna' },
  ],
  shoppingLists: [{ list_id: 's1', name: 'Rewe' }],
  packingLists: [{ list_id: 'p1', name: 'Urlaub' }],
  todoLists: [{ list_id: 't1', name: 'Umzug' }],
  notes: [{ note_id: 'n1', content: 'WLAN-Passwort\nsteht auf dem Router' }],
  pots: [
    { pot_id: 'h1', name: 'Haushalt', kind: 'household', closed_at: null },
    { pot_id: 'e1', name: 'Rom', kind: 'event', closed_at: '2026-10-01T00:00:00Z' },
  ],
  ...patch,
})

describe('the overview Claude gets with each question', () => {
  it('names the date, who is asking and the other members with their ids', () => {
    const text = buildOverview(household())
    expect(text).toContain('Heute ist Dienstag, 24. November 2026.')
    expect(text).toContain('Es fragt: Kilian (id u1)')
    expect(text).toContain('- Anna (id u2)')
  })

  it('lists every list, note and pot by name and id, but not their contents', () => {
    const text = buildOverview(household())
    expect(text).toContain('Einkaufslisten:\n- Rewe (id s1)')
    expect(text).toContain('Packlisten:\n- Urlaub (id p1)')
    expect(text).toContain('To-do-Listen:\n- Umzug (id t1)')
    expect(text).toContain('Notizen:\n- WLAN-Passwort (id n1)')
    expect(text).not.toContain('Router')
    expect(text).toContain('- Haushalt (id h1, Haushaltstopf)')
    expect(text).toContain('- Rom (id e1, abgeschlossen)')
  })

  it('shortens a long first line of a note to a title', () => {
    const long = 'Rezept für den Linseneintopf von Oma mit Speck und viel Majoran'
    const text = buildOverview(household({ notes: [{ note_id: 'n2', content: long }] }))
    expect(text).toContain('- Rezept für den Linseneintopf von Oma mit… (id n2)')
  })

  it('says so when an area is empty, so Claude does not look for ids', () => {
    const text = buildOverview(household({ packingLists: [], notes: [] }))
    expect(text).toContain('Packlisten: keine')
    expect(text).toContain('Notizen: keine')
  })
})
