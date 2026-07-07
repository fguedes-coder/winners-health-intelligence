import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  BedDouble,
  Brain,
  Pill,
  Repeat,
  Siren,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { formatBRL, formatNumber } from '@/lib/data'
import { cn } from '@/lib/utils'

// Paleta de acento por card — reproduz o design da referência executiva.
export type Tone = 'blue' | 'emerald' | 'sky' | 'amber' | 'teal' | 'violet'

const TONE_BADGE: Record<Tone, string> = {
  blue: 'bg-blue-500/15 text-blue-400',
  emerald: 'bg-emerald-500/15 text-emerald-400',
  sky: 'bg-sky-500/15 text-sky-400',
  amber: 'bg-amber-500/15 text-amber-400',
  teal: 'bg-teal-500/15 text-teal-400',
  violet: 'bg-violet-500/15 text-violet-400',
}

// Realce estratégico (borda + fundo tonalizado) para KPIs de destaque.
const TONE_EMPHASIS: Record<Tone, string> = {
  blue: 'border-blue-500/40 bg-blue-500/[0.05] ring-1 ring-blue-500/15',
  emerald: 'border-emerald-500/40 bg-emerald-500/[0.05] ring-1 ring-emerald-500/15',
  sky: 'border-sky-500/40 bg-sky-500/[0.05] ring-1 ring-sky-500/15',
  amber: 'border-amber-500/50 bg-amber-500/[0.06] ring-1 ring-amber-500/20',
  teal: 'border-teal-500/40 bg-teal-500/[0.05] ring-1 ring-teal-500/15',
  violet: 'border-violet-500/40 bg-violet-500/[0.05] ring-1 ring-violet-500/15',
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  variation,
  invertVariation = false,
  hint,
  href,
  highlight = false,
  emphasize = false,
}: {
  label: string
  value: string
  icon: LucideIcon
  tone: Tone
  variation?: number | null
  invertVariation?: boolean
  hint?: string
  href?: string
  highlight?: boolean
  emphasize?: boolean
}) {
  const hasVar = variation !== undefined && variation !== null
  const positive = hasVar && (variation as number) >= 0
  const good = invertVariation ? !positive : positive

  const inner = (
    <div
      className={cn(
        'flex h-full flex-col justify-between gap-3 rounded-2xl border bg-card p-4 transition-colors',
        highlight
          ? TONE_EMPHASIS.amber
          : emphasize
            ? TONE_EMPHASIS[tone]
            : 'border-border/70',
        href && 'hover:border-primary/50',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium leading-snug text-muted-foreground text-pretty">
          {label}
        </span>
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            TONE_BADGE[tone],
          )}
        >
          <Icon className="size-[18px]" />
        </div>
      </div>

      <div>
        <div className="text-2xl font-bold leading-none tracking-tight text-foreground xl:text-[26px]">
          {value}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {hasVar && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold',
                good
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-destructive/15 text-destructive',
              )}
            >
              {positive ? (
                <ArrowUpRight className="size-3.5" />
              ) : (
                <ArrowDownRight className="size-3.5" />
              )}
              {Math.abs(variation as number).toLocaleString('pt-BR', {
                maximumFractionDigits: 1,
              })}
              %
            </span>
          )}
          {hint && (
            <span className="text-[11px] leading-tight text-muted-foreground text-pretty">
              {hint}
            </span>
          )}
        </div>
      </div>
    </div>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {inner}
      </Link>
    )
  }
  return inner
}

export function SectionCard({
  title,
  subtitle,
  icon: Icon,
  iconTone = 'blue',
  action,
  children,
  className,
}: {
  title: string
  subtitle?: string
  icon?: LucideIcon
  iconTone?: Tone
  action?: { label: string; href: string }
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'flex flex-col rounded-2xl border border-border/70 bg-card',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-border/60 p-5">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <div
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-lg',
                TONE_BADGE[iconTone],
              )}
            >
              <Icon className="size-[18px]" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground text-pretty">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action && (
          <Link
            href={action.href}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-80"
          >
            {action.label}
            <ArrowRight className="size-4" />
          </Link>
        )}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

// Barras horizontais de participação (Utilização por Categoria).
export function CategoriaBars({
  data,
  formatValor,
}: {
  data: { nome: string; valor: number; pct: number }[]
  formatValor: (v: number) => string
}) {
  const max = data.reduce((m, d) => Math.max(m, d.valor), 0) || 1
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Sem dados de categorias no período.
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-4">
      {data.map((c) => (
        <li key={c.nome} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-foreground">{c.nome}</span>
            <span className="shrink-0 font-medium tabular-nums text-foreground">
              {formatValor(c.valor)}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {c.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
              </span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(2, (c.valor / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

// Card dedicado de Saúde Mental — diferencia beneficiários monitorados,
// utilizações (frequência), custo, participação no custo e tendência.
export function SaudeMentalCard({
  beneficiarios,
  utilizacoes,
  custo,
  pctCusto,
  tendenciaPct,
  href = '/utilizacao?cat=saude-mental',
}: {
  beneficiarios: number
  utilizacoes: number
  custo: number
  pctCusto: number
  tendenciaPct: number | null
  href?: string
}) {
  const temTendencia = tendenciaPct !== null
  const subindo = temTendencia && (tendenciaPct as number) > 0
  const caindo = temTendencia && (tendenciaPct as number) < 0

  const metrics: { label: string; value: string; icon: LucideIcon }[] = [
    {
      label: 'Beneficiários monitorados',
      value: formatNumber(beneficiarios),
      icon: Users,
    },
    { label: 'Utilizações', value: formatNumber(utilizacoes), icon: Activity },
    { label: 'Custo', value: formatBRL(custo), icon: Wallet },
  ]

  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-teal-500/40 bg-teal-500/[0.05] p-5 ring-1 ring-teal-500/15 transition-colors hover:border-teal-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 text-teal-400">
            <Brain className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Saúde Mental
            </h2>
            <p className="text-xs text-muted-foreground">
              {pctCusto.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
              do custo assistencial
            </p>
          </div>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold',
            !temTendencia
              ? 'bg-secondary text-muted-foreground'
              : subindo
                ? 'bg-destructive/15 text-destructive'
                : 'bg-emerald-500/15 text-emerald-400',
          )}
        >
          {temTendencia ? (
            <>
              {subindo ? (
                <TrendingUp className="size-3.5" />
              ) : (
                <TrendingDown className="size-3.5" />
              )}
              {subindo ? '+' : caindo ? '' : ''}
              {(tendenciaPct as number).toLocaleString('pt-BR', {
                maximumFractionDigits: 1,
              })}
              %
            </>
          ) : (
            'Sem base'
          )}
        </span>
      </header>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {metrics.map((m) => {
          const Icon = m.icon
          return (
            <div
              key={m.label}
              className="flex flex-col gap-1 rounded-xl border border-border/60 bg-card p-3"
            >
              <span className="flex items-center gap-1.5 text-[11px] leading-tight text-muted-foreground text-pretty">
                <Icon className="size-3.5 shrink-0" />
                {m.label}
              </span>
              <span className="text-lg font-bold tabular-nums text-foreground">
                {m.value}
              </span>
            </div>
          )
        })}
      </div>

      <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-teal-400">
        {temTendencia
          ? subindo
            ? 'Tendência de crescimento — atenção preventiva'
            : 'Tendência de redução no período'
          : 'Acompanhamento preventivo recomendado'}
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </p>
    </Link>
  )
}

// Resolve o ícone do fator de risco a partir do rótulo.
function iconeFator(nome: string): LucideIcon {
  const n = nome.toLowerCase()
  if (n.includes('reinterna')) return Repeat
  if (n.includes('interna')) return BedDouble
  if (n.includes('pronto') || n.includes('socorro')) return Siren
  if (n.includes('mental')) return Brain
  if (n.includes('medicament')) return Pill
  if (n.includes('procedimento')) return Stethoscope
  if (n.includes('crescimento') || n.includes('custo')) return TrendingUp
  return Activity
}

// Lista de fatores de risco: ícone + rótulo + contagem em badge.
export function FatoresList({
  data,
}: {
  data: { nome: string; valor: number }[]
}) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhum fator de risco identificado no período.
      </p>
    )
  }
  return (
    <ul className="flex flex-col">
      {data.map((f, i) => {
        const Icon = iconeFator(f.nome)
        return (
          <li
            key={f.nome}
            className={cn(
              'flex items-center justify-between gap-3 py-2.5',
              i !== data.length - 1 && 'border-b border-border/40',
            )}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm text-foreground">{f.nome}</span>
            </span>
            <span className="inline-flex min-w-8 shrink-0 items-center justify-center rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
              {f.valor.toLocaleString('pt-BR')}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
