import { DashboardShell } from '@/components/dashboard-shell'
import { getStatusChaveAssistente } from '@/lib/assistente/chave'
import { ConverseClient } from './converse-client'

export const metadata = {
  title: 'Converse com a Winners | Winners Health Intelligence',
  description: 'Pergunte em português sobre internações, autorizações, custos e cada vida da carteira.',
}

export const dynamic = 'force-dynamic'

export default async function ConversePage() {
  const configurada = (await getStatusChaveAssistente()).origem !== null
  return (
    <DashboardShell title="Converse com a Winners">
      <ConverseClient configurada={configurada} />
    </DashboardShell>
  )
}
