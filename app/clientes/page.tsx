import { DashboardShell } from '@/components/dashboard-shell'
import { createClient } from '@/lib/supabase/server'
import { ClientesManager } from './clientes-manager'
import type { Cliente } from './actions'

export const dynamic = 'force-dynamic'

export default async function ClientesPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nome, cnpj, operadora, vidas, valor_fatura, created_at')
    .order('created_at', { ascending: false })

  const clientes = (data ?? []) as Cliente[]

  return (
    <DashboardShell title="Clientes">
      {error ? (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Não foi possível carregar os clientes: {error.message}
        </p>
      ) : (
        <ClientesManager clientes={clientes} />
      )}
    </DashboardShell>
  )
}
