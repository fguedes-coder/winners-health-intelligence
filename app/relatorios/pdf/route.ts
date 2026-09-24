import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { requireAuthApi } from '@/lib/auth/require-user'
import { getDashboardData, getPainel } from '@/lib/queries'
import { getWinnersDataset } from '@/lib/winners-data-server'
import { gerarAnaliseExecutiva } from '@/lib/analise-ia'
import { gerarAnaliseWinnersDecide } from '@/lib/winners-decide-analysis'
import { resumirRadar } from '@/lib/radar-agg'
import { resumirSaudeMental } from '@/lib/saude-mental-agg'
import { criarAnonimizador, normalizarModoPrivacidade } from '@/lib/anonimizar'
import { getBeneficiaryPanorama } from '@/lib/beneficiary-panorama'
import { getRelatorioConfig } from '../actions'
import { createClient } from '@/lib/supabase/server'
import { contentDisposition, nomeRelatorio, periodoPorExtenso } from '@/lib/pdf/nome-arquivo'
import {
  gerarRelatorioPdf,
  type BaseVidasResumo,
  type MesAtendimento,
  type MiniResumoBeneficiario,
  type PontoHistorico,
} from '@/lib/pdf/relatorio-pdf'

/** Janela da série histórica de sinistralidade (padrão de mercado p/ reajuste). */
const JANELA_HISTORICO = 12

// Geração de PDF nativo (jsPDF) — requer runtime Node.js.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Permite a análise generativa (OpenAI) do módulo Winners Decide IA.
export const maxDuration = 60

/** Lê um asset local de /public e devolve um data URL base64. */
async function assetLocalDataUrl(rel: string, mime: string): Promise<string | null> {
  try {
    const buf = await readFile(path.join(process.cwd(), 'public', rel))
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch (err) {
    console.error('[v0] Falha ao ler asset do relatório:', rel, err)
    return null
  }
}

/** Baixa uma imagem remota (logo do cliente no Blob) e devolve data URL. */
async function assetRemotoDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const mime = res.headers.get('content-type') ?? 'image/png'
    // SVG não é suportado pelo jsPDF addImage; ignora com segurança.
    if (mime.includes('svg')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch (err) {
    console.error('[v0] Falha ao baixar logo do cliente:', err)
    return null
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthApi()
  if (auth instanceof NextResponse) return auth

  const sp = request.nextUrl.searchParams

  const mes = (sp.get('mes') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const modo = normalizarModoPrivacidade(sp.get('privacidade'))

  const [data, carteiraInteira, painel, config, dataset] = await Promise.all([
    getDashboardData({ mes }),
    // Sem filtro: fonte da série histórica. Mesmo cálculo do recorte, então o
    // mês de referência na série bate com o número do resto do relatório.
    getDashboardData({ mes: [] }),
    getPainel({ mes }),
    getRelatorioConfig(),
    getWinnersDataset(),
  ])
  const { eventos, faturaPorCompetencia } = dataset

  // Anonimizador compartilhado entre radar, saúde mental e top utilizadores
  // (IDs consistentes: RISCO-001 aponta para o mesmo beneficiário em todo o doc).
  const anonimizador = criarAnonimizador()
  const resumoRadar = resumirRadar(eventos, { mes, modo, anonimizador })
  const saudeMental = resumirSaudeMental(eventos, { mes, modo, anonimizador })

  const dataDoc =
    modo === 'anonimizado'
      ? {
          ...data,
          topUtilizadores: data.topUtilizadores.map((u) => ({
            ...u,
            nome: anonimizador.rotular(u.carteirinha ?? u.nome),
          })),
        }
      : data

  const competencias = data.resumoCompetencia.map((r) => r.competencia).sort()
  const competenciaInicio = competencias[0] ?? data.competenciaAtual ?? null
  const competenciaFim =
    competencias[competencias.length - 1] ?? data.competenciaAtual ?? null
  const competenciaRef = competenciaFim ?? 'período atual'

  // Série histórica até a competência de referência. Um mês isolado não diz se
  // a carteira está saudável: em 2026, ago/26 teve 23,6% e jun/26, 95%.
  const historico: PontoHistorico[] = carteiraInteira.resumoCompetencia
    .filter(
      (r) =>
        (!competenciaFim || r.competencia <= competenciaFim) &&
        faturaPorCompetencia[r.competencia] > 0,
    )
    .slice(-JANELA_HISTORICO)
    .map((r) => ({
      competencia: r.competencia,
      utilizado: r.valor,
      fatura: faturaPorCompetencia[r.competencia],
    }))

  // Competência é o mês de PAGAMENTO do evento pela operadora, não o do
  // atendimento. Sem esta nota o cliente lê "utilização de agosto" quando os
  // atendimentos pagos em agosto foram, em sua maioria, de junho.
  const mesSetAtend = new Set(mes)
  const porMesAtendimento = new Map<string, number>()
  let comData = 0
  for (const e of eventos) {
    if (mesSetAtend.size && !(e.competencia && mesSetAtend.has(e.competencia))) continue
    const m = e.dataAtendimento?.slice(0, 7)
    if (!m || !/^\d{4}-\d{2}$/.test(m)) continue
    porMesAtendimento.set(m, (porMesAtendimento.get(m) ?? 0) + 1)
    comData++
  }
  const mesesAtendimento: MesAtendimento[] = [...porMesAtendimento.entries()]
    .map(([m, n]) => ({ mes: m, pct: comData ? (n / comData) * 100 : 0 }))
    .sort((a, b) => b.pct - a.pct)

  // Composição da base de vidas da competência de referência. O KPI "vidas
  // ativas" vem da fatura; titulares/dependentes do resumo são de quem USOU o
  // plano — misturar os dois fez o relatório de ago/26 dizer "128 vidas: 63
  // titulares e 21 dependentes" (63 + 21 = 84, as vidas com utilização).
  let baseVidas: BaseVidasResumo | null = null
  if (competenciaFim) {
    const supabase = await createClient()
    const { data: vidasRows } = await supabase
      .from('beneficiario_vidas')
      .select('tipo')
      .eq('competencia', competenciaFim)
      .range(0, 9999)
    const linhas = (vidasRows ?? []) as { tipo: string | null }[]
    if (linhas.length > 0) {
      const tit = linhas.filter((l) => /^TIT/i.test(l.tipo ?? '')).length
      const dep = linhas.filter((l) => /^DEP/i.test(l.tipo ?? '')).length
      baseVidas = { competencia: competenciaFim, total: linhas.length, titulares: tit, dependentes: dep }
    }
  }

  const analise = gerarAnaliseExecutiva(dataDoc, competenciaRef, historico)

  // Análise consultiva Winners Decide IA (mesma lógica do endpoint /analyze:
  // OpenAI quando há chave, senão determinística). Sempre sobre dados anonimizados.
  //
  // O recorte por competência é obrigatório: `eventos` vem de getWinnersDataset()
  // sem filtro, e sem este recorte a IA monta o payload sobre a carteira inteira
  // e descreve números de outras competências num relatório mensal (ex.: citar
  // internações acumuladas do ano num PDF de um único mês). Mesma regra de
  // recorte usada por resumirRadar/resumirSaudeMental.
  const mesSet = new Set(mes)
  const eventosDoRecorte = mesSet.size
    ? eventos.filter((e) => e.competencia && mesSet.has(e.competencia))
    : eventos
  const analiseIA = await gerarAnaliseWinnersDecide(
    eventosDoRecorte,
    faturaPorCompetencia,
  )

  // Mini-resumos dos 3 maiores ofensores financeiros (páginas individuais).
  //
  // Prioridade, Risco Futuro e Potencial de Economia vêm da classificação
  // canônica do Radar (resumirRadar → intervencao.classificacoes), a mesma que
  // alimenta a tabela de prioritários e os gráficos de distribuição da seção.
  // Antes, esta lista reclassificava por conta própria com outros limiares e o
  // mesmo beneficiário aparecia como "Moderado" na tabela e "Alto" no card.
  // Do Panorama vem apenas o texto da recomendação.
  const anon = modo === 'anonimizado'
  const miniResumos: MiniResumoBeneficiario[] =
    resumoRadar.intervencao.topOfensores.flatMap(
      (ofensor): MiniResumoBeneficiario[] => {
        const panorama = getBeneficiaryPanorama(eventos, ofensor.carteirinha, {
          mes,
        })
        if (!panorama.encontrado) return []
        const display = anon
          ? ofensor.display
          : panorama.nome || panorama.display
        return [
          {
            display,
            riscoFuturo: ofensor.riscoFuturo,
            prioridadeNivel: ofensor.prioridadeNivel,
            prioridadeRotulo: ofensor.prioridadeRotulo,
            economia: ofensor.economia,
            participacaoPct: ofensor.participacaoPct,
            valorTotal: ofensor.valorTotal,
            resumo: panorama.analise.recomendacaoConsolidada,
          },
        ]
      },
    )

  const [shield, clienteLogo] = await Promise.all([
    assetLocalDataUrl('brand/winners-shield.png', 'image/png'),
    assetRemotoDataUrl(config.logoClienteUrl),
  ])

  const nomeDocumento = nomeRelatorio(
    config.clienteNome ?? 'Cliente',
    periodoPorExtenso(competenciaInicio, competenciaFim),
    modo !== 'anonimizado',
  )

  const pdf = gerarRelatorioPdf({
    data: dataDoc,
    painel,
    analise,
    config,
    resumoRadar,
    saudeMental,
    analiseIA,
    miniResumos,
    modo,
    competenciaInicio,
    competenciaFim,
    competenciasSelecionadas: competencias,
    historico,
    mesesAtendimento,
    baseVidas,
    tituloDocumento: nomeDocumento,
    assets: { shield, clienteLogo },
  })

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(`${nomeDocumento}.pdf`),
      'Cache-Control': 'no-store',
    },
  })
}
