import { Sparkles, Upload } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { EmptyState } from '@/components/empty-state'
import { Card } from '@/components/ui/card'
import { PeopleNav } from '@/components/people/people-nav'
import { LgpdToggle } from '@/components/people/lgpd-toggle'
import { WhiGauge } from '@/components/people/people-visuals'
import { formatBRL } from '@/lib/data'
import { gerarNarrativaCeo, loadPeopleAnalytics } from '@/lib/people-analytics/data'

export const metadata = {
  title: 'Narrativa para o CEO | People Analytics & Saúde',
  description:
    'Resumo executivo determinístico do cruzamento entre performance (OKR) e custo assistencial.',
}

const pct = (v: number, casas = 1) => `${v.toFixed(casas)}%`

export default async function NarrativaPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string }>
}) {
  const { modo } = await searchParams
  const anonimizado = modo === 'anonimizado'
  const { analise, importacao } = await loadPeopleAnalytics({
    modo: anonimizado ? 'anonimizado' : 'nominal',
  })

  const paragrafos = analise ? gerarNarrativaCeo(analise) : []

  return (
    <DashboardShell title="People Analytics & Saúde">
      <div className="flex flex-col gap-6">
        <PeopleNav />
        {!analise || !importacao ? (
          <EmptyState
            icon={Upload}
            title="Nenhum dado de RH importado"
            description="Importe a base de RH/OKR para gerar a narrativa executiva."
            actionHref="/people-analytics/importar"
            actionLabel="Importar arquivo RH"
          />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-foreground">
                  Narrativa para o CEO
                </h1>
                <p className="text-sm text-muted-foreground">
                  Resumo executivo gerado a partir de {analise.cards.importados}{' '}
                  colaboradores · {importacao.arquivo_nome}
                </p>
              </div>
              <LgpdToggle />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Texto */}
              <Card className="gap-0 p-6 lg:col-span-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sparkles className="size-4 text-primary" />
                  Resumo Executivo
                </h2>
                <div className="mt-4 flex flex-col gap-4">
                  {paragrafos.map((p, i) => (
                    <p
                      key={i}
                      className="text-sm leading-relaxed text-foreground/90 text-pretty"
                    >
                      {p}
                    </p>
                  ))}
                </div>
                <p className="mt-6 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                  Narrativa determinística, reproduzível diretamente dos números
                  do cruzamento — sem uso de IA generativa.
                </p>
              </Card>

              {/* Indicadores-chave */}
              <div className="flex flex-col gap-4">
                <Card className="flex flex-col items-center gap-2 p-6">
                  <span className="text-sm font-semibold text-foreground">
                    Índice Winners (WHI)
                  </span>
                  <WhiGauge valor={analise.cards.whiMedio} />
                </Card>
                <Card className="flex flex-col gap-3 p-5">
                  <Kpi label="Matching" valor={pct(analise.cards.pctMatching)} />
                  <Kpi
                    label="OKR médio"
                    valor={pct(analise.cards.okrMedio * 100, 2)}
                  />
                  <Kpi
                    label="Custo total"
                    valor={formatBRL(analise.cards.custoTotal)}
                  />
                  <Kpi
                    label="Custo médio"
                    valor={formatBRL(analise.cards.custoMedio)}
                  />
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}

function Kpi({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {valor}
      </span>
    </div>
  )
}
