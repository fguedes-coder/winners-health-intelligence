import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { ConfiguracoesForm } from './configuracoes-form'
import { RobosPanel } from './robos-panel'
import { getPerfil } from './actions'
import { getStatusRoboSulAmerica } from './robos-actions'

const ABAS = [
  { id: 'geral', rotulo: 'Geral' },
  { id: 'robos', rotulo: 'Robôs' },
] as const

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/')

  const { aba: abaParam } = await searchParams
  const aba = abaParam === 'robos' ? 'robos' : 'geral'

  return (
    <DashboardShell title="Configurações">
      <nav className="mb-6 flex max-w-4xl gap-1 border-b border-border" aria-label="Seções de configurações">
        {ABAS.map((a) => (
          <Link
            key={a.id}
            href={a.id === 'geral' ? '/configuracoes' : `/configuracoes?aba=${a.id}`}
            aria-current={aba === a.id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              aba === a.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {a.rotulo}
          </Link>
        ))}
      </nav>

      {aba === 'robos' ? (
        <RobosPanel status={await getStatusRoboSulAmerica()} />
      ) : (
        <ConfiguracoesForm perfil={perfil} />
      )}
    </DashboardShell>
  )
}
