import {
  Activity,
  Brain,
  Building2,
  FileText,
  HeartPulse,
  Percent,
  Users,
  Wallet,
} from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { EmptyState } from '@/components/empty-state'
import {
  Card,
  CardContent,
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
import { UtilizacaoMensalChart } from '@/components/charts'
import { CategoriaGerencialDonut } from '@/components/categoria-gerencial-donut'
import { formatBRL, formatNumber } from '@/lib/data'
import { formatCompetencia, getDashboardData, getPainel } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'
import { getFaturas } from './actions'
import { FaturasManager } from './faturas-manager'

export default async function SinistralidadePage() {
  const [painel, faturas, dashboard, supabase] = await Promise.all([
    getPainel(),
    getFaturas(),
    getDashboardData(),
    createClient(),
  ])

  const { data: apolicesData } = await supabase
    .from('apolices')
    .select('id, numero, cliente, cliente_id')

  const apolicesOpt = (apolicesData ?? []) as {
    id: string
    numero: string | null
    cliente: string | null
    cliente_id: string | null
  }[]

  const utilizacaoPorComp: Record<string, number> = {}
  for (const r of dashboard.resumoCompetencia) {
    utilizacaoPorComp[r.competencia] = r.valor
  }

  if (!painel) {
    return (
      <DashboardShell title="Sinistralidade">
        <EmptyState
          icon={Percent}
          title="Sem dados de sinistralidade"
          description="Importe um arquivo de utilização para analisar custos, prestadores e utilizadores por competência. A sinistralidade é calculada quando uma fatura for cadastrada."
          actionHref="/uploads"
          actionLabel="Importar utilização"
        />
      </DashboardShell>
    )
  }

  const utilChart = painel.historico.map((h) => ({
    mes: h.mes,
    utilizado: h.utilizado,
  }))

  const totalUtil = painel.valorUtilizado || 1
  const kpis = [
    {
      label: 'Valor Utilizado',
      value: formatBRL(painel.valorUtilizado),
      icon: Wallet,
    },
    {
      label: 'Fatura',
      value: painel.valorFatura === null ? 'Não informada' : formatBRL(painel.valorFatura),
      icon: FileText,
    },
    {
      label: 'Sinistralidade',
      value:
        painel.sinistralidade === null
          ? 'Não informada'
          : `${painel.sinistralidade.toLocaleString('pt-BR')}%`,
      icon: Percent,
    },
    {
      label: 'Beneficiários',
      value: formatNumber(painel.beneficiarios),
      icon: Users,
    },
    {
      label: 'Subestipulantes',
      value: formatNumber(painel.apolicesAtivas),
      icon: Building2,
    },
  ]

  const indicadoresClinicos = [
    { label: 'Internações', value: formatNumber(painel.internacoes), icon: HeartPulse },
    { label: 'Saúde Mental', value: formatNumber(painel.saudeMental), icon: Brain },
    { label: 'Eventos', value: formatNumber(painel.totalEventos), icon: Activity },
  ]

  return (
    <DashboardShell title="Sinistralidade">
      <div className="flex flex-col gap-5">
        {/* Cabeçalho */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground">
            Sinistralidade
          </h1>
          <p className="text-sm text-muted-foreground">
            Competência {formatCompetencia(painel.competenciaAtual)} ·{' '}
            {painel.clientesAtivos} cliente(s) · {painel.apolicesAtivas}{' '}
            apólice(s)
          </p>
        </div>

        {/* Aviso sobre fatura/sinistralidade */}
        {painel.sinistralidade === null && (
          <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
            A sinistralidade depende do valor da fatura, que não vem no arquivo
            de utilização. Cadastre a fatura da competência para calcular o
            índice e o saldo técnico.
          </p>
        )}

        {/* Cadastro de fatura + vidas por competência */}
        <FaturasManager
          faturas={faturas}
          apolices={apolicesOpt}
          utilizacaoPorComp={utilizacaoPorComp}
        />

        {/* KPIs */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {kpis.map((k) => {
            const Icon = k.icon
            return (
              <Card key={k.label} className="gap-0 p-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Icon className="size-4.5" />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {k.label}
                  </span>
                </div>
                <div className="mt-3 text-xl font-semibold text-foreground">
                  {k.value}
                </div>
              </Card>
            )
          })}
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Utilização por Competência</CardTitle>
            </CardHeader>
            <CardContent>
              {utilChart.length > 0 ? (
                <UtilizacaoMensalChart data={utilChart} />
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  Sem histórico de utilização.
                </p>
              )}
            </CardContent>
          </Card>

          <CategoriaGerencialDonut
            categorias={dashboard.categoriasGerenciais}
            total={dashboard.kpis.valorUtilizado}
          />
        </div>

        {/* Tabelas e indicadores */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-5">
          {/* Top 10 Utilizadores */}
          <Card className="2xl:col-span-2">
            <CardHeader>
              <CardTitle>Top 10 Utilizadores</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Beneficiário</TableHead>
                    <TableHead className="text-right">Utilizado</TableHead>
                    <TableHead className="pr-6 text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {painel.topUtilizadores.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        Sem dados no período.
                      </TableCell>
                    </TableRow>
                  ) : (
                    painel.topUtilizadores.map((u, i) => (
                      <TableRow key={`${u.nome}-${i}`}>
                        <TableCell className="pl-6">
                          <span className="font-medium text-foreground">
                            {i + 1}. {u.nome}
                          </span>
                          {u.detalhe && (
                            <span className="block text-xs text-muted-foreground">
                              {u.detalhe}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBRL(u.valor)}
                        </TableCell>
                        <TableCell className="pr-6 text-right tabular-nums text-muted-foreground">
                          {((u.valor / totalUtil) * 100).toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                          %
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Top 10 Prestadores */}
          <Card className="2xl:col-span-2">
            <CardHeader>
              <CardTitle>Top 10 Prestadores</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Prestador</TableHead>
                    <TableHead className="text-right">Utilizado</TableHead>
                    <TableHead className="pr-6 text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {painel.topPrestadores.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        Sem dados no período.
                      </TableCell>
                    </TableRow>
                  ) : (
                    painel.topPrestadores.map((p, i) => (
                      <TableRow key={`${p.nome}-${i}`}>
                        <TableCell className="pl-6 font-medium text-foreground">
                          {i + 1}. {p.nome}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBRL(p.valor)}
                        </TableCell>
                        <TableCell className="pr-6 text-right tabular-nums text-muted-foreground">
                          {((p.valor / totalUtil) * 100).toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                          %
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Indicadores Clínicos */}
          <Card>
            <CardHeader>
              <CardTitle>Indicadores Clínicos</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {indicadoresClinicos.map((ind) => {
                const Icon = ind.icon
                return (
                  <div
                    key={ind.label}
                    className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 p-3"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <Icon className="size-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {ind.label}
                      </p>
                      <span className="text-lg font-semibold text-foreground">
                        {ind.value}
                      </span>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  )
}
