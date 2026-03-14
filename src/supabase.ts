import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = url && key ? createClient(url, key) : null

// ─── Quizzes ─────────────────────────────────────────────────────────────────
function shortId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export async function saveQuizRemote(data: object): Promise<string> {
  const id = shortId()
  if (supabase) {
    await supabase.from('quizzes').insert({ id, data })
  }
  return id
}

export async function getQuizRemote(id: string): Promise<object | null> {
  if (!supabase) return null
  const { data } = await supabase.from('quizzes').select('data').eq('id', id).single()
  return data?.data ?? null
}

// ─── Rankings ─────────────────────────────────────────────────────────────────
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
