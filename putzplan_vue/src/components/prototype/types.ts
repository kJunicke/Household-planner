// WEGWERF-PROTOTYP — gemeinsame Datenform der Einkaufszettel-Varianten.

export interface PItem {
  id: string
  name: string
  qty: number
  purchased: boolean
  priority: boolean
  category: string | null
}

export interface PSection {
  key: string
  label: string
  category: string | null
  color: string
  isUncategorized: boolean
  items: PItem[]
}

export interface PList {
  id: string
  name: string
}
