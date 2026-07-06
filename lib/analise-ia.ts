import 'server-only'

import type { DashboardData } from '@/lib/queries'
import { formatBRL } from '@/lib/data'

export type AnaliseExecutiva = {
  resumoExecutivo: string
  pontosAtencao: string[]
  recomendacoes: { titulo: string; descricao: string }[]
  conclusao: string
  geradoPorIA: boolean
}

// Análise executiva determinística, derivada diretamente dos indicadores da
// carteira. Gera conclusões e recomendações contextualizadas sem depender de
// serviços externos de IA, garantindo que o relatório saia sempre completo.
export function gerarAnaliseExecutiva(
  data: DashboardData,
  competencia: string,
): AnaliseExecutiva {
  const k = data.kpis
  const sin = data.evolucaoSinistralidade.at(-1)?.valor ?? null

  // ---- Pontos de atenção --------------------------------------------------
  const pontos: string[] = []

  if (sin !== null) {
    if (sin >= 100)
      pontos.push(
        `Sinistralidade de ${sin.toFixed(1)}% acima do ponto de equilíbrio (100%), indicando déficit técnico da carteira no período.`,
      )
    else if (sin >= 75)
      pontos.push(
        `Sinistralidade de ${sin.toFixed(1)}% em patamar de atenção, aproximando-se do limite de equilíbrio atuarial.`,
      )
    else
      pontos.push(
        `Sinistralidade de ${sin.toFixed(1)}% em patamar saudável no período.`,
      )
  }

  const top5 = data.topUtilizadores.slice(0, 5).reduce((s, u) => s + u.valor, 0)
  if (k.valorUtilizado > 0) {
    pontos.push(
      `Os 5 maiores utilizadores concentram ${((top5 / k.valorUtilizado) * 100).toFixed(1)}% do valor utilizado, evidenciando concentração de risco.`,
    )
  }

  if (k.internacoes > 0) {
    pontos.push(
      `Foram registradas ${k.internacoes} internações, principal vetor de custo assistencial de alta complexidade.`,
    )
  }

  const catTop = data.categoriasDetalhadas[0]
  if (catTop) {
    pontos.push(
      `A categoria "${catTop.nome}" lidera o valor utilizado, respondendo por ${catTop.pct.toFixed(1)}% do total.`,
    )
  }

  if (k.saudeMental > 0) {
    pontos.push(
      `Identificados ${k.saudeMental} eventos relacionados à saúde mental, tema de atenção crescente na gestão de benefícios.`,
    )
  }

  // Concentração etária: faixa com maior participação no valor.
  const faixaTop = [...data.faixaEtaria].sort(
    (a, b) => b.pctValor - a.pctValor,
  )[0]
  if (faixaTop && faixaTop.pctValor > 0) {
    pontos.push(
      `A faixa etária "${faixaTop.faixa}" concentra ${faixaTop.pctValor.toFixed(1)}% do valor utilizado, orientando ações de saúde direcionadas.`,
    )
  }

  // ---- Resumo executivo ---------------------------------------------------
  const partesResumo: string[] = [
    `No período de referência (${competencia}), a carteira registrou ${formatBRL(
      k.valorUtilizado,
    )} em utilização, distribuídos por ${k.eventos} eventos e ${k.vidasComUtilizacao} vidas com utilização (${k.titulares} titulares e ${k.dependentes} dependentes).`,
  ]
  if (sin !== null) {
    partesResumo.push(`A sinistralidade apurada foi de ${sin.toFixed(1)}%.`)
  }
  if (data.vidas.custoMedioVida !== null) {
    partesResumo.push(
      `O custo médio por vida ativa foi de ${formatBRL(data.vidas.custoMedioVida)}.`,
    )
  }
  if (data.vidas.taxaUtilizacao !== null) {
    partesResumo.push(
      `A taxa de utilização da carteira atingiu ${data.vidas.taxaUtilizacao.toFixed(1)}%.`,
    )
  }
  partesResumo.push(
    'Os indicadores a seguir apoiam a gestão financeira e assistencial do contrato.',
  )

  // ---- Recomendações ------------------------------------------------------
  const recomendacoes: { titulo: string; descricao: string }[] = [
    {
      titulo: 'Gestão dos maiores utilizadores',
      descricao:
        'Acompanhar de forma individualizada os beneficiários de maior custo, com programas de gestão de crônicos e navegação de cuidado para mitigar a concentração de risco.',
    },
  ]
  if (sin !== null && sin >= 75) {
    recomendacoes.push({
      titulo: 'Contenção da sinistralidade',
      descricao:
        'Revisar o desenho do plano e as ações de gestão de saúde, dado o patamar de sinistralidade próximo (ou acima) do equilíbrio, para preservar a sustentabilidade do contrato.',
    })
  } else {
    recomendacoes.push({
      titulo: 'Monitoramento da sinistralidade',
      descricao:
        'Acompanhar a evolução mensal da sinistralidade e atuar preventivamente caso a tendência se aproxime do ponto de equilíbrio.',
    })
  }
  if (k.saudeMental > 0) {
    recomendacoes.push({
      titulo: 'Programa de saúde mental',
      descricao:
        'Estruturar ou ampliar iniciativas de apoio psicológico e bem-estar, considerando o volume de eventos de saúde mental observado.',
    })
  }
  recomendacoes.push({
    titulo: 'Promoção e prevenção',
    descricao:
      'Ampliar ações de atenção primária e rastreamento para reduzir eventos de alta complexidade ao longo do tempo.',
  })

  // ---- Conclusão ----------------------------------------------------------
  const conclusao =
    sin !== null && sin >= 100
      ? 'O relatório evidencia uma carteira em déficit técnico no período. Recomenda-se priorizar as ações de gestão de saúde e a revisão das condições contratuais para restabelecer o equilíbrio financeiro.'
      : sin !== null && sin >= 75
        ? 'O relatório indica uma carteira em zona de atenção. A continuidade do monitoramento mensal e a execução das ações recomendadas são essenciais para preservar a sustentabilidade do contrato.'
        : 'O relatório consolida a posição atual da carteira. Recomenda-se a continuidade do monitoramento mensal dos indicadores e a implementação das ações de gestão de saúde para a sustentabilidade do contrato.'

  return {
    resumoExecutivo: partesResumo.join(' '),
    pontosAtencao: pontos,
    recomendacoes,
    conclusao,
    geradoPorIA: false,
  }
}
