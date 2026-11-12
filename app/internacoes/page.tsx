import { BedDouble } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { EmptyState } from '@/components/empty-state'
import { getBenefDisplay } from '@/lib/display-prefs-server'
import { getInternacoesGC } from '@/lib/gestao-conectada'
import { InternacoesClient } from './internacoes-client'

export const metadata = {
  title: 'Internações | Winners Health Intelligence',
  description: 'Internações em tempo real pelo SulAmérica Gestão Conectada: internados agora, altas e histórico.',
}

export const dynamic = 'force-dynamic'

export default async function InternacoesPage() {
  const [{ disponivel, internacoes, ultimaColeta, hoje }, benefDisplay] = await Promise.all([
    getInternacoesGC(),
    getBenefDisplay(),
  ])

  if (!disponivel || (internacoes.length === 0 && ultimaColeta?.status !== 'ok')) {
    return (
      <DashboardShell title="Internações">
        <EmptyState
          icon={BedDouble}
          title="Nenhuma internação lida ainda"
          description={
            ultimaColeta?.status === 'erro' && ultimaColeta.mensagem
              ? `A última atualização do Gestão Conectada falhou: ${ultimaColeta.mensagem}`
              : 'Cadastre o acesso ao SulAmérica Gestão Conectada em Configurações → Robôs. O robô lê as internações e atualiza esta tela a cada 6 horas.'
          }
          actionHref="/configuracoes?aba=robos"
          actionLabel="Configurar o robô"
        />
      </DashboardShell>
    )
  }

  return (
    <DashboardShell title="Internações">
      <InternacoesClient
        internacoes={internacoes}
        ultimaColeta={ultimaColeta}
        hoje={hoje}
        benefDisplay={benefDisplay}
      />
    </DashboardShell>
  )
}
