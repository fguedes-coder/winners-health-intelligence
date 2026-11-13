import 'server-only'

import { createClient } from '@/lib/supabase/server'

// Chave da API do Claude: variável de ambiente (se houver) ou o cofre do
// banco, cadastrada em Configurações → Inteligência artificial
// (supabase/assistente.sql).

export async function obterChaveAssistente(): Promise<string | null> {
  const env = process.env.ANTHROPIC_API_KEY?.trim()
  if (env) return env
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('chave_assistente')
  if (error || typeof data !== 'string' || !data.trim()) return null
  return data.trim()
}

export type StatusChaveAssistente = {
  /** false quando as funções do cofre ainda não existem no banco. */
  disponivel: boolean
  origem: 'ambiente' | 'cofre' | null
  atualizadoEm: string | null
  final: string | null
}

export async function getStatusChaveAssistente(): Promise<StatusChaveAssistente> {
  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    return { disponivel: true, origem: 'ambiente', atualizadoEm: null, final: process.env.ANTHROPIC_API_KEY.trim().slice(-4) }
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('status_chave_assistente')
  if (error) return { disponivel: false, origem: null, atualizadoEm: null, final: null }
  const l = (data as { atualizado_em: string; final: string }[] | null)?.[0]
  return l
    ? { disponivel: true, origem: 'cofre', atualizadoEm: l.atualizado_em, final: l.final }
    : { disponivel: true, origem: null, atualizadoEm: null, final: null }
}
