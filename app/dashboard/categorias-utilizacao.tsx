'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { CategoriaBarChart } from '@/components/charts'
import { formatBRL, formatNumber } from '@/lib/data'
import type { CategoriaDetalhadaRow } from '@/lib/queries'

// Quantas categorias aparecem no gráfico (as principais por valor).
const TOP_GRAFICO = 8

function formatPct(pct: number): string {
  return `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

export function CategoriasUtilizacao({
  categorias,
  total,
}: {
  categorias: CategoriaDetalhadaRow[]
  total: number
}) {
  const [expandida, setExpandida] = useState<string | null>(null)

  if (categorias.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Utilização por Categoria</CardTitle>
          <CardDescription>Participação no valor utilizado</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="py-12 text-center text-sm text-muted-foreground">
            Sem dados no período.
          </p>
        </CardContent>
      </Card>
    )
  }

  const principais = categorias.slice(0, TOP_GRAFICO).map((c) => ({
    nome: c.nome,
    valor: c.valor,
    pct: c.pct,
  }))

  return (
    <Card className="xl:col-span-3">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Utilização por Categoria</CardTitle>
            <CardDescription>
              {categorias.length} categorias identificadas no arquivo · valores
              reais de DSC_SERVICO_PRINCIPAL e DSC_SERVICO
            </CardDescription>
          </div>
          <span className="text-sm font-medium text-foreground tabular-nums">
            {formatBRL(total)}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Gráfico com as principais categorias por valor */}
          <div>
            {categorias.length > TOP_GRAFICO && (
              <p className="mb-2 text-xs text-muted-foreground">
                Principais {TOP_GRAFICO} categorias por valor. A lista completa
                está ao lado.
              </p>
            )}
            <CategoriaBarChart data={principais} />
          </div>

          {/* Tabela completa: todas as categorias e subcategorias */}
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Categoria</span>
              <span className="text-right">Valor</span>
              <span className="text-right">%</span>
              <span className="text-right">Eventos</span>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {categorias.map((c) => {
                const aberta = expandida === c.nome
                const temSub =
                  c.subcategorias.length > 1 ||
                  (c.subcategorias.length === 1 &&
                    c.subcategorias[0].nome !== c.nome)
                return (
                  <div key={c.nome} className="border-b border-border last:border-0">
                    <button
                      type="button"
                      onClick={() =>
                        temSub ? setExpandida(aberta ? null : c.nome) : undefined
                      }
                      className={`grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 px-3 py-2 text-left text-sm transition-colors ${
                        temSub ? 'hover:bg-muted/50' : 'cursor-default'
                      }`}
                      aria-expanded={temSub ? aberta : undefined}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        {temSub ? (
                          aberta ? (
                            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                          )
                        ) : (
                          <span className="w-3.5 shrink-0" />
                        )}
                        <span className="truncate text-foreground" title={c.nome}>
                          {c.nome}
                        </span>
                      </span>
                      <span className="text-right font-medium text-foreground tabular-nums">
                        {formatBRL(c.valor)}
                      </span>
                      <span className="text-right text-muted-foreground tabular-nums">
                        {formatPct(c.pct)}
                      </span>
                      <span className="text-right text-muted-foreground tabular-nums">
                        {formatNumber(c.eventos)}
                      </span>
                    </button>
                    {aberta && (
                      <div className="bg-muted/20">
                        {c.subcategorias.map((s) => (
                          <div
                            key={s.nome}
                            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 px-3 py-1.5 pl-9 text-xs"
                          >
                            <span
                              className="truncate text-muted-foreground"
                              title={s.nome}
                            >
                              {s.nome}
                            </span>
                            <span className="text-right tabular-nums text-foreground">
                              {formatBRL(s.valor)}
                            </span>
                            <span className="text-right tabular-nums text-muted-foreground">
                              {formatPct(s.pct)}
                            </span>
                            <span className="text-right tabular-nums text-muted-foreground">
                              {formatNumber(s.eventos)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
