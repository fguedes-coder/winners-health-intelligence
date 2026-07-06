'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type PerfilData = {
  nome: string
  cargo: string
  email: string
  telefone: string
  razaoSocial: string
  cnpj: string
  plano: string
  responsavel: string
  alertaSinistralidade: boolean
  renovacaoApolices: boolean
  processamentoUploads: boolean
}

export type ActionResult = {
  error?: string
  success?: string
  emailConfirmacao?: boolean
}

const META_DEFAULTS: Omit<PerfilData, 'email'> = {
  nome: '',
  cargo: '',
  telefone: '',
  razaoSocial: '',
  cnpj: '',
  plano: '',
  responsavel: '',
  alertaSinistralidade: true,
  renovacaoApolices: true,
  processamentoUploads: false,
}

/** Lê o usuário autenticado e devolve perfil normalizado a partir do metadata. */
export async function getPerfil(): Promise<PerfilData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const m = (user.user_metadata ?? {}) as Record<string, unknown>
  const str = (k: string, fallback = '') =>
    typeof m[k] === 'string' ? (m[k] as string) : fallback
  const bool = (k: string, fallback: boolean) =>
    typeof m[k] === 'boolean' ? (m[k] as boolean) : fallback

  return {
    nome: str('nome'),
    cargo: str('cargo'),
    email: user.email ?? '',
    telefone: str('telefone'),
    razaoSocial: str('razaoSocial'),
    cnpj: str('cnpj'),
    plano: str('plano'),
    responsavel: str('responsavel'),
    alertaSinistralidade: bool(
      'alertaSinistralidade',
      META_DEFAULTS.alertaSinistralidade,
    ),
    renovacaoApolices: bool('renovacaoApolices', META_DEFAULTS.renovacaoApolices),
    processamentoUploads: bool(
      'processamentoUploads',
      META_DEFAULTS.processamentoUploads,
    ),
  }
}

function parsePerfil(formData: FormData): PerfilData {
  const s = (k: string) => String(formData.get(k) ?? '').trim()
  return {
    nome: s('nome'),
    cargo: s('cargo'),
    email: s('email'),
    telefone: s('telefone'),
    razaoSocial: s('razaoSocial'),
    cnpj: s('cnpj'),
    plano: s('plano'),
    responsavel: s('responsavel'),
    alertaSinistralidade: formData.get('alertaSinistralidade') === 'on',
    renovacaoApolices: formData.get('renovacaoApolices') === 'on',
    processamentoUploads: formData.get('processamentoUploads') === 'on',
  }
}

export async function salvarPerfil(formData: FormData): Promise<ActionResult> {
  const data = parsePerfil(formData)

  if (!data.nome) return { error: 'O nome completo é obrigatório.' }
  if (!data.email) return { error: 'O e-mail é obrigatório.' }
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
  if (!emailValido) return { error: 'Informe um e-mail válido.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão expirada. Faça login novamente.' }

  const metadata = {
    nome: data.nome,
    cargo: data.cargo,
    telefone: data.telefone,
    razaoSocial: data.razaoSocial,
    cnpj: data.cnpj,
    plano: data.plano,
    responsavel: data.responsavel,
    alertaSinistralidade: data.alertaSinistralidade,
    renovacaoApolices: data.renovacaoApolices,
    processamentoUploads: data.processamentoUploads,
  }

  // Só envia o e-mail ao Auth quando realmente mudou — trocar e-mail dispara
  // fluxo de confirmação e não deve acontecer a cada salvamento.
  const emailMudou =
    data.email.toLowerCase() !== (user.email ?? '').toLowerCase()

  const { error } = await supabase.auth.updateUser(
    emailMudou
      ? { email: data.email, data: metadata }
      : { data: metadata },
  )

  if (error) {
    return { error: `Não foi possível salvar: ${error.message}` }
  }

  revalidatePath('/configuracoes')
  revalidatePath('/', 'layout')

  return {
    success: 'Dados atualizados com sucesso.',
    emailConfirmacao: emailMudou,
  }
}

export async function alterarSenha(formData: FormData): Promise<ActionResult> {
  const novaSenha = String(formData.get('novaSenha') ?? '')
  const confirmarSenha = String(formData.get('confirmarSenha') ?? '')

  if (novaSenha.length < 8) {
    return { error: 'A nova senha deve ter ao menos 8 caracteres.' }
  }
  if (novaSenha !== confirmarSenha) {
    return { error: 'As senhas não coincidem.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão expirada. Faça login novamente.' }

  const { error } = await supabase.auth.updateUser({ password: novaSenha })
  if (error) {
    return { error: `Não foi possível alterar a senha: ${error.message}` }
  }

  return { success: 'Senha alterada com sucesso.' }
}
