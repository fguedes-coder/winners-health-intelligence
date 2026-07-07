import 'server-only'

import type { EventoDetalhado } from '@/lib/queries'
import { classificarEvento, ehPsiquiatria } from '@/lib/categorias'
import type { Anonimizador, ModoPrivacidade } from '@/lib/anonimizar'

// ===========================================================================
// Agregação de Saúde Mental (server-safe)
//
// Consolida os eventos classificados como "Saúde Mental" para a página
// dedicada do relatório executivo: totais, separação entre atendimentos de
// psicologia e psiquiatria, participação no custo assistencial, tendência de
// custo entre competências e ranking de beneficiários (com anonimização LGPD).
// ===========================================================================

export type TopBeneficiarioSaudeMental = {
  display: string
  utilizacoes: number
  custo: number
  /** Participação percentual no custo total de saúde mental. */
  participacaoPct: number
}

export type ResumoSaudeMental = {
  /** Total de eventos (utilizações) de saúde mental no período. */
  eventos: number
  /** Beneficiários distintos monitorados. */
  beneficiarios: number
  /** Utilizações em psicologia (não psiquiátricas). */
  psicologia: number
  /** Utilizações em psiquiatria. */
  psiquiatria: number
  /** Custo total associado à saúde mental. */
  custo: number
  /** Custo assistencial total do período (base para o percentual). */
  custoAssistencialTotal: number
  /** Participação da saúde mental no custo assistencial (%). */
  pctCusto: number
  /** Variação % do custo vs. competência anterior (null se sem base). */
  tendenciaPct: number | null
  /** Ranking dos maiores utilizadores de saúde mental. */
  top: TopBeneficiarioSaudeMental[]
  /** Interpretação executiva pronta para o relatório. */
  interpretacao: string
}

type LinhaBenef = {
  carteirinha: string
  display: string
  psicologia: number
  psiquiatria: number
  total: number
  custo: number
}

export function resumirSaudeMental(
  eventos: EventoDetalhado[],
  opts: {
    mes?: string[]
    topN?: number
    modo?: ModoPrivacidade
    anonimizador?: Anonimizador
  } = {},
): ResumoSaudeMental {
  const mesSet = new Set((opts.mes ?? []).filter(Boolean))
  const modo: ModoPrivacidade = opts.modo ?? 'nominal'
  const anon = opts.anonimizador
  const topN = opts.topN ?? 10
  const dentro = (e: EventoDetalhado) =>
    mesSet.size ? Boolean(e.competencia && mesSet.has(e.competencia)) : true

  let custoAssistencialTotal = 0
  const smPorComp = new Map<string, number>()
  const map = new Map<string, LinhaBenef>()

  for (const e of eventos) {
    if (!dentro(e)) continue
    custoAssistencialTotal += e.valorPago

    const categoria = classificarEvento({
      servicoPrincipal: e.servicoPrincipal,
      servico: e.servico,
      grupoEstatistico: e.grupoEstatistico,
      categoriaAtendimento: e.categoriaAtendimento,
      internacao: e.internacao,
      saudeMental: e.saudeMental,
    })
    if (categoria !== 'Saúde Mental') continue

    if (e.competencia) {
      smPorComp.set(e.competencia, (smPorComp.get(e.competencia) ?? 0) + e.valorPago)
    }

    const key = e.beneficiario
    const cur =
      map.get(key) ??
      {
        carteirinha: key,
        display: e.displayBeneficiario,
        psicologia: 0,
        psiquiatria: 0,
        total: 0,
        custo: 0,
      }
    const texto = `${e.servicoPrincipal ?? ''} ${e.servico ?? ''}`
    if (ehPsiquiatria(texto)) cur.psiquiatria++
    else cur.psicologia++
    cur.total++
    cur.custo += e.valorPago
    map.set(key, cur)
  }

  const linhas = [...map.values()]
  const custo = linhas.reduce((s, l) => s + l.custo, 0)
  const eventosSM = linhas.reduce((s, l) => s + l.total, 0)
  const psicologia = linhas.reduce((s, l) => s + l.psicologia, 0)
  const psiquiatria = linhas.reduce((s, l) => s + l.psiquiatria, 0)
  const pctCusto =
    custoAssistencialTotal > 0 ? (custo / custoAssistencialTotal) * 100 : 0

  // Tendência: compara as duas competências mais recentes com custo de SM.
  const comps = [...smPorComp.keys()].sort()
  let tendenciaPct: number | null = null
  if (comps.length >= 2) {
    const ult = smPorComp.get(comps[comps.length - 1]) ?? 0
    const pen = smPorComp.get(comps[comps.length - 2]) ?? 0
    if (pen > 0) tendenciaPct = ((ult - pen) / pen) * 100
  }

  const top: TopBeneficiarioSaudeMental[] = linhas
    .sort((a, b) => b.custo - a.custo || b.total - a.total)
    .slice(0, topN)
    .map((l) => ({
      display:
        modo === 'anonimizado' && anon ? anon.rotular(l.carteirinha) : l.display,
      utilizacoes: l.total,
      custo: l.custo,
      participacaoPct: custo > 0 ? (l.custo / custo) * 100 : 0,
    }))

  const pctFmt = pctCusto.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  const interpretacao =
    eventosSM > 0
      ? `A utilização relacionada à saúde mental representa ${pctFmt}% do custo assistencial do período e requer monitoramento contínuo${
          tendenciaPct !== null && tendenciaPct > 5
            ? ', sobretudo diante da tendência de crescimento observada entre as competências'
            : ''
        }.`
      : 'Não há utilização relevante de saúde mental no período analisado.'

  return {
    eventos: eventosSM,
    beneficiarios: linhas.length,
    psicologia,
    psiquiatria,
    custo,
    custoAssistencialTotal,
    pctCusto,
    tendenciaPct,
    top,
    interpretacao,
  }
}
