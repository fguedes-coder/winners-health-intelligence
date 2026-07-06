import { DashboardShell } from '@/components/dashboard-shell'
import { RhConferenciaClient } from './rh-conferencia-client'

export const metadata = {
  title: 'Conferência RH | Winners Health Intelligence',
  description:
    'Cruze uma planilha de RH com os beneficiários existentes antes de atualizar qualquer dado.',
}

export default function RhImportacaoPage() {
  return (
    <DashboardShell title="Conferência RH">
      <RhConferenciaClient />
    </DashboardShell>
  )
}
