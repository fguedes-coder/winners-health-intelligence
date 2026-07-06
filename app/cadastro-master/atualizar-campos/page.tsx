import { DashboardShell } from '@/components/dashboard-shell'
import { AtualizarCamposClient } from './atualizar-campos-client'

export const metadata = {
  title: 'Atualizar Cadastro | Winners Health Intelligence',
  description:
    'Preencha campos vazios do Cadastro Mestre a partir de uma planilha, com conferência antes de salvar.',
}

export default function AtualizarCamposPage() {
  return (
    <DashboardShell title="Atualizar Cadastro">
      <AtualizarCamposClient />
    </DashboardShell>
  )
}
