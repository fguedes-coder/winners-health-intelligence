'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type Apolice = {
  id: string
  numero: string | null
  cliente: string
  cliente_id: string | null
  operadora: string | null
  inicio: string | null
  fim: string | null
  vidas: number
  premio: number
  status: string
  created_at: string
}

export type ApoliceInput = {
  numero: string
  cliente: string
  cliente_id: string
  operadora: string
  inicio: string
  fim: string
  vidas: number
  premio: number
  status: string
}

function parseForm(formData: FormData): ApoliceInput {
  return {
    numero: String(formData.get('numero') ?? '').trim(),
    cliente: String(formData.get('cliente') ?? '').trim(),
    cliente_id: String(formData.get('cliente_id') ?? '').trim(),
    operadora: String(formData.get('operadora') ?? '').trim(),
    inicio: String(formData.get('inicio') ?? '').trim(),
    fim: String(formData.get('fim') ?? '').trim(),
    vidas: Number(formData.get('vidas') ?? 0),
    premio: Number(formData.get('premio') ?? 0),
    status: String(formData.get('status') ?? 'Vigente').trim() || 'Vigente',
  }
}

export async function createApolice(formData: FormData) {
  const data = parseForm(formData)
  if (!data.cliente) {
    return { error: 'O nome do cliente é obrigatório.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('apolices').insert({
    numero: data.numero || null,
    cliente: data.cliente,
    cliente_id: data.cliente_id || null,
    operadora: data.operadora || null,
    inicio: data.inicio || null,
    fim: data.fim || null,
    vidas: Number.isFinite(data.vidas) ? data.vidas : 0,
    premio: Number.isFinite(data.premio) ? data.premio : 0,
    status: data.status,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/apolices')
  return { success: true }
}

export async function updateApolice(id: string, formData: FormData) {
  const data = parseForm(formData)
  if (!data.cliente) {
    return { error: 'O nome do cliente é obrigatório.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('apolices')
    .update({
      numero: data.numero || null,
      cliente: data.cliente,
      cliente_id: data.cliente_id || null,
      operadora: data.operadora || null,
      inicio: data.inicio || null,
      fim: data.fim || null,
      vidas: Number.isFinite(data.vidas) ? data.vidas : 0,
      premio: Number.isFinite(data.premio) ? data.premio : 0,
      status: data.status,
    })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/apolices')
  return { success: true }
}

export async function deleteApolice(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('apolices').delete().eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/apolices')
  return { success: true }
}
