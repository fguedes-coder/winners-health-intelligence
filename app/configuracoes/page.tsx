import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { ConfiguracoesForm } from './configuracoes-form'
import { getPerfil } from './actions'

export default async function ConfiguracoesPage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/')

  return (
    <DashboardShell title="Configurações">
      <ConfiguracoesForm perfil={perfil} />
    </DashboardShell>
  )
}
