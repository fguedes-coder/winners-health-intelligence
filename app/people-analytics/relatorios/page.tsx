import { FileSpreadsheet, ShieldCheck, Upload } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { EmptyState } from '@/components/empty-state'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PeopleNav } from '@/components/people/people-nav'
import { LgpdToggle } from '@/components/people/lgpd-toggle'
import { ExportButtons } from '@/components/people/export-buttons'
import { loadPeopleAnalytics } from '@/lib/people-analytics/data'
import { formatBRL } from '@/lib/data'

export const metadata = {
  title: 'Relatórios LGPD | People Analytics & Saúde',
  description:
    'Exportação de relatórios do cruzamento RH × Saúde com controle de anonimização (LGPD).',
}

const pct = (v: number, casas = 1) => `${v.toFixed(casas)}%`

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string }>
}) {
  const { modo } = await searchParams
  const anonimizado = modo === 'anonimizado'
  const { analise, importacao } = await loadPeopleAnalytics({
    modo: anonimizado ? 'anonimizado' : 'nominal',
  })

  return (
    <DashboardShell title="People Analytics & Saúde">
      <div className="flex flex-col gap-6">
        <PeopleNav />
        {!analise || !importacao ? (
          <EmptyState
            icon={Upload}
            title="Nenhum dado de RH importado"
            description="Importe a base de RH/OKR para gerar e exportar relatórios."
            actionHref="/people-analytics/importar"
            actionLabel="Importar arquivo RH"
          />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-foreground">
                  Relatórios LGPD
                </h1>
                <p className="text-sm text-muted-foreground">
                  Exportação do cruzamento · {importacao.arquivo_nome}
                </p>
              </div>
              <LgpdToggle />
            </div>

            {/* Aviso de conformidade */}
            <Card
              className={
                anonimizado
                  ? 'flex flex-col gap-2 border-primary/40 bg-primary/5 p-5'
                  : 'flex flex-col gap-2 border-amber-500/40 bg-amber-500/5 p-5'
              }
            >
              <div className="flex items-center gap-2">
                <ShieldCheck
                  className={
                    anonimizado
                      ? 'size-5 text-primary'
                      : 'size-5 text-amber-500'
                  }
                />
                <span className="text-sm font-semibold text-foreground">
                  {anonimizado
                    ? 'Modo Anonimizado (LGPD)'
                    : 'Modo Identificado'}
                </span>
                <Badge variant={anonimizado ? 'success' : 'warning'}>
                  {anonimizado ? 'Nomes ocultos' : 'Dados sensíveis'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground text-pretty">
                {anonimizado
                  ? 'Os nomes dos colaboradores são substituídos por códigos (COLAB-001, COLAB-002…) de forma determinística por custo assistencial. Os arquivos exportados neste modo não contêm dados de identificação pessoal.'
                  : 'Os relatórios exportados neste modo contêm nomes e carteirinhas — dados pessoais sensíveis protegidos pela LGPD. Restrinja o compartilhamento. Para exportar sem identificação, ative o modo anonimizado.'}
              </p>
            </Card>

            {/* Resumo + exportação */}
            <Card className="flex flex-col gap-5 p-6">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="size-5 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">
                  Relatório Completo do Cruzamento
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric label="Colaboradores" valor={String(analise.cards.importados)} />
                <Metric label="Vinculados" valor={String(analise.cards.vinculados)} />
                <Metric label="Matching" valor={pct(analise.cards.pctMatching)} />
                <Metric label="WHI médio" valor={String(analise.cards.whiMedio)} />
                <Metric label="OKR médio" valor={pct(analise.cards.okrMedio * 100, 2)} />
                <Metric label="Custo total" valor={formatBRL(analise.cards.custoTotal)} />
                <Metric label="Custo médio" valor={formatBRL(analise.cards.custoMedio)} />
                <Metric
                  label="Não encontrados"
                  valor={String(analise.cards.naoEncontrados)}
                />
              </div>
              <div className="border-t border-border/60 pt-4">
                <p className="mb-3 text-xs text-muted-foreground">
                  O XLSX contém duas abas (Resumo e Colaboradores). O CSV contém a
                  base de colaboradores. Ambos respeitam o modo de privacidade
                  selecionado acima.
                </p>
                <ExportButtons
                  analise={analise}
                  sufixo={anonimizado ? 'anonimizado' : 'identificado'}
                />
              </div>
            </Card>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}

function Metric({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card/50 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-foreground">
        {valor}
      </span>
    </div>
  )
}
