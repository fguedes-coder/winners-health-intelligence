// ===========================================================================
// Agregação de risco da carteira (server-safe)
//
// Centraliza a lógica de score/faixa do Radar de Risco a partir dos eventos
// detalhados, para ser reutilizada tanto na tela do Radar quanto nos
// Relatórios e no PDF executivo. Não importa nada de client-only nem de
// Supabase — recebe os eventos já carregados e produz um resumo serializável.
// ===========================================================================

import type { EventoDetalhado } from '@/lib/queries'
import { classificarEvento, mesCurto } from '@/lib/categorias'
import {
  criarAnonimizador,
  type Anonimizador,
  type ModoPrivacidade,
} from '@/lib/anonimizar'
import {
  calcularScore,
  gerarAlertas,
  gerarPlanoAcao,
  calcularPrioridadeIntervencao,
  FAIXAS_ORDEM,
  LIMIARES,
  RISCO_META,
  INTERVENCAO_META,
  classificarImpacto,
  IMPACTO_META,
  type FaixaRisco,
  type FaixaIntervencao,
  type FatorRisco,
  type AlertaRisco,
} from '@/lib/risco'
import {
  classificarRiscoFuturoSinais,
  classificarEconomiaSinais,
  type SinaisClassificacao,
  type NivelRiscoFuturo,
  type NivelEconomia,
  type NivelPrioridade,
} from '@/lib/beneficiary-narrative'

export type TopBeneficiarioRisco = {
  carteirinha: string
  display: string
  /** Nome real cadastrado do beneficiário; null quando não há nome. */
  nome: string | null
  cliente: string | null
  plano: string | null
  eventos: number
  valorTotal: number
  score: number
  faixa: FaixaRisco
  faixaLabel: string
  faixaCor: string
  participacaoPct: number
  impactoLabel: string
  principaisFatores: string[]
}

// --- Plano de Ação Preventivo -------------------------------------------------
export type AcaoPrioritariaRow = {
  carteirinha: string
  display: string
  score: number
  faixaLabel: string
  faixaCor: string
  prioridadeLabel: string
  prioridadeCor: string
  valorTotal: number
  participacaoPct: number
  acao: string
}

export type RecomendacaoConsolidada = {
  chave: string
  icone: string
  titulo: string
  descricao: string
  frequencia: number
}

export type PlanoAcao = {
  resumoTexto: string
  beneficiariosPrioritarios: number
  contagemPrioritaria: { moderado: number; alto: number; critico: number }
  prioridadeCritica: number
  potencialImpacto: number
  exposicaoPct: number
  valorPrioritario: number
  economiaPotencial: number
  taxaEconomia: number
  acoes: AcaoPrioritariaRow[]
  recomendacoes: RecomendacaoConsolidada[]
  conclusao: string
}

// --- Intervenção: Prioridade (P1–P4), Risco Futuro e Potencial de Economia ---

// Linha da tabela de beneficiários prioritários para intervenção.
export type BeneficiarioPrioritario = {
  carteirinha: string
  display: string
  prioridadeNivel: NivelPrioridade
  prioridadeRotulo: string
  prioridadeIndice: number
  riscoFuturo: NivelRiscoFuturo
  economia: NivelEconomia
  score: number
  valorTotal: number
  participacaoPct: number
}

// Distribuição de vidas e custo por nível (P1–P4 ou Alto/Médio/Baixo).
export type DistribuicaoNivel = {
  nivel: string
  rotulo: string
  vidas: number
  pctVidas: number
  valor: number
  pctCusto: number
}

export type ResumoIntervencao = {
  // Top prioritários (ordenados por índice de prioridade e custo).
  prioritarios: BeneficiarioPrioritario[]
  // Distribuições sobre TODA a carteira.
  distribuicaoPrioridade: DistribuicaoNivel[]
  distribuicaoEconomia: DistribuicaoNivel[]
  contagemPrioridade: Record<NivelPrioridade, number>
  contagemEconomia: Record<NivelEconomia, number>
  vidasP1: number
  vidasP2: number
  vidasEconomiaAlta: number
  // Exposição financeira concentrada em P1+P2.
  valorPrioritario: number
  pctCustoPrioritario: number
  // Resumo executivo determinístico de oportunidades.
  resumoOportunidades: string
  // Top 3 ofensores por custo (para páginas individuais no PDF).
  topOfensores: { carteirinha: string; display: string; valorTotal: number }[]
}

export type ResumoRadar = {
  total: number
  emRisco: number
  contagem: Record<FaixaRisco, number>
  impactoFinanceiro: number
  valorTotalCarteira: number
  pctImpacto: number
  distribuicao: { nome: string; valor: number; cor: string }[]
  fatores: { nome: string; valor: number }[]
  evolucao: { mes: string; vidas: number }[]
  top: TopBeneficiarioRisco[]
  plano: PlanoAcao
  /** Classificação de intervenção da carteira (P1–P4, Risco Futuro, Economia). */
  intervencao: ResumoIntervencao
  /** Modo de privacidade aplicado ao gerar este resumo. */
  modo: ModoPrivacidade
  /** Mapa carteirinha-base -> identificador anônimo (vazio se nominal). */
  anonMapa: Record<string, string>
}

// Taxa conservadora de economia estimada sobre a utilização das vidas
// prioritárias, aplicada a ações preventivas e gestão de saúde.
export const TAXA_ECONOMIA_PREVENTIVA = 0.2

const ROTULOS_FATOR: Record<string, string> = {
  internacoes: 'Internações',
  reinternacao: 'Reinternações',
  prontoSocorro: 'Pronto-Socorro',
  saudeMental: 'Saúde Mental',
  procedimentos: 'Procedimentos',
  medicamentos: 'Medicamentos',
  crescimento: 'Crescimento de Custo',
  multiCategoria: 'Múltiplas Categorias',
}

// Agrega os eventos por beneficiário, calcula o score de risco e consolida o
// resumo da carteira. `mes` filtra por competência (vazio = todas).
export function resumirRadar(
  eventos: EventoDetalhado[],
  opts: {
    mes?: string[]
    topN?: number
    modo?: ModoPrivacidade
    anonimizador?: Anonimizador
  } = {},
): ResumoRadar {
  const mesSet = new Set((opts.mes ?? []).filter(Boolean))
  const topN = opts.topN ?? 10
  const modo: ModoPrivacidade = opts.modo ?? 'nominal'

  // Recorte por competência + categoria gerencial derivada.
  const filtrados = eventos
    .filter((e) => (mesSet.size ? e.competencia && mesSet.has(e.competencia) : true))
    .map((e) => ({
      ...e,
      categoria: classificarEvento({
        servicoPrincipal: e.servicoPrincipal,
        servico: e.servico,
        grupoEstatistico: e.grupoEstatistico,
        categoriaAtendimento: e.categoriaAtendimento,
        internacao: e.internacao,
        saudeMental: e.saudeMental,
      }),
    }))

  const ultimaComp = filtrados.reduce<string | null>((max, e) => {
    if (!e.competencia) return max
    return !max || e.competencia > max ? e.competencia : max
  }, null)

  type Agg = {
    ev: (typeof filtrados)[number]
    eventos: number
    valorTotal: number
    internacoes: number
    internacaoRecente: boolean
    prontoSocorro: number
    saudeMental: number
    procedimentosAltoCusto: number
    medicamentosAltoCusto: number
    altoCustoValor: number
    categorias: Set<string>
    porComp: Map<string, number>
    compsInternacao: Set<string>
  }

  const mapa = new Map<string, Agg>()
  for (const e of filtrados) {
    let a = mapa.get(e.beneficiario)
    if (!a) {
      a = {
        ev: e,
        eventos: 0,
        valorTotal: 0,
        internacoes: 0,
        internacaoRecente: false,
        prontoSocorro: 0,
        saudeMental: 0,
        procedimentosAltoCusto: 0,
        medicamentosAltoCusto: 0,
        altoCustoValor: 0,
        categorias: new Set(),
        porComp: new Map(),
        compsInternacao: new Set(),
      }
      mapa.set(e.beneficiario, a)
    }
    a.eventos++
    a.valorTotal += e.valorPago
    a.categorias.add(e.categoria)
    if (e.internacao) {
      a.internacoes++
      if (ultimaComp && e.competencia === ultimaComp) a.internacaoRecente = true
      if (e.competencia) a.compsInternacao.add(e.competencia)
    }
    if (e.categoria === 'Pronto-Socorro') a.prontoSocorro++
    if (e.categoria === 'Saúde Mental' || e.saudeMental) a.saudeMental++
    if (
      e.categoria === 'Procedimentos' &&
      e.valorPago >= LIMIARES.procedimentoAltoCusto
    ) {
      a.procedimentosAltoCusto++
      a.altoCustoValor += e.valorPago
    }
    if (
      e.categoria === 'Medicamentos' &&
      e.valorPago >= LIMIARES.medicamentoAltoCusto
    ) {
      a.medicamentosAltoCusto++
      a.altoCustoValor += e.valorPago
    }
    if (e.competencia) {
      a.porComp.set(e.competencia, (a.porComp.get(e.competencia) ?? 0) + e.valorPago)
    }
  }

  const totalVidas = mapa.size
  let somaPS = 0
  for (const a of mapa.values()) somaPS += a.prontoSocorro
  const mediaPS = totalVidas ? somaPS / totalVidas : 0

  type Calc = {
    carteirinha: string
    agg: Agg
    score: number
    faixa: FaixaRisco
    fatores: FatorRisco[]
    alertas: AlertaRisco[]
    fatoresChaves: string[]
    fatoresLabels: string[]
    numAlertas: number
    crescimentoAcelerado: boolean
  }

  const calculados: Calc[] = []
  let valorTotalCarteira = 0

  for (const [carteirinha, a] of mapa) {
    valorTotalCarteira += a.valorTotal
    const comps = [...a.porComp.entries()].sort((x, y) => x[0].localeCompare(y[0]))
    let crescimentoAcelerado = false
    if (comps.length >= 2) {
      const anterior = comps[comps.length - 2][1]
      const atual = comps[comps.length - 1][1]
      if (anterior > 0 && atual / anterior - 1 > LIMIARES.crescimentoCusto)
        crescimentoAcelerado = true
    }

    const { score, faixa, fatores } = calcularScore({
      internacoes: a.internacoes,
      reinternacao: a.internacoes >= 2,
      prontoSocorro: a.prontoSocorro,
      saudeMental: a.saudeMental,
      procedimentosAltoCusto: a.procedimentosAltoCusto,
      medicamentosAltoCusto: a.medicamentosAltoCusto,
      crescimentoAcelerado,
      categoriasDistintas: a.categorias.size,
    })

    const alertas = gerarAlertas({
      score,
      internacaoRecente: a.internacaoRecente,
      prontoSocorro: a.prontoSocorro,
      mediaProntoSocorroCarteira: mediaPS,
      crescimentoAcelerado,
      numFatores: fatores.length,
    })

    calculados.push({
      carteirinha,
      agg: a,
      score,
      faixa,
      fatores,
      alertas,
      fatoresChaves: fatores.map((f) => f.chave),
      fatoresLabels: fatores.map((f) => f.label),
      numAlertas: alertas.length,
      crescimentoAcelerado,
    })
  }

  // Anonimização (LGPD): pré-semeia os identificadores na ordem de risco, para
  // que RISCO-001 seja o beneficiário prioritário. O mesmo anonimizador é
  // reutilizado nas seções (top, plano) e pode ser compartilhado externamente.
  const anon: Anonimizador | null =
    modo === 'anonimizado' ? (opts.anonimizador ?? criarAnonimizador()) : null
  if (anon) {
    for (const c of [...calculados].sort(
      (x, y) => y.score - x.score || y.agg.valorTotal - x.agg.valorTotal,
    )) {
      anon.rotular(c.carteirinha)
    }
  }

  // Resumo da carteira
  const contagem: Record<FaixaRisco, number> = {
    baixo: 0,
    moderado: 0,
    alto: 0,
    critico: 0,
  }
  let impactoFinanceiro = 0
  const fatorMap = new Map<string, number>()

  for (const c of calculados) {
    contagem[c.faixa]++
    if (c.faixa === 'alto' || c.faixa === 'critico') {
      impactoFinanceiro += c.agg.valorTotal
    }
    for (const chave of c.fatoresChaves) {
      fatorMap.set(chave, (fatorMap.get(chave) ?? 0) + 1)
    }
  }

  // Evolução: vidas em alto/crítico com utilização em cada competência.
  const evoAcc = new Map<string, Set<string>>()
  for (const c of calculados) {
    if (c.faixa !== 'alto' && c.faixa !== 'critico') continue
    for (const comp of c.agg.porComp.keys()) {
      const set = evoAcc.get(comp) ?? new Set<string>()
      set.add(c.carteirinha)
      evoAcc.set(comp, set)
    }
  }
  const evolucao = [...evoAcc.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([comp, set]) => ({ mes: mesCurto(comp), vidas: set.size }))

  const fatores = [...fatorMap.entries()]
    .map(([chave, valor]) => ({ nome: ROTULOS_FATOR[chave] ?? chave, valor }))
    .sort((a, b) => b.valor - a.valor)

  const distribuicao = FAIXAS_ORDEM.map((f) => ({
    nome: RISCO_META[f].labelCurto,
    valor: contagem[f],
    cor: RISCO_META[f].cor,
  })).filter((d) => d.valor > 0)

  // Top beneficiários prioritários (score desc, valor desc).
  const top: TopBeneficiarioRisco[] = calculados
    .slice()
    .sort((x, y) => y.score - x.score || y.agg.valorTotal - x.agg.valorTotal)
    .slice(0, topN)
    .map((c) => {
      const participacaoPct =
        valorTotalCarteira > 0 ? (c.agg.valorTotal / valorTotalCarteira) * 100 : 0
      return {
        carteirinha: c.carteirinha,
        display: anon ? anon.rotular(c.carteirinha) : c.agg.ev.displayBeneficiario,
        nome: c.agg.ev.nome,
        cliente: c.agg.ev.apoliceCliente,
        plano: c.agg.ev.plano,
        eventos: c.agg.eventos,
        valorTotal: c.agg.valorTotal,
        score: c.score,
        faixa: c.faixa,
        faixaLabel: RISCO_META[c.faixa].labelCurto,
        faixaCor: RISCO_META[c.faixa].cor,
        participacaoPct,
        impactoLabel: IMPACTO_META[classificarImpacto(participacaoPct)].label,
        principaisFatores: c.fatoresLabels.slice(0, 3),
      }
    })

  const plano = montarPlanoAcao(
    calculados,
    valorTotalCarteira,
    {
      moderado: contagem.moderado,
      alto: contagem.alto,
      critico: contagem.critico,
      total: calculados.length,
      impactoFinanceiro,
    },
    anon,
  )

  const intervencao = montarIntervencao(calculados, valorTotalCarteira, anon)

  return {
    total: calculados.length,
    emRisco: contagem.alto + contagem.critico,
    contagem,
    impactoFinanceiro,
    valorTotalCarteira,
    pctImpacto:
      valorTotalCarteira > 0 ? (impactoFinanceiro / valorTotalCarteira) * 100 : 0,
    distribuicao,
    fatores,
    evolucao,
    top,
    plano,
    intervencao,
    modo,
    anonMapa: anon ? anon.paraRecord() : {},
  }
}

// ---------------------------------------------------------------------------
// Monta o Plano de Ação Preventivo a partir dos beneficiários calculados.
// "Prioritários" = vidas em faixa Moderado/Alto/Crítico.
// ---------------------------------------------------------------------------
type CalcMinimo = {
  carteirinha: string
  score: number
  faixa: FaixaRisco
  fatores: FatorRisco[]
  alertas: AlertaRisco[]
  agg: { valorTotal: number; ev: { displayBeneficiario: string } }
}

function montarPlanoAcao(
  calculados: CalcMinimo[],
  valorTotalCarteira: number,
  ctx: {
    moderado: number
    alto: number
    critico: number
    total: number
    impactoFinanceiro: number
  },
  anon: Anonimizador | null,
): PlanoAcao {
  const prioritarios = calculados.filter((c) => c.faixa !== 'baixo')
  const beneficiariosPrioritarios = prioritarios.length

  const valorPrioritario = prioritarios.reduce(
    (s, c) => s + c.agg.valorTotal,
    0,
  )
  const economiaPotencial = valorPrioritario * TAXA_ECONOMIA_PREVENTIVA
  const exposicaoPct = ctx.total > 0 ? (beneficiariosPrioritarios / ctx.total) * 100 : 0

  // Ordena prioritários por score/valor e monta linhas (uma por ação).
  const ordenados = prioritarios
    .slice()
    .sort((x, y) => y.score - x.score || y.agg.valorTotal - x.agg.valorTotal)

  const acoes: AcaoPrioritariaRow[] = []
  const freq = new Map<string, RecomendacaoConsolidada>()
  const criticaSet = new Set<string>()

  for (const c of ordenados) {
    const participacaoPct =
      valorTotalCarteira > 0 ? (c.agg.valorTotal / valorTotalCarteira) * 100 : 0
    const { faixa: prioridadeFaixa } = calcularPrioridadeIntervencao({
      score: c.score,
      participacaoPct,
      numAlertas: c.alertas.length,
    })
    if (prioridadeFaixa === 'critica') criticaSet.add(c.carteirinha)
    const prioridadeMeta = INTERVENCAO_META[prioridadeFaixa]
    const recs = gerarPlanoAcao({
      fatores: c.fatores,
      alertas: c.alertas,
      participacaoPct,
    })

    for (const r of recs) {
      // Linhas da tabela (limita a 12 beneficiários para legibilidade).
      if (acoes.length < 40) {
        acoes.push({
          carteirinha: c.carteirinha,
          display: anon ? anon.rotular(c.carteirinha) : c.agg.ev.displayBeneficiario,
          score: c.score,
          faixaLabel: RISCO_META[c.faixa].labelCurto,
          faixaCor: RISCO_META[c.faixa].cor,
          prioridadeLabel: prioridadeMeta.label,
          prioridadeCor: prioridadeMeta.cor,
          valorTotal: c.agg.valorTotal,
          participacaoPct,
          acao: r.titulo,
        })
      }
      // Recomendações consolidadas (frequência de cada ação no período).
      const atual = freq.get(r.chave)
      if (atual) {
        atual.frequencia++
      } else {
        freq.set(r.chave, {
          chave: r.chave,
          icone: r.icone,
          titulo: r.titulo,
          descricao: r.descricao,
          frequencia: 1,
        })
      }
    }
  }

  const recomendacoes = [...freq.values()].sort(
    (a, b) => b.frequencia - a.frequencia,
  )

  // Texto executivo automático.
  const resumoTexto =
    beneficiariosPrioritarios > 0
      ? 'Foram identificados beneficiários com risco assistencial elevado e impacto financeiro relevante na carteira. Com base nos padrões de utilização observados, recomenda-se a adoção de ações preventivas priorizadas para reduzir a probabilidade de continuidade dos custos assistenciais e melhorar a sustentabilidade do contrato.'
      : 'Não foram identificados beneficiários em faixa de risco prioritária no período. Recomenda-se manter o monitoramento preventivo de rotina da carteira.'

  const acaoDestaque = recomendacoes.slice(0, 3).map((r) => r.titulo.toLowerCase())
  const listaAcoes =
    acaoDestaque.length === 0
      ? 'acompanhamento preventivo de rotina'
      : acaoDestaque.length === 1
        ? acaoDestaque[0]
        : `${acaoDestaque.slice(0, -1).join(', ')} e ${acaoDestaque[acaoDestaque.length - 1]}`

  const conclusao =
    beneficiariosPrioritarios > 0
      ? `A análise identificou ${beneficiariosPrioritarios} beneficiário(s) em monitoramento prioritário, representando ${ctx.total > 0 ? ((ctx.impactoFinanceiro / (valorTotalCarteira || 1)) * 100).toFixed(1) : '0'}% dos custos assistenciais da carteira. Recomenda-se a implementação das ações preventivas sugeridas, com foco em ${listaAcoes}. O potencial impacto financeiro monitorado é de ${formatMoeda(ctx.impactoFinanceiro)}, com oportunidade estimada de economia de ${formatMoeda(economiaPotencial)}.`
      : 'Sem beneficiários prioritários no período. Manter acompanhamento preventivo de rotina para preservar a sustentabilidade do contrato.'

  return {
    resumoTexto,
    beneficiariosPrioritarios,
    contagemPrioritaria: {
      moderado: ctx.moderado,
      alto: ctx.alto,
      critico: ctx.critico,
    },
    prioridadeCritica: criticaSet.size,
    potencialImpacto: ctx.impactoFinanceiro,
    exposicaoPct,
    valorPrioritario,
    economiaPotencial,
    taxaEconomia: TAXA_ECONOMIA_PREVENTIVA,
    acoes,
    recomendacoes,
    conclusao,
  }
}

// ---------------------------------------------------------------------------
// Classificação de Intervenção da carteira (P1–P4, Risco Futuro, Economia)
//
// Classifica TODAS as vidas usando o mesmo núcleo determinístico da página do
// beneficiário (sinais normalizados), garantindo consistência entre o Panorama
// individual e o PDF executivo. A prioridade P1–P4 deriva do índice de urgência
// (calcularPrioridadeIntervencao); o Risco Futuro e o Potencial de Economia
// derivam dos sinais agregados por vida.
// ---------------------------------------------------------------------------

const PRIORIDADE_ROTULO: Record<NivelPrioridade, string> = {
  P1: 'Ação Imediata',
  P2: 'Alta Atenção',
  P3: 'Monitoramento',
  P4: 'Baixo Risco',
}

const NIVEIS_PRIORIDADE: NivelPrioridade[] = ['P1', 'P2', 'P3', 'P4']
const NIVEIS_ECONOMIA: NivelEconomia[] = ['Alto', 'Médio', 'Baixo']

function faixaIntervParaNivel(faixa: FaixaIntervencao): NivelPrioridade {
  return faixa === 'critica'
    ? 'P1'
    : faixa === 'alta'
      ? 'P2'
      : faixa === 'moderada'
        ? 'P3'
        : 'P4'
}

type CalcIntervencao = {
  carteirinha: string
  score: number
  numAlertas: number
  crescimentoAcelerado: boolean
  faixa: FaixaRisco
  agg: {
    valorTotal: number
    internacoes: number
    procedimentosAltoCusto: number
    medicamentosAltoCusto: number
    altoCustoValor: number
    compsInternacao: Set<string>
    ev: { displayBeneficiario: string }
  }
}

function montarIntervencao(
  calculados: CalcIntervencao[],
  valorTotalCarteira: number,
  anon: Anonimizador | null,
): ResumoIntervencao {
  type Classificada = {
    carteirinha: string
    display: string
    prioridadeNivel: NivelPrioridade
    prioridadeIndice: number
    riscoFuturo: NivelRiscoFuturo
    economia: NivelEconomia
    score: number
    valorTotal: number
    participacaoPct: number
  }

  const classificadas: Classificada[] = calculados.map((c) => {
    const participacaoPct =
      valorTotalCarteira > 0 ? (c.agg.valorTotal / valorTotalCarteira) * 100 : 0

    const prio = calcularPrioridadeIntervencao({
      score: c.score,
      participacaoPct,
      numAlertas: c.numAlertas,
    })

    const sinais: SinaisClassificacao = {
      score_risco: c.score,
      faixa_risco: RISCO_META[c.faixa].label,
      participacao_custo_carteira_pct: participacaoPct,
      internacoes: {
        total: c.agg.internacoes,
        reinternacao: c.agg.internacoes >= 2,
        competencias_com_internacao: c.agg.compsInternacao.size,
      },
      alto_custo: {
        tem_itens:
          c.agg.procedimentosAltoCusto + c.agg.medicamentosAltoCusto > 0,
        pct_do_custo:
          c.agg.valorTotal > 0
            ? (c.agg.altoCustoValor / c.agg.valorTotal) * 100
            : 0,
      },
      // A agregação da carteira não rastreia variação percentual nem
      // continuidade/prestador por vida; usa o sinal de crescimento acelerado
      // já calculado e mantém os demais neutros (classificação conservadora).
      crescimento_custo: {
        tendencia: c.crescimentoAcelerado ? 'crescente' : 'estavel',
        variacao_pct: null,
      },
      continuidade: {
        tratamento_continuo: false,
        procedimentos_multi_competencia: 0,
        prestadores_recorrentes: 0,
      },
      concentracao_prestador_top1_pct: 0,
    }

    return {
      carteirinha: c.carteirinha,
      display: anon ? anon.rotular(c.carteirinha) : c.agg.ev.displayBeneficiario,
      prioridadeNivel: faixaIntervParaNivel(prio.faixa),
      prioridadeIndice: prio.valor,
      riscoFuturo: classificarRiscoFuturoSinais(sinais).nivel,
      economia: classificarEconomiaSinais(sinais).nivel,
      score: c.score,
      valorTotal: c.agg.valorTotal,
      participacaoPct,
    }
  })

  // Contagens e valores por nível (sobre toda a carteira).
  const contagemPrioridade: Record<NivelPrioridade, number> = {
    P1: 0,
    P2: 0,
    P3: 0,
    P4: 0,
  }
  const valorPrioridade: Record<NivelPrioridade, number> = {
    P1: 0,
    P2: 0,
    P3: 0,
    P4: 0,
  }
  const contagemEconomia: Record<NivelEconomia, number> = {
    Alto: 0,
    Médio: 0,
    Baixo: 0,
  }
  const valorEconomia: Record<NivelEconomia, number> = {
    Alto: 0,
    Médio: 0,
    Baixo: 0,
  }

  for (const c of classificadas) {
    contagemPrioridade[c.prioridadeNivel]++
    valorPrioridade[c.prioridadeNivel] += c.valorTotal
    contagemEconomia[c.economia]++
    valorEconomia[c.economia] += c.valorTotal
  }

  const totalVidas = classificadas.length || 1
  const distribuicaoPrioridade: DistribuicaoNivel[] = NIVEIS_PRIORIDADE.map(
    (n) => ({
      nivel: n,
      rotulo: PRIORIDADE_ROTULO[n],
      vidas: contagemPrioridade[n],
      pctVidas: (contagemPrioridade[n] / totalVidas) * 100,
      valor: valorPrioridade[n],
      pctCusto:
        valorTotalCarteira > 0
          ? (valorPrioridade[n] / valorTotalCarteira) * 100
          : 0,
    }),
  )
  const distribuicaoEconomia: DistribuicaoNivel[] = NIVEIS_ECONOMIA.map((n) => ({
    nivel: n,
    rotulo: n,
    vidas: contagemEconomia[n],
    pctVidas: (contagemEconomia[n] / totalVidas) * 100,
    valor: valorEconomia[n],
    pctCusto:
      valorTotalCarteira > 0 ? (valorEconomia[n] / valorTotalCarteira) * 100 : 0,
  }))

  const valorPrioritario = valorPrioridade.P1 + valorPrioridade.P2
  const pctCustoPrioritario =
    valorTotalCarteira > 0 ? (valorPrioritario / valorTotalCarteira) * 100 : 0

  // Top prioritários: por índice de prioridade e, em empate, por custo.
  const prioritarios: BeneficiarioPrioritario[] = classificadas
    .slice()
    .sort(
      (x, y) =>
        y.prioridadeIndice - x.prioridadeIndice || y.valorTotal - x.valorTotal,
    )
    .slice(0, 5)
    .map((c) => ({
      carteirinha: c.carteirinha,
      display: c.display,
      prioridadeNivel: c.prioridadeNivel,
      prioridadeRotulo: PRIORIDADE_ROTULO[c.prioridadeNivel],
      prioridadeIndice: c.prioridadeIndice,
      riscoFuturo: c.riscoFuturo,
      economia: c.economia,
      score: c.score,
      valorTotal: c.valorTotal,
      participacaoPct: c.participacaoPct,
    }))

  // Top 3 ofensores por custo (páginas individuais no PDF).
  const topOfensores = classificadas
    .slice()
    .sort((x, y) => y.valorTotal - x.valorTotal)
    .slice(0, 3)
    .map((c) => ({
      carteirinha: c.carteirinha,
      display: c.display,
      valorTotal: c.valorTotal,
    }))

  const vidasP1 = contagemPrioridade.P1
  const vidasP2 = contagemPrioridade.P2
  const vidasEconomiaAlta = contagemEconomia.Alto

  const resumoOportunidades = montarResumoOportunidades({
    vidasP1,
    vidasP2,
    vidasEconomiaAlta,
    pctCustoPrioritario,
    valorPrioritario,
  })

  return {
    prioritarios,
    distribuicaoPrioridade,
    distribuicaoEconomia,
    contagemPrioridade,
    contagemEconomia,
    vidasP1,
    vidasP2,
    vidasEconomiaAlta,
    valorPrioritario,
    pctCustoPrioritario,
    resumoOportunidades,
    topOfensores,
  }
}

// Resumo executivo determinístico das oportunidades de intervenção.
function montarResumoOportunidades(d: {
  vidasP1: number
  vidasP2: number
  vidasEconomiaAlta: number
  pctCustoPrioritario: number
  valorPrioritario: number
}): string {
  const prioritarias = d.vidasP1 + d.vidasP2
  if (prioritarias === 0) {
    return 'Nenhuma vida foi classificada como prioritária para intervenção (P1 ou P2) no período. Recomenda-se manter o monitoramento preventivo de rotina da carteira.'
  }

  const partes: string[] = []
  partes.push(
    `${prioritarias} vida(s) concentram prioridade de intervenção (P1+P2), representando ${d.pctCustoPrioritario.toFixed(1)}% do custo assistencial da carteira (${formatMoeda(d.valorPrioritario)}).`,
  )
  if (d.vidasP1 > 0) {
    partes.push(
      `${d.vidasP1} exige(m) ação imediata (P1), com gestão de caso ativa para conter a exposição financeira e prevenir novas internações de alto custo.`,
    )
  }
  if (d.vidasP2 > 0) {
    partes.push(
      `${d.vidasP2} demanda(m) alta atenção (P2), com acompanhamento assistencial dirigido antes da renovação.`,
    )
  }
  if (d.vidasEconomiaAlta > 0) {
    partes.push(
      `${d.vidasEconomiaAlta} vida(s) apresentam alto potencial de economia por gestão assistencial (reinternações evitáveis, coordenação do cuidado e gestão de alto custo).`,
    )
  }
  partes.push(
    'O potencial de economia representa oportunidade de atuação, não promessa de redução: quanto maior, maior a janela de ganho com gestão preventiva.',
  )
  return partes.join(' ')
}

// Formatação monetária BRL server-safe (sem dependência de client helpers).
function formatMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}
