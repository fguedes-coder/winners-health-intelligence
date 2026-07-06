'use client'

import Link from 'next/link'
import { Activity, ShieldAlert, Users, Wallet } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EvolucaoRiscoChart, RiscoDonutChart } from '@/components/charts'
import { formatBRL, formatNumber } from '@/lib/data'
import type { ResumoRadar } from '@/lib/radar-agg'

export function RadarRiscoSection({ resumo }: { resumo: ResumoRadar }) {
  if (resumo.total === 0) return null

  const kpis = [
    {
      label: 'Beneficiários Monitorados',
      value: formatNumber(resumo.total),
      hint: 'Vidas com utilização analisada',
      icon: Users,
      cor: 'var(--primary)',
    },
    {
      label: 'Vidas em Risco',
      value: formatNumber(resumo.emRisco),
      hint: 'Faixas Alto e Crítico',
      icon: ShieldAlert,
      cor: 'oklch(0.62 0.2 25)',
    },
    {
      label: 'Impacto Financeiro',
      value: formatBRL(resumo.impactoFinanceiro),
      hint: `${resumo.pctImpacto.toFixed(1)}% do custo total`,
      icon: Wallet,
      cor: 'oklch(0.72 0.17 52)',
    },
    {
      label: 'Fator Predominante',
      value: resumo.fatores[0]?.nome ?? '—',
      hint: resumo.fatores[0] ? `${resumo.fatores[0].valor} vidas afetadas` : '—',
      icon: Activity,
      cor: 'var(--chart-2)',
    },
  ]

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Radar de Risco</h2>
          <p className="text-sm text-muted-foreground">
            Priorização de beneficiários por risco assistencial no período
          </p>
        </div>
        <Link
          href="/radar-risco"
          className="shrink-0 text-sm font-medium text-primary hover:underline"
        >
          Ver módulo completo
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="flex flex-col gap-2 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <k.icon className="size-4" style={{ color: k.cor }} />
                {k.label}
              </div>
              <p className="text-xl font-semibold text-foreground text-balance">
                {k.value}
              </p>
              <p className="text-xs text-muted-foreground">{k.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Faixa de Risco</CardTitle>
            <CardDescription>Vidas monitoradas por severidade</CardDescription>
          </CardHeader>
          <CardContent>
            {resumo.distribuicao.length > 0 ? (
              <RiscoDonutChart
                data={resumo.distribuicao}
                centerValue={formatNumber(resumo.total)}
                centerLabel="vidas"
              />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Sem dados de distribuição.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evolução de Vidas em Risco</CardTitle>
            <CardDescription>
              Beneficiários em Alto/Crítico por competência
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resumo.evolucao.length > 1 ? (
              <EvolucaoRiscoChart data={resumo.evolucao} />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Período insuficiente para série temporal.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top prioritários */}
      <Card>
        <CardHeader>
          <CardTitle>Beneficiários Prioritários</CardTitle>
          <CardDescription>
            Maiores scores de risco assistencial no período
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Beneficiário</TableHead>
                  <TableHead>Faixa</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Partic.</TableHead>
                  <TableHead className="pr-6">Principais fatores</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumo.top.map((b) => (
                  <TableRow key={b.carteirinha}>
                    <TableCell className="pl-6">
                      <span className="font-medium text-foreground">
                        {b.display}
                      </span>
                      {b.cliente ? (
                        <span className="block text-xs text-muted-foreground">
                          {b.cliente}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: b.faixaCor }}
                          aria-hidden
                        />
                        {b.faixaLabel}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-foreground">
                      {b.score}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatBRL(b.valorTotal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {b.participacaoPct.toFixed(1)}%
                    </TableCell>
                    <TableCell className="pr-6">
                      <span className="text-xs text-muted-foreground">
                        {b.principaisFatores.length > 0
                          ? b.principaisFatores.join(', ')
                          : '—'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
