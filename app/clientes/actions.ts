'use server'

import { revalidatePath } from 'next/cache'
import { requireAuthAction } from '@/lib/auth/require-user'
import { createClient } from '@/lib/supabase/server'

export type Cliente = {
  id: string
  nome: string
  cnpj: string | null
  operadora: string | null
  vidas: number
  valor_fatura: number
  created_at: string
}

export type ClienteInput = {
  nome: string
  cnpj: string
  operadora: string
  vidas: number
  valor_fatura: number
}

type ActionResult = { error?: string }

function parseForm(formData: FormData): ClienteInput {
  return {
    nome: String(formData.get('nome') ?? '').trim(),
    cnpj: String(formData.get('cnpj') ?? '').trim(),
    operadora: String(formData.get('operadora') ?? '').trim(),
    vidas: Number(formData.get('vidas') ?? 0),
    valor_fatura: Number(formData.get('valor_fatura') ?? 0),
  }
}

export async function createCliente(formData: FormData): Promise<ActionResult> {
  const auth = await requireAuthAction()
  if ('error' in auth) return { error: auth.error }

  const data = parseForm(formData)
  if (!data.nome) return { error: 'O nome é obrigatório.' }

  const supabase = await createClient()
  const { error } = await supabase.from('clientes').insert({
    nome: data.nome,
    cnpj: data.cnpj || null,
    operadora: data.operadora || null,
    vidas: Number.isFinite(data.vidas) ? data.vidas : 0,
    valor_fatura: Number.isFinite(data.valor_fatura) ? data.valor_fatura : 0,
  })

  if (error) return { error: error.message }
  revalidatePath('/clientes')
  return {}
}

export async function updateCliente(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAuthAction()
  if ('error' in auth) return { error: auth.error }

  const data = parseForm(formData)
  if (!data.nome) return { error: 'O nome é obrigatório.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('clientes')
    .update({
      nome: data.nome,
      cnpj: data.cnpj || null,
      operadora: data.operadora || null,
      vidas: Number.isFinite(data.vidas) ? data.vidas : 0,
      valor_fatura: Number.isFinite(data.valor_fatura) ? data.valor_fatura : 0,
    })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/clientes')
  return {}
}

export async function deleteCliente(id: string): Promise<ActionResult> {
  const auth = await requireAuthAction()
  if ('error' in auth) return { error: auth.error }

  const supabase = await createClient()
  const { error } = await supabase.from('clientes').delete().eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/clientes')
  return {}
}
