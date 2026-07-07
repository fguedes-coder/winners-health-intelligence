import { Suspense } from 'react'
import { CloudUpload } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { EmptyState } from '@/components/empty-state'
import { getWinnersDataset } from '@/lib/winners-data-server'
import { WinnersDecideExplorer } from './winners-decide-explorer'

export const metadata = {
  title: 'Winners Decide IA | Winners Health Intelligence',
  description:
    'Inteligência artificial consultiva sobre a carteira de saúde: resumo executivo, insights, previsões e plano de ação a partir dos dados de utilização e sinistralidade.',
}

export default async function WinnersDecidePage() {
  const { eventos, faturaPorCompetencia } = await getWinnersDataset()

  if (eventos.length === 0) {
    return (
      <DashboardShell title="Winners Decide IA">
        <EmptyState
          icon={CloudUpload}
          title="Nenhum dado disponível para análise da IA"
          description="Importe um arquivo de utilização da SulAmérica para que a Winners Decide IA gere resumo executivo, insights, previsões e plano de ação sobre a carteira."
          actionHref="/uploads"
          actionLabel="Importar utilização"
        />
      </DashboardShell>
    )
  }

  return (
    <DashboardShell title="Winners Decide IA">
      <Suspense fallback={null}>
        <WinnersDecideExplorer
          eventos={eventos}
          faturaPorCompetencia={faturaPorCompetencia}
        />
      </Suspense>
    </DashboardShell>
  )
}
