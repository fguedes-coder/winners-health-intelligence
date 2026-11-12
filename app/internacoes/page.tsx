import { BedDouble } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { EmptyState } from '@/components/empty-state'
import { getBenefDisplay } from '@/lib/display-prefs-server'
import { getAutorizacoesGC, getInternacoesGC, hojeSP } from '@/lib/gestao-conectada'
import { AutorizacoesCard } from './autorizacoes-card'
import { InternacoesClient } from './internacoes-client'

export const metadata = {
  title: 'Internações | Winners Health Intelligence',
  description: 'Internações em tempo real pelo SulAmérica Gestão Conectada: internados agora, altas e histórico.',
}

export const dynamic = 'force-dynamic'

export default async function InternacoesPage() {
  const umAno = new Date(Date.parse(`${hojeSP()}T12:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10)
  const [{ disponivel, internacoes, saudeMentalOutras, ultimaColeta, hoje }, benefDisplay, autorizacoes] = await Promise.all([
    getInternacoesGC(),
    getBenefDisplay(),
    getAutorizacoesGC(umAno),
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
        saudeMentalOutras={saudeMentalOutras}
        ultimaColeta={ultimaColeta}
        hoje={hoje}
        benefDisplay={benefDisplay}
      />
      <div className="mt-6">
        <AutorizacoesCard autorizacoes={autorizacoes} hoje={hoje} benefDisplay={benefDisplay} />
      </div>
    </DashboardShell>
  )
}
