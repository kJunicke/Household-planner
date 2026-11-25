import { describe, expect, it } from 'vitest'

import { withoutMarkdown } from './plainText'

describe('an answer shown in the chat', () => {
  it('loses bold markers and headings, keeping their words', () => {
    expect(withoutMarkdown('Im **QC-Test Urlaub** schuldet __Anna__ 5 €')).toBe(
      'Im QC-Test Urlaub schuldet Anna 5 €',
    )
    expect(withoutMarkdown('## Salden\n- Kilian hat 5 € gut')).toBe('Salden\n- Kilian hat 5 € gut')
  })

  it('keeps a lone star and plain text as they are', () => {
    expect(withoutMarkdown('2 * 3 Brötchen, Note *gut')).toBe('2 * 3 Brötchen, Note *gut')
    expect(withoutMarkdown('Milch → Einkauf')).toBe('Milch → Einkauf')
  })
})
