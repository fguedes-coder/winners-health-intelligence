'use server'

import { revalidatePath } from 'next/cache'
import { requireAuthAction } from '@/lib/auth/require-user'
import { createClient } from '@/lib/supabase/server'

// Bucket público do logo do cliente. Antes isto vivia no @vercel/blob, que só
// existe dentro da Vercel; com o app no VPS o armazenamento passa a ser o
// próprio Supabase, o mesmo que já guarda os arquivos de importação.
const BUCKET_LOGOS = 'logos-clientes'

/**
 * Extrai o caminho dentro do bucket a partir da URL pública do Storage.
 * Devolve null para URL de outra origem — logos antigos ficaram no Vercel
 * Blob e não podem ser apagados por aqui; somem quando o blob store for
 * desativado.
 */
function caminhoNoBucket(url: string | null): string | null {
  if (!url) return null
  const marca = `/storage/v1/object/public/${BUCKET_LOGOS}/`
  const i = url.indexOf(marca)
  return i === -1 ? null : decodeURIComponent(url.slice(i + marca.length))
}

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
    const anterior = caminhoNoBucket(atual?.logo_cliente_url ?? null)
    if (anterior) {
      await supabase.storage.from(BUCKET_LOGOS).remove([anterior])
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const caminho = `logo-cliente-${Date.now()}-${safeName}`
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_LOGOS)
      .upload(caminho, file, {
        contentType: file.type || 'image/png',
        upsert: false,
      })
    if (uploadError) return { ok: false, error: uploadError.message }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET_LOGOS).getPublicUrl(caminho)

    const { error } = await supabase
      .from('relatorio_config')
      .update({ logo_cliente_url: publicUrl, atualizado_em: new Date().toISOString() })
      .eq('id', 1)
    if (error) return { ok: false, error: error.message }

    revalidatePath('/relatorios')
    return { ok: true, url: publicUrl }
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
  const caminho = caminhoNoBucket(atual?.logo_cliente_url ?? null)
  if (caminho) {
    await supabase.storage.from(BUCKET_LOGOS).remove([caminho])
  }
  const { error } = await supabase
    .from('relatorio_config')
    .update({ logo_cliente_url: null, atualizado_em: new Date().toISOString() })
    .eq('id', 1)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/relatorios')
  return { ok: true }
}
