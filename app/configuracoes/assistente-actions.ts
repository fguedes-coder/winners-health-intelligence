'use server'

import { revalidatePath } from 'next/cache'
import { requireAuthAction } from '@/lib/auth/require-user'
import { createClient } from '@/lib/supabase/server'

/** Guarda a chave da API do Claude no cofre (criptografada). */
export async function salvarChaveAssistente(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuthAction()
  if ('error' in auth) return { ok: false, error: auth.error }

  const chave = String(formData.get('chave') ?? '').trim()
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(chave)) {
    return { ok: false, error: 'A chave do Claude começa com "sk-ant-". Confira se copiou inteira.' }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('salvar_chave_assistente', { p_valor: chave })
  if (error) return { ok: false, error: `Falha ao salvar: ${error.message}` }

  revalidatePath('/configuracoes')
  revalidatePath('/converse')
  return { ok: true }
}
