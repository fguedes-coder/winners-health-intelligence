// ===========================================================================
// Cadastro Mestre de Beneficiários — normalização e parsing (server-safe)
//
// Módulo puro (sem Supabase, sem client-only). Mapeia linhas de CSV/XLSX para
// os campos canônicos do cadastro mestre, tolerante a variações de cabeçalho.
// Reaproveita normalizarNome do módulo de People Analytics.
// ===========================================================================

import {
  normalizarCpf,
  normalizarCarteirinha,
  normalizarMatricula,
  normalizarNome,
} from '@/lib/beneficiario/identity'

export type MasterLinha = {
  carteirinha: string | null
  matricula: string | null
  cpf: string | null
  nome: string | null
  nomeNorm: string | null
  tipo: string | null
  sexo: string | null
  dataNascimento: string | null
  plano: string | null
  empresa: string | null
  dataAdesao: string | null
  dataAdmissao: string | null
  email: string | null
  telefone: string | null
  status: string | null
  competencia: string | null
}

// Campos do cadastro que participam do índice de qualidade, com rótulo.
export const CAMPOS_QUALIDADE: { chave: keyof MasterLinha; label: string }[] = [
  { chave: 'cpf', label: 'CPF' },
  { chave: 'nome', label: 'Nome' },
  { chave: 'sexo', label: 'Sexo' },
  { chave: 'dataNascimento', label: 'Data de nascimento' },
  { chave: 'empresa', label: 'Empresa' },
  { chave: 'plano', label: 'Plano' },
  { chave: 'tipo', label: 'Tipo (titular/dependente)' },
  { chave: 'dataAdesao', label: 'Data de adesão' },
  { chave: 'dataAdmissao', label: 'Data de admissão' },
  { chave: 'email', label: 'E-mail' },
  { chave: 'telefone', label: 'Telefone' },
]

type CampoCanonico =
  | 'carteirinha'
  | 'matricula'
  | 'cpf'
  | 'nome'
  | 'tipo'
  | 'sexo'
  | 'dataNascimento'
  | 'plano'
  | 'empresa'
  | 'dataAdesao'
  | 'dataAdmissao'
  | 'email'
  | 'telefone'
  | 'status'
  | 'competencia'

// Aliases de cabeçalho aceitos no upload (case/acentos-insensitive).
const HEADER_ALIASES: Record<CampoCanonico, string[]> = {
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
  ],
  matricula: ['matricula', 'matrícula', 'matricula rh', 'registro', 'chapa'],
  cpf: ['cpf', 'cpf beneficiario', 'cpf beneficiário', 'nr cpf'],
  nome: ['nome', 'nome beneficiario', 'nome beneficiário', 'beneficiario', 'beneficiário'],
  tipo: [
    'tipo',
    'tipo beneficiario',
    'vinculo',
    'vínculo',
    'titularidade',
    'titular dependente',
  ],
  sexo: ['sexo', 'genero', 'gênero'],
  dataNascimento: [
    'data nascimento',
    'data de nascimento',
    'nascimento',
    'dt nascimento',
    'dt nasc',
    'nasc',
  ],
  plano: ['plano', 'produto', 'plano contratado'],
  empresa: ['empresa', 'estipulante', 'contratante', 'cliente', 'razao social', 'razão social'],
  dataAdesao: [
    'data adesao',
    'data adesão',
    'data de adesao',
    'data de adesão',
    'adesao',
    'adesão',
    'dt adesao',
    'inicio vigencia',
    'início vigência',
  ],
  dataAdmissao: [
    'data admissao',
    'data admissão',
    'data de admissao',
    'data de admissão',
    'admissao',
    'admissão',
    'dt admissao',
  ],
  email: ['email', 'e-mail', 'e mail', 'correio eletronico', 'correio eletrônico'],
  telefone: ['telefone', 'fone', 'celular', 'contato', 'whatsapp'],
  status: ['status', 'situacao', 'situação', 'ativo'],
  competencia: ['competencia', 'competência', 'mes referencia', 'mês referência'],
}

export type MasterLinhaBruta = Partial<Record<CampoCanonico, unknown>>

// Mapeia uma linha (chaves = cabeçalhos do arquivo) para os campos canônicos.
export function mapearLinhaMaster(row: Record<string, unknown>): MasterLinhaBruta {
  const chaveNorm = new Map<string, string>()
  for (const k of Object.keys(row)) chaveNorm.set(normalizarNome(k), k)

  const out: MasterLinhaBruta = {}
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

// Texto limpo ou null (trata '' e espaços como ausência).
function texto(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s : null
}

// Normaliza uma linha bruta em MasterLinha.
// nenhuma chave de identificação nem nome (linha vazia/inaproveitável).
export function normalizarLinhaMaster(bruta: MasterLinhaBruta): MasterLinha | null {
  const cartRaw = texto(bruta.carteirinha)
  const carteirinha = cartRaw ? normalizarCarteirinha(cartRaw) || cartRaw : null
  const matricula = normalizarMatricula(texto(bruta.matricula))
  const cpf = normalizarCpf(texto(bruta.cpf))
  const nome = texto(bruta.nome)

  // Sem qualquer identificador útil, a linha não serve para matching/insert.
  if (!carteirinha && !matricula && !cpf && !nome) return null

  return {
    carteirinha: carteirinha || null,
    matricula,
    cpf,
    nome,
    nomeNorm: nome ? normalizarNome(nome) : null,
    tipo: texto(bruta.tipo),
    sexo: texto(bruta.sexo),
    dataNascimento: texto(bruta.dataNascimento),
    plano: texto(bruta.plano),
    empresa: texto(bruta.empresa),
    dataAdesao: texto(bruta.dataAdesao),
    dataAdmissao: texto(bruta.dataAdmissao),
    email: texto(bruta.email),
    telefone: texto(bruta.telefone),
    status: texto(bruta.status),
    competencia: texto(bruta.competencia),
  }
}
