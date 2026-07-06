import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { NextRequest } from 'next/server'

import { getDashboardData, getPainel } from '@/lib/queries'
import { getWinnersDataset } from '@/lib/winners-data-server'
import { gerarAnaliseExecutiva } from '@/lib/analise-ia'
import { gerarAnaliseWinnersDecide } from '@/lib/winners-decide-analysis'
import { resumirRadar } from '@/lib/radar-agg'
import { resumirSaudeMental } from '@/lib/saude-mental-agg'
import { criarAnonimizador, normalizarModoPrivacidade } from '@/lib/anonimizar'
import { getBeneficiaryPanorama } from '@/lib/beneficiary-panorama'
import {
  montarPayloadBeneficiario,
  classificarPrioridadeIntervencao,
  classificarPotencialEconomia,
} from '@/lib/beneficiary-narrative'
import { getRelatorioConfig } from '../actions'
import { gerarRelatorioPdf, type MiniResumoBeneficiario } from '@/lib/pdf/relatorio-pdf'

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

function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'cliente'
  )
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams

  const mes = (sp.get('mes') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const modo = normalizarModoPrivacidade(sp.get('privacidade'))

  const [data, painel, config, dataset] = await Promise.all([
    getDashboardData({ mes }),
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

  const analise = gerarAnaliseExecutiva(dataDoc, competenciaRef)

  // Análise consultiva Winners Decide IA (mesma lógica do endpoint /analyze:
  // OpenAI quando há chave, senão determinística). Sempre sobre dados anonimizados.
  const analiseIA = await gerarAnaliseWinnersDecide(eventos, faturaPorCompetencia)

  // Mini-resumos dos 3 maiores ofensores financeiros (páginas individuais).
  // Reutiliza o mesmo núcleo determinístico da página do beneficiário, para
  // que Risco Futuro, Prioridade e Economia sejam idênticos ao Panorama.
  const anon = modo === 'anonimizado'
  const miniResumos: MiniResumoBeneficiario[] = data.topUtilizadores
    .slice(0, 3)
    .flatMap((u): MiniResumoBeneficiario[] => {
      const carteirinha = u.carteirinha ?? u.nome
      const panorama = getBeneficiaryPanorama(eventos, carteirinha, { mes })
      if (!panorama.encontrado) return []
      const payload = montarPayloadBeneficiario(panorama)
      const prio = classificarPrioridadeIntervencao(
        payload,
        panorama.analise.prioridadeIntervencao,
      )
      const eco = classificarPotencialEconomia(payload)
      const display = anon
        ? anonimizador.rotular(carteirinha)
        : panorama.nome || panorama.display
      return [
        {
          display,
          riscoFuturo: payload.risco_assistencial_futuro.nivel,
          prioridadeNivel: prio.nivel,
          prioridadeRotulo: prio.rotulo,
          economia: eco.nivel,
          participacaoPct: panorama.kpis.participacaoPct,
          valorTotal: panorama.kpis.valorTotal,
          resumo: panorama.analise.recomendacaoConsolidada,
        },
      ]
    })

  const [shield, clienteLogo] = await Promise.all([
    assetLocalDataUrl('brand/winners-shield.png', 'image/png'),
    assetRemotoDataUrl(config.logoClienteUrl),
  ])

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
    assets: { shield, clienteLogo },
  })

  const cliente = slugify(config.clienteNome ?? 'cliente')
  const sufixo = modo === 'anonimizado' ? '-anonimizado' : ''
  const nomeArquivo = `relatorio-executivo-${cliente}${sufixo}.pdf`

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${nomeArquivo}"`,
      'Cache-Control': 'no-store',
    },
  })
}
