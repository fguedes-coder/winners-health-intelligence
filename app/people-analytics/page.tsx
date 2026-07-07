import { Upload } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { EmptyState } from '@/components/empty-state'
import { PeopleNav } from '@/components/people/people-nav'
import { gerarNarrativaCeo, loadPeopleAnalytics } from '@/lib/people-analytics/data'
import { DashboardExecutivo } from './dashboard-executivo'

// Rótulo de competência (ex.: "Julho/2026") a partir da data ISO.
function competencia(iso: string) {
  const d = new Date(iso)
  const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const label = d
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(' de ', '/')
  return { valor, label: label.charAt(0).toUpperCase() + label.slice(1) }
}

export const metadata = {
  title: 'Dashboard Executivo | People Analytics & Saúde',
  description:
    'Cruzamento de dados de RH (OKR) e Saúde — visão executiva de performance, custo assistencial e Índice Winners (WHI).',
}

export default async function PeopleAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string; mes?: string }>
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
            description="Importe a base de RH/OKR (XLSX ou CSV) para cruzar com a base assistencial e gerar o dashboard executivo."
            actionHref="/people-analytics/importar"
            actionLabel="Importar arquivo RH"
          />
        ) : (
          <DashboardExecutivo
            analise={analise}
            anonimizado={anonimizado}
            importacao={importacao}
            narrativa={gerarNarrativaCeo(analise)}
            meses={[competencia(importacao.created_at)]}
            mesAtual={competencia(importacao.created_at).valor}
          />
        )}
      </div>
    </DashboardShell>
  )
}
