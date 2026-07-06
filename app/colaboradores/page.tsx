import { Users } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { EmptyState } from '@/components/empty-state'
import {
  getColaboradores,
  type ColaboradorFiltros,
} from '@/lib/queries'
import { ColaboradoresExplorer } from './colaboradores-explorer'

export default async function ColaboradoresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const str = (v: string | string[] | undefined) =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined

  const modo = str(sp.modo) ?? 'acumulado'
  const filtros: ColaboradorFiltros = {}
  if (modo === 'mes') filtros.mes = str(sp.mes)
  else if (modo === 'ano') filtros.ano = str(sp.ano)
  else if (modo === 'periodo') {
    filtros.de = str(sp.de)
    filtros.ate = str(sp.ate)
  }

  const data = await getColaboradores(filtros)

  if (data.totalVidas === 0 && data.mesesDisponiveis.length === 0) {
    return (
      <DashboardShell title="Beneficiários">
        <EmptyState
          icon={Users}
          title="Sem beneficiários para exibir"
          description="Importe a base de vidas elegíveis (CSV/TXT com cabeçalho) para gerir toda a população segurada. Você também pode importar um arquivo de utilização para cruzar os eventos por carteirinha."
          actionHref="/uploads"
          actionLabel="Importar utilização"
        />
      </DashboardShell>
    )
  }

  return (
    <DashboardShell title="Beneficiários">
      <ColaboradoresExplorer
        data={data}
        modo={modo}
        mes={str(sp.mes) ?? ''}
        ano={str(sp.ano) ?? ''}
        de={str(sp.de) ?? ''}
        ate={str(sp.ate) ?? ''}
        buscaInicial={str(sp.q) ?? ''}
      />
    </DashboardShell>
  )
}
