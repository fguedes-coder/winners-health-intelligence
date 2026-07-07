import { CloudUpload } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { EmptyState } from '@/components/empty-state'
import { getEventosDetalhados } from '@/lib/queries'
import { JornadaClient } from './jornada-client'

export const metadata = {
  title: 'Jornada Assistencial | Winners Health Intelligence',
  description:
    'Acompanhe a trajetória de utilização e eventos assistenciais de cada beneficiário.',
}

export default async function JornadaAssistencialPage() {
  const eventos = await getEventosDetalhados()

  if (eventos.length === 0) {
    return (
      <DashboardShell title="Jornada Assistencial">
        <EmptyState
          icon={CloudUpload}
          title="Nenhum dado de utilização disponível"
          description="Importe um arquivo de utilização da SulAmérica para reconstruir a jornada assistencial de cada beneficiário."
          actionHref="/uploads"
          actionLabel="Importar utilização"
        />
      </DashboardShell>
    )
  }

  return (
    <DashboardShell title="Jornada Assistencial">
      <JornadaClient eventos={eventos} />
    </DashboardShell>
  )
}
