export interface LettaAgent {
  id: string
  name: string
  created_at: string
  memory_blocks?: LettaBlock[]
}

export interface LettaPassage {
  id: string
  text: string
  tags?: string[]
  created_at: string
  updated_at?: string
}

export interface LettaBlock {
  id: string
  label: string
  value: string
  limit: number
}

export interface LettaArchivalSearchResult {
  id: string
  text: string
  score: number
  metadata?: Record<string, unknown>
}

export interface LettaArchivalSearchResponse {
  results: LettaArchivalSearchResult[]
  count: number
}

export interface LettaCreateAgentBody {
  name: string
}

export interface LettaCreatePassageBody {
  text: string
  tags?: string[]
}

export interface LettaUpdateBlockBody {
  value: string
}
