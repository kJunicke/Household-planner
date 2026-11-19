import { describe, expect, it } from 'vitest'

import type { PointBenchmark } from '@/types/PointBenchmark'

import { parseBenchmarkPoints, parseExamples } from './pointBenchmarks'

const benchmark = (points: number, overrides: Partial<PointBenchmark> = {}): PointBenchmark => ({
  benchmark_id: `b${points}`,
  household_id: 'h1',
  points,
  is_quick_option: true,
  examples: [],
  created_at: '2026-11-19T00:00:00Z',
  ...overrides,
})

const existing = [benchmark(1), benchmark(5), benchmark(12, { is_quick_option: false })]

describe('parseBenchmarkPoints', () => {
  it('nimmt eine freie Punktzahl an', () => {
    expect(parseBenchmarkPoints(existing, ' 7 ')).toEqual({ points: 7 })
  })

  it('weist eine Punktzahl ab, die es schon gibt — auch ohne Schnelloption', () => {
    expect(parseBenchmarkPoints(existing, '12')).toEqual({
      error: 'Einen Richtwert für 12 Punkte gibt es schon',
    })
  })

  it('verlangt eine ganze Zahl von 1 bis 999', () => {
    expect(parseBenchmarkPoints(existing, '')).toEqual({ error: 'Bitte eine Punktzahl eintragen' })
    expect(parseBenchmarkPoints(existing, '0')).toEqual({ error: 'Nur ganze Zahlen von 1 bis 999' })
    expect(parseBenchmarkPoints(existing, '1000')).toEqual({
      error: 'Nur ganze Zahlen von 1 bis 999',
    })
    expect(parseBenchmarkPoints(existing, '2,5')).toEqual({
      error: 'Nur ganze Zahlen von 1 bis 999',
    })
  })
})

describe('parseExamples', () => {
  it('macht aus jeder nicht leeren Zeile ein Beispiel, ohne Rand-Leerraum', () => {
    expect(parseExamples('  Bad putzen \n\n   \nSpülmaschine ausräumen\r\n')).toEqual({
      examples: ['Bad putzen', 'Spülmaschine ausräumen'],
    })
  })

  it('leerer Text heißt: keine Beispiele', () => {
    expect(parseExamples('')).toEqual({ examples: [] })
  })

  it('weist mehr als 50 Beispiele ab', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => `Aufgabe ${i}`)
    expect(parseExamples(fifty.join('\n'))).toEqual({ examples: fifty })
    expect(parseExamples([...fifty, 'eine zu viel'].join('\n'))).toEqual({
      error: 'Höchstens 50 Beispiele',
    })
  })

  it('weist mehr als 5000 Zeichen zusammen ab', () => {
    const long = 'x'.repeat(2500)
    expect(parseExamples(`${long}\n${long}`)).toEqual({ examples: [long, long] })
    expect(parseExamples(`${long}\n${long}y`)).toEqual({
      error: 'Höchstens 5000 Zeichen in allen Beispielen zusammen',
    })
  })
})
