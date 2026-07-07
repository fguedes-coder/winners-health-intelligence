'use server'

import { put, del } from '@vercel/blob'
import { revalidatePath } from 'next/cache'
import { requireAuthAction } from '@/lib/auth/require-user'
import { createClient } from '@/lib/supabase/server'

export type RelatorioConfig = {
  clienteNome: string | null
  logoClienteUrl: string | null
}

export async function getRelatorioConfig(): Promise<RelatorioConfig> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('relatorio_config')
    .select('cliente_nome, logo_cliente_url')
    .eq('id', 1)
    .maybeSingle()
  return {
    clienteNome: data?.cliente_nome ?? null,
    logoClienteUrl: data?.logo_cliente_url ?? null,
  }
}

export async function salvarNomeCliente(
  nome: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuthAction()
  if ('error' in auth) return { ok: false, error: auth.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from('relatorio_config')
    .update({ cliente_nome: nome.trim() || null, atualizado_em: new Date().toISOString() })
    .eq('id', 1)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/relatorios')
  return { ok: true }
}

export async function uploadLogoCliente(
  formData: FormData,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const auth = await requireAuthAction()
  if ('error' in auth) return { ok: false, error: auth.error }

  const file = formData.get('logo')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Selecione um arquivo de imagem.' }
  }
  if (!file.type.startsWith('image/')) {
    return { ok: false, error: 'O arquivo precisa ser uma imagem (PNG, JPG ou SVG).' }
  }
  if (file.size > 4 * 1024 * 1024) {
    return { ok: false, error: 'A imagem deve ter no máximo 4 MB.' }
  }

  try {
    const supabase = await createClient()

    // Remove o logo anterior, se houver, para não acumular arquivos órfãos.
    const { data: atual } = await supabase
      .from('relatorio_config')
      .select('logo_cliente_url')
      .eq('id', 1)
      .maybeSingle()
    if (atual?.logo_cliente_url) {
      await del(atual.logo_cliente_url).catch(() => {})
    }

    const blob = await put(`relatorios/logo-cliente-${Date.now()}-${file.name}`, file, {
      access: 'public',
    })

    const { error } = await supabase
      .from('relatorio_config')
      .update({ logo_cliente_url: blob.url, atualizado_em: new Date().toISOString() })
      .eq('id', 1)
    if (error) return { ok: false, error: error.message }

    revalidatePath('/relatorios')
    return { ok: true, url: blob.url }
  } catch (err) {
    console.error('[v0] Erro no upload do logo:', err)
    return { ok: false, error: 'Falha ao enviar a imagem. Tente novamente.' }
  }
}

export async function removerLogoCliente(): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuthAction()
  if ('error' in auth) return { ok: false, error: auth.error }

  const supabase = await createClient()
  const { data: atual } = await supabase
    .from('relatorio_config')
    .select('logo_cliente_url')
    .eq('id', 1)
    .maybeSingle()
  if (atual?.logo_cliente_url) {
    await del(atual.logo_cliente_url).catch(() => {})
  }
  const { error } = await supabase
    .from('relatorio_config')
    .update({ logo_cliente_url: null, atualizado_em: new Date().toISOString() })
    .eq('id', 1)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/relatorios')
  return { ok: true }
}
