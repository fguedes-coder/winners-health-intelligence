import { DashboardShell } from '@/components/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { UploadsManager } from './uploads-manager'
import type { ColetaSulAmerica, Importacao } from './actions'

export default async function UploadsPage() {
  const supabase = await createClient()

  const [{ data: importacoes }, { data: clientes }, { data: coletas }] = await Promise.all([
    supabase
      .from('importacoes')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase.from('clientes').select('id, nome').order('nome'),
    // Últimas buscas do coletor automático da SulAmérica. Se a tabela ainda
    // não existir, `data` vem nulo e a tela segue sem o cartão.
    supabase
      .from('coletas_sulamerica')
      .select('*')
      .order('solicitado_em', { ascending: false })
      .limit(5),
  ])

  return (
    <DashboardShell title="Upload de Arquivos">
      <UploadsManager
        importacoes={(importacoes as Importacao[]) ?? []}
        clientes={clientes ?? []}
        coletas={(coletas as ColetaSulAmerica[] | null) ?? null}
      />
    </DashboardShell>
  )
}
