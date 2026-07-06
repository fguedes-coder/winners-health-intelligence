import type { ReactNode } from 'react'
import { DashboardSidebar } from '@/components/dashboard-sidebar'
import { DashboardTopbar } from '@/components/dashboard-topbar'
import { getBenefDisplay } from '@/lib/display-prefs-server'
import { createClient } from '@/lib/supabase/server'

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

export async function DashboardShell({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const benefDisplay = await getBenefDisplay()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
  const nome =
    (typeof meta.nome === 'string' && meta.nome.trim()) ||
    user?.email?.split('@')[0] ||
    'Usuário'
  const cargo =
    typeof meta.cargo === 'string' && meta.cargo.trim() ? meta.cargo : 'Membro'

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar
          title={title}
          benefDisplay={benefDisplay}
          usuario={{ nome, cargo, iniciais: iniciais(nome) }}
        />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
