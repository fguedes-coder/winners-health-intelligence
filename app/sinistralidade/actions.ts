'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type FaturaRegistro = {
  id: string
  competencia: string // YYYY-MM
  cliente_id: string | null
  cliente_nome: string | null
  apolice_id: string | null
  apolice_nome: string | null
  valor: number | null
  vidas_ativas: number | null
  created_at: string
  updated_at: string
}

export async function getFaturas(): Promise<FaturaRegistro[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('faturas')
    .select(
      'id, competencia, cliente_id, cliente_nome, apolice_id, apolice_nome, valor, vidas_ativas, created_at, updated_at',
    )
    .order('competencia', { ascending: false })
  if (error || !data) return []
  return data as FaturaRegistro[]
}

type FaturaInput = {
  competencia: string
  valor: number | null
  vidas: number | null
  apolice_id: string | null
  apolice_nome: string | null
  cliente_id: string | null
  cliente_nome: string | null
}

function parse(formData: FormData): FaturaInput {
  const valorRaw = String(formData.get('valor') ?? '').trim()
  const vidasRaw = String(formData.get('vidas') ?? '').trim()
  return {
    competencia: String(formData.get('competencia') ?? '').trim(),
    valor: valorRaw === '' ? null : Number(valorRaw.replace(',', '.')),
    vidas: vidasRaw === '' ? null : Number.parseInt(vidasRaw, 10),
    apolice_id: String(formData.get('apolice_id') ?? '').trim() || null,
    apolice_nome: String(formData.get('apolice_nome') ?? '').trim() || null,
    cliente_id: String(formData.get('cliente_id') ?? '').trim() || null,
    cliente_nome: String(formData.get('cliente_nome') ?? '').trim() || null,
  }
}

// Cria ou atualiza o lançamento da competência (fatura + total de vidas).
export async function upsertFatura(formData: FormData) {
  const d = parse(formData)
  if (!/^\d{4}-\d{2}$/.test(d.competencia)) {
    return { error: 'Informe uma competência válida (mês/ano).' }
  }
  if (d.valor === null && d.vidas === null) {
    return { error: 'Informe ao menos o valor da fatura ou o total de vidas.' }
  }
  if (d.valor !== null && (!Number.isFinite(d.valor) || d.valor < 0)) {
    return { error: 'Valor da fatura inválido.' }
  }
  if (d.vidas !== null && (!Number.isFinite(d.vidas) || d.vidas < 0)) {
    return { error: 'Total de vidas inválido.' }
  }

  const supabase = await createClient()

  // Procura lançamento existente da mesma competência/apólice
  let existing = supabase
    .from('faturas')
    .select('id')
    .eq('competencia', d.competencia)
  existing = d.apolice_id
    ? existing.eq('apolice_id', d.apolice_id)
    : existing.is('apolice_id', null)
  const { data: found } = await existing.maybeSingle()

  const payload = {
    competencia: d.competencia,
    valor: d.valor,
    vidas_ativas: d.vidas,
    apolice_id: d.apolice_id,
    apolice_nome: d.apolice_nome,
    cliente_id: d.cliente_id,
    cliente_nome: d.cliente_nome,
    updated_at: new Date().toISOString(),
  }

  if (found?.id) {
    const { error } = await supabase
      .from('faturas')
      .update(payload)
      .eq('id', found.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('faturas').insert(payload)
    if (error) return { error: error.message }
  }

  revalidatePath('/sinistralidade')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteFatura(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('faturas').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/sinistralidade')
  revalidatePath('/dashboard')
  return { success: true }
}
