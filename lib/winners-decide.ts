// ===========================================================================
// Winners Decide IA — camada de inteligência consultiva (server-safe)
//
// Consolida os dados já existentes da plataforma (utilização, risco,
// sinistralidade e base de vidas) numa análise executiva determinística,
// reutilizando o motor de risco (`resumirRadar`). Produz:
//   - Cards principais da carteira
//   - Insights automáticos (com severidade e recomendação)
//   - Previsões por tendência histórica (3 meses)
//   - Plano de ação priorizado
//   - Payload anonimizado (LGPD) para envio à OpenAI
//
// Não importa client-only nem Supabase — recebe os eventos já carregados.
// ===========================================================================

import type { EventoDetalhado } from '@/lib/queries'
import { classificarEvento, mesCurto, formatCompetencia } from '@/lib/categorias'
import { resumirRadar, type ResumoRadar } from '@/lib/radar-agg'

export type WinnersFiltros = {
  cliente: string
  apolice: string
  sub: string
  plano: string
  competenciaInicial: string
  competenciaFinal: string
}

export const FILTROS_VAZIOS: WinnersFiltros = {
  cliente: '',
  apolice: '',
  sub: '',
  plano: '',
  competenciaInicial: '',
  competenciaFinal: '',
}

export type Severidade = 'baixo' | 'moderado' | 'alto' | 'critico'

export const SEVERIDADE_META: Record<
  Severidade,
  { label: string; cor: string }
> = {
  baixo: { label: 'Baixo', cor: 'oklch(0.7 0.15 152)' },
  moderado: { label: 'Moderado', cor: 'oklch(0.78 0.15 78)' },
  alto: { label: 'Alto', cor: 'oklch(0.72 0.17 52)' },
  critico: { label: 'Crítico', cor: 'oklch(0.62 0.2 25)' },
}

export type Prioridade = 'alta' | 'media' | 'baixa'

export type WinnersCards = {
  vidasAnalisadas: number
  sinistralidadeAtual: number | null
  vidasRiscoCritico: number
  impactoFinanceiro: number
  tendenciaProjetada: number // variação % projetada de custo (próximo ciclo)
  nivelAlerta: Severidade
}

export type WinnersInsight = {
  chave: string
  titulo: string
  descricao: string
  severidade: Severidade
  recomendacao: string
  metrica: string
}

export type SeriePonto = { mes: string; competencia: string; valor: number }
export type ProjecaoPonto = { mes: string; valor: number }
export type Cenarios = { otimista: number; provavel: number; critico: number }

export type WinnersPrevisoes = {
  sinistralidade: {
    disponivel: boolean
    historico: SeriePonto[]
    projecao: ProjecaoPonto[]
    cenarios: Cenarios
  }
  vidasCriticas: {
    historico: { mes: string; valor: number }[]
    projecao: ProjecaoPonto[]
  }
  custoAssistencial: {
    historico: SeriePonto[]
    projecao: ProjecaoPonto[]
    tendenciaPct: number
  }
  impactoFinanceiroPotencial: number
  reajusteEstimado: { min: number; max: number }
}

export type WinnersAcao = {
  chave: string
  titulo: string
  prioridade: Prioridade
  impacto: string
  prazo: string
  responsavel: string
  justificativa: string
}

export type WinnersAnalise = {
  cards: WinnersCards
  insights: WinnersInsight[]
  previsoes: WinnersPrevisoes
  planoAcao: WinnersAcao[]
  distribuicaoRisco: { nome: string; valor: number; cor: string }[]
  evolucaoCusto: SeriePonto[]
  evolucaoVidasCriticas: { mes: string; valor: number }[]
  totalCarteira: number
  periodo: { inicio: string | null; fim: string | null }
  temDados: boolean
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function formatMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

// Regressão linear simples (mínimos quadrados) sobre y[i] em x = índice.
// Retorna coeficientes para projeção: valor(x) = intercepto + inclinacao * x.
function regressaoLinear(y: number[]): { intercepto: number; inclinacao: number } {
  const n = y.length
  if (n === 0) return { intercepto: 0, inclinacao: 0 }
  if (n === 1) return { intercepto: y[0], inclinacao: 0 }
  let somaX = 0
  let somaY = 0
  let somaXY = 0
  let somaXX = 0
  for (let i = 0; i < n; i++) {
    somaX += i
    somaY += y[i]
    somaXY += i * y[i]
    somaXX += i * i
  }
  const denom = n * somaXX - somaX * somaX
  const inclinacao = denom === 0 ? 0 : (n * somaXY - somaX * somaY) / denom
  const intercepto = (somaY - inclinacao * somaX) / n
  return { intercepto, inclinacao }
}

// Projeta `passos` valores futuros a partir de uma série histórica.
// Usa apenas a janela recente (até 4 competências) na regressão para capturar
// a trajetória atual — séries de saúde são curtas e voláteis, e uma regressão
// sobre todo o histórico é facilmente distorcida por outliers antigos (ex.:
// picos de custo em meses iniciais), o que produziria projeções irreais.
function projetarSerie(y: number[], passos: number): number[] {
  if (y.length === 0) return Array.from({ length: passos }, () => 0)
  const janela = Math.min(4, y.length)
  const recente = y.slice(-janela)
  const { intercepto, inclinacao } = regressaoLinear(recente)
  const ultimoIndice = recente.length - 1
  return Array.from(
    { length: passos },
    (_, i) => intercepto + inclinacao * (ultimoIndice + 1 + i),
  )
}

// Gera rótulos de competência para os próximos `qtd` meses após `competencia`.
function proximasCompetencias(competencia: string, qtd: number): string[] {
  const out: string[] = []
  const [anoStr, mesStr] = competencia.split('-')
  let ano = Number(anoStr)
  let mes = Number(mesStr)
  for (let i = 0; i < qtd; i++) {
    mes++
    if (mes > 12) {
      mes = 1
      ano++
    }
    out.push(`${ano}-${String(mes).padStart(2, '0')}`)
  }
  return out
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// ---------------------------------------------------------------------------
// Filtragem dos eventos conforme os filtros selecionados
// ---------------------------------------------------------------------------
export function filtrarEventos(
  eventos: EventoDetalhado[],
  f: WinnersFiltros,
): EventoDetalhado[] {
  const ini = f.competenciaInicial || ''
  const fim = f.competenciaFinal || ''
  return eventos.filter((e) => {
    if (f.cliente && e.apoliceCliente !== f.cliente) return false
    if (f.apolice && e.apoliceNumero !== f.apolice) return false
    if (f.sub && e.subCodigo !== f.sub) return false
    if (f.plano && e.plano !== f.plano) return false
    if (ini && (!e.competencia || e.competencia < ini)) return false
    if (fim && (!e.competencia || e.competencia > fim)) return false
    return true
  })
}

// ===========================================================================
// Análise principal (determinística, baseada nos dados reais da plataforma)
// ===========================================================================
export function analisarCarteira(
  eventos: EventoDetalhado[],
  filtros: WinnersFiltros,
  faturaPorCompetencia: Record<string, number>,
): WinnersAnalise {
  const filtrados = filtrarEventos(eventos, filtros)

  const resumo: ResumoRadar = resumirRadar(filtrados, { topN: 20 })

  // Série de custo (utilização) por competência + sinistralidade quando há fatura.
  const custoPorComp = new Map<string, number>()
  for (const e of filtrados) {
    if (!e.competencia) continue
    custoPorComp.set(e.competencia, (custoPorComp.get(e.competencia) ?? 0) + e.valorPago)
  }
  const competencias = [...custoPorComp.keys()].sort()

  const evolucaoCusto: SeriePonto[] = competencias.map((c) => ({
    competencia: c,
    mes: mesCurto(c),
    valor: custoPorComp.get(c) ?? 0,
  }))

  const serieSinistralidade: SeriePonto[] = competencias
    .map((c) => {
      const fatura = faturaPorCompetencia[c] ?? 0
      return {
        competencia: c,
        mes: mesCurto(c),
        valor: fatura > 0 ? Number((((custoPorComp.get(c) ?? 0) / fatura) * 100).toFixed(1)) : 0,
        temFatura: fatura > 0,
      }
    })
    .filter((s) => s.temFatura)
    .map(({ temFatura: _t, ...rest }) => rest)

  const sinistralidadeDisponivel = serieSinistralidade.length > 0
  const sinistralidadeAtual = sinistralidadeDisponivel
    ? serieSinistralidade[serieSinistralidade.length - 1].valor
    : null

  // ---- Projeções por tendência (regressão linear) -------------------------
  const ultimaComp = competencias[competencias.length - 1] ?? ''
  const futuras = ultimaComp ? proximasCompetencias(ultimaComp, 3) : []

  // Custo assistencial
  const custosY = evolucaoCusto.map((p) => p.valor)
  const custoFuturo = projetarSerie(custosY, 3)
  const projCusto: ProjecaoPonto[] = futuras.map((c, i) => ({
    mes: mesCurto(c),
    valor: Math.max(0, Math.round(custoFuturo[i])),
  }))
  // Compara a projeção com a média recente (janela de até 3 meses) em vez do
  // último mês isolado, reduzindo o efeito de um único mês atípico. O
  // percentual é limitado a uma faixa plausível para não exibir variações
  // irreais em séries curtas.
  const janelaCusto = Math.min(3, custosY.length)
  const custoBase =
    janelaCusto > 0
      ? custosY.slice(-janelaCusto).reduce((a, b) => a + b, 0) / janelaCusto
      : 0
  const custoProjimo = projCusto[0]?.valor ?? custoBase
  const tendenciaCustoPct =
    custoBase > 0
      ? Number(clamp((custoProjimo / custoBase - 1) * 100, -60, 120).toFixed(1))
      : 0

  // Sinistralidade
  const sinistY = serieSinistralidade.map((p) => p.valor)
  const sinistFuturo = projetarSerie(sinistY, 3)
  const projSinist: ProjecaoPonto[] = futuras.map((c, i) => ({
    mes: mesCurto(c),
    valor: Number(clamp(sinistFuturo[i], 0, 300).toFixed(1)),
  }))
  const sinistProvavel = projSinist[projSinist.length - 1]?.valor ?? (sinistralidadeAtual ?? 0)
  const cenariosSinist: Cenarios = {
    otimista: Number((sinistProvavel * 0.9).toFixed(1)),
    provavel: Number(sinistProvavel.toFixed(1)),
    critico: Number((sinistProvavel * 1.15).toFixed(1)),
  }

  // Vidas críticas (alto + crítico) por competência — reaproveita a evolução do radar.
  const evolucaoVidasCriticas = resumo.evolucao.map((e) => ({ mes: e.mes, valor: e.vidas }))
  const vidasY = evolucaoVidasCriticas.map((p) => p.valor)
  const vidasFuturo = projetarSerie(vidasY, 3)
  const projVidas: ProjecaoPonto[] = futuras.map((c, i) => ({
    mes: mesCurto(c),
    valor: Math.max(0, Math.round(vidasFuturo[i])),
  }))

  // Reajuste estimado: pressão a partir da sinistralidade projetada vs. meta (70%).
  const META_SINISTRALIDADE = 70
  const baseSinist = sinistralidadeDisponivel ? cenariosSinist.provavel : 0
  let reajusteMin = 0
  let reajusteMax = 0
  if (baseSinist > META_SINISTRALIDADE) {
    const pressao = (baseSinist / META_SINISTRALIDADE - 1) * 100
    reajusteMin = Number((pressao * 0.6).toFixed(1))
    reajusteMax = Number((pressao * 1.1).toFixed(1))
  }

  // ---- Nível geral de alerta ----------------------------------------------
  const pctCritico = resumo.total > 0 ? (resumo.contagem.critico / resumo.total) * 100 : 0
  const nivelAlerta = calcularNivelAlerta({
    pctImpacto: resumo.pctImpacto,
    pctCritico,
    tendenciaCustoPct,
    sinistralidade: sinistralidadeAtual,
  })

  const cards: WinnersCards = {
    vidasAnalisadas: resumo.total,
    sinistralidadeAtual,
    vidasRiscoCritico: resumo.contagem.critico,
    impactoFinanceiro: resumo.impactoFinanceiro,
    tendenciaProjetada: tendenciaCustoPct,
    nivelAlerta,
  }

  const insights = gerarInsights(filtrados, resumo, {
    evolucaoCusto,
    serieSinistralidade,
    evolucaoVidasCriticas,
  })

  const previsoes: WinnersPrevisoes = {
    sinistralidade: {
      disponivel: sinistralidadeDisponivel,
      historico: serieSinistralidade,
      projecao: projSinist,
      cenarios: cenariosSinist,
    },
    vidasCriticas: {
      historico: evolucaoVidasCriticas,
      projecao: projVidas,
    },
    custoAssistencial: {
      historico: evolucaoCusto,
      projecao: projCusto,
      tendenciaPct: tendenciaCustoPct,
    },
    impactoFinanceiroPotencial: resumo.impactoFinanceiro,
    reajusteEstimado: { min: reajusteMin, max: reajusteMax },
  }

  const planoAcao = gerarPlanoAcaoIA(insights, resumo)

  return {
    cards,
    insights,
    previsoes,
    planoAcao,
    distribuicaoRisco: resumo.distribuicao,
    evolucaoCusto,
    evolucaoVidasCriticas,
    totalCarteira: resumo.valorTotalCarteira,
    periodo: {
      inicio: competencias[0] ?? null,
      fim: ultimaComp || null,
    },
    temDados: filtrados.length > 0,
  }
}

function calcularNivelAlerta(params: {
  pctImpacto: number
  pctCritico: number
  tendenciaCustoPct: number
  sinistralidade: number | null
}): Severidade {
  let pontos = 0
  if (params.pctImpacto > 40) pontos += 3
  else if (params.pctImpacto > 25) pontos += 2
  else if (params.pctImpacto > 15) pontos += 1

  if (params.pctCritico > 8) pontos += 3
  else if (params.pctCritico > 4) pontos += 2
  else if (params.pctCritico > 1) pontos += 1

  if (params.tendenciaCustoPct > 15) pontos += 2
  else if (params.tendenciaCustoPct > 5) pontos += 1

  if (params.sinistralidade !== null) {
    if (params.sinistralidade > 90) pontos += 2
    else if (params.sinistralidade > 75) pontos += 1
  }

  if (pontos >= 7) return 'critico'
  if (pontos >= 4) return 'alto'
  if (pontos >= 2) return 'moderado'
  return 'baixo'
}

// ---------------------------------------------------------------------------
// Insights automáticos — comparam a última competência com a anterior.
// ---------------------------------------------------------------------------
function variacaoPct(atual: number, anterior: number): number | null {
  if (anterior <= 0) return null
  return Number((((atual / anterior) - 1) * 100).toFixed(1))
}

function severidadePorVariacao(v: number | null): Severidade {
  if (v === null) return 'baixo'
  if (v >= 40) return 'critico'
  if (v >= 20) return 'alto'
  if (v >= 8) return 'moderado'
  return 'baixo'
}

function gerarInsights(
  eventos: (EventoDetalhado & { categoria?: string })[],
  resumo: ResumoRadar,
  series: {
    evolucaoCusto: SeriePonto[]
    serieSinistralidade: SeriePonto[]
    evolucaoVidasCriticas: { mes: string; valor: number }[]
  },
): WinnersInsight[] {
  const insights: WinnersInsight[] = []

  // Agregação por competência das categorias relevantes.
  type CompAgg = {
    prontoSocorro: number
    internacoes: number
    saudeMental: number
  }
  const porComp = new Map<string, CompAgg>()
  const internacoesPorBenef = new Map<string, number>()
  for (const e of eventos) {
    const cat = classificarEvento({
      servicoPrincipal: e.servicoPrincipal,
      servico: e.servico,
      grupoEstatistico: e.grupoEstatistico,
      categoriaAtendimento: e.categoriaAtendimento,
      internacao: e.internacao,
      saudeMental: e.saudeMental,
    })
    if (e.competencia) {
      const a = porComp.get(e.competencia) ?? { prontoSocorro: 0, internacoes: 0, saudeMental: 0 }
      if (cat === 'Pronto-Socorro') a.prontoSocorro++
      if (e.internacao) a.internacoes++
      if (cat === 'Saúde Mental' || e.saudeMental) a.saudeMental++
      porComp.set(e.competencia, a)
    }
    if (e.internacao) {
      internacoesPorBenef.set(e.beneficiario, (internacoesPorBenef.get(e.beneficiario) ?? 0) + 1)
    }
  }
  const comps = [...porComp.keys()].sort()
  const ultima = comps[comps.length - 1]
  const penultima = comps[comps.length - 2]
  const aggUlt = ultima ? porComp.get(ultima)! : { prontoSocorro: 0, internacoes: 0, saudeMental: 0 }
  const aggPen = penultima ? porComp.get(penultima)! : null

  // 1. Pronto-socorro
  if (aggPen) {
    const v = variacaoPct(aggUlt.prontoSocorro, aggPen.prontoSocorro)
    insights.push({
      chave: 'pronto-socorro',
      titulo: 'Utilização de Pronto-Socorro',
      descricao:
        v !== null && v > 0
          ? `Os atendimentos de pronto-socorro cresceram ${v}% na última competência, indicando possível uso evitável de urgência.`
          : 'Os atendimentos de pronto-socorro permaneceram estáveis ou em queda na última competência.',
      severidade: severidadePorVariacao(v),
      recomendacao:
        'Orientar beneficiários sobre a rede ambulatorial e telemedicina para reduzir a procura evitável por pronto-socorro.',
      metrica: `${aggUlt.prontoSocorro} atendimentos${v !== null ? ` (${v > 0 ? '+' : ''}${v}%)` : ''}`,
    })
  }

  // 2. Crescimento de custo
  const custos = series.evolucaoCusto
  if (custos.length >= 2) {
    const v = variacaoPct(custos[custos.length - 1].valor, custos[custos.length - 2].valor)
    insights.push({
      chave: 'crescimento-custo',
      titulo: 'Crescimento de Custo Assistencial',
      descricao:
        v !== null && v > 0
          ? `O custo assistencial cresceu ${v}% em relação à competência anterior, pressionando o resultado da carteira.`
          : 'O custo assistencial manteve-se controlado em relação à competência anterior.',
      severidade: severidadePorVariacao(v),
      recomendacao:
        'Monitorar os maiores ofensores de custo e avaliar ações preventivas nas vidas de maior utilização.',
      metrica: `${formatMoeda(custos[custos.length - 1].valor)}${v !== null ? ` (${v > 0 ? '+' : ''}${v}%)` : ''}`,
    })
  }

  // 3. Internações
  if (aggPen) {
    const v = variacaoPct(aggUlt.internacoes, aggPen.internacoes)
    insights.push({
      chave: 'internacoes',
      titulo: 'Internações Hospitalares',
      descricao:
        v !== null && v > 0
          ? `As internações aumentaram ${v}% na última competência, elevando o risco de continuidade de custos hospitalares.`
          : 'As internações permaneceram estáveis ou em queda na última competência.',
      severidade: severidadePorVariacao(v),
      recomendacao:
        'Implementar monitoramento pós-alta para reduzir a probabilidade de reinternação e complicações.',
      metrica: `${aggUlt.internacoes} internações${v !== null ? ` (${v > 0 ? '+' : ''}${v}%)` : ''}`,
    })
  }

  // 4. Reinternações
  const reinternados = [...internacoesPorBenef.values()].filter((n) => n >= 2).length
  insights.push({
    chave: 'reinternacoes',
    titulo: 'Reinternações',
    descricao:
      reinternados > 0
        ? `${reinternados} beneficiário(s) apresentaram duas ou mais internações no período, sinalizando casos de maior complexidade.`
        : 'Não foram identificados padrões relevantes de reinternação no período.',
    severidade: reinternados >= 5 ? 'alto' : reinternados > 0 ? 'moderado' : 'baixo',
    recomendacao:
      'Ativar gestão de caso individualizada para beneficiários com reinternações recorrentes.',
    metrica: `${reinternados} beneficiário(s)`,
  })

  // 5. Saúde mental
  if (aggPen) {
    const v = variacaoPct(aggUlt.saudeMental, aggPen.saudeMental)
    insights.push({
      chave: 'saude-mental',
      titulo: 'Saúde Mental',
      descricao:
        v !== null && v > 0
          ? `Os atendimentos de saúde mental cresceram ${v}% na última competência.`
          : 'Os atendimentos de saúde mental permaneceram estáveis no período.',
      severidade: severidadePorVariacao(v),
      recomendacao:
        'Avaliar programas de suporte emocional e acompanhamento psicológico preventivo para a carteira.',
      metrica: `${aggUlt.saudeMental} atendimentos${v !== null ? ` (${v > 0 ? '+' : ''}${v}%)` : ''}`,
    })
  }

  // 6. Concentração de custo em poucas vidas
  const topN = Math.max(1, Math.ceil(resumo.total * 0.05))
  const topConcentracao = resumo.top.slice(0, topN).reduce((s, b) => s + b.valorTotal, 0)
  const pctConcentracao =
    resumo.valorTotalCarteira > 0
      ? Number(((topConcentracao / resumo.valorTotalCarteira) * 100).toFixed(1))
      : 0
  insights.push({
    chave: 'concentracao-custo',
    titulo: 'Concentração de Custo',
    descricao: `Os ${topN} beneficiário(s) de maior utilização concentram ${pctConcentracao}% do custo assistencial total da carteira.`,
    severidade: pctConcentracao > 50 ? 'critico' : pctConcentracao > 35 ? 'alto' : pctConcentracao > 20 ? 'moderado' : 'baixo',
    recomendacao:
      'Priorizar acompanhamento estratégico das vidas de alto custo para conter a continuidade da utilização.',
    metrica: `${pctConcentracao}% em ${topN} vida(s)`,
  })

  // 7. Evolução de vidas críticas
  const evc = series.evolucaoVidasCriticas
  if (evc.length >= 2) {
    const v = variacaoPct(evc[evc.length - 1].valor, evc[evc.length - 2].valor)
    insights.push({
      chave: 'vidas-criticas',
      titulo: 'Evolução de Vidas Críticas',
      descricao:
        v !== null && v > 0
          ? `O número de vidas em alto/crítico risco cresceu ${v}% na última competência.`
          : 'O número de vidas em alto/crítico risco manteve-se estável ou em queda.',
      severidade: severidadePorVariacao(v),
      recomendacao:
        'Reforçar a gestão preventiva das vidas em risco elevado antes da escalada de custos.',
      metrica: `${evc[evc.length - 1].valor} vida(s)${v !== null ? ` (${v > 0 ? '+' : ''}${v}%)` : ''}`,
    })
  }

  // 8. Variação da sinistralidade
  const ss = series.serieSinistralidade
  if (ss.length >= 2) {
    const v = variacaoPct(ss[ss.length - 1].valor, ss[ss.length - 2].valor)
    const atual = ss[ss.length - 1].valor
    insights.push({
      chave: 'sinistralidade',
      titulo: 'Variação da Sinistralidade',
      descricao:
        v !== null && v > 0
          ? `A sinistralidade subiu para ${atual}% (${v > 0 ? '+' : ''}${v} p.p. de tendência), aproximando-se de faixas de pressão sobre o reajuste.`
          : `A sinistralidade encontra-se em ${atual}%, com tendência estável ou de queda no período.`,
      severidade: atual > 90 ? 'critico' : atual > 75 ? 'alto' : atual > 60 ? 'moderado' : 'baixo',
      recomendacao:
        'Preparar argumentação técnica de renovação e ações de contenção para preservar a sustentabilidade do contrato.',
      metrica: `${atual}%`,
    })
  }

  // Ordena por severidade (crítico → baixo).
  const ordem: Record<Severidade, number> = { critico: 0, alto: 1, moderado: 2, baixo: 3 }
  insights.sort((a, b) => ordem[a.severidade] - ordem[b.severidade])
  return insights
}

// ---------------------------------------------------------------------------
// Plano de ação priorizado — deriva ações práticas dos insights e do risco.
// ---------------------------------------------------------------------------
function gerarPlanoAcaoIA(insights: WinnersInsight[], resumo: ResumoRadar): WinnersAcao[] {
  const sev = new Map(insights.map((i) => [i.chave, i.severidade]))
  const acoes: WinnersAcao[] = []
  const alta = (c: string) => sev.get(c) === 'alto' || sev.get(c) === 'critico'

  if (resumo.contagem.critico > 0 || resumo.contagem.alto > 0) {
    acoes.push({
      chave: 'monitorar-criticos',
      titulo: 'Monitorar vidas críticas',
      prioridade: 'alta',
      impacto: 'Alto — contenção direta de custos e prevenção de agravamentos',
      prazo: 'Imediato (até 15 dias)',
      responsavel: 'Gestor de Saúde / Corretora',
      justificativa: `${resumo.contagem.alto + resumo.contagem.critico} vida(s) em alto/crítico risco concentram o maior potencial de custo assistencial futuro.`,
    })
  }

  acoes.push({
    chave: 'revisar-ps',
    titulo: 'Revisar utilização recorrente de pronto-socorro',
    prioridade: alta('pronto-socorro') ? 'alta' : 'media',
    impacto: 'Médio — redução de custos evitáveis de urgência',
    prazo: 'Curto prazo (30 dias)',
    responsavel: 'RH / Gestor de Saúde',
    justificativa:
      'Uso frequente de pronto-socorro indica oportunidade de direcionamento para a rede ambulatorial e telemedicina.',
  })

  if (alta('saude-mental') || sev.get('saude-mental') === 'moderado') {
    acoes.push({
      chave: 'saude-mental',
      titulo: 'Avaliar ações de saúde mental',
      prioridade: alta('saude-mental') ? 'alta' : 'media',
      impacto: 'Médio — bem-estar e redução de afastamentos e utilização',
      prazo: 'Curto prazo (30–60 dias)',
      responsavel: 'RH',
      justificativa:
        'A demanda por saúde mental sinaliza necessidade de programas de suporte emocional preventivo.',
    })
  }

  acoes.push({
    chave: 'telemedicina',
    titulo: 'Sugerir telemedicina',
    prioridade: 'media',
    impacto: 'Médio — ampliação de acesso e redução de custo por atendimento',
    prazo: 'Curto prazo (30 dias)',
    responsavel: 'RH / Corretora',
    justificativa:
      'A telemedicina amplia o acesso à atenção primária e reduz a procura por atendimentos presenciais evitáveis.',
  })

  acoes.push({
    chave: 'gestao-cronicos',
    titulo: 'Sugerir gestão de crônicos',
    prioridade: alta('internacoes') || alta('reinternacoes') ? 'alta' : 'media',
    impacto: 'Alto — controle de condições que puxam internações e alto custo',
    prazo: 'Médio prazo (60–90 dias)',
    responsavel: 'Gestor de Saúde',
    justificativa:
      'Programas de gestão de crônicos reduzem internações e a continuidade de custos assistenciais elevados.',
  })

  if (alta('internacoes') || alta('reinternacoes')) {
    acoes.push({
      chave: 'segunda-opiniao',
      titulo: 'Sugerir segunda opinião médica',
      prioridade: 'media',
      impacto: 'Médio — adequação assistencial em casos de alta complexidade',
      prazo: 'Médio prazo (60 dias)',
      responsavel: 'Gestor de Saúde',
      justificativa:
        'Casos de internação/reinternação recorrente se beneficiam de segunda opinião para adequação da conduta.',
    })
  }

  acoes.push({
    chave: 'renovacao',
    titulo: 'Preparar argumentação para renovação',
    prioridade: alta('sinistralidade') ? 'alta' : 'media',
    impacto: 'Alto — sustentabilidade do contrato e previsibilidade de reajuste',
    prazo: 'Antes da renovação (90 dias)',
    responsavel: 'Corretora / Financeiro',
    justificativa:
      'Documentar a evolução de sinistralidade, ações preventivas e resultados fortalece a negociação de reajuste.',
  })

  const ordem: Record<Prioridade, number> = { alta: 0, media: 1, baixa: 2 }
  acoes.sort((a, b) => ordem[a.prioridade] - ordem[b.prioridade])
  return acoes
}

// ===========================================================================
// Payload anonimizado (LGPD) para a OpenAI + prompt do sistema
// ===========================================================================
export const PROMPT_SISTEMA = `Você é o Winners Decide IA, consultor sênior da Winners Health Intelligence, especialista em saúde corporativa, sinistralidade, gestão de risco assistencial, utilização de planos de saúde empresariais e renovação de contratos corporativos.

Seu papel não é resumir números. Seu papel é interpretar os dados e gerar valor executivo para RH, Financeiro, Diretoria e Corretores.

Você não deve repetir indicadores já exibidos nos cards da plataforma.

Seu objetivo é responder:
- O que está acontecendo.
- Por que está acontecendo.
- O que pode acontecer.
- Qual o impacto para o cliente.
- Qual ação deve ser tomada.

REGRAS OBRIGATÓRIAS
1. Não repita indicadores já exibidos na tela.
2. Não apenas descreva números; explique o significado deles.
3. Explique os motivos prováveis dos resultados encontrados.
4. Identifique os principais ofensores e fatores que mais impactam a carteira.
5. Destaque riscos futuros e tendências relevantes.
6. Aponte oportunidades de economia e otimização de custos.
7. Sugira ações práticas e objetivas para RH, Financeiro e Gestão de Benefícios.
8. Priorize recomendações que possam reduzir sinistralidade e pressão de reajuste.
9. Não faça diagnósticos médicos.
10. Não invente informações que não estejam presentes nos dados enviados.
11. Sempre destaque os três fatores mais relevantes da análise.
12. Evite listar indicadores sem interpretação.
13. Priorize insights sobre números.
14. Toda conclusão relevante deve citar a evidência utilizada — o número, percentual ou campo do payload que a sustenta (ex.: "internações concentram 83,3% do custo", "custo total de R$ X", "N vidas em risco crítico"). Não faça afirmações sem apoiá-las em dados presentes no payload.

FREQUÊNCIA NÃO É IMPACTO FINANCEIRO
- Nunca conclua que um fator é o principal impacto financeiro apenas pela quantidade de ocorrências.
- Diferencie explicitamente frequência de utilização (quantas vezes um evento ocorre) de impacto financeiro (quanto custa).
- Um evento mais frequente nem sempre representa o maior custo; um evento raro pode concentrar a maior despesa.
- Ao apontar o principal ofensor de custo, baseie-se sempre em: custo associado, impacto financeiro potencial, concentração de despesas e os ofensores de maior custo — não na contagem de ocorrências.
- Use o campo "custo_por_categoria" (ordenado por custo) para identificar impacto financeiro; use "principais_fatores_risco" (ocorrências) apenas para descrever frequência de utilização.
- Quando houver divergência entre o fator mais frequente e o de maior custo, explicite essa diferença ao cliente.

DIMENSÕES DISPONÍVEIS NO PAYLOAD (sempre diferencie ao analisar)
Cada categoria em "custo_por_categoria" traz cinco dimensões distintas — trate-as separadamente:
1. Frequência de utilização → campo "ocorrencias".
2. Custo associado → campo "custo".
3. Percentual do custo total → campo "pct_custo".
4. Concentração em poucos beneficiários → campos "beneficiarios" e "custo_medio_por_beneficiario", além do bloco "concentracao_despesas" (top 1%, top 5% e top 10 vidas sobre o custo total).
5. Impacto financeiro potencial → campo "impacto_financeiro_potencial".
Nunca trate frequência como se fosse custo, nem custo como se fosse concentração. Quando um custo elevado estiver concentrado em poucas vidas (alto custo_medio_por_beneficiario ou alto top_1pct_vidas_pct_custo), destaque isso como risco de concentração.

SAÚDE MENTAL
- Use o bloco "saude_mental" para comentar saúde mental: "pct_custo" (participação no custo assistencial), "tendencia_pct" (variação de custo vs. competência anterior), "beneficiarios" e "utilizacoes".
- Sempre cite o percentual do custo e a tendência (ex.: "A saúde mental representa X% do custo assistencial monitorado e apresenta tendência de crescimento, exigindo atenção preventiva").
- Trate saúde mental como frente PREVENTIVA. Nunca faça diagnóstico clínico nem inferência de gravidade individual — é indicador de utilização.

ESTRUTURA OBRIGATÓRIA DA RESPOSTA

1. Leitura Executiva
Explique o que mais chama atenção na carteira e por quê.

2. Principais Causas
Explique os fatores que estão impulsionando os resultados observados.

3. Riscos e Tendências
Explique o que pode acontecer se o cenário atual continuar.

4. Oportunidades de Economia
Mostre onde existe potencial de redução de custos ou ganho de eficiência.

5. Recomendações Prioritárias
Liste as 3 ações mais importantes para serem executadas imediatamente.

6. Mensagem para Diretoria
Finalize com uma conclusão executiva de alto nível, como se estivesse apresentando a análise para um CEO, CFO ou Diretor de RH.

ESTILO DE RESPOSTA
- Linguagem consultiva, estratégica e objetiva.
- Evite listas excessivas de números.
- Priorize interpretação, impacto financeiro e tomada de decisão.
- Seja direto, executivo e acionável.
- Responda como uma consultoria especializada em saúde corporativa.
- Ancore cada conclusão em evidência: sempre que afirmar algo relevante, cite o dado que o comprova (percentual, valor em R$, contagem ou tendência) entre a interpretação.
- Use markdown com títulos (##) para cada seção da estrutura obrigatória.`

export type PayloadIA = {
  cliente: string
  periodo: string
  vidas_analisadas: number
  sinistralidade: number | null
  utilizacao_total: number
  custo_total: number
  vidas_risco_baixo: number
  vidas_risco_moderado: number
  vidas_risco_alto: number
  vidas_risco_critico: number
  impacto_financeiro_potencial: number
  principais_fatores_risco: { fator: string; ocorrencias: number }[]
  // Custo por categoria (ordenado por custo desc) — distingue impacto
  // financeiro de frequência de utilização e concentração em poucas vidas.
  custo_por_categoria: {
    categoria: string
    custo: number
    ocorrencias: number
    pct_custo: number
    beneficiarios: number
    custo_medio_por_beneficiario: number
  }[]
  // Concentração de despesas: quanto do custo total está em poucas vidas.
  concentracao_despesas: {
    vidas_com_custo: number
    top_10_vidas_pct_custo: number
    top_1pct_vidas_pct_custo: number
    top_5pct_vidas_pct_custo: number
  }
  evolucao_mensal: { mes: string; custo: number; sinistralidade: number | null; vidas_criticas: number }[]
  maiores_ofensores_anonimizados: { id: string; custo: number; score: number; faixa: string; principais_fatores: string[] }[]
  indicadores_saude_mental: number
  // Bloco dedicado de Saúde Mental — % do custo assistencial, tendência de
  // custo entre competências, beneficiários monitorados e utilizações.
  saude_mental: {
    utilizacoes: number
    beneficiarios: number
    custo: number
    pct_custo: number
    tendencia_pct: number | null
  }
  internacoes: number
  reinternacoes: number
  pronto_socorro: number
  crescimento_custo_pct: number
  tendencia_sinistralidade_projetada: number | null
  reajuste_estimado_pct: { min: number; max: number }
}

// Monta o payload agregado e anonimizado enviado à OpenAI. Usa o resumo do
// radar em modo anonimizado (RISCO-001, RISCO-002, ...) para os ofensores.
export function montarPayloadIA(
  eventos: EventoDetalhado[],
  filtros: WinnersFiltros,
  faturaPorCompetencia: Record<string, number>,
): PayloadIA {
  const filtrados = filtrarEventos(eventos, filtros)
  const analise = analisarCarteira(eventos, filtros, faturaPorCompetencia)
  const resumoAnon = resumirRadar(filtrados, { topN: 10, modo: 'anonimizado' })

  // Totais de utilização por categoria (para os campos agregados).
  let saudeMental = 0
  let internacoes = 0
  let prontoSocorro = 0
  const internacoesPorBenef = new Map<string, number>()
  // Acumula custo, ocorrências e beneficiários únicos por categoria para
  // diferenciar impacto financeiro (custo) de frequência (ocorrências) e
  // medir a concentração em poucas vidas.
  const porCategoria = new Map<string, { custo: number; ocorrencias: number; benef: Set<string> }>()
  // Custo total por beneficiário (para medir concentração de despesas).
  const custoPorBenef = new Map<string, number>()
  // Saúde Mental: custo por competência (tendência) e beneficiários monitorados.
  const smCustoPorComp = new Map<string, number>()
  const smBenef = new Set<string>()
  for (const e of filtrados) {
    const cat = classificarEvento({
      servicoPrincipal: e.servicoPrincipal,
      servico: e.servico,
      grupoEstatistico: e.grupoEstatistico,
      categoriaAtendimento: e.categoriaAtendimento,
      internacao: e.internacao,
      saudeMental: e.saudeMental,
    })
    const acc = porCategoria.get(cat) ?? { custo: 0, ocorrencias: 0, benef: new Set<string>() }
    acc.custo += e.valorPago
    acc.ocorrencias += 1
    acc.benef.add(e.beneficiario)
    porCategoria.set(cat, acc)
    custoPorBenef.set(e.beneficiario, (custoPorBenef.get(e.beneficiario) ?? 0) + e.valorPago)
    if (cat === 'Saúde Mental' || e.saudeMental) saudeMental++
    if (cat === 'Saúde Mental') {
      smBenef.add(e.beneficiario)
      if (e.competencia) {
        smCustoPorComp.set(
          e.competencia,
          (smCustoPorComp.get(e.competencia) ?? 0) + e.valorPago,
        )
      }
    }
    if (cat === 'Pronto-Socorro') prontoSocorro++
    if (e.internacao) {
      internacoes++
      internacoesPorBenef.set(e.beneficiario, (internacoesPorBenef.get(e.beneficiario) ?? 0) + 1)
    }
  }
  const reinternacoes = [...internacoesPorBenef.values()].filter((n) => n >= 2).length

  // Custo por categoria ordenado por custo (não por frequência). Inclui as
  // 5 dimensões: frequência (ocorrencias), custo, % do custo total,
  // beneficiários envolvidos e custo médio por beneficiário.
  const custoTotalCategorias = [...porCategoria.values()].reduce((s, c) => s + c.custo, 0)
  const custoPorCategoria = [...porCategoria.entries()]
    .map(([categoria, v]) => ({
      categoria,
      custo: Math.round(v.custo),
      ocorrencias: v.ocorrencias,
      pct_custo: custoTotalCategorias > 0 ? Math.round((v.custo / custoTotalCategorias) * 1000) / 10 : 0,
      beneficiarios: v.benef.size,
      custo_medio_por_beneficiario: v.benef.size > 0 ? Math.round(v.custo / v.benef.size) : 0,
    }))
    .sort((a, b) => b.custo - a.custo)

  // Concentração de despesas: quanto do custo total está em poucas vidas.
  const custosBenefOrdenados = [...custoPorBenef.values()].sort((a, b) => b - a)
  const totalVidasComCusto = custosBenefOrdenados.length
  const somaTop = (n: number) =>
    custosBenefOrdenados.slice(0, n).reduce((s, v) => s + v, 0)
  const pctDoTotal = (v: number) =>
    custoTotalCategorias > 0 ? Math.round((v / custoTotalCategorias) * 1000) / 10 : 0
  const nTop1pct = Math.max(1, Math.round(totalVidasComCusto * 0.01))
  const nTop5pct = Math.max(1, Math.round(totalVidasComCusto * 0.05))
  const concentracaoDespesas = {
    vidas_com_custo: totalVidasComCusto,
    top_10_vidas_pct_custo: pctDoTotal(somaTop(10)),
    top_1pct_vidas_pct_custo: pctDoTotal(somaTop(nTop1pct)),
    top_5pct_vidas_pct_custo: pctDoTotal(somaTop(nTop5pct)),
  }

  // Bloco de Saúde Mental: participação no custo e tendência entre competências.
  const smCat = porCategoria.get('Saúde Mental')
  const smComps = [...smCustoPorComp.keys()].sort()
  const smUlt = smComps.length ? smCustoPorComp.get(smComps[smComps.length - 1])! : undefined
  const smPen = smComps.length >= 2 ? smCustoPorComp.get(smComps[smComps.length - 2])! : undefined
  const saudeMentalBloco = {
    utilizacoes: smCat?.ocorrencias ?? 0,
    beneficiarios: smBenef.size,
    custo: Math.round(smCat?.custo ?? 0),
    pct_custo:
      custoTotalCategorias > 0 && smCat
        ? Math.round((smCat.custo / custoTotalCategorias) * 1000) / 10
        : 0,
    tendencia_pct:
      smUlt !== undefined && smPen !== undefined && smPen > 0
        ? Math.round(((smUlt - smPen) / smPen) * 1000) / 10
        : null,
  }

  const periodo =
    analise.periodo.inicio && analise.periodo.fim
      ? analise.periodo.inicio === analise.periodo.fim
        ? formatCompetencia(analise.periodo.inicio)
        : `${formatCompetencia(analise.periodo.inicio)} a ${formatCompetencia(analise.periodo.fim)}`
      : 'Período não informado'

  return {
    cliente: filtros.cliente || 'Carteira consolidada (todos os clientes)',
    periodo,
    vidas_analisadas: resumoAnon.total,
    sinistralidade: analise.cards.sinistralidadeAtual,
    utilizacao_total: filtrados.length,
    custo_total: Math.round(resumoAnon.valorTotalCarteira),
    vidas_risco_baixo: resumoAnon.contagem.baixo,
    vidas_risco_moderado: resumoAnon.contagem.moderado,
    vidas_risco_alto: resumoAnon.contagem.alto,
    vidas_risco_critico: resumoAnon.contagem.critico,
    impacto_financeiro_potencial: Math.round(resumoAnon.impactoFinanceiro),
    principais_fatores_risco: resumoAnon.fatores.map((f) => ({ fator: f.nome, ocorrencias: f.valor })),
    custo_por_categoria: custoPorCategoria,
    concentracao_despesas: concentracaoDespesas,
    evolucao_mensal: analise.evolucaoCusto.map((c) => {
      const sinist = analise.previsoes.sinistralidade.historico.find((s) => s.mes === c.mes)
      const vidas = analise.evolucaoVidasCriticas.find((v) => v.mes === c.mes)
      return {
        mes: c.mes,
        custo: Math.round(c.valor),
        sinistralidade: sinist ? sinist.valor : null,
        vidas_criticas: vidas ? vidas.valor : 0,
      }
    }),
    maiores_ofensores_anonimizados: resumoAnon.top.map((b) => ({
      id: b.display, // já anonimizado (RISCO-XXX)
      custo: Math.round(b.valorTotal),
      score: b.score,
      faixa: b.faixaLabel,
      principais_fatores: b.principaisFatores,
    })),
    indicadores_saude_mental: saudeMental,
    saude_mental: saudeMentalBloco,
    internacoes,
    reinternacoes,
    pronto_socorro: prontoSocorro,
    crescimento_custo_pct: analise.previsoes.custoAssistencial.tendenciaPct,
    tendencia_sinistralidade_projetada: analise.previsoes.sinistralidade.disponivel
      ? analise.previsoes.sinistralidade.cenarios.provavel
      : null,
    reajuste_estimado_pct: analise.previsoes.reajusteEstimado,
  }
}

// ---------------------------------------------------------------------------
// Análise executiva determinística (fallback quando não há OPENAI_API_KEY).
// ---------------------------------------------------------------------------
export function gerarResumoMock(p: PayloadIA): string {
  const sinist = p.sinistralidade !== null ? `${p.sinistralidade}%` : 'não disponível (fatura não cadastrada no período)'
  const emRisco = p.vidas_risco_alto + p.vidas_risco_critico
  const fatores = p.principais_fatores_risco.slice(0, 3).map((f) => f.fator.toLowerCase())
  const listaFatores =
    fatores.length === 0
      ? 'utilização dentro do padrão'
      : fatores.length === 1
        ? fatores[0]
        : `${fatores.slice(0, -1).join(', ')} e ${fatores[fatores.length - 1]}`
  const tendencia =
    p.crescimento_custo_pct > 5
      ? `tendência de alta (${p.crescimento_custo_pct > 0 ? '+' : ''}${p.crescimento_custo_pct}% projetados para o próximo ciclo)`
      : p.crescimento_custo_pct < -5
        ? `tendência de queda (${p.crescimento_custo_pct}% projetados)`
        : 'tendência estável de custo assistencial'
  const reajuste =
    p.reajuste_estimado_pct.max > 0
      ? `A projeção indica possível pressão sobre o reajuste, em uma faixa estimada de ${p.reajuste_estimado_pct.min}% a ${p.reajuste_estimado_pct.max}%.`
      : 'Não há, no momento, pressão relevante de sinistralidade sobre o reajuste.'

  // Diferencia impacto financeiro (custo) de frequência de utilização.
  const brl = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
  const maiorCusto = p.custo_por_categoria[0]
  const maiorFrequencia = [...p.custo_por_categoria].sort((a, b) => b.ocorrencias - a.ocorrencias)[0]
  const linhaOfensorCusto = maiorCusto
    ? `O maior ofensor de custo é **${maiorCusto.categoria}**, com ${brl(maiorCusto.custo)} (${maiorCusto.pct_custo}% do custo total) em ${maiorCusto.ocorrencias} ocorrências.`
    : 'Não há concentração relevante de custo por categoria no período.'
  const linhaFrequencia =
    maiorFrequencia && maiorCusto && maiorFrequencia.categoria !== maiorCusto.categoria
      ? ` Atenção: a categoria mais **frequente** é **${maiorFrequencia.categoria}** (${maiorFrequencia.ocorrencias} ocorrências), mas ela não representa o maior custo — frequência não equivale a impacto financeiro.`
      : ''
  const c = p.concentracao_despesas
  const linhaConcentracao =
    c && c.vidas_com_custo > 0
      ? ` A despesa está concentrada: as 10 vidas de maior custo respondem por ${c.top_10_vidas_pct_custo}% do total, e o 1% mais custoso concentra ${c.top_1pct_vidas_pct_custo}% (base de ${c.vidas_com_custo} vidas com custo).`
      : ''

  const sm = p.saude_mental
  const smTend =
    sm.tendencia_pct === null
      ? 'sem base de comparação entre competências'
      : sm.tendencia_pct > 0
        ? `tendência de crescimento (${sm.tendencia_pct > 0 ? '+' : ''}${sm.tendencia_pct}% no custo vs. competência anterior)`
        : sm.tendencia_pct < 0
          ? `tendência de redução (${sm.tendencia_pct}% no custo vs. competência anterior)`
          : 'estabilidade no custo entre competências'
  const linhaSaudeMental =
    sm.utilizacoes > 0
      ? `A saúde mental representa atualmente ${sm.pct_custo}% do custo assistencial monitorado (${brl(sm.custo)} em ${sm.utilizacoes} utilizações de ${sm.beneficiarios} beneficiários) e apresenta ${smTend}${sm.tendencia_pct !== null && sm.tendencia_pct > 0 ? ', exigindo atenção preventiva' : ''}.`
      : 'Não há utilização relevante de saúde mental no período analisado.'

  return `## 1. Resumo executivo
A carteira de **${p.cliente}** (período ${p.periodo}) reúne **${p.vidas_analisadas} vidas analisadas**, com sinistralidade atual em **${sinist}** e ${tendencia}.

## 2. Principais achados
- **${emRisco} vidas** em risco alto ou crítico, das quais **${p.vidas_risco_critico}** em faixa crítica.
- Principais fatores de risco: ${listaFatores}.
- **${p.internacoes}** internações e **${p.reinternacoes}** casos de reinternação no período.
- **${p.pronto_socorro}** atendimentos de pronto-socorro e **${p.indicadores_saude_mental}** de saúde mental.
- ${linhaSaudeMental}

## 3. Riscos relevantes
A concentração de custo nos maiores ofensores e a presença de vidas em risco crítico elevam a probabilidade de continuidade de custos nos próximos ciclos.

## 4. Tendência provável
Com base na série histórica, projeta-se ${tendencia}. ${p.tendencia_sinistralidade_projetada !== null ? `A sinistralidade provável projetada é de aproximadamente ${p.tendencia_sinistralidade_projetada}%.` : ''}

## 5. Impacto financeiro
O potencial impacto financeiro monitorado (vidas em alto/crítico) é de **${brl(p.impacto_financeiro_potencial)}**, sobre um custo total de ${brl(p.custo_total)}. ${linhaOfensorCusto}${linhaFrequencia}${linhaConcentracao}

## 6. Recomendações práticas
- Monitorar prioritariamente as vidas críticas e de maior utilização.
- Reduzir uso evitável de pronto-socorro com direcionamento assistencial e telemedicina.
- Reforçar gestão de crônicos e acompanhamento pós-alta.

## 7. Plano de ação sugerido
${reajuste} Recomenda-se preparar a argumentação técnica de renovação com base na evolução observada e nas ações preventivas em curso.

 _Análise gerada de forma determinística a partir dos dados da plataforma. Configure a variável OPENAI_API_KEY para ativar a análise consultiva generativa. Esta análise não realiza diagnóstico médico._`
}

export function gerarRespostaChatMock(pergunta: string, p: PayloadIA): string {
  const emRisco = p.vidas_risco_alto + p.vidas_risco_critico
  return `Com base nos dados disponíveis da carteira **${p.cliente}** (${p.periodo}):

- Vidas analisadas: **${p.vidas_analisadas}** · em alto/crítico risco: **${emRisco}**
- Sinistralidade atual: **${p.sinistralidade !== null ? p.sinistralidade + '%' : 'não disponível'}**
- Tendência de custo projetada: **${p.crescimento_custo_pct > 0 ? '+' : ''}${p.crescimento_custo_pct}%**
- Pronto-socorro: **${p.pronto_socorro}** · Internações: **${p.internacoes}** · Saúde mental: **${p.indicadores_saude_mental}**

Sobre "${pergunta.trim()}": os indicadores acima apontam ${emRisco > 0 ? 'concentração de risco em um grupo de vidas que deve ser monitorado prioritariamente' : 'uma carteira sem concentração relevante de risco no momento'}. ${p.reajuste_estimado_pct.max > 0 ? `Há pressão estimada de reajuste entre ${p.reajuste_estimado_pct.min}% e ${p.reajuste_estimado_pct.max}%.` : 'Não há pressão relevante de reajuste no momento.'}

 _Resposta determinística baseada nos dados da plataforma. Configure a variável OPENAI_API_KEY para respostas consultivas generativas. Não constitui diagnóstico médico._`
}
