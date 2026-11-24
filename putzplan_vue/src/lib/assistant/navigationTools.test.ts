import { describe, expect, it } from 'vitest'

import type { AppPage } from '@/lib/appNavigation'
import type { ShoppingToolStore } from './shoppingTools'
import { assistantTools } from './tools'

function registry() {
  const visited: AppPage[] = []
  const tools = assistantTools({
    shopping: { lists: [], items: [] } as unknown as ShoppingToolStore,
    goToPage: (page) => visited.push(page),
  })
  return { tools, visited }
}

describe('go_to_page', () => {
  it.each<[Record<string, unknown>, AppPage, string]>([
    [{ page: 'putzen' }, { area: 'wall' }, 'Putzen'],
    [{ page: 'kasse_ausgleich' }, { area: 'kasse', tab: 'ausgleich' }, 'Kasse · Ausgleich'],
    [{ page: 'topf', id: 'p1' }, { area: 'pot', potId: 'p1' }, 'Kasse · Topf'],
    [{ page: 'einkauf', id: 'l1' }, { area: 'shopping', listId: 'l1' }, 'Listen · Einkauf'],
    [{ page: 'packlisten' }, { area: 'packing' }, 'Listen · Packlisten'],
    [{ page: 'einstellungen' }, { area: 'settings' }, 'Einstellungen'],
  ])('%o brings the app to the page and tells the user where', async (input, page, label) => {
    const { tools, visited } = registry()
    const outcome = await tools.execute('go_to_page', input)
    expect(visited).toEqual([page])
    expect(outcome.isError).toBeFalsy()
    expect(outcome.summary).toBe(`→ ${label}`)
    expect(outcome.undo).toBeUndefined()
  })

  it('offers every page of the app to Claude', () => {
    const tool = registry().tools.definitions.find((t) => t.name === 'go_to_page')!
    const pages = (tool.input_schema.properties as { page: { enum: string[] } }).page.enum
    expect(pages).toEqual([
      'putzen',
      'verlauf',
      'kasse_statistik',
      'kasse_ausgleich',
      'toepfe',
      'topf',
      'einkauf',
      'packlisten',
      'todo',
      'notizen',
      'einstellungen',
    ])
  })

  it('needs the id of the pot to open one', async () => {
    const { tools, visited } = registry()
    const outcome = await tools.execute('go_to_page', { page: 'topf' })
    expect(outcome.isError).toBe(true)
    expect(visited).toEqual([])
  })

  it('rejects a page the app does not have', async () => {
    const { tools, visited } = registry()
    const outcome = await tools.execute('go_to_page', { page: 'rangliste' })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toContain('rangliste')
    expect(visited).toEqual([])
  })
})

describe('get_app_guide', () => {
  it('hands Claude the guide to the app, and changes nothing', async () => {
    const { tools, visited } = registry()
    const outcome = await tools.execute('get_app_guide', {})
    expect(outcome.result).toMatch(/Wochenziel/)
    expect(outcome.result).toMatch(/Einstellungen/)
    expect(outcome.summary).toBeUndefined()
    expect(visited).toEqual([])
  })
})
