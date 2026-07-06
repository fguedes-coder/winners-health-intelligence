'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Download, ExternalLink, ShieldCheck, X } from 'lucide-react'
import { formatBRL } from '@/lib/data'
import { ordinalPt } from '@/lib/risco'
import type { EventoDetalhado } from '@/lib/queries'
import {
  getBeneficiaryPanorama,
  RISCO_META,
  type PanoramaFiltros,
} from '@/lib/beneficiary-panorama'
import {
  BeneficiaryPanoramaSections,
  panoramaTitulo,
  panoramaSubtitulo,
  formatData,
} from '@/components/beneficiary-panorama-sections'

// Serializa os filtros ativos (+ flag de anonimização) em query string para
// abrir a página dedicada preservando o mesmo recorte do dashboard.
function montarHref(
  carteirinha: string,
  filtros: PanoramaFiltros,
  anonimizado: boolean,
): string {
  const sp = new URLSearchParams()
  const add = (chave: string, v: string | string[] | undefined) => {
    if (v === undefined) return
    for (const item of Array.isArray(v) ? v : [v]) {
      if (item) sp.append(chave, item)
    }
  }
  add('cliente', filtros.cliente)
  add('apolice', filtros.apolice)
  add('sub', filtros.sub)
  add('plano', filtros.plano)
  add('mes', filtros.mes)
  if (anonimizado) sp.set('anon', '1')
  const qs = sp.toString()
  return `/beneficiario/${encodeURIComponent(carteirinha)}${qs ? `?${qs}` : ''}`
}

export function BeneficiaryPanoramaDrawer({
  beneficiaryId,
  eventos,
  filtros = {},
  anonimizado = false,
  displayLabel,
  onClose,
}: {
  /** Identificador interno seguro do beneficiário (carteirinha). Null = fechado. */
  beneficiaryId: string | null
  eventos: EventoDetalhado[]
  filtros?: PanoramaFiltros
  /** Quando true, oculta nome/dados pessoais e usa o identificador LGPD. */
  anonimizado?: boolean
  /** Rótulo a exibir no cabeçalho (ex.: RISCO-001 ou nome). Opcional. */
  displayLabel?: string
  onClose: () => void
}) {
  const aberto = beneficiaryId !== null

  useEffect(() => {
    if (!aberto) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [aberto, onClose])

  const panorama = useMemo(
    () =>
      beneficiaryId
        ? getBeneficiaryPanorama(eventos, beneficiaryId, filtros)
        : null,
    [beneficiaryId, eventos, filtros],
  )

  if (!beneficiaryId || !panorama) return null

  const p = panorama
  const k = p.kpis
  const meta = RISCO_META[k.faixa]
  const titulo = panoramaTitulo(p, anonimizado, displayLabel)
  const subtitulo = panoramaSubtitulo(p, anonimizado)
  const href = montarHref(p.carteirinha, filtros, anonimizado)

  function exportarPanorama() {
    const linhas: string[] = []
    linhas.push('PANORAMA DO BENEFICIÁRIO')
    linhas.push('='.repeat(40))
    linhas.push(`Identificação: ${titulo}`)
    linhas.push(`Tipo: ${p.tipoLabel}`)
    if (p.plano) linhas.push(`Plano: ${p.plano}`)
    linhas.push('')
    linhas.push('INDICADORES')
    linhas.push(`- Valor utilizado: ${formatBRL(k.valorTotal)}`)
    linhas.push(`- Eventos: ${k.eventos}`)
    linhas.push(`- Score de risco: ${k.score}/100 (${meta.label})`)
    linhas.push(
      `- Participação no custo da carteira: ${k.participacaoPct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
    )
    linhas.push(
      `- Ranking de custo: ${k.ranking > 0 ? ordinalPt(k.ranking) : '—'} de ${k.totalVidas}`,
    )
    linhas.push(
      `- Internações: ${k.internacoes} | Pronto-Socorro: ${k.prontoSocorro}`,
    )
    linhas.push(
      `- Consultas: ${k.consultas} | Exames: ${k.exames} | Saúde Mental: ${k.saudeMental}`,
    )
    linhas.push('')
    linhas.push('ANÁLISE EXECUTIVA')
    linhas.push(`Padrão de utilização: ${p.analise.padraoUtilizacao}`)
    linhas.push(`Evolução de custo: ${p.analise.evolucaoCusto}`)
    linhas.push(`Risco de continuidade: ${p.analise.riscoContinuidade}`)
    linhas.push(`Recomendação: ${p.analise.recomendacaoConsolidada}`)
    linhas.push('')
    linhas.push('HISTÓRICO DE ATENDIMENTOS')
    for (const g of p.grupos) {
      linhas.push(`# ${g.grupo} — ${g.eventos} evento(s) · ${formatBRL(g.valor)}`)
      for (const a of g.atendimentos) {
        linhas.push(
          `  ${formatData(a.data, a.competencia)} | ${a.procedimento} | ${a.prestador ?? '—'} | ${formatBRL(a.valor)}`,
        )
      }
    }
    if (anonimizado) {
      linhas.push('')
      linhas.push('* Dados anonimizados conforme LGPD.')
    }
    const blob = new Blob([linhas.join('\n')], {
      type: 'text/plain;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `panorama-${titulo.replace(/[^\w-]+/g, '_')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Panorama do Beneficiário"
    >
      <button
        type="button"
        aria-label="Fechar painel"
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />

      <div className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-border bg-card shadow-2xl">
        {/* Cabeçalho */}
        <div className="sticky top-0 z-10 border-b border-border bg-card px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-primary">
                Panorama do Beneficiário
              </p>
              <p className="mt-0.5 truncate text-lg font-semibold text-foreground">
                {titulo}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitulo}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={href}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Abrir panorama completo em página dedicada"
              >
                <ExternalLink className="size-3.5" />
                Abrir completo
              </Link>
              <button
                type="button"
                onClick={exportarPanorama}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Exportar panorama"
              >
                <Download className="size-3.5" />
                Exportar
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {anonimizado && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="size-3.5 shrink-0 text-primary" />
              Dados anonimizados conforme LGPD.
            </div>
          )}
        </div>

        <div className="p-5">
          <BeneficiaryPanoramaSections p={p} anonimizado={anonimizado} />
        </div>
      </div>
    </div>
  )
}
