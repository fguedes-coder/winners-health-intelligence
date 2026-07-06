import Link from 'next/link'
import { ArrowLeft, CloudUpload, ShieldCheck } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { EmptyState } from '@/components/empty-state'
import { getEventosDetalhados } from '@/lib/queries'
import {
  getBeneficiaryPanorama,
  panoramaTitulo,
  panoramaSubtitulo,
  RISCO_META,
  IMPACTO_META,
  type PanoramaFiltros,
} from '@/lib/beneficiary-panorama'
import { BeneficiaryPanoramaSections } from '@/components/beneficiary-panorama-sections'

export const metadata = {
  title: 'Panorama do Beneficiário | Winners Health Intelligence',
  description:
    'Visão clínica, financeira e estratégica consolidada de um beneficiário, com score de risco, perfil de utilização e recomendações preventivas.',
}

type SearchParams = Record<string, string | string[] | undefined>

export default async function BeneficiarioPanoramaPage({
  params,
  searchParams,
}: {
  params: Promise<{ carteirinha: string }>
  searchParams: Promise<SearchParams>
}) {
  const { carteirinha } = await params
  const sp = await searchParams
  const id = decodeURIComponent(carteirinha)

  const eventos = await getEventosDetalhados()

  if (eventos.length === 0) {
    return (
      <DashboardShell title="Panorama do Beneficiário">
        <EmptyState
          icon={CloudUpload}
          title="Nenhum dado de utilização disponível"
          description="Importe um arquivo de utilização da SulAmérica para gerar o panorama completo do beneficiário."
          actionHref="/uploads"
          actionLabel="Importar utilização"
        />
      </DashboardShell>
    )
  }

  const anonimizado = sp.anon === '1'
  const filtros: PanoramaFiltros = {
    cliente: sp.cliente,
    apolice: sp.apolice,
    sub: sp.sub,
    plano: sp.plano,
    mes: sp.mes,
  }

  const p = getBeneficiaryPanorama(eventos, id, filtros)

  if (!p.encontrado) {
    return (
      <DashboardShell title="Panorama do Beneficiário">
        <div className="flex flex-col gap-6">
          <Link
            href="/radar-risco"
            className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Voltar
          </Link>
          <EmptyState
            icon={CloudUpload}
            title="Beneficiário sem utilização no recorte"
            description="Não há atendimentos para este beneficiário dentro dos filtros aplicados. Ajuste o recorte e tente novamente."
          />
        </div>
      </DashboardShell>
    )
  }

  const titulo = panoramaTitulo(p, anonimizado)
  const subtitulo = panoramaSubtitulo(p, anonimizado)
  const meta = RISCO_META[p.kpis.faixa]
  const impactoMeta = IMPACTO_META[p.kpis.faixaImpacto]

  return (
    <DashboardShell title="Panorama do Beneficiário">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <Link
          href="/radar-risco"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para o Radar de Risco
        </Link>

        {/* Cabeçalho */}
        <header className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-primary">
                Panorama do Beneficiário
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-foreground text-balance">
                {titulo}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{subtitulo}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium"
                style={{
                  backgroundColor: `color-mix(in oklch, ${meta.cor} 22%, transparent)`,
                  color: meta.cor,
                }}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: meta.cor }}
                />
                {meta.label} · {p.kpis.score}/100
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: `color-mix(in oklch, ${impactoMeta.cor} 16%, transparent)`,
                  color: impactoMeta.cor,
                }}
              >
                Impacto {impactoMeta.label}
              </span>
            </div>
          </div>

          {anonimizado && (
            <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="size-3.5 shrink-0 text-primary" />
              Dados anonimizados conforme LGPD.
            </div>
          )}
        </header>

        <BeneficiaryPanoramaSections p={p} anonimizado={anonimizado} />
      </div>
    </DashboardShell>
  )
}
