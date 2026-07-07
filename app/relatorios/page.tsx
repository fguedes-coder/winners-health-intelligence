import { FileText } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FaixaEtariaChart } from '@/components/charts'
import { EmptyState } from '@/components/empty-state'
import { getEventosDetalhados, getPainel } from '@/lib/queries'
import { resumirRadar } from '@/lib/radar-agg'
import { ExportarRelatorios } from './exportar-relatorios'
import { GerarPdfPanel } from './gerar-pdf-panel'
import { RadarRiscoSection } from './radar-risco-section'
import { PlanoAcaoSection } from './plano-acao-section'
import { getRelatorioConfig } from './actions'
import { RelatoriosCompetenciaFiltro } from './relatorios-competencia-filtro'

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const mesRaw = sp.mes
  const mes = (Array.isArray(mesRaw) ? mesRaw.join(',') : (mesRaw ?? ''))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const [painel, relatorioConfig, eventos] = await Promise.all([
    getPainel({ mes }),
    getRelatorioConfig(),
    getEventosDetalhados(),
  ])

  const resumoRadar = resumirRadar(eventos, { mes })

  if (!painel) {
    return (
      <DashboardShell title="Relatórios">
        <EmptyState
          icon={FileText}
          title="Nenhum dado para relatórios"
          description="Importe um arquivo de utilização na tela de Uploads para gerar relatórios a partir dos dados reais."
        />
      </DashboardShell>
    )
  }

  const temFaixa = painel.faixaEtaria.length > 0

  return (
    <DashboardShell title="Relatórios">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <RelatoriosCompetenciaFiltro meses={painel.competenciasLista} />
          <ExportarRelatorios painel={painel} resumoRadar={resumoRadar} />
        </div>

        <GerarPdfPanel config={relatorioConfig} mes={mes} />

        <RadarRiscoSection resumo={resumoRadar} />

        <PlanoAcaoSection resumo={resumoRadar} />

        <Card>
          <CardHeader>
            <CardTitle>Demografia de Beneficiários</CardTitle>
            <CardDescription>
              Distribuição por faixa etária dos beneficiários com utilização no
              período
            </CardDescription>
          </CardHeader>
          <CardContent>
            {temFaixa ? (
              <FaixaEtariaChart data={painel.faixaEtaria} />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Sem informação de idade no arquivo importado.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Utilização por categoria</CardTitle>
              <CardDescription>
                Composição do valor utilizado no período
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {painel.categorias.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Sem dados de categoria.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {painel.categorias.map((c) => (
                    <li
                      key={c.nome}
                      className="flex items-center justify-between px-6 py-3 text-sm"
                    >
                      <span className="text-foreground">{c.nome}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {c.pct.toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top prestadores</CardTitle>
              <CardDescription>
                Maiores valores de utilização no período
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {painel.topPrestadores.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Sem dados de prestadores.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {painel.topPrestadores.slice(0, 8).map((p, i) => (
                    <li
                      key={p.nome + i}
                      className="flex items-center justify-between gap-3 px-6 py-3 text-sm"
                    >
                      <span className="truncate text-foreground">
                        {p.nome}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {p.eventos} ev.
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  )
}
