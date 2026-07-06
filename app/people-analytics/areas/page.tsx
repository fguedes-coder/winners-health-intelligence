import { Building2, Upload } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { EmptyState } from '@/components/empty-state'
import { Card } from '@/components/ui/card'
import { PeopleNav } from '@/components/people/people-nav'
import { LgpdToggle } from '@/components/people/lgpd-toggle'
import { loadPeopleAnalytics } from '@/lib/people-analytics/data'
import { formatBRL } from '@/lib/data'

export const metadata = {
  title: 'Análise por Área | People Analytics & Saúde',
  description:
    'Consolidação de OKR, custo assistencial e Índice Winners por área/departamento.',
}

const pct = (v: number, casas = 1) => `${v.toFixed(casas)}%`

export default async function AreasPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string }>
}) {
  const { modo } = await searchParams
  const anonimizado = modo === 'anonimizado'
  const { analise } = await loadPeopleAnalytics({
    modo: anonimizado ? 'anonimizado' : 'nominal',
  })

  return (
    <DashboardShell title="People Analytics & Saúde">
      <div className="flex flex-col gap-6">
        <PeopleNav />

        {!analise ? (
          <EmptyState
            icon={Upload}
            title="Nenhum dado de RH importado"
            description="Importe a base de RH/OKR para habilitar a análise por área."
            actionHref="/people-analytics/importar"
            actionLabel="Importar arquivo RH"
          />
        ) : !analise.temArea || !analise.areas ? (
          <EmptyState
            icon={Building2}
            title="Arquivo sem informação de área"
            description="O arquivo importado não contém uma coluna de área/departamento. Inclua essa coluna na próxima importação para desbloquear a consolidação por área."
            actionHref="/people-analytics/importar"
            actionLabel="Reimportar com áreas"
          />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-foreground">
                  Análise por Área
                </h1>
                <p className="text-sm text-muted-foreground">
                  {analise.areas.length} áreas · consolidado de OKR, custo e WHI
                </p>
              </div>
              <LgpdToggle />
            </div>

            <Card className="gap-0 overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                      <th className="px-5 py-3 font-medium">Área</th>
                      <th className="px-3 py-3 text-right font-medium">Colab.</th>
                      <th className="px-3 py-3 text-right font-medium">Vinculados</th>
                      <th className="px-3 py-3 text-right font-medium">OKR Médio</th>
                      <th className="px-3 py-3 text-right font-medium">Custo Total</th>
                      <th className="px-3 py-3 text-center font-medium">WHI Médio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analise.areas.map((a) => (
                      <tr
                        key={a.area}
                        className="border-b border-border/40 last:border-0 hover:bg-muted/30"
                      >
                        <td className="px-5 py-2.5 font-medium text-foreground">
                          {a.area}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                          {a.colaboradores}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {a.vinculados}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                          {pct(a.okrMedio * 100)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                          {formatBRL(a.custoTotal)}
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums text-foreground">
                          {a.whiMedio}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
