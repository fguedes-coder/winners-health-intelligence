import { DashboardShell } from '@/components/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { getSubestipulantesPorApolice } from '@/lib/queries'
import { ApolicesManager } from './apolices-manager'
import type { Apolice } from './actions'

export default async function ApolicesPage() {
  const supabase = await createClient()
  const [{ data: apolices }, { data: clientes }, subsPorApolice] =
    await Promise.all([
      supabase
        .from('apolices')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('clientes').select('id, nome').order('nome'),
      getSubestipulantesPorApolice(),
    ])

  return (
    <DashboardShell title="Apólices">
      <ApolicesManager
        apolices={(apolices as Apolice[]) ?? []}
        clientes={(clientes as { id: string; nome: string }[]) ?? []}
        subsPorApolice={subsPorApolice}
      />
    </DashboardShell>
  )
}
