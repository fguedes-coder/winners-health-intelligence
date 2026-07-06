'use client'

import {
  Brain,
  ClipboardCheck,
  ClipboardList,
  HeartPulse,
  Lightbulb,
  Pill,
  PiggyBank,
  RefreshCw,
  Route,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react'
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
import { formatBRL, formatNumber } from '@/lib/data'
import type { ResumoRadar } from '@/lib/radar-agg'

// Resolve a chave de ícone das recomendações para um componente lucide.
const REC_ICONES: Record<string, LucideIcon> = {
  'heart-pulse': HeartPulse,
  refresh: RefreshCw,
  route: Route,
  brain: Brain,
  clipboard: ClipboardList,
  pill: Pill,
  'trending-up': TrendingUp,
  target: Target,
}

export function PlanoAcaoSection({ resumo }: { resumo: ResumoRadar }) {
  const { plano } = resumo
  if (resumo.total === 0 || plano.beneficiariosPrioritarios === 0) return null

  const kpis = [
    {
      label: 'Beneficiários Prioritários',
      value: formatNumber(plano.beneficiariosPrioritarios),
      hint: `Mod. ${plano.contagemPrioritaria.moderado} · Alto ${plano.contagemPrioritaria.alto} · Crít. ${plano.contagemPrioritaria.critico}`,
      icon: Users,
      cor: 'var(--primary)',
    },
    {
      label: 'Prioridade Crítica',
      value: formatNumber(plano.prioridadeCritica),
      hint: 'Vidas com intervenção crítica',
      icon: ShieldAlert,
      cor: 'oklch(0.62 0.2 25)',
    },
    {
      label: 'Potencial Impacto Financeiro',
      value: formatBRL(plano.potencialImpacto),
      hint: 'Custo das vidas Alto/Crítico',
      icon: Target,
      cor: 'oklch(0.72 0.17 52)',
    },
    {
      label: 'Exposição ao Risco',
      value: `${plano.exposicaoPct.toFixed(1)}%`,
      hint: 'Da carteira em monitoramento prioritário',
      icon: TrendingUp,
      cor: 'var(--chart-2)',
    },
  ]

  return (
    <section className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">
            Plano de Ação Preventivo
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          {plano.resumoTexto}
        </p>
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

      {/* Tabela de ação prioritária */}
      <Card>
        <CardHeader>
          <CardTitle>Ações Prioritárias</CardTitle>
          <CardDescription>
            Beneficiários prioritários e ações preventivas recomendadas
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Beneficiário</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Faixa</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Partic.</TableHead>
                  <TableHead className="pr-6">Ação Recomendada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plano.acoes.map((a, i) => (
                  <TableRow key={`${a.carteirinha}-${a.acao}-${i}`}>
                    <TableCell className="pl-6 font-medium text-foreground">
                      {a.display}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-foreground">
                      {a.score}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: a.faixaCor }}
                          aria-hidden
                        />
                        {a.faixaLabel}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: `color-mix(in oklch, ${a.prioridadeCor} 16%, transparent)`,
                          color: a.prioridadeCor,
                        }}
                      >
                        {a.prioridadeLabel}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatBRL(a.valorTotal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {a.participacaoPct.toFixed(1)}%
                    </TableCell>
                    <TableCell className="pr-6 text-sm text-foreground">
                      {a.acao}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Recomendações consolidadas */}
      <div>
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-foreground">
          <Sparkles className="size-4 text-primary" />
          Recomendações Prioritárias do Período
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Ações mais frequentes entre os beneficiários prioritários
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {plano.recomendacoes.map((r) => {
            const Icon = REC_ICONES[r.icone] ?? Sparkles
            return (
              <Card key={r.chave}>
                <CardContent className="flex gap-3 p-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="size-4 text-primary" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {r.titulo}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
                        {r.frequencia} {r.frequencia === 1 ? 'vida' : 'vidas'}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
                      {r.descricao}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Oportunidade de economia */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15">
              <PiggyBank className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Economia Potencial Estimada
              </p>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground text-pretty">
                Considerando uma redução conservadora de{' '}
                {(plano.taxaEconomia * 100).toFixed(0)}% na utilização das vidas
                prioritárias por meio de ações preventivas e gestão de saúde,
                estima-se o seguinte potencial de economia para o contrato.
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lightbulb className="size-3.5" />
                Base: {formatBRL(plano.valorPrioritario)} ×{' '}
                {(plano.taxaEconomia * 100).toFixed(0)}%
              </p>
            </div>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Economia Potencial
            </p>
            <p className="text-3xl font-semibold text-primary text-balance">
              {formatBRL(plano.economiaPotencial)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Conclusão executiva */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conclusão Executiva</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            {plano.conclusao}
          </p>
        </CardContent>
      </Card>
    </section>
  )
}
