// Motor de Score de Risco Assistencial — Winners Health Intelligence.
//
// IMPORTANTE: este módulo NÃO produz diagnósticos médicos. Ele identifica
// PADRÕES DE UTILIZAÇÃO que sinalizam maior probabilidade de aumento de custo
// assistencial futuro (risco assistencial e financeiro), servindo à gestão
// preventiva e ao monitoramento de utilização.
//
// A implementação inicial é DETERMINÍSTICA (baseada em regras de negócio e
// pesos configuráveis). A estrutura foi desenhada para permitir a evolução
// futura para modelos preditivos / Machine Learning: as "features" de cada
// beneficiário são explícitas (ScoreInput) e os pesos são isolados em
// PESOS_RISCO, de modo que um estimador possa substituir `calcularScore` sem
// alterar a camada de dados nem a interface.

export type FaixaRisco = 'baixo' | 'moderado' | 'alto' | 'critico'

// Pesos do modelo determinístico (pontos somados ao score). Centralizados aqui
// para facilitar calibração manual hoje e substituição por coeficientes de um
// modelo treinado no futuro.
export const PESOS_RISCO = {
  internacao: 25, // por internação
  reinternacao: 40, // ocorrência de reinternação (bônus único)
  prontoSocorro: 5, // por atendimento de pronto-socorro
  saudeMental: 5, // por atendimento de saúde mental
  procedimentoAltoCusto: 20, // por procedimento de alto custo
  medicamentoAltoCusto: 15, // por medicamento de alto custo
  crescimentoCusto: 20, // crescimento acelerado de custo (bônus único)
  multiCategoria: 15, // utilização em muitas categorias (bônus único)
} as const

// Teto máximo de pontos por fator, para evitar superpontuação causada por
// eventos repetitivos (ex.: muitas idas ao pronto-socorro). Fatores sem teto
// (internação, bônus únicos) não aparecem aqui.
export const CAPS_RISCO = {
  prontoSocorro: 25,
  saudeMental: 20,
  procedimentoAltoCusto: 40,
  medicamentoAltoCusto: 30,
} as const

// Limiares de negócio usados na extração de features.
export const LIMIARES = {
  procedimentoAltoCusto: 5000, // R$ por evento de procedimento
  medicamentoAltoCusto: 2000, // R$ por evento de medicamento
  crescimentoCusto: 0.5, // +50% vs. competência anterior
  multiCategoria: 5, // mais de 5 categorias distintas
} as const

// Metadados de cada faixa (rótulo, cor semântica e intervalo do score).
export const RISCO_META: Record<
  FaixaRisco,
  {
    label: string
    labelCurto: string
    cor: string
    badge: 'success' | 'warning' | 'destructive'
    min: number
    max: number
  }
> = {
  baixo: {
    label: 'Baixo Risco',
    labelCurto: 'Baixo',
    cor: 'oklch(0.7 0.15 152)',
    badge: 'success',
    min: 0,
    max: 39,
  },
  moderado: {
    label: 'Risco Moderado',
    labelCurto: 'Moderado',
    cor: 'oklch(0.78 0.15 78)',
    badge: 'warning',
    min: 40,
    max: 69,
  },
  alto: {
    label: 'Alto Risco',
    labelCurto: 'Alto',
    cor: 'oklch(0.72 0.17 52)',
    badge: 'warning',
    min: 70,
    max: 84,
  },
  critico: {
    label: 'Risco Crítico',
    labelCurto: 'Crítico',
    cor: 'oklch(0.62 0.2 25)',
    badge: 'destructive',
    min: 85,
    max: 100,
  },
}

export const FAIXAS_ORDEM: FaixaRisco[] = ['baixo', 'moderado', 'alto', 'critico']

// ---------------------------------------------------------------------------
// Impacto financeiro na carteira (participação % no custo total)
// ---------------------------------------------------------------------------
export type FaixaImpacto = 'baixo' | 'moderado' | 'alto' | 'critico'

export const IMPACTO_META: Record<
  FaixaImpacto,
  { label: string; cor: string; badge: 'success' | 'warning' | 'destructive' }
> = {
  baixo: { label: 'Baixo Impacto', cor: 'oklch(0.7 0.15 152)', badge: 'success' },
  moderado: {
    label: 'Impacto Moderado',
    cor: 'oklch(0.78 0.15 78)',
    badge: 'warning',
  },
  alto: { label: 'Alto Impacto', cor: 'oklch(0.72 0.17 52)', badge: 'warning' },
  critico: {
    label: 'Impacto Crítico',
    cor: 'oklch(0.62 0.2 25)',
    badge: 'destructive',
  },
}

// Classifica a faixa de impacto pela participação no custo total da carteira.
// Regras: até 1% baixo · 1–3% moderado · 3–5% alto · acima de 5% crítico.
export function classificarImpacto(participacaoPct: number): FaixaImpacto {
  if (participacaoPct > 5) return 'critico'
  if (participacaoPct > 3) return 'alto'
  if (participacaoPct > 1) return 'moderado'
  return 'baixo'
}

// Sufixo ordinal em português para o ranking (1º, 2º, 3º...).
export function ordinalPt(posicao: number): string {
  return `${posicao}º`
}

export type FatorRisco = {
  chave: string
  label: string
  pontos: number
}

// Features do beneficiário — entrada do modelo. Mantidas explícitas e numéricas
// para servirem diretamente a um estimador de ML no futuro.
export type ScoreInput = {
  internacoes: number
  reinternacao: boolean
  prontoSocorro: number
  saudeMental: number
  procedimentosAltoCusto: number
  medicamentosAltoCusto: number
  crescimentoAcelerado: boolean
  categoriasDistintas: number
}

export type ScoreResultado = {
  score: number
  faixa: FaixaRisco
  fatores: FatorRisco[]
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// Classifica um score (0-100) na faixa de risco correspondente.
export function classificarRisco(score: number): FaixaRisco {
  if (score >= RISCO_META.critico.min) return 'critico'
  if (score >= RISCO_META.alto.min) return 'alto'
  if (score >= RISCO_META.moderado.min) return 'moderado'
  return 'baixo'
}

// Calcula o score determinístico a partir das features. Retorna também a
// decomposição por fator (explicabilidade), ordenada da maior contribuição
// para a menor.
export function calcularScore(input: ScoreInput): ScoreResultado {
  const fatores: FatorRisco[] = []
  const add = (chave: string, label: string, pontos: number) => {
    if (pontos > 0) fatores.push({ chave, label, pontos })
  }

  add('internacoes', 'Internações', input.internacoes * PESOS_RISCO.internacao)
  add(
    'reinternacao',
    'Reinternação',
    input.reinternacao ? PESOS_RISCO.reinternacao : 0,
  )
  add(
    'prontoSocorro',
    'Pronto-Socorro',
    Math.min(
      input.prontoSocorro * PESOS_RISCO.prontoSocorro,
      CAPS_RISCO.prontoSocorro,
    ),
  )
  add(
    'saudeMental',
    'Saúde Mental',
    Math.min(input.saudeMental * PESOS_RISCO.saudeMental, CAPS_RISCO.saudeMental),
  )
  add(
    'procedimentos',
    'Procedimentos de Alto Custo',
    Math.min(
      input.procedimentosAltoCusto * PESOS_RISCO.procedimentoAltoCusto,
      CAPS_RISCO.procedimentoAltoCusto,
    ),
  )
  add(
    'medicamentos',
    'Medicamentos de Alto Custo',
    Math.min(
      input.medicamentosAltoCusto * PESOS_RISCO.medicamentoAltoCusto,
      CAPS_RISCO.medicamentoAltoCusto,
    ),
  )
  add(
    'crescimento',
    'Crescimento de Utilização',
    input.crescimentoAcelerado ? PESOS_RISCO.crescimentoCusto : 0,
  )
  add(
    'multiCategoria',
    'Utilização em Múltiplas Categorias',
    input.categoriasDistintas > LIMIARES.multiCategoria
      ? PESOS_RISCO.multiCategoria
      : 0,
  )

  const bruto = fatores.reduce((s, f) => s + f.pontos, 0)
  const score = Math.round(clamp(bruto, 0, 100))
  fatores.sort((a, b) => b.pontos - a.pontos)

  return { score, faixa: classificarRisco(score), fatores }
}

export type AlertaRisco = {
  chave: string
  titulo: string
  descricao: string
  severidade: 'info' | 'atencao' | 'critico'
}

// Gera alertas automáticos com linguagem de risco assistencial / gestão
// preventiva (nunca diagnóstica).
export function gerarAlertas(params: {
  score: number
  internacaoRecente: boolean
  prontoSocorro: number
  mediaProntoSocorroCarteira: number
  crescimentoAcelerado: boolean
  numFatores: number
}): AlertaRisco[] {
  const alertas: AlertaRisco[] = []

  if (params.internacaoRecente) {
    alertas.push({
      chave: 'internacao-recente',
      titulo: 'Internação Recente',
      descricao:
        'Beneficiário apresentou internação na competência mais recente do período analisado.',
      severidade: 'critico',
    })
  }

  if (
    params.prontoSocorro >= 2 &&
    params.prontoSocorro > params.mediaProntoSocorroCarteira
  ) {
    alertas.push({
      chave: 'ps-excessivo',
      titulo: 'Uso Excessivo de Pronto-Socorro',
      descricao:
        'Frequência de pronto-socorro acima da média da carteira, indicando possível uso evitável.',
      severidade: 'atencao',
    })
  }

  if (params.crescimentoAcelerado) {
    alertas.push({
      chave: 'crescimento-custos',
      titulo: 'Crescimento Acelerado de Custos',
      descricao:
        'Utilização financeira cresceu de forma significativa em relação ao período anterior.',
      severidade: 'atencao',
    })
  }

  if (params.numFatores >= 3) {
    alertas.push({
      chave: 'alta-complexidade',
      titulo: 'Alta Complexidade',
      descricao:
        'Combinação de múltiplos fatores de risco assistencial no período.',
      severidade: 'atencao',
    })
  }

  if (params.score >= RISCO_META.critico.min) {
    alertas.push({
      chave: 'risco-elevado',
      titulo: 'Risco Assistencial Elevado',
      descricao:
        'Score de risco acima de 85. Recomenda-se monitoramento preventivo prioritário.',
      severidade: 'critico',
    })
  }

  return alertas
}

// Gera um resumo executivo automático em linguagem de gestão preventiva,
// narrando o padrão de utilização predominante em vez de listar pontos brutos.
export function gerarInsightExecutivo(params: {
  faixa: FaixaRisco
  fatores: FatorRisco[]
  alertas: AlertaRisco[]
}): string {
  if (params.faixa === 'baixo') {
    return 'Utilização dentro do padrão esperado para a carteira, sem sinais relevantes de risco assistencial no período. Recomenda-se manter o acompanhamento de rotina.'
  }

  const chaves = new Set(params.fatores.map((f) => f.chave))
  const predominante = params.fatores[0]?.chave ?? ''

  // Descreve o padrão de utilização com base no fator predominante.
  const internacaoFator = params.fatores.find((f) => f.chave === 'internacoes')
  const multiplasInternacoes = internacaoFator
    ? internacaoFator.pontos >= PESOS_RISCO.internacao * 2
    : false

  const PADRAO: Record<string, string> = {
    internacoes: `utilização predominantemente hospitalar, com ${
      multiplasInternacoes ? 'múltiplas internações' : 'internação'
    } no período`,
    reinternacao: `utilização predominantemente hospitalar, com ${
      multiplasInternacoes ? 'múltiplas internações' : 'internação'
    } no período`,
    prontoSocorro:
      'utilização concentrada em pronto-socorro, com recorrência de atendimentos de urgência',
    saudeMental:
      'utilização concentrada em saúde mental, com atendimentos recorrentes no período',
    procedimentos: 'utilização marcada por procedimentos de alto custo',
    medicamentos: 'utilização puxada por terapias medicamentosas de alto custo',
    crescimento: 'aceleração relevante da utilização em relação ao ciclo anterior',
    multiCategoria: 'utilização dispersa em múltiplas frentes assistenciais',
  }

  let padrao = PADRAO[predominante] ?? 'utilização acima do padrão da carteira'

  // Reinternação reforça o padrão hospitalar quando presente.
  if (chaves.has('reinternacao')) {
    padrao += ' e evidência de reinternação'
  }

  // Avaliação de risco e perspectiva de continuidade de custos.
  const avaliacao =
    params.faixa === 'critico'
      ? 'O padrão observado sugere risco assistencial crítico e forte potencial de continuidade de custos nos próximos ciclos, recomendando gestão de caso imediata.'
      : params.faixa === 'alto'
        ? 'O padrão observado sugere elevado risco assistencial e potencial continuidade de custos nos próximos ciclos, recomendando monitoramento preventivo prioritário.'
        : 'O padrão observado sugere risco assistencial moderado, recomendando acompanhamento preventivo e monitoramento da evolução da utilização.'

  return `Beneficiário apresentou ${padrao}. ${avaliacao}`
}

// ===========================================================================
// Plano de Ação Recomendado — motor de apoio à decisão
// ===========================================================================
export type Prioridade = 'alta' | 'media' | 'baixa'

export const PRIORIDADE_META: Record<
  Prioridade,
  { label: string; cor: string; badge: 'success' | 'warning' | 'destructive' }
> = {
  alta: { label: 'Alta', cor: 'oklch(0.62 0.2 25)', badge: 'destructive' },
  media: { label: 'Média', cor: 'oklch(0.78 0.15 78)', badge: 'warning' },
  baixa: { label: 'Baixa', cor: 'oklch(0.7 0.15 152)', badge: 'success' },
}

// A ordem controla a apresentação (alta → baixa).
export const PRIORIDADE_ORDEM: Record<Prioridade, number> = {
  alta: 0,
  media: 1,
  baixa: 2,
}

export type Recomendacao = {
  chave: string
  icone: string // chave do ícone lucide, resolvida na UI
  titulo: string
  descricao: string
  prioridade: Prioridade
}

// Gera recomendações preventivas com base nos fatores e alertas detectados.
export function gerarPlanoAcao(params: {
  fatores: FatorRisco[]
  alertas: AlertaRisco[]
  participacaoPct: number
}): Recomendacao[] {
  const fatorChaves = new Set(params.fatores.map((f) => f.chave))
  const alertaChaves = new Set(params.alertas.map((a) => a.chave))
  const recs: Recomendacao[] = []

  // Internação recente → monitoramento pós-alta
  if (alertaChaves.has('internacao-recente') || fatorChaves.has('internacoes')) {
    recs.push({
      chave: 'pos-alta',
      icone: 'heart-pulse',
      titulo: 'Monitoramento Pós-Alta',
      descricao:
        'Recomenda-se acompanhamento pós-alta hospitalar para reduzir risco de reinternação e continuidade de custos assistenciais.',
      prioridade: 'alta',
    })
  }

  // Reinternação → gestão de caso
  if (fatorChaves.has('reinternacao')) {
    recs.push({
      chave: 'gestao-caso',
      icone: 'refresh',
      titulo: 'Gestão de Caso',
      descricao:
        'Beneficiário apresenta padrão de reinternação. Recomenda-se avaliação individualizada e acompanhamento ativo.',
      prioridade: 'alta',
    })
  }

  // Uso recorrente de pronto-socorro → direcionamento assistencial
  if (fatorChaves.has('prontoSocorro') || alertaChaves.has('ps-excessivo')) {
    recs.push({
      chave: 'direcionamento',
      icone: 'route',
      titulo: 'Direcionamento Assistencial',
      descricao:
        'Avaliar necessidade de acompanhamento ambulatorial para reduzir utilização recorrente de pronto-socorro.',
      prioridade: 'media',
    })
  }

  // Saúde mental → programa de suporte
  if (fatorChaves.has('saudeMental')) {
    recs.push({
      chave: 'saude-mental',
      icone: 'brain',
      titulo: 'Programa de Saúde Mental',
      descricao:
        'Avaliar inclusão em programas de suporte emocional e acompanhamento psicológico preventivo.',
      prioridade: 'media',
    })
  }

  // Procedimentos de alto custo → revisão assistencial
  if (fatorChaves.has('procedimentos')) {
    recs.push({
      chave: 'revisao',
      icone: 'clipboard',
      titulo: 'Revisão Assistencial',
      descricao:
        'Monitorar continuidade do tratamento e possíveis eventos futuros relacionados.',
      prioridade: 'media',
    })
  }

  // Medicamentos de alto custo → gestão terapêutica
  if (fatorChaves.has('medicamentos')) {
    recs.push({
      chave: 'gestao-terapeutica',
      icone: 'pill',
      titulo: 'Gestão Terapêutica',
      descricao:
        'Acompanhar adesão terapêutica e evolução clínica para evitar agravamentos.',
      prioridade: 'media',
    })
  }

  // Crescimento acelerado de custos → monitoramento intensivo
  if (fatorChaves.has('crescimento') || alertaChaves.has('crescimento-custos')) {
    recs.push({
      chave: 'monitoramento-intensivo',
      icone: 'trending-up',
      titulo: 'Monitoramento Intensivo',
      descricao:
        'Beneficiário apresenta crescimento acelerado de utilização. Recomenda-se acompanhamento prioritário.',
      prioridade: 'alta',
    })
  }

  // Impacto financeiro crítico → acompanhamento estratégico
  if (params.participacaoPct > 5) {
    recs.push({
      chave: 'estrategico',
      icone: 'target',
      titulo: 'Acompanhamento Estratégico',
      descricao:
        'Beneficiário possui impacto financeiro relevante na carteira e deve ser priorizado em ações preventivas.',
      prioridade: 'alta',
    })
  }

  recs.sort(
    (a, b) => PRIORIDADE_ORDEM[a.prioridade] - PRIORIDADE_ORDEM[b.prioridade],
  )
  return recs
}

// ---------------------------------------------------------------------------
// Prioridade de Intervenção — indicador consolidado de urgência de ação
// ---------------------------------------------------------------------------
export type FaixaIntervencao = 'baixa' | 'moderada' | 'alta' | 'critica'

export const INTERVENCAO_META: Record<
  FaixaIntervencao,
  { label: string; cor: string }
> = {
  baixa: { label: 'Baixa', cor: 'oklch(0.7 0.15 152)' },
  moderada: { label: 'Moderada', cor: 'oklch(0.78 0.15 78)' },
  alta: { label: 'Alta', cor: 'oklch(0.72 0.17 52)' },
  critica: { label: 'Crítica', cor: 'oklch(0.62 0.2 25)' },
}

// Combina risco assistencial (60%), impacto financeiro (25%) e número de
// alertas (15%) num índice 0-100 de urgência de intervenção.
export function calcularPrioridadeIntervencao(params: {
  score: number
  participacaoPct: number
  numAlertas: number
}): { valor: number; faixa: FaixaIntervencao } {
  const compRisco = clamp(params.score, 0, 100)
  const compFinanceiro = (clamp(params.participacaoPct, 0, 10) / 10) * 100
  const compAlertas = (clamp(params.numAlertas, 0, 4) / 4) * 100

  const valor = Math.round(
    0.6 * compRisco + 0.25 * compFinanceiro + 0.15 * compAlertas,
  )

  const faixa: FaixaIntervencao =
    valor >= 80
      ? 'critica'
      : valor >= 60
        ? 'alta'
        : valor >= 35
          ? 'moderada'
          : 'baixa'

  return { valor, faixa }
}

// Consolida faixa de risco, padrão de utilização, impacto e principais ações
// numa recomendação executiva única.
export function gerarRecomendacaoConsolidada(params: {
  faixa: FaixaRisco
  recomendacoes: Recomendacao[]
  participacaoPct: number
}): string {
  const meta = RISCO_META[params.faixa]
  const acoes = params.recomendacoes.slice(0, 3).map((r) => r.titulo.toLowerCase())

  const impacto =
    params.participacaoPct > 5
      ? ' e alta concentração de custos na carteira'
      : params.participacaoPct > 3
        ? ' e concentração relevante de custos na carteira'
        : ''

  const listaAcoes =
    acoes.length === 0
      ? 'acompanhamento preventivo de rotina'
      : acoes.length === 1
        ? acoes[0]
        : `${acoes.slice(0, -1).join(', ')} e ${acoes[acoes.length - 1]}`

  return `Beneficiário apresenta ${meta.label.toLowerCase()}${impacto}. Recomenda-se ${listaAcoes} como frentes prioritárias de intervenção.`
}
