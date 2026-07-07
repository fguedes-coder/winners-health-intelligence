'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, ShieldCheck, UserPlus } from 'lucide-react'
import type { TopBeneficiarioRisco } from '@/lib/radar-agg'
import type { EventoDetalhado } from '@/lib/queries'
import type { PanoramaFiltros } from '@/lib/beneficiary-panorama'
import { BeneficiaryPanoramaDrawer } from '@/components/beneficiary-panorama-drawer'

function prioridadeDe(score: number): { label: string; classe: string } {
  if (score >= 95) return { label: 'Crítica', classe: 'text-red-400' }
  if (score >= 70) return { label: 'Alta', classe: 'text-orange-400' }
  if (score >= 40) return { label: 'Moderada', classe: 'text-amber-400' }
  return { label: 'Baixa', classe: 'text-emerald-400' }
}

function formatBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

export function TopVidasTable({
  top,
  eventos = [],
  filtros = {},
}: {
  top: TopBeneficiarioRisco[]
  eventos?: EventoDetalhado[]
  filtros?: PanoramaFiltros
}) {
  // Por padrão anonimizado (LGPD). Ao clicar, revela os nomes reais.
  const [anonimizado, setAnonimizado] = useState(true)
  // Identificador interno seguro (carteirinha) do beneficiário em drill-down.
  const [selecionado, setSelecionado] = useState<string | null>(null)

  const selecionadoTop = top.find((b) => b.carteirinha === selecionado) ?? null

  return (
    <>
      <button
        type="button"
        onClick={() => setAnonimizado((v) => !v)}
        aria-pressed={anonimizado}
        title={
          anonimizado
            ? 'Clique para revelar os nomes dos beneficiários'
            : 'Clique para anonimizar novamente (LGPD)'
        }
        className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
          anonimizado
            ? 'bg-primary/10 text-primary ring-primary/20 hover:bg-primary/15'
            : 'bg-secondary text-muted-foreground ring-border hover:bg-secondary/70'
        }`}
      >
        {anonimizado ? (
          <ShieldCheck className="size-3.5" />
        ) : (
          <Eye className="size-3.5" />
        )}
        {anonimizado ? 'Anonimizado (LGPD)' : 'Nomes visíveis'}
      </button>

      {top.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma vida prioritária identificada no período.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-2 font-medium">#</th>
                <th className="pb-2 pr-3 font-medium">Identificação</th>
                <th className="pb-2 pr-3 text-right font-medium">Score</th>
                <th className="pb-2 pr-3 font-medium">Faixa</th>
                <th className="pb-2 pr-3 font-medium">Prioridade</th>
                <th className="pb-2 pr-3 text-right font-medium">
                  Valor Utilizado
                </th>
                <th className="pb-2 pr-3 text-right font-medium">% do Total</th>
                <th className="pb-2 font-medium">Principais Fatores</th>
              </tr>
            </thead>
            <tbody>
              {top.map((b, i) => {
                const prio = prioridadeDe(b.score)
                return (
                  <tr
                    key={b.carteirinha}
                    onClick={() => setSelecionado(b.carteirinha)}
                    className="cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-muted/40"
                    title="Ver Panorama do Beneficiário"
                  >
                    <td className="py-2.5 pr-2 tabular-nums text-muted-foreground">
                      {i + 1}
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-foreground">
                      {anonimizado ? (
                        b.display
                      ) : b.nome ? (
                        b.nome
                      ) : (
                        <Link
                          href={`/colaboradores?q=${encodeURIComponent(b.carteirinha)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="group inline-flex items-center gap-1.5"
                          title="Localizar e cadastrar o nome deste beneficiário"
                        >
                          <span className="font-mono text-xs text-muted-foreground group-hover:text-primary">
                            {b.carteirinha}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-500 group-hover:bg-amber-500/25">
                            <UserPlus className="size-3" />
                            sem nome
                          </span>
                        </Link>
                      )}
                    </td>
                    <td
                      className="py-2.5 pr-3 text-right font-semibold tabular-nums"
                      style={{ color: b.faixaCor }}
                    >
                      {b.score}
                    </td>
                    <td
                      className="py-2.5 pr-3 font-medium"
                      style={{ color: b.faixaCor }}
                    >
                      {b.faixaLabel}
                    </td>
                    <td className={`py-2.5 pr-3 font-medium ${prio.classe}`}>
                      {prio.label}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-foreground">
                      {formatBRL(b.valorTotal)}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                      {b.participacaoPct.toLocaleString('pt-BR', {
                        maximumFractionDigits: 1,
                      })}
                      %
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      {b.principaisFatores.length > 0
                        ? b.principaisFatores.slice(0, 2).join(', ')
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        {anonimizado
          ? '* Identificações anonimizadas em conformidade com a LGPD.'
          : '* Nomes visíveis. Use com responsabilidade conforme a LGPD.'}
      </p>

      <BeneficiaryPanoramaDrawer
        beneficiaryId={selecionado}
        eventos={eventos}
        filtros={filtros}
        anonimizado={anonimizado}
        displayLabel={
          selecionadoTop
            ? anonimizado
              ? selecionadoTop.display
              : (selecionadoTop.nome ?? selecionadoTop.carteirinha)
            : undefined
        }
        onClose={() => setSelecionado(null)}
      />
    </>
  )
}
