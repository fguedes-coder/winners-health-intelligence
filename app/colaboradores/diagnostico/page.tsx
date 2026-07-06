import { DashboardShell } from '@/components/dashboard-shell'
import {
  getDiagnosticoBase,
  getQualidadeCadastral,
  type ColaboradorFiltros,
} from '@/lib/queries'
import { formatCompetencia } from '@/lib/categorias'
import { DiagnosticoView } from './diagnostico-view'

export default async function DiagnosticoPage({
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

  // Preserva o período selecionado ao voltar para a listagem.
  const params = new URLSearchParams()
  params.set('modo', modo)
  if (modo === 'mes' && str(sp.mes)) params.set('mes', str(sp.mes) as string)
  if (modo === 'ano' && str(sp.ano)) params.set('ano', str(sp.ano) as string)
  if (modo === 'periodo') {
    if (str(sp.de)) params.set('de', str(sp.de) as string)
    if (str(sp.ate)) params.set('ate', str(sp.ate) as string)
  }

  const periodoLabel =
    modo === 'mes' && filtros.mes
      ? formatCompetencia(filtros.mes)
      : modo === 'ano' && filtros.ano
        ? filtros.ano
        : modo === 'periodo' && (filtros.de || filtros.ate)
          ? `${filtros.de ?? '…'} a ${filtros.ate ?? '…'}`
          : 'Acumulado (até hoje)'

  const [data, qualidade] = await Promise.all([
    getDiagnosticoBase(filtros),
    getQualidadeCadastral(),
  ])

  return (
    <DashboardShell title="Diagnóstico de Base Elegível">
      <DiagnosticoView
        data={data}
        qualidade={qualidade}
        querystring={params.toString()}
        periodoLabel={periodoLabel}
      />
    </DashboardShell>
  )
}
