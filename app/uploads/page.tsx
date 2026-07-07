import { DashboardShell } from '@/components/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { UploadsManager } from './uploads-manager'
import type { Importacao } from './actions'

export default async function UploadsPage() {
  const supabase = await createClient()

  const [{ data: importacoes }, { data: clientes }] = await Promise.all([
    supabase
      .from('importacoes')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase.from('clientes').select('id, nome').order('nome'),
  ])

  return (
    <DashboardShell title="Upload de Arquivos">
      <UploadsManager
        importacoes={(importacoes as Importacao[]) ?? []}
        clientes={clientes ?? []}
      />
    </DashboardShell>
  )
}
