// ===========================================================================
// Privacidade / LGPD — anonimização de beneficiários e perfis de acesso
//
// Módulo server-safe (sem client-only nem Supabase). Centraliza:
//  1. O modo de privacidade do relatório (nominal | anonimizado).
//  2. O anonimizador determinístico (carteirinha -> RISCO-001, RISCO-002, ...).
//  3. A estrutura de perfis de acesso (RH, Financeiro, Diretoria, Médico,
//     Gestor de Saúde) — preparação para permissões futuras baseadas em perfil.
// ===========================================================================

export type ModoPrivacidade = 'nominal' | 'anonimizado'

export const MODO_PRIVACIDADE_PADRAO: ModoPrivacidade = 'nominal'

// Normaliza/valida um valor arbitrário para um modo de privacidade válido.
export function normalizarModoPrivacidade(valor: unknown): ModoPrivacidade {
  return valor === 'anonimizado' ? 'anonimizado' : 'nominal'
}

// Prefixo dos identificadores anônimos.
export const PREFIXO_ANON = 'RISCO'

// Formata o número sequencial no padrão RISCO-001, RISCO-002, ...
export function formatarIdAnon(n: number): string {
  return `${PREFIXO_ANON}-${String(n).padStart(3, '0')}`
}

// A carteirinha pode vir como "123456/00" (carteirinha/dígito). Para manter o
// mesmo identificador anônimo entre seções, normalizamos pela carteirinha base.
export function normalizarChaveAnon(carteirinha: string): string {
  return (carteirinha ?? '').split('/')[0].trim()
}

// ---------------------------------------------------------------------------
// Anonimizador determinístico e com estado.
// A ordem de atribuição é a ordem em que as carteirinhas são registradas —
// registre primeiro pela ordem desejada (ex.: maior risco) para que RISCO-001
// corresponda ao beneficiário prioritário.
// ---------------------------------------------------------------------------
export type Anonimizador = {
  /** Retorna (criando se necessário) o identificador anônimo da carteirinha. */
  rotular: (carteirinha: string) => string
  /** Quantidade de beneficiários já rotulados. */
  readonly tamanho: number
  /** Mapa serializável carteirinha-base -> identificador anônimo. */
  paraRecord: () => Record<string, string>
}

export function criarAnonimizador(): Anonimizador {
  const mapa = new Map<string, string>()
  return {
    rotular(carteirinha: string): string {
      const chave = normalizarChaveAnon(carteirinha)
      const existente = mapa.get(chave)
      if (existente) return existente
      const id = formatarIdAnon(mapa.size + 1)
      mapa.set(chave, id)
      return id
    },
    get tamanho() {
      return mapa.size
    },
    paraRecord() {
      return Object.fromEntries(mapa)
    },
  }
}

// ---------------------------------------------------------------------------
// Perfis de acesso — estrutura para permissões futuras.
// Ainda não aplica controle de acesso em runtime; define o modelo de dados que
// governará o que cada perfil pode visualizar (dados nominais, financeiros e
// clínicos) e o modo de privacidade sugerido por padrão para cada um.
// ---------------------------------------------------------------------------
export type PerfilUsuario =
  | 'rh'
  | 'financeiro'
  | 'diretoria'
  | 'medico'
  | 'gestor_saude'

export type PermissoesPerfil = {
  perfil: PerfilUsuario
  label: string
  descricao: string
  /** Pode visualizar nomes de beneficiários (dado pessoal). */
  podeVerNomes: boolean
  /** Pode visualizar valores e custos assistenciais. */
  podeVerFinanceiro: boolean
  /** Pode visualizar dados clínicos (fatores de saúde, saúde mental). */
  podeVerClinico: boolean
  /** Modo de privacidade sugerido ao gerar relatórios para este perfil. */
  modoSugerido: ModoPrivacidade
}

export const PERFIS_ORDEM: PerfilUsuario[] = [
  'rh',
  'financeiro',
  'diretoria',
  'medico',
  'gestor_saude',
]

export const PERFIS: Record<PerfilUsuario, PermissoesPerfil> = {
  rh: {
    perfil: 'rh',
    label: 'RH',
    descricao: 'Gestão de pessoas e benefícios.',
    podeVerNomes: true,
    podeVerFinanceiro: true,
    podeVerClinico: false,
    modoSugerido: 'nominal',
  },
  financeiro: {
    perfil: 'financeiro',
    label: 'Financeiro',
    descricao: 'Controle de custos e sinistralidade.',
    podeVerNomes: false,
    podeVerFinanceiro: true,
    podeVerClinico: false,
    modoSugerido: 'anonimizado',
  },
  diretoria: {
    perfil: 'diretoria',
    label: 'Diretoria',
    descricao: 'Visão executiva e estratégica.',
    podeVerNomes: false,
    podeVerFinanceiro: true,
    podeVerClinico: false,
    modoSugerido: 'anonimizado',
  },
  medico: {
    perfil: 'medico',
    label: 'Médico',
    descricao: 'Avaliação clínica e assistencial.',
    podeVerNomes: true,
    podeVerFinanceiro: false,
    podeVerClinico: true,
    modoSugerido: 'nominal',
  },
  gestor_saude: {
    perfil: 'gestor_saude',
    label: 'Gestor de Saúde',
    descricao: 'Gestão de saúde populacional e programas preventivos.',
    podeVerNomes: true,
    podeVerFinanceiro: true,
    podeVerClinico: true,
    modoSugerido: 'nominal',
  },
}

// Texto padrão do aviso de conformidade LGPD para o relatório anonimizado.
export const AVISO_LGPD =
  'Este relatório foi gerado no modo anonimizado, em conformidade com a Lei Geral ' +
  'de Proteção de Dados (Lei nº 13.709/2018 — LGPD). Os nomes dos beneficiários ' +
  'foram substituídos por identificadores automáticos (RISCO-001, RISCO-002, ...), ' +
  'preservando todos os indicadores, scores de risco, impactos financeiros, ' +
  'rankings e recomendações. Nenhum dado pessoal direto que permita a ' +
  'identificação do titular é exibido neste documento.'
