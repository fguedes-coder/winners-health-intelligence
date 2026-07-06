// ===========================================================================
// Cadastro Mestre de Beneficiários — normalização e parsing (server-safe)
//
// Módulo puro (sem Supabase, sem client-only). Mapeia linhas de CSV/XLSX para
// os campos canônicos do cadastro mestre, tolerante a variações de cabeçalho.
// Reaproveita normalizarNome do módulo de People Analytics.
// ===========================================================================

import * as XLSX from 'xlsx'
import { normalizarNome } from '@/lib/people-analytics/rh'

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

export type CampoCanonico =
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

export const LABEL_CAMPO_CANONICO: Record<CampoCanonico, string> = {
  carteirinha: 'Carteirinha',
  matricula: 'Matrícula',
  cpf: 'CPF',
  nome: 'Nome',
  tipo: 'Tipo (titular/dependente)',
  sexo: 'Sexo',
  dataNascimento: 'Data de nascimento',
  plano: 'Plano',
  empresa: 'Empresa/filial',
  dataAdesao: 'Data de adesão',
  dataAdmissao: 'Data de admissão',
  email: 'E-mail',
  telefone: 'Telefone',
  status: 'Status',
  competencia: 'Competência',
}

// Aliases de cabeçalho aceitos no upload (case/acentos-insensitive). Cobre
// tanto planilhas de RH "manuais" quanto exportações de operadora no layout
// MECSAS/ANS (ex.: Nome_Benef, Carteira de identificacao, Data_Nasc, Data_Adm,
// Cod_Emp), que usam nomes de coluna bem diferentes dos de uma planilha comum.
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
    'carteira de identificacao',
    'carteira de identificação',
  ],
  matricula: ['matricula', 'matrícula', 'matricula rh', 'registro', 'chapa'],
  cpf: ['cpf', 'cpf beneficiario', 'cpf beneficiário', 'nr cpf'],
  nome: [
    'nome',
    'nome beneficiario',
    'nome beneficiário',
    'beneficiario',
    'beneficiário',
    'funcionario',
    'funcionário',
    'colaborador',
    'nome completo',
    'nome completo do beneficiario',
    'nome completo do beneficiário',
    'nome do beneficiario',
    'nome do beneficiário',
    'nome benef',
  ],
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
    'data nasc',
  ],
  plano: ['plano', 'produto', 'plano contratado'],
  empresa: [
    'empresa',
    'estipulante',
    'contratante',
    'cliente',
    'razao social',
    'razão social',
    'filial',
    'cod emp',
    'codigo empresa',
    'código empresa',
  ],
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
    'data adm',
    'dt adm',
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

// Mantém apenas dígitos (para CPF/carteirinha/matrícula), preservando null.
function soDigitos(v: unknown): string | null {
  const s = texto(v)
  if (s == null) return null
  const d = s.replace(/\D/g, '')
  return d ? d : null
}

// Normaliza uma linha bruta em MasterLinha. Retorna null quando não há
// nenhuma chave de identificação nem nome (linha vazia/inaproveitável).
export function normalizarLinhaMaster(bruta: MasterLinhaBruta): MasterLinha | null {
  // Carteirinha/matrícula mantidas como texto trimado (para casar com o padrão
  // do restante do sistema, que compara por string). CPF fica só com dígitos.
  const carteirinha = texto(bruta.carteirinha)
  const matricula = texto(bruta.matricula)
  const cpf = soDigitos(bruta.cpf)
  const nome = texto(bruta.nome)

  // Sem qualquer identificador útil, a linha não serve para matching/insert.
  if (!carteirinha && !matricula && !cpf && !nome) return null

  return {
    carteirinha,
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

// ===========================================================================
// Leitura de planilha com detecção de aba e linha de cabeçalho reais.
//
// Algumas exportações (ex.: layout MECSAS/ANS) têm uma primeira linha que é
// só uma numeração de colunas (1, 2, 3...) e o cabeçalho de verdade só
// aparece na segunda linha — assumir que a linha 1 é sempre o cabeçalho faz
// o parser não reconhecer nenhuma coluna. Por isso a linha de cabeçalho é
// detectada por pontuação: a linha, entre as primeiras 15 de cada aba, com
// mais células que "parecem" um nome de coluna conhecido vence.
// ===========================================================================

const PALAVRAS_CHAVE_CABECALHO = [
  'nome',
  'cpf',
  'carteir',
  'matricul',
  'registro',
  'chapa',
  'nascim',
  'nasc',
  'sexo',
  'genero',
  'gênero',
  'admiss',
  'adesao',
  'adesão',
  'plano',
  'tipo',
  'vinculo',
  'vínculo',
  'filial',
  'empresa',
  'estipulante',
  'contratante',
  'email',
  'e-mail',
  'telefone',
  'celular',
]

export type DiagnosticoPlanilha = {
  abasEncontradas: string[]
  abaEscolhida: string
  linhaCabecalhoIndex: number
  colunasReconhecidas: { campo: CampoCanonico; label: string; colunaOriginal: string }[]
  colunasNaoReconhecidas: string[]
  amostras: Record<string, unknown>[]
}

function pontuarLinhaComoCabecalho(linha: unknown[]): number {
  let score = 0
  for (const cel of linha) {
    const norm = normalizarNome(cel == null ? '' : String(cel))
    if (!norm) continue
    if (PALAVRAS_CHAVE_CABECALHO.some((kw) => norm.includes(normalizarNome(kw)))) score++
  }
  return score
}

// Acha, em todas as abas, a linha com maior pontuação de "parece cabeçalho"
// dentro das primeiras 15 linhas de cada uma.
function melhorCabecalho(
  wb: XLSX.WorkBook,
): { aba: string; linhaIndex: number; score: number } | null {
  let melhor: { aba: string; linhaIndex: number; score: number } | null = null
  for (const aba of wb.SheetNames) {
    const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[aba], {
      header: 1,
      defval: null,
      raw: false,
    })
    const limite = Math.min(raw.length, 15)
    for (let i = 0; i < limite; i++) {
      const score = pontuarLinhaComoCabecalho(raw[i] ?? [])
      if (score > 0 && (!melhor || score > melhor.score)) {
        melhor = { aba, linhaIndex: i, score }
      }
    }
  }
  return melhor
}

// Converte as linhas cruas (array de arrays) de uma aba, a partir da linha
// de cabeçalho identificada, em objetos { cabeçalho: valor }.
function linhasComoObjetos(
  wb: XLSX.WorkBook,
  aba: string,
  linhaCabecalhoIndex: number,
): { headers: string[]; rows: Record<string, unknown>[] } {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[aba], {
    header: 1,
    defval: null,
    raw: false,
  })
  const headerRow = (raw[linhaCabecalhoIndex] ?? []).map((h, i) => {
    const s = h == null ? '' : String(h).trim()
    return s || `Coluna ${i + 1}`
  })
  const rows = raw
    .slice(linhaCabecalhoIndex + 1)
    .filter((r) => (r ?? []).some((c) => c != null && String(c).trim() !== ''))
    .map((r) => {
      const obj: Record<string, unknown> = {}
      headerRow.forEach((h, i) => {
        obj[h] = (r ?? [])[i] ?? null
      })
      return obj
    })
  return { headers: headerRow, rows }
}

// Lê o workbook inteiro: escolhe a aba e a linha de cabeçalho corretas
// (mesmo em layouts como o MECSAS/ANS), mapeia cada linha para MasterLinha
// e monta o diagnóstico (abas encontradas, cabeçalho detectado, colunas
// reconhecidas/não reconhecidas e as 5 primeiras linhas lidas).
export function lerPlanilhaMaster(wb: XLSX.WorkBook): {
  linhas: MasterLinha[]
  diagnostico: DiagnosticoPlanilha
} {
  const abasEncontradas = wb.SheetNames
  const melhor = melhorCabecalho(wb)

  if (!melhor) {
    return {
      linhas: [],
      diagnostico: {
        abasEncontradas,
        abaEscolhida: abasEncontradas[0] ?? '',
        linhaCabecalhoIndex: -1,
        colunasReconhecidas: [],
        colunasNaoReconhecidas: [],
        amostras: [],
      },
    }
  }

  const { headers, rows } = linhasComoObjetos(wb, melhor.aba, melhor.linhaIndex)

  const colunasReconhecidas: { campo: CampoCanonico; label: string; colunaOriginal: string }[] = []
  const reconhecidas = new Set<string>()
  for (const campo of Object.keys(HEADER_ALIASES) as CampoCanonico[]) {
    for (const alias of HEADER_ALIASES[campo]) {
      const original = headers.find((h) => normalizarNome(h) === normalizarNome(alias))
      if (original !== undefined) {
        colunasReconhecidas.push({ campo, label: LABEL_CAMPO_CANONICO[campo], colunaOriginal: original })
        reconhecidas.add(original)
        break
      }
    }
  }
  const colunasNaoReconhecidas = headers.filter((h) => !reconhecidas.has(h))

  const linhas = rows
    .map((r) => normalizarLinhaMaster(mapearLinhaMaster(r)))
    .filter((l): l is MasterLinha => l !== null)

  return {
    linhas,
    diagnostico: {
      abasEncontradas,
      abaEscolhida: melhor.aba,
      linhaCabecalhoIndex: melhor.linhaIndex,
      colunasReconhecidas,
      colunasNaoReconhecidas,
      amostras: rows.slice(0, 5),
    },
  }
}
