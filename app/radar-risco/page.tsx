import { Suspense } from 'react'
import { CloudUpload } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { EmptyState } from '@/components/empty-state'
import { getEventosDetalhados } from '@/lib/queries'
import { RadarExplorer } from './radar-explorer'

export const metadata = {
  title: 'Radar de Risco | Winners Health Intelligence',
  description:
    'Gestão preditiva de saúde corporativa: identifique precocemente beneficiários com maior risco assistencial e potencial impacto financeiro futuro.',
}

export default async function RadarRiscoPage() {
  const eventos = await getEventosDetalhados()

  if (eventos.length === 0) {
    return (
      <DashboardShell title="Radar de Risco">
        <EmptyState
          icon={CloudUpload}
          title="Nenhum dado de utilização para análise de risco"
          description="Importe um arquivo de utilização da SulAmérica para que o Radar de Risco identifique padrões que indiquem aumento potencial de custo assistencial futuro."
          actionHref="/uploads"
          actionLabel="Importar utilização"
        />
      </DashboardShell>
    )
  }

  return (
    <DashboardShell title="Radar de Risco">
      <Suspense fallback={null}>
        <RadarExplorer eventos={eventos} />
      </Suspense>
    </DashboardShell>
  )
}
