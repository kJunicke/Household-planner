import { describe, expect, it } from 'vitest'

import type { ListToolStores } from './listTools'
import type { ShoppingToolStore } from './shoppingTools'
import { assistantTools } from './tools'

const registry = () =>
  assistantTools({
    shopping: { lists: [], items: [] } as unknown as ShoppingToolStore,
    lists: {} as ListToolStores,
    goToPage: () => {},
  })

describe('the tool registry', () => {
  it('describes every tool for Claude as plain JSON: name, description, input schema', () => {
    const sent = JSON.parse(JSON.stringify(registry().definitions))
    expect(sent.map((t: { name: string }) => t.name)).toEqual([
      'read_shopping_list',
      'add_shopping_items',
      'mark_shopping_items_purchased',
      'delete_shopping_items',
      'read_checklist',
      'add_checklist_entries',
      'update_checklist_entries',
      'check_checklist_entries',
      'delete_checklist_entries',
      'create_list',
      'rename_list',
      'set_list_note',
      'delete_checklist',
      'create_checklist_category',
      'rename_checklist_category',
      'delete_checklist_category',
      'go_to_page',
      'get_app_guide',
    ])
    for (const tool of sent) {
      expect(Object.keys(tool).sort()).toEqual(['description', 'input_schema', 'name'])
      expect(tool.description).not.toBe('')
      expect(tool.input_schema.type).toBe('object')
    }
  })

  it('the check-off tool no longer offers itself for clearing a list', () => {
    const markTool = registry().definitions.find((t) => t.name === 'mark_shopping_items_purchased')
    expect(markTool!.description).not.toMatch(/leeren/i)
  })

  it('has no tool for an Ausgleich', () => {
    for (const { name, description } of registry().definitions) {
      expect(`${name} ${description}`).not.toMatch(/settle|ausgleich/i)
    }
  })

  it('rejects a tool it does not know', async () => {
    const outcome = await registry().execute('settle_debts', {})
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toContain('settle_debts')
  })
})
