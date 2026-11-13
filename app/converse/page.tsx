import { DashboardShell } from '@/components/dashboard-shell'
import { ConverseClient } from './converse-client'

export const metadata = {
  title: 'Converse com a Winners | Winners Health Intelligence',
  description: 'Pergunte em português sobre internações, autorizações, custos e cada vida da carteira.',
}

export const dynamic = 'force-dynamic'

export default function ConversePage() {
  const configurada = Boolean(process.env.ANTHROPIC_API_KEY?.trim())
  return (
    <DashboardShell title="Converse com a Winners">
      <ConverseClient configurada={configurada} />
    </DashboardShell>
  )
}
