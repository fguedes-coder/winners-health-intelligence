// ===========================================================================
// Panorama do Beneficiário — drill-down (server-safe)
//
// Concentra a lógica de dados do painel "Panorama do Beneficiário", usado no
// drawer reutilizável a partir do Radar de Risco e do card Top 5 Vidas
// Prioritárias. Recebe os eventos detalhados já carregados + um identificador
// interno seguro do beneficiário (carteirinha) + os filtros ativos do
// dashboard, e devolve um objeto serializável com visão clínica, financeira e
// estratégica. Não importa client-only nem Supabase.
// ===========================================================================

import type { EventoDetalhado } from '@/lib/queries'
import {
  classificarEvento,
  subcategoriaDinamica,
  subcategoriaSaudeMental,
  ehPsiquiatria,
  indiceAtencaoSaudeMental,
  mesCurto,
  type CategoriaGerencial,
  type NivelAtencaoSM,
} from '@/lib/categorias'
import {
  calcularScore,
  gerarAlertas,
  gerarInsightExecutivo,
  gerarPlanoAcao,
  calcularPrioridadeIntervencao,
  gerarRecomendacaoConsolidada,
  classificarImpacto,
  RISCO_META,
  IMPACTO_META,
  INTERVENCAO_META,
  LIMIARES,
  type FaixaRisco,
  type FaixaImpacto,
  type FaixaIntervencao,
  type FatorRisco,
  type AlertaRisco,
  type Recomendacao,
} from '@/lib/risco'

// Filtros ativos do dashboard. Todos opcionais; strings ou arrays são aceitos.
export type PanoramaFiltros = {
  cliente?: string | string[]
  apolice?: string | string[]
  sub?: string | string[]
  plano?: string | string[]
  mes?: string | string[]
}

// Grupos de utilização exibidos no histórico de atendimentos.
export const GRUPOS_UTILIZACAO = [
  'Internações',
  'Pronto-Socorro',
  'Consultas',
  'Exames',
  'Saúde Mental',
  'Demais Utilizações',
] as const

export type GrupoUtilizacao = (typeof GRUPOS_UTILIZACAO)[number]

// Mapeia a categoria gerencial para um dos 6 grupos do histórico.
function grupoDaCategoria(cat: CategoriaGerencial): GrupoUtilizacao {
  switch (cat) {
    case 'Internações':
      return 'Internações'
    case 'Pronto-Socorro':
      return 'Pronto-Socorro'
    case 'Consultas':
      return 'Consultas'
    case 'Exames':
      return 'Exames'
    case 'Saúde Mental':
      return 'Saúde Mental'
    default:
      return 'Demais Utilizações'
  }
}

export type Atendimento = {
  id: string
  data: string | null
  competencia: string | null
  categoria: CategoriaGerencial
  grupo: GrupoUtilizacao
  procedimento: string
  prestador: string | null
  valor: number
  internacao: boolean
  saudeMental: boolean
}

export type GrupoAtendimentos = {
  grupo: GrupoUtilizacao
  eventos: number
  valor: number
  atendimentos: Atendimento[]
}

export type PanoramaKpis = {
  valorTotal: number
  eventos: number
  score: number
  faixa: FaixaRisco
  participacaoPct: number
  faixaImpacto: FaixaImpacto
  ranking: number
  totalVidas: number
  internacoes: number
  prontoSocorro: number
  consultas: number
  exames: number
  saudeMental: number
}

export type PanoramaAnalise = {
  insight: string
  fatores: FatorRisco[]
  alertas: AlertaRisco[]
  recomendacoes: Recomendacao[]
  prioridadeIntervencao: { valor: number; faixa: FaixaIntervencao }
  recomendacaoConsolidada: string
  padraoUtilizacao: string
  evolucaoCusto: string
  riscoContinuidade: string
}

// Perfil de utilização: composição percentual por grupo (eventos e custo).
export type PerfilUtilizacao = {
  grupo: GrupoUtilizacao
  eventos: number
  valor: number
  pctEventos: number
  pctValor: number
}

// Ranking de prestadores mais utilizados pelo beneficiário.
export type PrestadorUso = {
  nome: string
  eventos: number
  valor: number
  participacaoPct: number
}

// Breakdown visual do score: contribuição de cada fator + soma bruta e final.
export type ScoreBreakdown = {
  fatores: FatorRisco[]
  scoreBruto: number
  score: number
  limitado: boolean
}

// Detalhe de saúde mental: split psiquiatria x psicologia/terapias, subcategorias
// e evolução temporal. Frequência de utilização (nunca diagnóstico clínico).
export type SaudeMentalDetalhe = {
  total: number
  valor: number
  nivel: NivelAtencaoSM
  psiquiatria: { eventos: number; valor: number }
  psicoterapia: { eventos: number; valor: number }
  subcategorias: { nome: string; eventos: number; valor: number }[]
  timeline: { competencia: string; mes: string; eventos: number; valor: number }[]
}

export type PanoramaBeneficiario = {
  encontrado: boolean
  // Identidade — o id interno seguro é sempre a carteirinha.
  carteirinha: string
  nome: string | null
  display: string
  titular: boolean
  tipoLabel: string
  idade: number | null
  sexo: string | null
  plano: string | null
  cliente: string | null
  apolice: string | null
  kpis: PanoramaKpis
  timeline: { competencia: string; mes: string; valor: number; eventos: number }[]
  grupos: GrupoAtendimentos[]
  perfilUtilizacao: PerfilUtilizacao[]
  prestadores: PrestadorUso[]
  scoreBreakdown: ScoreBreakdown
  saudeMentalDetalhe: SaudeMentalDetalhe
  analise: PanoramaAnalise
}

function toSet(v: string | string[] | undefined): Set<string> {
  if (v === undefined) return new Set()
  const arr = (Array.isArray(v) ? v : [v]).map((s) => s.trim()).filter(Boolean)
  return new Set(arr)
}

function aplicaFiltros(e: EventoDetalhado, f: {
  cliente: Set<string>
  apolice: Set<string>
  sub: Set<string>
  plano: Set<string>
  mes: Set<string>
}): boolean {
  if (f.cliente.size && !(e.apoliceCliente && f.cliente.has(e.apoliceCliente))) return false
  if (f.apolice.size && !(e.apoliceNumero && f.apolice.has(e.apoliceNumero))) return false
  if (f.sub.size && !(e.subCodigo && f.sub.has(e.subCodigo))) return false
  if (f.plano.size && !(e.plano && f.plano.has(e.plano))) return false
  if (f.mes.size && !(e.competencia && f.mes.has(e.competencia))) return false
  return true
}

// Constrói o panorama completo de um beneficiário respeitando os filtros
// ativos do dashboard. `beneficiaryId` é a carteirinha (identificador interno).
export function getBeneficiaryPanorama(
  eventos: EventoDetalhado[],
  beneficiaryId: string,
  filtros: PanoramaFiltros = {},
): PanoramaBeneficiario {
  const f = {
    cliente: toSet(filtros.cliente),
    apolice: toSet(filtros.apolice),
    sub: toSet(filtros.sub),
    plano: toSet(filtros.plano),
    mes: toSet(filtros.mes),
  }

  // Recorte da carteira dentro dos filtros ativos (contexto de ranking/%).
  const carteira = eventos.filter((e) => aplicaFiltros(e, f))

  // Última competência do recorte (para "internação recente").
  const ultimaComp = carteira.reduce<string | null>((max, e) => {
    if (!e.competencia) return max
    return !max || e.competencia > max ? e.competencia : max
  }, null)

  // Agregação por beneficiário (valor total, PS) para ranking e média de PS.
  const valorPorBenef = new Map<string, number>()
  let somaPS = 0
  for (const e of carteira) {
    valorPorBenef.set(e.beneficiario, (valorPorBenef.get(e.beneficiario) ?? 0) + e.valorPago)
    const cat = classificarEvento(e)
    if (cat === 'Pronto-Socorro') somaPS++
  }
  const totalVidas = valorPorBenef.size
  const mediaPS = totalVidas ? somaPS / totalVidas : 0
  const valorTotalCarteira = [...valorPorBenef.values()].reduce((s, v) => s + v, 0)
  const ranking =
    [...valorPorBenef.entries()]
      .sort((a, b) => b[1] - a[1])
      .findIndex(([id]) => id === beneficiaryId) + 1

  // Eventos do beneficiário alvo.
  const meus = carteira.filter((e) => e.beneficiario === beneficiaryId)

  const base = meus[0] ?? null

  const kpisVazio: PanoramaKpis = {
    valorTotal: 0,
    eventos: 0,
    score: 0,
    faixa: 'baixo',
    participacaoPct: 0,
    faixaImpacto: 'baixo',
    ranking: 0,
    totalVidas,
    internacoes: 0,
    prontoSocorro: 0,
    consultas: 0,
    exames: 0,
    saudeMental: 0,
  }

  if (!base) {
    return {
      encontrado: false,
      carteirinha: beneficiaryId,
      nome: null,
      display: beneficiaryId,
      titular: false,
      tipoLabel: '—',
      idade: null,
      sexo: null,
      plano: null,
      cliente: null,
      apolice: null,
      kpis: kpisVazio,
      timeline: [],
      grupos: [],
      perfilUtilizacao: [],
      prestadores: [],
      scoreBreakdown: { fatores: [], scoreBruto: 0, score: 0, limitado: false },
      saudeMentalDetalhe: {
        total: 0,
        valor: 0,
        nivel: 'Baixo',
        psiquiatria: { eventos: 0, valor: 0 },
        psicoterapia: { eventos: 0, valor: 0 },
        subcategorias: [],
        timeline: [],
      },
      analise: {
        insight: 'Sem utilização registrada para este beneficiário no recorte selecionado.',
        fatores: [],
        alertas: [],
        recomendacoes: [],
        prioridadeIntervencao: { valor: 0, faixa: 'baixa' },
        recomendacaoConsolidada:
          'Sem dados suficientes para gerar recomendações no período filtrado.',
        padraoUtilizacao: 'Não há atendimentos no recorte atual.',
        evolucaoCusto: 'Sem base de comparação de custo no período.',
        riscoContinuidade: 'Não avaliável sem histórico de utilização.',
      },
    }
  }

  // Contadores clínicos e financeiros + histórico detalhado.
  let valorTotal = 0
  let internacoes = 0
  let internacaoRecente = false
  let prontoSocorro = 0
  let consultas = 0
  let exames = 0
  let saudeMental = 0
  let procedimentosAltoCusto = 0
  let medicamentosAltoCusto = 0
  const categorias = new Set<string>()
  const porComp = new Map<string, { valor: number; eventos: number }>()
  const atendimentos: Atendimento[] = []

  for (const e of meus) {
    const cat = classificarEvento(e)
    valorTotal += e.valorPago
    categorias.add(cat)

    if (e.internacao) {
      internacoes++
      if (ultimaComp && e.competencia === ultimaComp) internacaoRecente = true
    }
    if (cat === 'Pronto-Socorro') prontoSocorro++
    if (cat === 'Consultas') consultas++
    if (cat === 'Exames') exames++
    if (cat === 'Saúde Mental' || e.saudeMental) saudeMental++
    if (cat === 'Procedimentos' && e.valorPago >= LIMIARES.procedimentoAltoCusto)
      procedimentosAltoCusto++
    if (cat === 'Medicamentos' && e.valorPago >= LIMIARES.medicamentoAltoCusto)
      medicamentosAltoCusto++

    if (e.competencia) {
      const c = porComp.get(e.competencia) ?? { valor: 0, eventos: 0 }
      c.valor += e.valorPago
      c.eventos++
      porComp.set(e.competencia, c)
    }

    atendimentos.push({
      id: e.id,
      data: e.dataAtendimento,
      competencia: e.competencia,
      categoria: cat,
      grupo: grupoDaCategoria(cat),
      procedimento: subcategoriaDinamica(e),
      prestador: e.prestadorNome,
      valor: e.valorPago,
      internacao: e.internacao,
      saudeMental: e.saudeMental,
    })
  }

  const eventosTotal = meus.length

  // Timeline por competência (ascendente).
  const compsOrd = [...porComp.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const timeline = compsOrd.map(([competencia, v]) => ({
    competencia,
    mes: mesCurto(competencia),
    valor: v.valor,
    eventos: v.eventos,
  }))

  // Crescimento acelerado (última competência vs. anterior).
  let crescimentoAcelerado = false
  if (compsOrd.length >= 2) {
    const anterior = compsOrd[compsOrd.length - 2][1].valor
    const atual = compsOrd[compsOrd.length - 1][1].valor
    if (anterior > 0 && atual / anterior - 1 > LIMIARES.crescimentoCusto)
      crescimentoAcelerado = true
  }

  const { score, faixa, fatores } = calcularScore({
    internacoes,
    reinternacao: internacoes >= 2,
    prontoSocorro,
    saudeMental,
    procedimentosAltoCusto,
    medicamentosAltoCusto,
    crescimentoAcelerado,
    categoriasDistintas: categorias.size,
  })

  const alertas = gerarAlertas({
    score,
    internacaoRecente,
    prontoSocorro,
    mediaProntoSocorroCarteira: mediaPS,
    crescimentoAcelerado,
    numFatores: fatores.length,
  })

  const participacaoPct =
    valorTotalCarteira > 0 ? (valorTotal / valorTotalCarteira) * 100 : 0
  const faixaImpacto = classificarImpacto(participacaoPct)

  const insight = gerarInsightExecutivo({ faixa, fatores, alertas })
  const recomendacoes = gerarPlanoAcao({ fatores, alertas, participacaoPct })
  const prioridadeIntervencao = calcularPrioridadeIntervencao({
    score,
    participacaoPct,
    numAlertas: alertas.length,
  })
  const recomendacaoConsolidada = gerarRecomendacaoConsolidada({
    faixa,
    recomendacoes,
    participacaoPct,
  })

  // Agrupa o histórico por tipo de utilização (ordem fixa; oculta grupos vazios).
  const gruposMap = new Map<GrupoUtilizacao, GrupoAtendimentos>()
  for (const a of atendimentos) {
    let g = gruposMap.get(a.grupo)
    if (!g) {
      g = { grupo: a.grupo, eventos: 0, valor: 0, atendimentos: [] }
      gruposMap.set(a.grupo, g)
    }
    g.eventos++
    g.valor += a.valor
    g.atendimentos.push(a)
  }
  const grupos: GrupoAtendimentos[] = GRUPOS_UTILIZACAO.map((nome) =>
    gruposMap.get(nome),
  )
    .filter((g): g is GrupoAtendimentos => !!g)
    .map((g) => ({
      ...g,
      // Atendimentos mais recentes primeiro dentro de cada grupo.
      atendimentos: g.atendimentos.sort((x, y) =>
        (y.data ?? y.competencia ?? '').localeCompare(x.data ?? x.competencia ?? ''),
      ),
    }))

  // --- Perfil de utilização (% por tipo) ----------------------------------
  const perfilUtilizacao: PerfilUtilizacao[] = grupos
    .map((g) => ({
      grupo: g.grupo,
      eventos: g.eventos,
      valor: g.valor,
      pctEventos: eventosTotal > 0 ? (g.eventos / eventosTotal) * 100 : 0,
      pctValor: valorTotal > 0 ? (g.valor / valorTotal) * 100 : 0,
    }))
    .sort((a, b) => b.valor - a.valor)

  // --- Ranking de prestadores ---------------------------------------------
  const prestMap = new Map<string, { eventos: number; valor: number }>()
  for (const e of meus) {
    const nome = (e.prestadorNome || '').trim() || 'Prestador não informado'
    const cur = prestMap.get(nome) ?? { eventos: 0, valor: 0 }
    cur.eventos++
    cur.valor += e.valorPago
    prestMap.set(nome, cur)
  }
  const prestadores: PrestadorUso[] = [...prestMap.entries()]
    .map(([nome, v]) => ({
      nome,
      eventos: v.eventos,
      valor: v.valor,
      participacaoPct: valorTotal > 0 ? (v.valor / valorTotal) * 100 : 0,
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8)

  // --- Breakdown visual do score ------------------------------------------
  const scoreBruto = Math.round(fatores.reduce((s, f) => s + f.pontos, 0))
  const scoreBreakdown: ScoreBreakdown = {
    fatores,
    scoreBruto,
    score,
    limitado: scoreBruto > 100,
  }

  // --- Detalhe de saúde mental --------------------------------------------
  const smEventos = meus.filter(
    (e) => e.saudeMental || classificarEvento(e) === 'Saúde Mental',
  )
  let smValor = 0
  const smPsiq = { eventos: 0, valor: 0 }
  const smPsico = { eventos: 0, valor: 0 }
  const smSubMap = new Map<string, { eventos: number; valor: number }>()
  const smCompMap = new Map<string, { eventos: number; valor: number }>()
  for (const e of smEventos) {
    const texto = subcategoriaDinamica(e)
    smValor += e.valorPago
    if (ehPsiquiatria(texto)) {
      smPsiq.eventos++
      smPsiq.valor += e.valorPago
    } else {
      smPsico.eventos++
      smPsico.valor += e.valorPago
    }
    const sub = subcategoriaSaudeMental(texto)
    const s = smSubMap.get(sub) ?? { eventos: 0, valor: 0 }
    s.eventos++
    s.valor += e.valorPago
    smSubMap.set(sub, s)
    if (e.competencia) {
      const c = smCompMap.get(e.competencia) ?? { eventos: 0, valor: 0 }
      c.eventos++
      c.valor += e.valorPago
      smCompMap.set(e.competencia, c)
    }
  }
  const saudeMentalDetalhe: SaudeMentalDetalhe = {
    total: smEventos.length,
    valor: smValor,
    nivel: indiceAtencaoSaudeMental(smEventos.length),
    psiquiatria: smPsiq,
    psicoterapia: smPsico,
    subcategorias: [...smSubMap.entries()]
      .map(([nome, v]) => ({ nome, eventos: v.eventos, valor: v.valor }))
      .sort((a, b) => b.eventos - a.eventos),
    timeline: [...smCompMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([competencia, v]) => ({
        competencia,
        mes: mesCurto(competencia),
        eventos: v.eventos,
        valor: v.valor,
      })),
  }

  // --- Análise executiva textual ------------------------------------------
  const catValor = new Map<CategoriaGerencial, number>()
  for (const a of atendimentos)
    catValor.set(a.categoria, (catValor.get(a.categoria) ?? 0) + a.valor)
  const catTop = [...catValor.entries()].sort((x, y) => y[1] - x[1])[0]
  const pctFmt = (n: number) =>
    n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

  const padraoUtilizacao =
    catTop && valorTotal > 0
      ? `A utilização concentra-se em ${catTop[0]} (${pctFmt(
          (catTop[1] / valorTotal) * 100,
        )}% do custo), distribuída em ${categorias.size} categoria(s) e ${eventosTotal} atendimento(s) no período.`
      : `Foram registrados ${eventosTotal} atendimento(s) no período, sem concentração relevante de custo.`

  let evolucaoCusto: string
  if (compsOrd.length >= 2) {
    const primeiro = compsOrd[0][1].valor
    const ultimo = compsOrd[compsOrd.length - 1][1].valor
    const varTotal = primeiro > 0 ? (ultimo / primeiro - 1) * 100 : 0
    evolucaoCusto = crescimentoAcelerado
      ? `Custo em aceleração: a última competência cresceu de forma expressiva frente à anterior, com variação acumulada de ${varTotal >= 0 ? '+' : ''}${pctFmt(varTotal)}% no período.`
      : varTotal >= 0
        ? `Custo em tendência de alta moderada, com variação acumulada de +${pctFmt(varTotal)}% entre a primeira e a última competência.`
        : `Custo em redução, com variação acumulada de ${pctFmt(varTotal)}% entre a primeira e a última competência.`
  } else {
    evolucaoCusto =
      'Apenas uma competência com utilização no recorte — sem base para tendência de custo.'
  }

  const riscoContinuidade =
    faixa === 'critico' || faixa === 'alto'
      ? `Risco de continuidade ELEVADO${
          internacaoRecente ? ', com internação recente' : ''
        }${
          crescimentoAcelerado ? ' e custo em aceleração' : ''
        }. Alta probabilidade de manutenção ou crescimento dos custos assistenciais nas próximas competências, exigindo intervenção prioritária.`
      : faixa === 'moderado'
        ? 'Risco de continuidade MODERADO. Recomenda-se acompanhamento preventivo para evitar escalada de utilização e custo.'
        : 'Risco de continuidade BAIXO. Utilização dentro de padrões esperados; manter monitoramento de rotina.'

  return {
    encontrado: true,
    carteirinha: beneficiaryId,
    nome: base.nome,
    display: base.displayBeneficiario,
    titular: base.titular,
    tipoLabel: base.titular ? 'Titular' : 'Dependente',
    idade: base.idade,
    sexo: base.sexo,
    plano: base.plano,
    cliente: base.apoliceCliente,
    apolice: base.apoliceNumero,
    kpis: {
      valorTotal,
      eventos: eventosTotal,
      score,
      faixa,
      participacaoPct,
      faixaImpacto,
      ranking,
      totalVidas,
      internacoes,
      prontoSocorro,
      consultas,
      exames,
      saudeMental,
    },
    timeline,
    grupos,
    perfilUtilizacao,
    prestadores,
    scoreBreakdown,
    saudeMentalDetalhe,
    analise: {
      insight,
      fatores,
      alertas,
      recomendacoes,
      prioridadeIntervencao,
      recomendacaoConsolidada,
      padraoUtilizacao,
      evolucaoCusto,
      riscoContinuidade,
    },
  }
}

// Rótulo de cabeçalho respeitando LGPD (nome vs. identificador anonimizado).
export function panoramaTitulo(
  p: PanoramaBeneficiario,
  anonimizado: boolean,
  displayLabel?: string,
): string {
  return anonimizado
    ? (displayLabel ?? p.carteirinha)
    : (displayLabel ?? (p.nome || p.display))
}

export function panoramaSubtitulo(
  p: PanoramaBeneficiario,
  anonimizado: boolean,
): string {
  return anonimizado
    ? [p.tipoLabel, p.plano ?? undefined].filter(Boolean).join(' · ')
    : [
        p.tipoLabel,
        p.idade !== null ? `${p.idade} anos` : undefined,
        p.sexo ?? undefined,
        p.plano ?? undefined,
      ]
        .filter(Boolean)
        .join(' · ')
}

export { RISCO_META, IMPACTO_META, INTERVENCAO_META }
