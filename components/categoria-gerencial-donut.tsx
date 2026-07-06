'use client'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { CategoriaDonutChart } from '@/components/charts'
import { formatBRL } from '@/lib/data'

// Paleta azul on-brand com tons distintos o suficiente para as 13 categorias
// gerenciais, sem repetir cores adjacentes e sem usar roxo/violeta.
const PALETA = [
  'oklch(0.58 0.20 256)',
  'oklch(0.72 0.13 234)',
  'oklch(0.46 0.18 266)',
  'oklch(0.82 0.09 230)',
  'oklch(0.64 0.16 246)',
  'oklch(0.52 0.18 260)',
  'oklch(0.78 0.11 232)',
  'oklch(0.42 0.17 268)',
  'oklch(0.68 0.14 240)',
  'oklch(0.86 0.07 228)',
  'oklch(0.56 0.16 252)',
  'oklch(0.74 0.12 236)',
  'oklch(0.48 0.10 250)',
]

type CategoriaGerencial = {
  nome: string
  valor: number
  pct: number
  eventos: number
}

export function CategoriaGerencialDonut({
  categorias,
  total,
  className,
}: {
  categorias: CategoriaGerencial[]
  total: number
  className?: string
}) {
  // Já chegam ordenadas da maior para a menor participação, mas garantimos aqui.
  const ordenadas = [...categorias].sort((a, b) => b.valor - a.valor)

  const donut = ordenadas.map((c, i) => ({
    nome: c.nome,
    valor: Number(c.pct.toFixed(1)),
    cor: PALETA[i % PALETA.length],
  }))

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Utilização por Categoria</CardTitle>
      </CardHeader>
      <CardContent>
        {ordenadas.length > 0 ? (
          <div className="@container">
            <div className="flex flex-col items-center gap-4 @md:flex-row">
              <div className="w-full max-w-[220px] shrink-0">
                <CategoriaDonutChart
                  data={donut}
                  centerValue={formatBRL(total)}
                  centerLabel="Utilizado"
                />
              </div>
              <ul className="grid w-full grid-cols-1 gap-x-6 gap-y-2 @xs:grid-cols-2 @md:max-h-[260px] @md:grid-cols-1 @md:gap-y-2 @md:overflow-y-auto @md:pr-1">
              {ordenadas.map((c, i) => (
                <li
                  key={c.nome}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: PALETA[i % PALETA.length] }}
                    />
                    <span className="truncate" title={c.nome}>
                      {c.nome}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums text-foreground">
                    {c.pct.toLocaleString('pt-BR', {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                    %
                  </span>
                </li>
              ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Sem categorias no período.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
