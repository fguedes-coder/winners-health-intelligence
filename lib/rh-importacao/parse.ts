// ===========================================================================
// Conferência RH — normalização e parsing (server-safe)
//
// Módulo puro (sem Supabase, sem client-only). Mapeia linhas de XLSX/CSV de
// RH para os campos usados no cruzamento com beneficiários existentes:
// CPF, Carteirinha, Matrícula e Nome. Tolerante a variações de cabeçalho.
// ===========================================================================

import { normalizarNome } from '@/lib/people-analytics/rh'

export type LinhaRh = {
  nome: string | null
  nomeNorm: string | null
  cpf: string | null
  carteirinha: string | null
  matricula: string | null
}

type CampoCanonico = 'nome' | 'cpf' | 'carteirinha' | 'matricula'

// Aliases de cabeçalho aceitos no upload (case/acentos-insensitive).
const HEADER_ALIASES: Record<CampoCanonico, string[]> = {
  nome: ['nome', 'colaborador', 'funcionario', 'funcionário', 'nome completo', 'nome do beneficiario', 'nome do beneficiário'],
  cpf: ['cpf', 'cpf beneficiario', 'cpf beneficiário', 'nr cpf'],
  carteirinha: [
    'carteirinha',
    'carteira',
    'cartao',
    'cartão',
    'codigo beneficiario',
    'código beneficiário',
    'cod beneficiario',
    'matricula ans',
    'nr carteira',
    'carteira de identificacao',
    'carteira de identificação',
  ],
  matricula: ['matricula', 'matrícula', 'matricula rh', 'registro', 'chapa'],
}

type LinhaRhBruta = Partial<Record<CampoCanonico, unknown>>

// Mapeia uma linha (chaves = cabeçalhos do arquivo) para os campos canônicos.
export function mapearLinhaRh(row: Record<string, unknown>): LinhaRhBruta {
  const chaveNorm = new Map<string, string>()
  for (const k of Object.keys(row)) chaveNorm.set(normalizarNome(k), k)

  const out: LinhaRhBruta = {}
  for (const campo of Object.keys(HEADER_ALIASES) as CampoCanonico[]) {
    for (const alias of HEADER_ALIASES[campo]) {
      const original = chaveNorm.get(normalizarNome(alias))
      if (original !== undefined) {
        out[campo] = row[original]
        break
      }
    }
  }
  return out
}

function texto(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s : null
}

// Mantém apenas dígitos (para CPF), preservando null.
function soDigitos(v: unknown): string | null {
  const s = texto(v)
  if (s == null) return null
  const d = s.replace(/\D/g, '')
  return d ? d : null
}

// Normaliza uma linha bruta em LinhaRh. Retorna null quando não há nenhum
// identificador útil (linha vazia/inaproveitável para o cruzamento).
export function normalizarLinhaRh(bruta: LinhaRhBruta): LinhaRh | null {
  const nome = texto(bruta.nome)
  const cpf = soDigitos(bruta.cpf)
  const carteirinha = texto(bruta.carteirinha)
  const matricula = texto(bruta.matricula)

  if (!nome && !cpf && !carteirinha && !matricula) return null

  return {
    nome,
    nomeNorm: nome ? normalizarNome(nome) : null,
    cpf,
    carteirinha,
    matricula,
  }
}
