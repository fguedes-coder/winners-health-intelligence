'use client'

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LgpdToggle } from '@/components/people/lgpd-toggle'
import { MatrizImpacto } from '@/components/people/people-visuals'
import { formatBRL } from '@/lib/data'
import type {
  AnalisePeople,
  Quadrante,
} from '@/lib/people-analytics/analise'
import { QUADRANTE_META } from '@/lib/people-analytics/analise'
import { cn } from '@/lib/utils'

const pct = (v: number, casas = 0) => `${v.toFixed(casas)}%`

export function MatrizClient({ analise }: { analise: AnalisePeople }) {
  const [selecionado, setSelecionado] = useState<Quadrante>('alto_custo_baixo_okr')

  const itens = useMemo(
    () =>
      analise.colaboradores
        .filter((c) => c.quadrante === selecionado)
        .sort((a, b) => (b.custoSaude ?? 0) - (a.custoSaude ?? 0)),
    [analise.colaboradores, selecionado],
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Matriz de Impacto
          </h1>
          <p className="text-sm text-muted-foreground">
            Custo Assistencial × OKR — {analise.cards.vinculados} colaboradores
            vinculados
          </p>
        </div>
        <LgpdToggle />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="gap-0 p-5">
          <h2 className="text-sm font-semibold text-foreground">
            Distribuição por Quadrante
          </h2>
          <div className="mt-4">
            <MatrizImpacto quadrantes={analise.quadrantes} />
          </div>
        </Card>

        <Card className="gap-0 p-5">
          <h2 className="text-sm font-semibold text-foreground">
            Selecione um quadrante
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {analise.quadrantes.map((q) => {
              const active = q.quadrante === selecionado
              return (
                <button
                  key={q.quadrante}
                  type="button"
                  onClick={() => setSelecionado(q.quadrante)}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                    active
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border hover:border-primary/30 hover:bg-muted/30',
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: q.cor }}
                    />
                    {q.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {q.descricao}
                  </span>
                  <span className="mt-1 text-sm font-semibold text-foreground">
                    {q.vidas} colab. · {formatBRL(q.custoTotal)}
                  </span>
                </button>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Lista do quadrante selecionado */}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border/60 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span
              className="size-3 rounded-full"
              style={{ backgroundColor: QUADRANTE_META[selecionado].cor }}
            />
            {QUADRANTE_META[selecionado].label}
          </h2>
          <span className="text-xs text-muted-foreground">
            {itens.length} colaboradores
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">Colaborador</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 text-right font-medium">OKR</th>
                <th className="px-3 py-3 text-right font-medium">Custo Assist.</th>
                <th className="px-3 py-3 text-center font-medium">Risco</th>
                <th className="px-3 py-3 text-center font-medium">WHI</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((c, i) => (
                <tr
                  key={c.nome + i}
                  className="border-b border-border/40 last:border-0 hover:bg-muted/30"
                >
                  <td className="px-5 py-2.5 font-medium text-foreground">
                    {c.display}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant={c.apto ? 'success' : 'destructive'}
                      className="text-[11px]"
                    >
                      {c.status ?? '—'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                    {c.okr != null ? pct(c.okr * 100) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                    {c.custoSaude != null ? formatBRL(c.custoSaude) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">
                    {c.faixaRisco ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-foreground">
                    {c.whi ?? '—'}
                  </td>
                </tr>
              ))}
              {itens.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-sm text-muted-foreground"
                  >
                    Nenhum colaborador neste quadrante.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
