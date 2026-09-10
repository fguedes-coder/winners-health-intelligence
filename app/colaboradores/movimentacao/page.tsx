import { DashboardShell } from '@/components/dashboard-shell'
import { getMovimentacaoCarteira } from '@/lib/queries'
import { MovimentacaoView } from './movimentacao-view'

export default async function MovimentacaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const str = (v: string | string[] | undefined) =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined

  // Preserva o período selecionado ao voltar para a listagem de Beneficiários.
  const params = new URLSearchParams()
  const modo = str(sp.modo) ?? 'acumulado'
  params.set('modo', modo)
  if (modo === 'mes' && str(sp.mes)) params.set('mes', str(sp.mes) as string)
  if (modo === 'ano' && str(sp.ano)) params.set('ano', str(sp.ano) as string)
  if (modo === 'periodo') {
    if (str(sp.de)) params.set('de', str(sp.de) as string)
    if (str(sp.ate)) params.set('ate', str(sp.ate) as string)
  }

  const data = await getMovimentacaoCarteira()

  return (
    <DashboardShell title="Movimentação da Carteira">
      <MovimentacaoView data={data} querystring={params.toString()} />
    </DashboardShell>
  )
}
