export type SettlementMethod = 'activity' | 'money' | 'surprise' | 'other'

export interface Settlement {
  settlement_id: string
  household_id: string
  from_user_id: string
  to_user_id: string
  points_settled: number
  method: SettlementMethod
  description: string | null
  settled_at: string
  created_by: string | null
  created_at: string
}
