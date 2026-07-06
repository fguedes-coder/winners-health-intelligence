import { Upload } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { EmptyState } from '@/components/empty-state'
import { PeopleNav } from '@/components/people/people-nav'
import { loadPeopleAnalytics } from '@/lib/people-analytics/data'
import { RankingClient } from './ranking-client'

export const metadata = {
  title: 'Ranking Custo × Performance | People Analytics & Saúde',
  description:
    'Ranking de colaboradores cruzando custo assistencial, OKR e Índice Winners (WHI).',
}

export default async function RankingPage({
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
            description="Importe a base de RH/OKR para gerar o ranking de custo × performance."
            actionHref="/people-analytics/importar"
            actionLabel="Importar arquivo RH"
          />
        ) : (
          <RankingClient analise={analise} />
        )}
      </div>
    </DashboardShell>
  )
}
