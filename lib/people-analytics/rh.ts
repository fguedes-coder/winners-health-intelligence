// ===========================================================================
// People Analytics & Saúde — normalização, parsing e matching (server-safe)
//
// Módulo puro (sem Supabase, sem client-only). Cuida de:
//  1. Normalização de nomes para o cruzamento RH × base assistencial.
//  2. Parsing dos campos do arquivo RH (OKR, triggers, percentuais).
//  3. Similaridade de nomes (exato + fuzzy) para o vínculo por nome.
// ===========================================================================

// Normaliza um nome para comparação: remove acentos, pontuação, colapsa
// espaços e passa para maiúsculas. Base tanto do match exato quanto do fuzzy.
export function normalizarNome(valor: string | null | undefined): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // acentos
    .replace(/[^a-zA-Z0-9\s]/g, ' ') // pontuação
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

// Converte "69,75%" | "64%" | 0.64 | "0,64" -> fração 0..1. Retorna null quando
// o valor não é um percentual (ex.: "TL - TRIGGER SATISFAÇÃO CT").
export function parsePercent(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return null
    return valor > 1 ? valor / 100 : valor
  }
  const txt = String(valor).trim()
  const m = txt.match(/^(-?\d+(?:[.,]\d+)?)\s*%?$/)
  if (!m) return null
  const num = Number(m[1].replace(',', '.'))
  if (!Number.isFinite(num)) return null
  // "69,75%" e "0,6975" ambos viram 0.6975.
  return txt.includes('%') || num > 1 ? num / 100 : num
}

// Distância de Levenshtein (iterativa, O(n*m)) para similaridade de nomes.
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = new Array<number>(n + 1)
  let cur = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    cur[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, cur] = [cur, prev]
  }
  return prev[n]
}

// Similaridade 0..1 entre dois nomes já normalizados (1 = idênticos).
export function similaridade(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const dist = levenshtein(a, b)
  const maxLen = Math.max(a.length, b.length)
  return maxLen === 0 ? 1 : 1 - dist / maxLen
}

// Linha de colaborador RH já normalizada (independe da origem: XLSX/CSV/DB).
export type RhColaborador = {
  nome: string
  nomeNormalizado: string
  status: string | null
  okr: number | null
  satisfacao: string | null
  satisfacaoPct: number | null
  profit: string | null
  profitPct: number | null
  processo: string | null
  processoPct: number | null
  cotacao: string | null
  cotacaoPct: number | null
  // Expansão futura.
  cpf: string | null
  matricula: string | null
  cargo: string | null
  area: string | null
  gestor: string | null
}

// Aliases de cabeçalho aceitos no upload (tolerante a variações de rótulo).
const HEADER_ALIASES: Record<keyof RhLinhaBruta, string[]> = {
  nome: ['colaborador', 'nome', 'funcionario', 'funcionário'],
  status: ['contabilizacao', 'contabilização', 'status', 'situacao', 'situação'],
  okr: ['okr', 'okr %', 'okr(%)'],
  satisfacao: ['satisfacao', 'satisfação'],
  profit: ['profit', 'lucro'],
  processo: ['processo', 'processos'],
  cotacao: ['cotacao', 'cotação'],
  cpf: ['cpf'],
  matricula: ['matricula', 'matrícula'],
  cargo: ['cargo', 'funcao', 'função'],
  area: ['area', 'área', 'departamento', 'setor'],
  gestor: ['gestor', 'lider', 'líder', 'responsavel', 'responsável'],
}

export type RhLinhaBruta = {
  nome?: unknown
  status?: unknown
  okr?: unknown
  satisfacao?: unknown
  profit?: unknown
  processo?: unknown
  cotacao?: unknown
  cpf?: unknown
  matricula?: unknown
  cargo?: unknown
  area?: unknown
  gestor?: unknown
}

// Mapeia uma linha de objeto (chaves = cabeçalhos do arquivo) para os campos
// canônicos, usando os aliases acima (case/acentos-insensitive).
export function mapearLinha(row: Record<string, unknown>): RhLinhaBruta {
  const chaveNorm = new Map<string, string>()
  for (const k of Object.keys(row)) chaveNorm.set(normalizarNome(k), k)

  const out: RhLinhaBruta = {}
  for (const campo of Object.keys(HEADER_ALIASES) as (keyof RhLinhaBruta)[]) {
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

// Normaliza uma linha bruta em RhColaborador. Retorna null quando não há nome.
export function normalizarColaborador(bruta: RhLinhaBruta): RhColaborador | null {
  const nome = bruta.nome == null ? '' : String(bruta.nome).trim()
  if (!nome) return null
  const texto = (v: unknown): string | null => {
    if (v == null) return null
    const s = String(v).trim()
    return s ? s : null
  }
  return {
    nome,
    nomeNormalizado: normalizarNome(nome),
    status: texto(bruta.status),
    okr: parsePercent(bruta.okr),
    satisfacao: texto(bruta.satisfacao),
    satisfacaoPct: parsePercent(bruta.satisfacao),
    profit: texto(bruta.profit),
    profitPct: parsePercent(bruta.profit),
    processo: texto(bruta.processo),
    processoPct: parsePercent(bruta.processo),
    cotacao: texto(bruta.cotacao),
    cotacaoPct: parsePercent(bruta.cotacao),
    cpf: texto(bruta.cpf),
    matricula: texto(bruta.matricula),
    cargo: texto(bruta.cargo),
    area: texto(bruta.area),
    gestor: texto(bruta.gestor),
  }
}

// Status "APTO" (case-insensitive, tolerante a acentos).
export function isApto(status: string | null): boolean {
  if (!status) return false
  const n = normalizarNome(status)
  return n === 'APTO' || n.startsWith('APTO')
}
