import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = url && key ? createClient(url, key) : null

export interface RankingRow {
  id?: string
  quiz_id: string
  player_name: string
  score: number
  total: number
  created_at?: string
}

export async function saveScoreRemote(entry: Omit<RankingRow, 'id' | 'created_at'>) {
  if (!supabase) return
  await supabase.from('rankings').insert(entry)
}

export async function getScoresRemote(quizId: string): Promise<RankingRow[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('rankings')
    .select('*')
    .eq('quiz_id', quizId)
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
  return data ?? []
}
