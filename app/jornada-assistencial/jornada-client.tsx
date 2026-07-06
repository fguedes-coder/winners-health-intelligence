'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  BedDouble,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Download,
  Eye,
  FlaskConical,
  type LucideIcon,
  Radar,
  Repeat,
  RotateCcw,
  Search,
  ShieldCheck,
  Siren,
  Sparkles,
  Stethoscope,
  TrendingUp,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EventoDetalhado } from '@/lib/queries'
import {
  formatBRL2 as formatBRL,
  type Beneficiario,
  type BeneficiarioResumo,
  type JornadaKpis,
  type Risco,
} from './mock-data'
import {
  competenciaLabel,
  construirBeneficiario,
  filtrarPorCompetencias,
  listarCompetencias,
  resumirJornada,
} from './adapter'
import { CategoriaDonutChart, EvolucaoCustosChart } from './jornada-charts'

// ---------------------------------------------------------------------------
// Tokens visuais
// ---------------------------------------------------------------------------

const RISCO_BADGE: Record<Risco, string> = {
  Crítico: 'bg-destructive/15 text-destructive',
  Alto: 'bg-orange-500/15 text-orange-400',
  Moderado: 'bg-amber-500/15 text-amber-400',
  Baixo: 'bg-emerald-500/15 text-emerald-400',
}

const EVENTO_ICON: Record<string, LucideIcon> = {
  Consulta: Stethoscope,
  Exame: FlaskConical,
  'Pronto Socorro': Siren,
  Internação: BedDouble,
  Alta: CheckCircle2,
  Reinternação: Repeat,
  Retorno: RotateCcw,
}

const EVENTO_TONE: Record<string, string> = {
  Consulta: 'bg-blue-500/15 text-blue-400 ring-blue-500/30',
  Exame: 'bg-violet-500/15 text-violet-400 ring-violet-500/30',
  'Pronto Socorro': 'bg-orange-500/15 text-orange-400 ring-orange-500/30',
  Internação: 'bg-destructive/15 text-destructive ring-destructive/30',
  Alta: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  Reinternação: 'bg-destructive/15 text-destructive ring-destructive/30',
  Retorno: 'bg-teal-500/15 text-teal-400 ring-teal-500/30',
}

const TABS = [
  'Linha do Tempo',
  'Evolução de Custos',
  'Prestadores',
  'Resumo da Jornada',
  'Narrativa Assistencial',
  'Radar de Risco',
] as const
type Tab = (typeof TABS)[number]

// Texto auxiliar dos KPIs ("6,3% da base").
function pctBase(value: number, total: number): string {
  if (!total) return '0% da base'
  const pct = (value / total) * 100
  return `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da base`
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export function JornadaClient({ eventos }: { eventos: EventoDetalhado[] }) {
  // Competências disponíveis (YYYY-MM). Vazio em `competencias` = todos os meses.
  const competenciasDisponiveis = useMemo(
    () => listarCompetencias(eventos),
    [eventos],
  )
  const [competencias, setCompetencias] = useState<string[]>([])

  // Modo LGPD: por padrão anonimizado (nomes ocultos). Toggle revela os nomes.
  const [anonimizado, setAnonimizado] = useState(true)

  // Eventos restritos às competências selecionadas — tudo abaixo deriva daqui.
  const eventosFiltrados = useMemo(
    () => filtrarPorCompetencias(eventos, competencias),
    [eventos, competencias],
  )

  // Resumo canônico da carteira (KPIs + lista) derivado dos eventos filtrados.
  const { kpis, lista } = useMemo(
    () => resumirJornada(eventosFiltrados, anonimizado),
    [eventosFiltrados, anonimizado],
  )

  const [selectedId, setSelectedId] = useState(() => lista[0]?.id ?? '')
  const [busca, setBusca] = useState('')
  const [faixaRisco, setFaixaRisco] = useState<string>('Todos')
  const [ordenar, setOrdenar] = useState<string>('Maior custo')
  const [tab, setTab] = useState<Tab>('Linha do Tempo')

  const listaFiltrada = useMemo(() => {
    let out = [...lista]
    if (busca.trim()) {
      const q = busca.trim().toLowerCase()
      out = out.filter(
        (b) =>
          b.nome.toLowerCase().includes(q) || b.carteirinha.includes(q),
      )
    }
    if (faixaRisco !== 'Todos') {
      out = out.filter((b) => b.risco === faixaRisco)
    }
    out.sort((a, b) =>
      ordenar === 'Maior custo'
        ? b.custo - a.custo
        : ordenar === 'Mais eventos'
          ? b.eventos - a.eventos
          : a.nome.localeCompare(b.nome),
    )
    return out
  }, [lista, busca, faixaRisco, ordenar])

  // Se o selecionado sair da carteira filtrada, cai para o primeiro da lista.
  const selecionadoValido = lista.some((b) => b.id === selectedId)
  const idAtivo = selecionadoValido ? selectedId : (lista[0]?.id ?? '')

  // Rótulo anônimo (RISCO-xxx) já atribuído na lista — mantém detalhe e lista
  // com o mesmo identificador quando anonimizado.
  const displayLabelAtivo = lista.find((b) => b.id === idAtivo)?.nome

  // Detalhe completo (Panorama) apenas do beneficiário selecionado.
  const beneficiario = useMemo(
    () =>
      construirBeneficiario(eventosFiltrados, idAtivo, {
        anonimizado,
        displayLabel: displayLabelAtivo,
      }),
    [eventosFiltrados, idAtivo, anonimizado, displayLabelAtivo],
  )

  function limparFiltros() {
    setBusca('')
    setFaixaRisco('Todos')
    setOrdenar('Maior custo')
    setCompetencias([])
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Cabeçalho da página */}
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground lg:text-[28px]">
            Jornada Assistencial
          </h1>
          <p className="text-sm text-muted-foreground text-pretty">
            Acompanhe a trajetória de utilização e eventos assistenciais de cada
            beneficiário.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <CompetenciaPicker
            disponiveis={competenciasDisponiveis}
            selecionadas={competencias}
            onChange={setCompetencias}
          />
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-opacity hover:opacity-95"
          >
            <Download className="size-4" />
            Exportar Jornada
          </button>
        </div>
      </header>

      {/* KPIs superiores */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          icon={Users}
          tone="blue"
          label="Beneficiários com jornada"
          value={kpis.total.toLocaleString('pt-BR')}
          hint="Base com utilização"
        />
        <KpiCard
          icon={TriangleAlert}
          tone="red"
          label="Jornadas Críticas"
          value={kpis.criticas.toLocaleString('pt-BR')}
          hint={pctBase(kpis.criticas, kpis.total)}
        />
        <KpiCard
          icon={Building2}
          tone="orange"
          label="Reinternações"
          value={kpis.reinternacoes.toLocaleString('pt-BR')}
          hint={pctBase(kpis.reinternacoes, kpis.total)}
        />
        <KpiCard
          icon={DollarSign}
          tone="violet"
          label="Alto Custo"
          value={kpis.altoCusto.toLocaleString('pt-BR')}
          hint={pctBase(kpis.altoCusto, kpis.total)}
        />
        <KpiCard
          icon={TrendingUp}
          tone="emerald"
          label="Crescimento de utilização"
          value={kpis.crescimento.toLocaleString('pt-BR')}
          hint={pctBase(kpis.crescimento, kpis.total)}
        />
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-border/70 bg-card/60 p-3 backdrop-blur-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Field label="Buscar beneficiário" className="xl:col-span-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome ou carteirinha"
                className="h-9 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </Field>
          <Field label="Faixa de Risco">
            <SelectBox
              value={faixaRisco}
              onChange={setFaixaRisco}
              options={['Todos', 'Crítico', 'Alto', 'Moderado', 'Baixo']}
            />
          </Field>
          <Field label="Categoria">
            <SelectBox
              value="Todas"
              onChange={() => {}}
              options={['Todas', 'Internações', 'Exames', 'Consultas']}
            />
          </Field>
          <Field label="Prestador">
            <SelectBox
              value="Todos"
              onChange={() => {}}
              options={['Todos', 'Hospital São Lucas', 'Clínica Cardio']}
            />
          </Field>
          <div className="flex items-end gap-2">
            <Field label="Ordenar por" className="flex-1">
              <SelectBox
                value={ordenar}
                onChange={setOrdenar}
                options={['Maior custo', 'Mais eventos', 'Nome']}
              />
            </Field>
            <button
              type="button"
              onClick={limparFiltros}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              <RotateCcw className="size-4" />
              <span className="hidden sm:inline">Limpar filtros</span>
            </button>
          </div>
        </div>
      </div>

      {/* Layout principal: 3 colunas */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        {/* Coluna 1 — Lista de beneficiários */}
        <section className="flex flex-col rounded-2xl border border-border/70 bg-card">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 p-4">
            <h2 className="text-sm font-semibold text-foreground">
              Beneficiários ({kpis.total.toLocaleString('pt-BR')})
            </h2>
            <button
              type="button"
              onClick={() => setAnonimizado((v) => !v)}
              aria-pressed={anonimizado}
              title={
                anonimizado
                  ? 'Clique para revelar os nomes dos beneficiários'
                  : 'Clique para anonimizar novamente (LGPD)'
              }
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
                anonimizado
                  ? 'bg-primary/10 text-primary ring-primary/20 hover:bg-primary/15'
                  : 'bg-secondary text-muted-foreground ring-border hover:bg-secondary/70',
              )}
            >
              {anonimizado ? (
                <ShieldCheck className="size-3.5" />
              ) : (
                <Eye className="size-3.5" />
              )}
              {anonimizado ? 'Anonimizado (LGPD)' : 'Nomes visíveis'}
            </button>
          </header>
          <div className="flex flex-col gap-2 p-3">
            {listaFiltrada.map((b) => (
              <BeneficiarioItem
                key={b.id}
                b={b}
                active={b.id === idAtivo}
                anonimizado={anonimizado}
                onClick={() => setSelectedId(b.id)}
              />
            ))}
            {listaFiltrada.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                Nenhum beneficiário encontrado.
              </p>
            )}
            <button
              type="button"
              className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              Ver todos os beneficiários
              <ArrowRight className="size-4" />
            </button>
          </div>
        </section>

        {/* Coluna 2 — Detalhe da jornada */}
        {!beneficiario ? (
          <section className="flex min-w-0 items-center justify-center rounded-2xl border border-border/70 bg-card p-10 xl:col-span-2">
            <p className="text-center text-sm text-muted-foreground">
              Selecione um beneficiário para visualizar a jornada assistencial.
            </p>
          </section>
        ) : (
          <>
        <section className="flex min-w-0 flex-col gap-4">
          <BeneficiarioHeader b={beneficiario} anonimizado={anonimizado} />
          <IndicadoresJornada b={beneficiario} />
          <div className="flex flex-col rounded-2xl border border-border/70 bg-card">
            <nav className="flex flex-wrap gap-1 border-b border-border/60 px-3 pt-3">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'relative -mb-px rounded-t-lg px-3 py-2 text-sm font-medium transition-colors',
                    tab === t
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t}
                  {tab === t && (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </nav>
            <div className="p-5">
              <TabContent tab={tab} b={beneficiario} />
            </div>
          </div>
        </section>

        {/* Coluna 3 — Resumos e sinais */}
        <aside className="flex flex-col gap-4">
          <CardBlock title="Evolução de Custos (R$)">
            <EvolucaoCustosChart data={beneficiario.evolucaoCustos} />
          </CardBlock>

          <CardBlock title="Distribuição por Categoria">
            <CategoriaDonutChart data={beneficiario.categorias} />
            <ul className="mt-3 flex flex-col gap-2">
              {beneficiario.categorias.map((c) => (
                <li
                  key={c.nome}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: c.cor }}
                    />
                    {c.nome}
                  </span>
                  <span className="flex items-center gap-3 tabular-nums">
                    <span className="text-muted-foreground">
                      {c.pct.toLocaleString('pt-BR', {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                      %
                    </span>
                    <span className="font-medium text-foreground">
                      {formatBRL(c.valor)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardBlock>

          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/[0.05] p-5">
            <h3 className="text-sm font-semibold text-foreground">
              Sinais Identificados
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {beneficiario.sinais.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </aside>
          </>
        )}
      </div>

      {/* Narrativa Assistencial (IA) */}
      <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/[0.06] p-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Sparkles className="size-5" />
          </div>
          <p className="text-sm text-foreground">
            <span className="font-semibold">
              Narrativa Assistencial gerada por IA
            </span>{' '}
            <span className="text-muted-foreground">
              disponível nesta jornada
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTab('Narrativa Assistencial')}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
        >
          Ver narrativa completa
          <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------

const KPI_TONE: Record<string, string> = {
  blue: 'bg-blue-500 text-white',
  red: 'bg-destructive text-white',
  orange: 'bg-orange-500 text-white',
  violet: 'bg-violet-500 text-white',
  emerald: 'bg-emerald-500 text-white',
}

function KpiCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: LucideIcon
  tone: keyof typeof KPI_TONE
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border/70 bg-card p-4">
      <div
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-full',
          KPI_TONE[tone],
        )}
      >
        <Icon className="size-6" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] leading-snug text-muted-foreground text-pretty">
          {label}
        </p>
        <p className="text-2xl font-bold leading-tight text-foreground">
          {value}
        </p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </div>
  )
}

function CompetenciaPicker({
  disponiveis,
  selecionadas,
  onChange,
}: {
  disponiveis: string[]
  selecionadas: string[]
  onChange: (v: string[]) => void
}) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const todos = selecionadas.length === 0

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [aberto])

  function toggleMes(comp: string) {
    const set = new Set(selecionadas)
    if (set.has(comp)) set.delete(comp)
    else set.add(comp)
    onChange([...set])
  }

  const resumo = todos
    ? 'Todos os meses'
    : selecionadas.length === 1
      ? competenciaLabel(selecionadas[0])
      : `${selecionadas.length} meses selecionados`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:border-primary/50"
        aria-haspopup="listbox"
        aria-expanded={aberto}
      >
        <Calendar className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground">Competência:</span>
        <span className="font-semibold text-foreground">{resumo}</span>
        <ChevronDown
          className={cn(
            'size-4 text-muted-foreground transition-transform',
            aberto && 'rotate-180',
          )}
        />
      </button>

      {aberto && (
        <div className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-xl shadow-black/30">
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Selecionar meses
            </span>
            {!todos && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs font-medium text-primary hover:underline"
              >
                Limpar
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => onChange([])}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent/50"
          >
            <span
              className={cn(
                'flex size-4 items-center justify-center rounded border',
                todos
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border',
              )}
            >
              {todos && <Check className="size-3" />}
            </span>
            <span className={cn('font-medium', todos && 'text-foreground')}>
              Todos os meses
            </span>
          </button>

          <div className="max-h-64 overflow-y-auto border-t border-border/60 py-1">
            {disponiveis.map((comp) => {
              const marcado = selecionadas.includes(comp)
              return (
                <button
                  key={comp}
                  type="button"
                  onClick={() => toggleMes(comp)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent/50"
                >
                  <span
                    className={cn(
                      'flex size-4 items-center justify-center rounded border',
                      marcado
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border',
                    )}
                  >
                    {marcado && <Check className="size-3" />}
                  </span>
                  <span
                    className={cn(
                      'tabular-nums',
                      marcado ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {competenciaLabel(comp)}
                  </span>
                </button>
              )
            })}
            {disponiveis.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                Nenhuma competência disponível.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  className,
  children,
  }: {
  label: string
  className?: string
  children: React.ReactNode
  }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function SelectBox({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full appearance-none rounded-lg border border-border bg-card px-3 pr-8 text-sm text-foreground outline-none transition-colors hover:border-primary/50 focus:border-primary/60"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 rotate-90 text-muted-foreground" />
    </div>
  )
}

function BeneficiarioItem({
  b,
  active,
  anonimizado,
  onClick,
  }: {
  b: BeneficiarioResumo
  active: boolean
  anonimizado: boolean
  onClick: () => void
  }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
        active
          ? 'border-primary bg-primary/10'
          : 'border-transparent hover:border-border hover:bg-muted/40',
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground">
        {b.iniciais}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {b.nome}
          </span>
          <span
            className={cn(
              'shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
              RISCO_BADGE[b.risco],
            )}
          >
            {b.risco}
          </span>
        </div>
        <p className="truncate text-[11px] text-muted-foreground">
          {anonimizado ? 'Identificador anônimo (LGPD)' : `Carteirinha: ${b.carteirinha}`}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          Custo: {formatBRL(b.custo)} • Eventos: {b.eventos}
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function BeneficiarioHeader({
  b,
  anonimizado,
}: {
  b: Beneficiario
  anonimizado: boolean
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-secondary text-lg font-bold text-foreground">
            {b.iniciais}
          </div>
          <div>
                <h2 className="text-xl font-bold text-foreground">{b.nome}</h2>
                <p className="text-xs text-muted-foreground">
                  {anonimizado
                    ? 'Identificador anônimo (LGPD)'
                    : `Carteirinha: ${b.carteirinha}`}
                </p>
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold',
            RISCO_BADGE[b.risco],
          )}
        >
          Risco {b.risco}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/50 pt-4 text-sm">
        <InfoInline label="Sexo" value={b.sexo} />
        <InfoInline label="Idade" value={`${b.idade} anos`} />
        <InfoInline label="Plano" value={b.plano} />
        <InfoInline label="Tipo" value={b.tipo} />
        <span className="ml-auto text-sm">
          <span className="text-muted-foreground">Score: </span>
          <span className="font-semibold text-foreground">{b.score}/100</span>
        </span>
      </div>
    </div>
  )
}

function InfoInline({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-muted-foreground">
      {label}: <span className="font-medium text-foreground">{value}</span>
    </span>
  )
}

function IndicadoresJornada({ b }: { b: Beneficiario }) {
  const itens = [
    {
      label: 'Impacto financeiro',
      value: formatBRL(b.impactoFinanceiro),
      hint: `${b.pctCarteira.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da carteira`,
    },
    { label: 'Primeiro evento', value: b.primeiroEvento, hint: b.primeiroEventoHa },
    { label: 'Último evento', value: b.ultimoEvento, hint: b.ultimoEventoHa },
    {
      label: 'Total de eventos',
      value: String(b.totalEventos),
      hint: 'Assistenciais',
    },
    {
      label: 'Prestadores utilizados',
      value: String(b.prestadoresUtilizados),
      hint: 'Distintos',
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {itens.map((i) => (
        <div
          key={i.label}
          className="rounded-xl border border-border/70 bg-card p-3"
        >
          <p className="text-[11px] leading-tight text-muted-foreground text-pretty">
            {i.label}
          </p>
          <p className="mt-1 text-sm font-bold leading-tight tabular-nums text-foreground text-pretty">
            {i.value}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{i.hint}</p>
        </div>
      ))}
    </div>
  )
}

function CardBlock({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Conteúdo das abas
// ---------------------------------------------------------------------------

function TabContent({ tab, b }: { tab: Tab; b: Beneficiario }) {
  if (tab === 'Linha do Tempo') return <Timeline b={b} />
  if (tab === 'Evolução de Custos')
    return (
      <div>
        <EvolucaoCustosChart data={b.evolucaoCustos} height={320} />
      </div>
    )
  if (tab === 'Prestadores') return <PrestadoresTab b={b} />
  if (tab === 'Resumo da Jornada') return <ResumoTab b={b} />
  if (tab === 'Narrativa Assistencial') return <NarrativaTab b={b} />
  return <RadarTab b={b} />
}

function Timeline({ b }: { b: Beneficiario }) {
  return (
    <div>
      <h3 className="mb-4 text-base font-semibold text-foreground">
        Linha do Tempo Assistencial
      </h3>
      <ol className="relative flex flex-col">
        {b.timeline.map((e, i) => {
          const Icon = EVENTO_ICON[e.tipo] ?? Stethoscope
          const destaque = e.destaque === 'internacao' || e.destaque === 'reinternacao'
          const isLast = i === b.timeline.length - 1
          return (
            <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
              {!isLast && (
                <span className="absolute left-[19px] top-10 h-[calc(100%-1rem)] w-px bg-border" />
              )}
              <span
                className={cn(
                  'z-10 flex size-10 shrink-0 items-center justify-center rounded-full ring-4 ring-background',
                  EVENTO_TONE[e.tipo],
                )}
              >
                <Icon className="size-4.5" />
              </span>
              <div
                className={cn(
                  'flex flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl px-3 py-2',
                  destaque && 'border border-destructive/30 bg-destructive/[0.06]',
                )}
              >
                <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
                  {e.data}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      destaque ? 'text-destructive' : 'text-foreground',
                    )}
                  >
                    {e.titulo}
                  </p>
                  <p className="text-xs text-muted-foreground">{e.descricao}</p>
                  {e.detalhe && (
                    <p className="text-[11px] font-medium text-destructive">
                      {e.detalhe}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {e.prestador}
                </span>
                <span
                  className={cn(
                    'w-24 shrink-0 text-right text-sm font-semibold tabular-nums',
                    destaque ? 'text-destructive' : 'text-foreground',
                  )}
                >
                  {formatBRL(e.valor)}
                </span>
              </div>
            </li>
          )
        })}
      </ol>
      <button
        type="button"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      >
        Ver todos os {b.totalEventos} eventos
      </button>
    </div>
  )
}

function PrestadoresTab({ b }: { b: Beneficiario }) {
  const max = b.prestadores.reduce((m, p) => Math.max(m, p.valor), 0) || 1
  return (
    <div>
      <h3 className="mb-4 text-base font-semibold text-foreground">
        Prestadores Utilizados
      </h3>
      <ul className="flex flex-col gap-4">
        {b.prestadores.map((p) => (
          <li key={p.nome} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-foreground">{p.nome}</span>
              <span className="shrink-0 font-medium tabular-nums text-foreground">
                {formatBRL(p.valor)}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {p.atendimentos} atend.
                </span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(3, (p.valor / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ResumoTab({ b }: { b: Beneficiario }) {
  const itens = [
    ['Total de eventos', String(b.totalEventos)],
    ['Prestadores distintos', String(b.prestadoresUtilizados)],
    ['Impacto financeiro', formatBRL(b.impactoFinanceiro)],
    ['Participação na carteira', `${b.pctCarteira.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`],
    ['Primeiro evento', b.primeiroEvento],
    ['Último evento', b.ultimoEvento],
  ]
  return (
    <div>
      <h3 className="mb-4 text-base font-semibold text-foreground">
        Resumo da Jornada
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {itens.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 px-4 py-3"
          >
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="text-sm font-semibold text-foreground">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function NarrativaTab({ b }: { b: Beneficiario }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h3 className="text-base font-semibold text-foreground">
          Narrativa Assistencial gerada por IA
        </h3>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
        {b.narrativa}
      </p>
    </div>
  )
}

function RadarTab({ b }: { b: Beneficiario }) {
  return (
    <div>
      <h3 className="mb-4 text-base font-semibold text-foreground">
        Radar de Risco
      </h3>
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <div className="flex size-28 shrink-0 flex-col items-center justify-center rounded-full border-4 border-destructive/30 text-destructive">
          <span className="text-3xl font-bold">{b.score}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
        <div className="flex-1">
          <p className="mb-3 text-sm font-medium text-foreground">
            Fatores identificados
          </p>
          <ul className="flex flex-col gap-2">
            {b.fatoresRisco.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                <CheckCircle2 className="size-4 text-primary" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <a
        href="/radar-risco"
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
      >
        <Radar className="size-4" />
        Abrir Radar Completo
      </a>
    </div>
  )
}
