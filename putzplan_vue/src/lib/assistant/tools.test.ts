import { describe, expect, it } from 'vitest'

import type { ListToolStores } from './listTools'
import type { ShoppingToolStore } from './shoppingTools'
import type { NotesToolStore } from './notesTools'
import type { PotToolStores } from './potTools'
import type { TaskToolStores } from './taskTools'
import { assistantTools, undoFailedText } from './tools'

const registry = () =>
  assistantTools({
    shopping: { lists: [], items: [] } as unknown as ShoppingToolStore,
    lists: {} as ListToolStores,
    notes: { notes: [] } as unknown as NotesToolStore,
    tasks: {} as TaskToolStores,
    pots: {} as PotToolStores,
    goToPage: () => {},
    currentUserId: () => 'me',
  })

describe('the tool registry', () => {
  it('describes every tool for Claude as plain JSON: name, description, input schema', () => {
    const sent = JSON.parse(JSON.stringify(registry().definitions))
    expect(sent.map((t: { name: string }) => t.name)).toEqual([
      'read_shopping_list',
      'add_shopping_items',
      'update_shopping_items',
      'mark_shopping_items_purchased',
      'delete_shopping_items',
      'read_checklist',
      'add_checklist_entries',
      'update_checklist_entries',
      'check_checklist_entries',
      'reset_checklist',
      'delete_checklist_entries',
      'create_list',
      'copy_checklist',
      'rename_list',
      'set_list_note',
      'delete_checklist',
      'delete_shopping_list',
      'create_checklist_category',
      'rename_checklist_category',
      'delete_checklist_category',
      'read_note',
      'create_note',
      'append_to_note',
      'rewrite_note',
      'delete_note',
      'read_tasks',
      'read_task_history',
      'read_weekly_goal',
      'create_task',
      'update_task',
      'assign_task',
      'postpone_task',
      'mark_task_dirty',
      'delete_task',
      'complete_task',
      'log_quick_task',
      'create_pot',
      'close_pot',
      'reopen_pot',
      'delete_pot',
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

describe('a failed undo', () => {
  it('says what stays as it is, and that there is no connection when offline', () => {
    expect(undoFailedText('✓ Milch → Einkauf', false)).toBe(
      'Rückgängig ging nicht, keine Verbindung. Es bleibt: Milch → Einkauf',
    )
    expect(undoFailedText('✓ gelöscht: Zucker (Einkauf)', true)).toBe(
      'Rückgängig ging nicht. Es bleibt: gelöscht: Zucker (Einkauf)',
    )
  })
})
