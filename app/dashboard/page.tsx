import {
  Activity,
  BarChart3,
  CloudUpload,
  FileText,
  Flame,
  Info,
  Receipt,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { DashboardShell } from '@/components/dashboard-shell'
import { EmptyState } from '@/components/empty-state'
import { EvolucaoSinistralidadeChart, RiscoDonutChart } from '@/components/charts'
import { formatBRL, formatNumber } from '@/lib/data'
import {
  getDashboardData,
  getEventosDetalhados,
  type DashboardFiltros,
} from '@/lib/queries'
import { resumirRadar } from '@/lib/radar-agg'
import { ExecutiveFilters } from './executive-filters'
import {
  CategoriaBars,
  FatoresList,
  KpiCard,
  SaudeMentalCard,
  SectionCard,
  type Tone,
} from './executive-cards'
import { TopVidasTable } from './top-vidas-table'

function toArray(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined
  const arr = (Array.isArray(v) ? v : v.split(','))
    .map((s) => s.trim())
    .filter(Boolean)
  return arr.length ? arr : undefined
}

function varPct(cur?: number, prev?: number): number | null {
  if (cur === undefined || prev === undefined || !prev) return null
  return ((cur - prev) / prev) * 100
}

// Prioridade de ação derivada do score (para a tabela Top 5).
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams

  const filtros: DashboardFiltros = {
    apolice: toArray(sp.apolice),
    sub: toArray(sp.sub),
    plano: toArray(sp.plano),
    mes: toArray(sp.mes),
  }

  const [data, eventos] = await Promise.all([
    getDashboardData(filtros),
    getEventosDetalhados(),
  ])

  if (!data.hasData) {
    return (
      <DashboardShell title="Dashboard">
        <EmptyState
          icon={CloudUpload}
          title="Nenhum dado importado ainda"
          description="Importe um arquivo TXT de utilização da SulAmérica para ver os indicadores reais da carteira neste painel executivo."
          actionHref="/uploads"
          actionLabel="Importar utilização"
        />
      </DashboardShell>
    )
  }

  // Radar de risco (dados anonimizados por padrão — conformidade LGPD).
  const resumo = resumirRadar(eventos, {
    mes: filtros.mes,
    modo: 'anonimizado',
    topN: 5,
  })

  const { kpis } = data
  const contagem = resumo.contagem
  const vidasRisco = contagem.moderado + contagem.alto + contagem.critico

  // Variações período-a-período (último mês vs. anterior) a partir das séries.
  const um = data.utilizacaoMensal
  const uLast = um.at(-1)
  const uPrev = um.at(-2)
  const varUtil = varPct(uLast?.utilizado, uPrev?.utilizado)
  const varFatura = varPct(uLast?.fatura, uPrev?.fatura)
  const tendenciaAlta = varUtil !== null && varUtil > 0
  const deltaUtil =
    uLast?.utilizado !== undefined && uPrev?.utilizado !== undefined
      ? uLast.utilizado - uPrev.utilizado
      : null

  const es = data.evolucaoSinistralidade
  const sinLast = es.at(-1)?.valor
  const sinPrev = es.at(-2)?.valor
  const varSin =
    sinLast !== undefined && sinPrev !== undefined ? sinLast - sinPrev : null

  // Subtítulo de composição das vidas em risco.
  const compostoRisco = [
    contagem.critico > 0 ? `${contagem.critico} críticas` : null,
    contagem.alto > 0 ? `${contagem.alto} de alto risco` : null,
    contagem.moderado > 0 ? `${contagem.moderado} moderadas` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const periodoTxt =
    um.length > 0
      ? um.length === 1
        ? um[0].mes
        : `${um[0].mes} a ${um[um.length - 1].mes}`
      : 'Sem competências'

  // Categorias de maior participação para o painel de barras.
  const categorias = data.categoriasGerenciais
    .filter((c) => c.valor > 0)
    .slice(0, 6)

  // Insight principal automático a partir dos dados reais.
  const topCat = categorias[0]
  const insight =
    topCat && kpis.valorUtilizado
      ? `${topCat.nome} concentra ${topCat.pct.toLocaleString('pt-BR', {
          maximumFractionDigits: 1,
        })}% do custo assistencial no período${
          vidasRisco > 0
            ? `, e ${vidasRisco} vida(s) em situação de risco respondem por ${resumo.pctImpacto.toLocaleString(
                'pt-BR',
                { maximumFractionDigits: 1 },
              )}% do valor utilizado.`
            : '.'
        } Priorizar a gestão dessas frentes tende a reduzir a sinistralidade nas próximas competências.`
      : 'Importe mais competências para gerar recomendações estratégicas baseadas na evolução da carteira.'

  return (
    <DashboardShell title="Dashboard">
      <div className="flex flex-col gap-5">
        {/* Filtros executivos (faixa horizontal compacta) */}
        <ExecutiveFilters
          apolices={data.opcoes.apolices}
          subestipulantes={data.opcoes.subestipulantes}
          planos={data.opcoes.planos}
          meses={data.opcoes.meses}
        />

        {/* Cabeçalho executivo */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance lg:text-3xl">
                Resumo Executivo da Carteira
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary ring-1 ring-inset ring-primary/20">
                <Sparkles className="size-3.5" />
                Inteligência de saúde
              </span>
            </div>
            <p className="text-sm text-muted-foreground text-pretty">
              Visão consolidada da saúde da sua empresa
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Users className="size-4 text-primary" />
              <span className="font-semibold text-foreground">
                {formatNumber(resumo.total)}
              </span>
              vidas analisadas
            </span>
            <span className="hidden h-4 w-px bg-border sm:block" />
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <span className="size-2 rounded-full bg-primary" />
              Competências:{' '}
              <span className="font-semibold text-foreground">
                {data.competenciasNoRecorte}
              </span>
              <span className="text-muted-foreground">({periodoTxt})</span>
            </span>
          </div>
        </div>

        {!data.vidas.cadastrada && (
          <Link
            href="/sinistralidade"
            className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm transition-colors hover:border-primary/50 hover:bg-secondary/60"
          >
            <TriangleAlert className="size-4 shrink-0 text-warning" />
            <span className="text-pretty text-muted-foreground">
              O arquivo de utilização não contém as vidas ativas da apólice.
              Cadastre o total de vidas em{' '}
              <span className="font-medium text-foreground">Sinistralidade</span>{' '}
              para liberar taxa de utilização e custo por vida.
            </span>
          </Link>
        )}

        {/* KPIs estratégicos — protagonistas da primeira dobra */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="Utilização Total"
            value={formatBRL(kpis.valorUtilizado)}
            icon={Wallet}
            tone="blue"
            variation={varUtil}
            invertVariation
            hint="vs. período anterior"
          />
          <KpiCard
            label="Fatura Total"
            value={
              kpis.valorFatura === null ? 'Não informada' : formatBRL(kpis.valorFatura)
            }
            icon={Receipt}
            tone="emerald"
            variation={kpis.valorFatura === null ? null : varFatura}
            hint={
              kpis.valorFatura === null
                ? 'Cadastre as faturas'
                : 'vs. período anterior'
            }
            href={kpis.valorFatura === null ? '/sinistralidade' : undefined}
          />
          <KpiCard
            label="Sinistralidade Consolidada"
            value={
              kpis.sinistralidadeConsolidada === null
                ? 'Não informada'
                : `${kpis.sinistralidadeConsolidada.toLocaleString('pt-BR', {
                    maximumFractionDigits: 1,
                  })}%`
            }
            icon={Activity}
            tone="sky"
            variation={kpis.sinistralidadeConsolidada === null ? null : varSin}
            invertVariation
            hint={
              kpis.sinistralidadeConsolidada === null
                ? 'Cadastre as faturas'
                : 'p.p. vs. período anterior'
            }
          />
          <KpiCard
            label="Vidas em Risco"
            value={formatNumber(vidasRisco)}
            icon={TriangleAlert}
            tone="amber"
            highlight
            hint={compostoRisco || 'Nenhuma vida em risco'}
            href="/radar-risco"
          />
          <KpiCard
            label="Potencial de Impacto Financeiro"
            value={formatBRL(resumo.impactoFinanceiro)}
            icon={Target}
            tone="teal"
            emphasize
            hint={`${resumo.pctImpacto.toLocaleString('pt-BR', {
              maximumFractionDigits: 1,
            })}% do custo utilizado`}
            href="/radar-risco"
          />
          <KpiCard
            label="Oportunidade de Economia"
            value={formatBRL(resumo.plano.economiaPotencial)}
            icon={Sparkles}
            tone="violet"
            emphasize
            hint="Estimativa preventiva (20%)"
            href="/relatorios"
          />
        </div>

        {/* Saúde Mental — card estratégico dedicado */}
        <SaudeMentalCard
          beneficiarios={data.saudeMentalResumo.beneficiarios}
          utilizacoes={data.saudeMentalResumo.utilizacoes}
          custo={data.saudeMentalResumo.custo}
          pctCusto={data.saudeMentalResumo.pctCusto}
          tendenciaPct={data.saudeMentalResumo.tendenciaPct}
        />

        {/* Evolução + Radar + Categoria */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-10">
          <SectionCard
            title="Evolução da Sinistralidade (%)"
            subtitle="Por competência, com faixas de risco e break-even"
            icon={TrendingDown}
            iconTone="sky"
            className="xl:col-span-4"
          >
            {data.sinistralidadeDisponivel ? (
              <EvolucaoSinistralidadeChart data={data.evolucaoSinistralidade} />
            ) : (
              <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center">
                <p className="text-sm text-muted-foreground text-pretty">
                  A sinistralidade é calculada quando o valor da fatura é
                  cadastrado por competência.
                </p>
                <Link
                  href="/sinistralidade"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Cadastrar faturas
                </Link>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Radar de Risco da Carteira"
            subtitle="Distribuição das vidas por faixa"
            icon={ShieldAlert}
            iconTone="amber"
            action={{ label: 'Ver radar', href: '/radar-risco' }}
            className="xl:col-span-3"
          >
            <RiscoDonutChart
              data={resumo.distribuicao}
              centerValue={formatNumber(resumo.total)}
              centerLabel="vidas com utilização"
            />
            <ul className="mt-4 flex flex-col gap-2">
              {resumo.distribuicao.map((d) => (
                <li
                  key={d.nome}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: d.cor }}
                    />
                    {d.nome}
                  </span>
                  <span className="font-medium tabular-nums text-foreground">
                    {formatNumber(d.valor)}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/radar-risco"
              className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
            >
              Ver Radar Completo
            </Link>
          </SectionCard>

          <SectionCard
            title="Utilização por Categoria (Valor)"
            subtitle="Participação no custo assistencial"
            icon={BarChart3}
            iconTone="blue"
            action={{ label: 'Detalhar', href: '/utilizacao' }}
            className="xl:col-span-3"
          >
            <CategoriaBars data={categorias} formatValor={formatBRL} />
          </SectionCard>
        </div>

        {/* Top 5 + Fatores + Tendência */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-10">
          <SectionCard
            title="Top 5 Vidas Prioritárias"
            subtitle="Maior potencial de impacto assistencial e financeiro"
            icon={Users}
            iconTone="violet"
            action={{ label: 'Ver radar completo', href: '/radar-risco' }}
            className="xl:col-span-4"
          >
            <TopVidasTable top={resumo.top} eventos={eventos} filtros={filtros} />
          </SectionCard>

          <SectionCard
            title="Principais Fatores de Risco"
            className="xl:col-span-3"
            subtitle="Ocorrências que elevam o risco assistencial"
            icon={Flame}
            iconTone="amber"
            action={{ label: 'Ver todos', href: '/radar-risco' }}
          >
            <FatoresList data={resumo.fatores.slice(0, 6)} />
          </SectionCard>

          <SectionCard
            title="Tendência da Carteira"
            subtitle="Movimento no último período"
            icon={TrendingUp}
            iconTone="teal"
            className="xl:col-span-3"
          >
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <div
                className={`flex size-24 items-center justify-center rounded-full border-4 ${
                  tendenciaAlta
                    ? 'border-destructive/30 text-destructive'
                    : 'border-emerald-500/30 text-emerald-400'
                }`}
              >
                {tendenciaAlta ? (
                  <TrendingUp className="size-10" />
                ) : (
                  <TrendingDown className="size-10" />
                )}
              </div>
              <div>
                <span
                  className={`text-4xl font-bold tracking-tight ${
                    tendenciaAlta ? 'text-destructive' : 'text-emerald-400'
                  }`}
                >
                  {varUtil === null
                    ? '—'
                    : `${varUtil > 0 ? '+' : ''}${varUtil.toLocaleString(
                        'pt-BR',
                        { maximumFractionDigits: 1 },
                      )}%`}
                </span>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {varUtil === null
                    ? 'Sem base de comparação'
                    : tendenciaAlta
                      ? 'Aumento na utilização total'
                      : 'Redução na utilização total'}
                </p>
              </div>
              {deltaUtil !== null && (
                <p className="text-sm text-muted-foreground text-pretty">
                  A utilização total {tendenciaAlta ? 'aumentou' : 'reduziu'}{' '}
                  <span className="font-semibold text-foreground">
                    {formatBRL(Math.abs(deltaUtil))}
                  </span>{' '}
                  em relação ao período anterior.
                </p>
              )}
            </div>
          </SectionCard>
        </div>

        {/* Insights principais + Aprofundar análise */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-10">
          {/* Insights */}
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-primary/25 bg-primary/[0.06] p-5 xl:col-span-6">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Info className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Insights principais
                </p>
                <p className="mt-1 text-sm text-muted-foreground text-pretty">
                  {insight}
                </p>
              </div>
            </div>
            <Link
              href="/relatorios"
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-opacity hover:opacity-95 sm:w-auto sm:self-end"
            >
              Ver Recomendações
            </Link>
          </div>

          {/* Aprofundar análise */}
          <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-5 xl:col-span-4">
            <h2 className="text-base font-semibold text-foreground">
              Aprofundar análise
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {aprofundar.map((a) => (
                <AprofundarCard key={a.href} {...a} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}

const aprofundar: {
  href: string
  icon: LucideIcon
  title: string
  tone: Tone
}[] = [
  {
    href: '/utilizacao',
    icon: BarChart3,
    title: 'Utilização detalhada',
    tone: 'blue',
  },
  {
    href: '/sinistralidade',
    icon: Activity,
    title: 'Sinistralidade completa',
    tone: 'sky',
  },
  {
    href: '/radar-risco',
    icon: ShieldAlert,
    title: 'Radar de Risco completo',
    tone: 'amber',
  },
  {
    href: '/relatorios',
    icon: FileText,
    title: 'Relatórios gerenciais',
    tone: 'emerald',
  },
]

const APROFUNDAR_TONE: Record<Tone, string> = {
  blue: 'bg-blue-500/15 text-blue-400',
  emerald: 'bg-emerald-500/15 text-emerald-400',
  sky: 'bg-sky-500/15 text-sky-400',
  amber: 'bg-amber-500/15 text-amber-400',
  teal: 'bg-teal-500/15 text-teal-400',
  violet: 'bg-violet-500/15 text-violet-400',
}

function AprofundarCard({
  href,
  icon: Icon,
  title,
  tone,
}: {
  href: string
  icon: LucideIcon
  title: string
  tone: Tone
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border bg-secondary/30 p-3 transition-colors hover:border-primary/50 hover:bg-secondary/50"
    >
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${APROFUNDAR_TONE[tone]}`}
      >
        <Icon className="size-[18px]" />
      </span>
      <span className="text-sm font-medium leading-tight text-foreground text-pretty">
        {title}
      </span>
    </Link>
  )
}
