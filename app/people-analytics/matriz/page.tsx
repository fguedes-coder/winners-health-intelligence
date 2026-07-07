import { Upload } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { EmptyState } from '@/components/empty-state'
import { PeopleNav } from '@/components/people/people-nav'
import { loadPeopleAnalytics } from '@/lib/people-analytics/data'
import { MatrizClient } from './matriz-client'

export const metadata = {
  title: 'Matriz de Impacto | People Analytics & Saúde',
  description:
    'Matriz 2×2 cruzando custo assistencial e OKR para priorização estratégica de pessoas.',
}

export default async function MatrizPage({
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
            description="Importe a base de RH/OKR para gerar a Matriz de Impacto."
            actionHref="/people-analytics/importar"
            actionLabel="Importar arquivo RH"
          />
        ) : (
          <MatrizClient analise={analise} />
        )}
      </div>
    </DashboardShell>
  )
}
