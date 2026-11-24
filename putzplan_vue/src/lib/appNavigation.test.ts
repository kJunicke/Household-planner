import { describe, expect, it } from 'vitest'

import { createGoToPage, listAreaOfTab, type AppPage } from './appNavigation'

/** Records where the app was sent instead of driving a real router. */
function fakeApp() {
  const visited: unknown[] = []
  const selected: [string, string][] = []
  let settingsOpen = false
  const goToPage = createGoToPage({
    push: (to) => visited.push(to),
    setSettingsOpen: (open) => (settingsOpen = open),
    selectList: (area, listId) => selected.push([area, listId]),
  })
  return { goToPage, visited, selected, settingsOpen: () => settingsOpen }
}

describe('going to a page of the app', () => {
  it.each<[AppPage, unknown]>([
    [{ area: 'wall' }, { name: 'home' }],
    [{ area: 'history' }, { name: 'history' }],
    [{ area: 'notes' }, { name: 'notes' }],
    [
      { area: 'kasse', tab: 'statistik' },
      { name: 'kasse', query: {} },
    ],
    [
      { area: 'kasse', tab: 'ausgleich' },
      { name: 'kasse', query: { tab: 'ausgleich' } },
    ],
    [
      { area: 'kasse', tab: 'toepfe' },
      { name: 'kasse', query: { tab: 'toepfe' } },
    ],
    [
      { area: 'pot', potId: 'p1' },
      { name: 'kasse', query: { tab: 'toepfe', topf: 'p1' } },
    ],
    [{ area: 'shopping' }, { name: 'listen', query: {} }],
    [{ area: 'packing' }, { name: 'listen', query: { tab: 'packlisten' } }],
    [{ area: 'todo' }, { name: 'listen', query: { tab: 'todo' } }],
  ])('%o opens %o', (page, route) => {
    const app = fakeApp()
    app.goToPage(page)
    expect(app.visited).toEqual([route])
  })

  it('opens a given list the way a tap on its chip does, then its tab', () => {
    const app = fakeApp()
    app.goToPage({ area: 'packing', listId: 'l2' })
    expect(app.selected).toEqual([['packing', 'l2']])
    expect(app.visited).toEqual([{ name: 'listen', query: { tab: 'packlisten' } }])
  })

  it('opens the settings, which are a side panel and not a page', () => {
    const app = fakeApp()
    app.goToPage({ area: 'settings' })
    expect(app.visited).toEqual([])
    expect(app.settingsOpen()).toBe(true)
  })

  it('closes the settings when it goes to any page, so they never cover it', () => {
    const app = fakeApp()
    app.goToPage({ area: 'settings' })
    app.goToPage({ area: 'wall' })
    expect(app.settingsOpen()).toBe(false)
    expect(app.visited).toEqual([{ name: 'home' }])
  })
})

describe('the Listen tab in the address', () => {
  it.each([
    [undefined, 'shopping'],
    ['packlisten', 'packing'],
    ['todo', 'todo'],
    ['quatsch', 'shopping'],
  ])('?tab=%s shows %s', (tab, area) => {
    expect(listAreaOfTab(tab)).toBe(area)
  })
})
