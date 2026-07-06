import { Suspense } from 'react'
import { CloudUpload } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { EmptyState } from '@/components/empty-state'
import { getEventosDetalhados } from '@/lib/queries'
import { UtilizacaoExplorer } from './utilizacao-explorer'

export const metadata = {
  title: 'Utilização | Winners Health Intelligence',
  description:
    'Auditoria completa da utilização da SulAmérica: quem, o quê, onde, quando e quanto custou.',
}

export default async function UtilizacaoPage() {
  const eventos = await getEventosDetalhados()

  if (eventos.length === 0) {
    return (
      <DashboardShell title="Utilização">
        <EmptyState
          icon={CloudUpload}
          title="Nenhum evento de utilização importado"
          description="Importe um arquivo TXT de utilização da SulAmérica para auditar cada evento por beneficiário, prestador, serviço e categoria."
          actionHref="/uploads"
          actionLabel="Importar utilização"
        />
      </DashboardShell>
    )
  }

  return (
    <DashboardShell title="Utilização">
      <Suspense fallback={null}>
        <UtilizacaoExplorer eventos={eventos} />
      </Suspense>
    </DashboardShell>
  )
}
