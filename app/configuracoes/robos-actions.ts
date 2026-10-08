'use server'

import { revalidatePath } from 'next/cache'
import { requireAuthAction } from '@/lib/auth/require-user'
import { createClient } from '@/lib/supabase/server'

// Credenciais do Robô do TXT SulAmérica. Guardadas criptografadas no Supabase
// Vault pela função salvar_credencial_sulamerica; o app nunca lê as senhas de
// volta — só sabe se estão cadastradas e quando foram atualizadas.

const CAMPOS = {
  sulamerica_login: 'login',
  sulamerica_senha: 'senha',
  sulamerica_imap_usuario: 'email',
  sulamerica_imap_senha: 'senha_email',
} as const

type NomeCredencial = keyof typeof CAMPOS

export type StatusCredencial = { cadastrada: boolean; atualizadoEm: string | null; valor: string | null }

export type StatusRoboSulAmerica = {
  /** false quando as funções do cofre ainda não existem no banco. */
  disponivel: boolean
  credenciais: Record<NomeCredencial, StatusCredencial>
  ultimaBusca: { competencia: string; status: string; mensagem: string | null; quando: string } | null
}

const VAZIO: StatusCredencial = { cadastrada: false, atualizadoEm: null, valor: null }

export async function getStatusRoboSulAmerica(): Promise<StatusRoboSulAmerica> {
  const supabase = await createClient()
  const [{ data, error }, { data: coletas }] = await Promise.all([
    supabase.rpc('status_credenciais_sulamerica'),
    supabase
      .from('coletas_sulamerica')
      .select('competencia, status, mensagem, solicitado_em, concluido_em')
      .order('solicitado_em', { ascending: false })
      .limit(1),
  ])

  const credenciais = Object.fromEntries(
    (Object.keys(CAMPOS) as NomeCredencial[]).map((k) => [k, { ...VAZIO }]),
  ) as Record<NomeCredencial, StatusCredencial>
  for (const linha of (data ?? []) as { nome: NomeCredencial; atualizado_em: string; valor_visivel: string | null }[]) {
    if (linha.nome in credenciais) {
      credenciais[linha.nome] = { cadastrada: true, atualizadoEm: linha.atualizado_em, valor: linha.valor_visivel }
    }
  }

  const c = coletas?.[0]
  return {
    disponivel: !error,
    credenciais,
    ultimaBusca: c
      ? { competencia: c.competencia, status: c.status, mensagem: c.mensagem, quando: c.concluido_em ?? c.solicitado_em }
      : null,
  }
}

/**
 * Salva só os campos preenchidos: senha em branco = manter a atual. Assim dá
 * para trocar uma senha sem redigitar as outras.
 */
export async function salvarAcessoSulAmerica(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuthAction()
  if ('error' in auth) return { ok: false, error: auth.error }

  const valores = (Object.entries(CAMPOS) as [NomeCredencial, string][])
    .map(([nome, campo]) => [nome, String(formData.get(campo) ?? '')] as const)
    // E-mails sem espaços; senhas exatamente como digitadas.
    .map(([nome, v]) => [nome, nome.endsWith('senha') ? v : v.trim()] as const)
    .filter(([, v]) => v.length > 0)

  for (const [nome, v] of valores) {
    if ((nome === 'sulamerica_login' || nome === 'sulamerica_imap_usuario') && !/^\S+@\S+\.\S+$/.test(v)) {
      return { ok: false, error: 'Login e e-mail precisam ser endereços de e-mail válidos.' }
    }
  }
  if (valores.length === 0) return { ok: false, error: 'Nada para salvar.' }

  const supabase = await createClient()
  for (const [nome, v] of valores) {
    const { error } = await supabase.rpc('salvar_credencial_sulamerica', { p_nome: nome, p_valor: v })
    if (error) return { ok: false, error: `Falha ao salvar: ${error.message}` }
  }

  revalidatePath('/configuracoes')
  revalidatePath('/uploads')
  return { ok: true }
}
