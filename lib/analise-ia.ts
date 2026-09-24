import 'server-only'

import type { DashboardData } from '@/lib/queries'
import { formatBRL } from '@/lib/data'

/** Ponto da série histórica: utilização e fatura de uma competência. */
export type PontoSerie = { competencia: string; utilizado: number; fatura: number }

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** "2026-08" → "agosto/2026". Texto de relatório não carrega data ISO. */
export function competenciaPorExtenso(c: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(c)
  return m ? `${MESES[Number(m[2]) - 1]}/${m[1]}` : c
}

/** Percentual em pt-BR com 1 casa ("23,6%"), igual aos cartões do PDF. */
function pctBR(v: number): string {
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

/** Sinistralidade acumulada da série (soma utilizado ÷ soma fatura). */
export function sinistralidadeAcumulada(serie: PontoSerie[]): number | null {
  const fat = serie.reduce((a, p) => a + p.fatura, 0)
  if (serie.length < 2 || fat <= 0) return null
  return (serie.reduce((a, p) => a + p.utilizado, 0) / fat) * 100
}

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
  historico: PontoSerie[] = [],
  opcoes: { anoContratual?: boolean } = {},
): AnaliseExecutiva {
  const k = data.kpis
  const sin = data.evolucaoSinistralidade.at(-1)?.valor ?? null
  // O acumulado da série é a medida técnica da carteira; o mês isolado oscila
  // com o calendário de pagamento da operadora. Recomendações e conclusão
  // seguem o acumulado quando há série, e o mês quando não há.
  const acumulado = sinistralidadeAcumulada(historico)
  const sinRef = acumulado ?? sin
  const janela =
    historico.length >= 2
      ? `${opcoes.anoContratual ? 'do ano contratual, ' : ''}de ${competenciaPorExtenso(historico[0].competencia)} a ${competenciaPorExtenso(historico[historico.length - 1].competencia)}`
      : null

  // ---- Pontos de atenção --------------------------------------------------
  const pontos: string[] = []

  const leitura = (v: number) =>
    v >= 100
      ? 'acima de 100%, em déficit técnico'
      : v >= 75
        ? 'acima do ponto de equilíbrio técnico (75%)'
        : v >= 70
          ? 'próxima do ponto de equilíbrio técnico (70% a 75%)'
          : 'abaixo do ponto de equilíbrio técnico'
  if (sin !== null) {
    pontos.push(
      `Sinistralidade de ${pctBR(sin)} no mês de referência, ${leitura(sin)}.`,
    )
  }
  if (acumulado !== null && janela) {
    pontos.push(
      `No acumulado ${janela} (${historico.length} competências), a sinistralidade é de ${pctBR(acumulado)}, ${leitura(acumulado)}.`,
    )
  }

  const top5 = data.topUtilizadores.slice(0, 5).reduce((s, u) => s + u.valor, 0)
  if (k.valorUtilizado > 0) {
    pontos.push(
      `Os 5 maiores utilizadores concentram ${pctBR((top5 / k.valorUtilizado) * 100)} do valor utilizado, evidenciando concentração de risco.`,
    )
  }

  if (k.internacoes > 0) {
    pontos.push(
      `Foram registradas ${k.internacoes} internações, principal vetor de custo assistencial de alta complexidade.`,
    )
  }

  // Categoria GERENCIAL, nunca a descrição do procedimento: o "serviço
  // principal" do arquivo é o nome do procedimento, e citá-lo aqui reintroduz
  // no texto exatamente o dado sensível que a camada de privacidade remove das
  // tabelas (ex.: "CURETAGEM POS-ABORTAMENTO lidera o valor utilizado").
  // "Demais Utilizações" é o balde do que não foi classificado — dizer ao
  // cliente que "outros" lidera o gasto não informa nada.
  const catTop = [...data.categoriasGerenciais]
    .filter((c) => c.nome !== 'Demais Utilizações')
    .sort((a, b) => b.valor - a.valor)[0]
  if (catTop) {
    pontos.push(
      `A categoria "${catTop.nome}" lidera o valor utilizado, respondendo por ${pctBR(catTop.pct)} do total.`,
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
      `A faixa etária "${faixaTop.faixa}" concentra ${pctBR(faixaTop.pctValor)} do valor utilizado, orientando ações de saúde direcionadas.`,
    )
  }

  // ---- Resumo executivo ---------------------------------------------------
  const partesResumo: string[] = [
    `Na competência de ${competenciaPorExtenso(competencia)} (mês de pagamento pela operadora), a carteira registrou ${formatBRL(
      k.valorUtilizado,
    )} em utilização, distribuídos por ${k.eventos} eventos e ${k.vidasComUtilizacao} vidas com utilização (${k.titulares} titulares e ${k.dependentes} dependentes).`,
  ]
  if (sin !== null) {
    partesResumo.push(`A sinistralidade apurada no mês foi de ${pctBR(sin)}.`)
    if (acumulado !== null && janela) {
      partesResumo.push(`No acumulado ${janela}, foi de ${pctBR(acumulado)}.`)
    }
  }
  if (data.vidas.custoMedioVida !== null) {
    partesResumo.push(
      `O custo médio por vida ativa foi de ${formatBRL(data.vidas.custoMedioVida)}.`,
    )
  }
  if (data.vidas.taxaUtilizacao !== null) {
    partesResumo.push(
      `A taxa de utilização da carteira atingiu ${pctBR(data.vidas.taxaUtilizacao)}.`,
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
  if (sinRef !== null && sinRef >= 75) {
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
    sinRef !== null && sinRef >= 100
      ? 'O relatório evidencia uma carteira em déficit técnico no período. Recomenda-se priorizar as ações de gestão de saúde e a revisão das condições contratuais para restabelecer o equilíbrio financeiro.'
      : sinRef !== null && sinRef >= 75
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
