// ===========================================================================
// People Analytics & Saúde — cruzamento RH × base assistencial, WHI Score e
// agregações (server-safe, puro). Recebe os colaboradores RH já normalizados e
// um índice da base de saúde; produz o dataset consumido por todas as telas.
// ===========================================================================

import { criarAnonimizador } from '@/lib/anonimizar'
import type { FaixaRisco } from '@/lib/risco'
import { similaridade, type RhColaborador } from './rh'

// Vida da base assistencial exposta ao módulo (derivada de resumirRadar).
export type VidaSaude = {
  carteirinha: string
  nome: string
  nomeNormalizado: string
  valorTotal: number
  score: number
  faixa: FaixaRisco
  participacaoPct: number
}

export type TipoMatch = 'exato' | 'fuzzy' | 'sem_vinculo'

export type ClassificacaoWhi = 'estrategico' | 'estavel' | 'atencao' | 'critico'

export const WHI_META: Record<
  ClassificacaoWhi,
  { label: string; cor: string; min: number }
> = {
  estrategico: { label: 'Estratégico', cor: 'oklch(0.7 0.15 152)', min: 80 },
  estavel: { label: 'Estável', cor: 'oklch(0.72 0.13 220)', min: 60 },
  atencao: { label: 'Atenção', cor: 'oklch(0.78 0.15 78)', min: 40 },
  critico: { label: 'Crítico', cor: 'oklch(0.62 0.2 25)', min: 0 },
}

export function classificarWhi(whi: number): ClassificacaoWhi {
  if (whi >= 80) return 'estrategico'
  if (whi >= 60) return 'estavel'
  if (whi >= 40) return 'atencao'
  return 'critico'
}

// Quadrantes da Matriz de Impacto (OKR × Custo assistencial).
export type Quadrante =
  | 'alto_custo_baixo_okr'
  | 'alto_custo_alto_okr'
  | 'baixo_custo_baixo_okr'
  | 'baixo_custo_alto_okr'

export const QUADRANTE_META: Record<
  Quadrante,
  { label: string; cor: string; descricao: string }
> = {
  alto_custo_baixo_okr: {
    label: 'Alto custo · Baixo OKR',
    cor: 'oklch(0.62 0.2 25)',
    descricao: 'Revisão estratégica e acompanhamento direcionado.',
  },
  alto_custo_alto_okr: {
    label: 'Alto custo · Alto OKR',
    cor: 'oklch(0.78 0.15 78)',
    descricao: 'Talentos-chave com custo elevado — reter e cuidar.',
  },
  baixo_custo_baixo_okr: {
    label: 'Baixo custo · Baixo OKR',
    cor: 'oklch(0.72 0.17 52)',
    descricao: 'Desenvolvimento de performance.',
  },
  baixo_custo_alto_okr: {
    label: 'Baixo custo · Alto OKR',
    cor: 'oklch(0.7 0.15 152)',
    descricao: 'Perfil ideal — alta performance e baixo custo.',
  },
}

// Colaborador enriquecido com o vínculo assistencial e o WHI Score.
export type ColaboradorAnalisado = {
  nome: string
  display: string // respeita o modo de privacidade
  status: string | null
  apto: boolean
  okr: number | null
  satisfacao: string | null
  profit: string | null
  processo: string | null
  cotacao: string | null
  area: string | null
  // Vínculo assistencial.
  tipoMatch: TipoMatch
  similaridade: number | null
  carteirinha: string | null
  custoSaude: number | null
  scoreRisco: number | null
  faixaRisco: FaixaRisco | null
  participacaoPct: number | null
  // Índice WHI (apenas para vinculados).
  whi: number | null
  whiClasse: ClassificacaoWhi | null
  quadrante: Quadrante | null
}

export type CardsPeople = {
  importados: number
  vinculados: number
  naoEncontrados: number
  pctMatching: number
  okrMedio: number // 0..1
  custoTotal: number
  custoMedio: number
  whiMedio: number
}

export type QuadranteResumo = {
  quadrante: Quadrante
  label: string
  cor: string
  descricao: string
  vidas: number
  pct: number
  custoTotal: number
}

export type DistribuicaoWhi = {
  classe: ClassificacaoWhi
  label: string
  cor: string
  vidas: number
  pct: number
}

export type AreaResumo = {
  area: string
  colaboradores: number
  vinculados: number
  okrMedio: number
  custoTotal: number
  scoreRiscoMedio: number
  whiMedio: number
}

export type AnalisePeople = {
  colaboradores: ColaboradorAnalisado[]
  cards: CardsPeople
  quadrantes: QuadranteResumo[]
  distribuicaoWhi: DistribuicaoWhi[]
  areas: AreaResumo[] | null // null => arquivo sem coluna de área
  temArea: boolean
  arquivoNome: string | null
  similaridadeMin: number
}

// --- WHI Score --------------------------------------------------------------
// 50% OKR + 30% Custo (invertido) + 20% Risco (invertido). Custo é normalizado
// pelo maior custo da coorte vinculada; risco pelo intervalo 0..100.
export function calcularWhi(
  okr: number | null,
  custo: number,
  score: number,
  custoMax: number,
): number {
  const okrNorm = Math.max(0, Math.min(1, okr ?? 0))
  const custoInv = custoMax > 0 ? 1 - custo / custoMax : 1
  const riscoInv = 1 - Math.max(0, Math.min(100, score)) / 100
  const whi = 100 * (0.5 * okrNorm + 0.3 * custoInv + 0.2 * riscoInv)
  return Math.round(Math.max(0, Math.min(100, whi)))
}

function classificarQuadrante(
  okr: number | null,
  custo: number,
  okrMediana: number,
  custoMediana: number,
): Quadrante {
  const altoOkr = (okr ?? 0) >= okrMediana
  const altoCusto = custo >= custoMediana
  if (altoCusto && !altoOkr) return 'alto_custo_baixo_okr'
  if (altoCusto && altoOkr) return 'alto_custo_alto_okr'
  if (!altoCusto && !altoOkr) return 'baixo_custo_baixo_okr'
  return 'baixo_custo_alto_okr'
}

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0
  const ord = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(ord.length / 2)
  return ord.length % 2 ? ord[meio] : (ord[meio - 1] + ord[meio]) / 2
}

export type OpcoesAnalise = {
  similaridadeMin?: number // 0..1 (default 0.85)
  modo?: 'nominal' | 'anonimizado'
  arquivoNome?: string | null
}

// Núcleo: cruza colaboradores × base de saúde e monta o dataset completo.
export function analisarPeople(
  colaboradores: RhColaborador[],
  vidas: VidaSaude[],
  opts: OpcoesAnalise = {},
): AnalisePeople {
  const similaridadeMin = opts.similaridadeMin ?? 0.85
  const modo = opts.modo ?? 'nominal'

  // Índice exato por nome normalizado (mantém a de maior custo em colisão).
  const porNome = new Map<string, VidaSaude>()
  for (const v of vidas) {
    const atual = porNome.get(v.nomeNormalizado)
    if (!atual || v.valorTotal > atual.valorTotal) porNome.set(v.nomeNormalizado, v)
  }

  // 1ª passada: resolve o vínculo (exato → fuzzy). Cada vida usada só uma vez.
  const usadas = new Set<string>()
  type Parcial = {
    col: RhColaborador
    vida: VidaSaude | null
    tipo: TipoMatch
    sim: number | null
  }
  const parciais: Parcial[] = colaboradores.map((col) => {
    const exato = porNome.get(col.nomeNormalizado)
    if (exato && !usadas.has(exato.carteirinha)) {
      usadas.add(exato.carteirinha)
      return { col, vida: exato, tipo: 'exato', sim: 1 }
    }
    return { col, vida: null, tipo: 'sem_vinculo', sim: null }
  })

  // Fuzzy para quem não teve match exato.
  for (const p of parciais) {
    if (p.vida) continue
    let melhor: VidaSaude | null = null
    let melhorSim = 0
    for (const v of vidas) {
      if (usadas.has(v.carteirinha)) continue
      const s = similaridade(p.col.nomeNormalizado, v.nomeNormalizado)
      if (s > melhorSim) {
        melhorSim = s
        melhor = v
      }
    }
    if (melhor && melhorSim >= similaridadeMin) {
      usadas.add(melhor.carteirinha)
      p.vida = melhor
      p.tipo = 'fuzzy'
      p.sim = melhorSim
    }
  }

  // Estatísticas para WHI e quadrantes (somente vinculados).
  const vinculados = parciais.filter((p) => p.vida)
  const custoMax = Math.max(0, ...vinculados.map((p) => p.vida!.valorTotal))
  const okrMediana = mediana(
    vinculados.map((p) => p.col.okr ?? 0),
  )
  const custoMediana = mediana(vinculados.map((p) => p.vida!.valorTotal))

  // Anonimização determinística — registra primeiro os de maior custo para que
  // COLAB-001 seja o de maior impacto assistencial.
  const anon = criarAnonimizador()
  const ordemAnon = [...parciais].sort(
    (a, b) => (b.vida?.valorTotal ?? -1) - (a.vida?.valorTotal ?? -1),
  )
  const displayPorNome = new Map<string, string>()
  let semVinculoSeq = 0
  for (const p of ordemAnon) {
    if (modo === 'anonimizado') {
      // Reutiliza o anonimizador (prefixo RISCO) mas expõe como COLAB-XXX.
      const idx = anon.tamanho + 1
      anon.rotular(p.vida?.carteirinha ?? `SEMVINC-${semVinculoSeq++}`)
      displayPorNome.set(p.col.nome, `COLAB-${String(idx).padStart(3, '0')}`)
    } else {
      displayPorNome.set(p.col.nome, p.col.nome)
    }
  }

  const analisados: ColaboradorAnalisado[] = parciais.map((p) => {
    const vida = p.vida
    const whi = vida ? calcularWhi(p.col.okr, vida.valorTotal, vida.score, custoMax) : null
    const quadrante = vida
      ? classificarQuadrante(p.col.okr, vida.valorTotal, okrMediana, custoMediana)
      : null
    return {
      nome: p.col.nome,
      display: displayPorNome.get(p.col.nome) ?? p.col.nome,
      status: p.col.status,
      apto: (p.col.status ?? '').toUpperCase().startsWith('APTO'),
      okr: p.col.okr,
      satisfacao: p.col.satisfacao,
      profit: p.col.profit,
      processo: p.col.processo,
      cotacao: p.col.cotacao,
      area: p.col.area,
      tipoMatch: p.tipo,
      similaridade: p.sim,
      carteirinha: vida?.carteirinha ?? null,
      custoSaude: vida?.valorTotal ?? null,
      scoreRisco: vida?.score ?? null,
      faixaRisco: vida?.faixa ?? null,
      participacaoPct: vida?.participacaoPct ?? null,
      whi,
      whiClasse: whi != null ? classificarWhi(whi) : null,
      quadrante,
    }
  })

  // --- Cards ---
  const importados = analisados.length
  const nVinculados = vinculados.length
  const custoTotal = vinculados.reduce((s, p) => s + p.vida!.valorTotal, 0)
  const okrValidos = analisados.map((c) => c.okr).filter((v): v is number => v != null)
  const okrMedio =
    okrValidos.length > 0 ? okrValidos.reduce((s, v) => s + v, 0) / okrValidos.length : 0
  const whiValidos = analisados
    .map((c) => c.whi)
    .filter((v): v is number => v != null)
  const whiMedio =
    whiValidos.length > 0
      ? Math.round(whiValidos.reduce((s, v) => s + v, 0) / whiValidos.length)
      : 0
  const cards: CardsPeople = {
    importados,
    vinculados: nVinculados,
    naoEncontrados: importados - nVinculados,
    pctMatching: importados > 0 ? (nVinculados / importados) * 100 : 0,
    okrMedio,
    custoTotal,
    custoMedio: nVinculados > 0 ? custoTotal / nVinculados : 0,
    whiMedio,
  }

  // --- Quadrantes ---
  const ordemQuad: Quadrante[] = [
    'alto_custo_baixo_okr',
    'alto_custo_alto_okr',
    'baixo_custo_baixo_okr',
    'baixo_custo_alto_okr',
  ]
  const quadrantes: QuadranteResumo[] = ordemQuad.map((q) => {
    const itens = analisados.filter((c) => c.quadrante === q)
    return {
      quadrante: q,
      label: QUADRANTE_META[q].label,
      cor: QUADRANTE_META[q].cor,
      descricao: QUADRANTE_META[q].descricao,
      vidas: itens.length,
      pct: nVinculados > 0 ? (itens.length / nVinculados) * 100 : 0,
      custoTotal: itens.reduce((s, c) => s + (c.custoSaude ?? 0), 0),
    }
  })

  // --- Distribuição WHI ---
  const ordemWhi: ClassificacaoWhi[] = ['estrategico', 'estavel', 'atencao', 'critico']
  const distribuicaoWhi: DistribuicaoWhi[] = ordemWhi.map((cl) => {
    const itens = analisados.filter((c) => c.whiClasse === cl)
    return {
      classe: cl,
      label: WHI_META[cl].label,
      cor: WHI_META[cl].cor,
      vidas: itens.length,
      pct: nVinculados > 0 ? (itens.length / nVinculados) * 100 : 0,
    }
  })

  // --- Áreas (auto-oculta quando o arquivo não traz área) ---
  const temArea = analisados.some((c) => c.area && c.area.trim())
  let areas: AreaResumo[] | null = null
  if (temArea) {
    const mapa = new Map<string, ColaboradorAnalisado[]>()
    for (const c of analisados) {
      const chave = c.area?.trim() || 'Sem área'
      ;(mapa.get(chave) ?? mapa.set(chave, []).get(chave)!).push(c)
    }
    areas = [...mapa.entries()]
      .map(([area, itens]) => {
        const vinc = itens.filter((c) => c.custoSaude != null)
        const okrs = itens.map((c) => c.okr).filter((v): v is number => v != null)
        const scores = vinc.map((c) => c.scoreRisco!).filter((v) => v != null)
        const whis = vinc.map((c) => c.whi!).filter((v) => v != null)
        return {
          area,
          colaboradores: itens.length,
          vinculados: vinc.length,
          okrMedio: okrs.length ? okrs.reduce((s, v) => s + v, 0) / okrs.length : 0,
          custoTotal: vinc.reduce((s, c) => s + (c.custoSaude ?? 0), 0),
          scoreRiscoMedio: scores.length
            ? scores.reduce((s, v) => s + v, 0) / scores.length
            : 0,
          whiMedio: whis.length
            ? Math.round(whis.reduce((s, v) => s + v, 0) / whis.length)
            : 0,
        }
      })
      .sort((a, b) => b.custoTotal - a.custoTotal)
  }

  return {
    colaboradores: analisados,
    cards,
    quadrantes,
    distribuicaoWhi,
    areas,
    temArea,
    arquivoNome: opts.arquivoNome ?? null,
    similaridadeMin,
  }
}
