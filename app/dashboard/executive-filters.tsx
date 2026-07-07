'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  CalendarRange,
  ChevronDown,
  Download,
  GitCompareArrows,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react'
import { MultiSelect } from './dashboard-filters'

const MESES_LONGOS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

function mesLongo(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})$/)
  if (!m) return value
  return `${MESES_LONGOS[Number(m[2]) - 1]}/${m[1]}`
}

type Filtros = {
  apolice: string[]
  sub: string[]
  plano: string[]
  mes: string[]
}

const PERIODOS = [
  { value: '', label: 'Todo o período' },
  { value: '3', label: 'Últimos 3 meses' },
  { value: '6', label: 'Últimos 6 meses' },
  { value: '12', label: 'Últimos 12 meses' },
] as const

const COMPARACOES = [
  { value: 'anterior', label: 'Período anterior' },
  { value: 'ano', label: 'Mesmo período (ano anterior)' },
  { value: 'nenhum', label: 'Sem comparação' },
] as const

export function ExecutiveFilters({
  apolices,
  subestipulantes,
  planos,
  meses,
}: {
  apolices: { numero: string; label: string }[]
  subestipulantes: { codigo: string; label: string }[]
  planos: string[]
  meses: string[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function read(key: string): string[] {
    const raw = searchParams.get(key)
    if (!raw) return []
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
  }

  const urlFiltros: Filtros = {
    apolice: read('apolice'),
    sub: read('sub'),
    plano: read('plano'),
    mes: read('mes'),
  }

  const [pending, setPending] = useState<Filtros>(urlFiltros)
  const [comparacao, setComparacao] = useState<string>('anterior')

  // Ressincroniza o rascunho quando a URL muda (ex.: navegação externa).
  const urlKey = searchParams.toString()
  useEffect(() => {
    setPending({
      apolice: read('apolice'),
      sub: read('sub'),
      plano: read('plano'),
      mes: read('mes'),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey])

  const mesesDesc = [...meses].sort((a, b) => b.localeCompare(a))
  const periodoAtual =
    pending.mes.length === 0
      ? ''
      : PERIODOS.slice(1).find(
          (p) => Number(p.value) === pending.mes.length,
        )?.value ?? 'custom'

  function set<K extends keyof Filtros>(key: K, values: string[]) {
    setPending((p) => ({ ...p, [key]: values }))
  }

  function setPeriodo(value: string) {
    if (value === '') return set('mes', [])
    const n = Number(value)
    set('mes', mesesDesc.slice(0, n))
  }

  function aplicar() {
    const params = new URLSearchParams()
    for (const key of ['apolice', 'sub', 'plano', 'mes'] as const) {
      const v = pending[key]
      if (v.length) params.set(key, v.join(','))
    }
    startTransition(() => {
      router.push(`/dashboard?${params.toString()}`, { scroll: false })
    })
  }

  function limpar() {
    setPending({ apolice: [], sub: [], plano: [], mes: [] })
    startTransition(() => {
      router.push('/dashboard', { scroll: false })
    })
  }

  const dirty =
    JSON.stringify(pending) !==
    JSON.stringify({
      apolice: urlFiltros.apolice,
      sub: urlFiltros.sub,
      plano: urlFiltros.plano,
      mes: urlFiltros.mes,
    })

  return (
    <div
      className={`rounded-2xl border border-border/70 bg-card/60 px-3 py-2.5 backdrop-blur-sm ${
        isPending ? 'opacity-70' : ''
      }`}
    >
      <div className="flex flex-col gap-2.5 2xl:flex-row 2xl:items-center">
        <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <SingleSelect
            label="Período de análise"
            icon={CalendarRange}
            value={periodoAtual === 'custom' ? '' : periodoAtual}
            placeholder={
              periodoAtual === 'custom'
                ? `${pending.mes.length} competências`
                : undefined
            }
            options={PERIODOS.map((p) => ({ value: p.value, label: p.label }))}
            onChange={setPeriodo}
          />
          <SingleSelect
            label="Comparar com"
            icon={GitCompareArrows}
            value={comparacao}
            options={COMPARACOES.map((c) => ({ value: c.value, label: c.label }))}
            onChange={setComparacao}
          />
          <MultiSelect
            label="Apólice"
            allLabel="Todas as apólices"
            selected={pending.apolice}
            onChange={(v) => set('apolice', v)}
            options={apolices.map((a) => ({ value: a.numero, label: a.label }))}
            compact
          />
          <MultiSelect
            label="Subestipulante"
            allLabel="Todos os subestipulantes"
            selected={pending.sub}
            onChange={(v) => set('sub', v)}
            options={subestipulantes.map((s) => ({
              value: s.codigo,
              label: s.label,
            }))}
            compact
          />
          <MultiSelect
            label="Plano"
            allLabel="Todos os planos"
            selected={pending.plano}
            onChange={(v) => set('plano', v)}
            options={planos.map((p) => ({ value: p, label: p }))}
            compact
          />
          <MultiSelect
            label="Competência"
            allLabel="Todas as competências"
            selected={pending.mes}
            onChange={(v) => set('mes', v)}
            options={mesesDesc.map((m) => ({ value: m, label: mesLongo(m) }))}
            highlight
            compact
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {dirty && (
            <span className="hidden items-center gap-1 rounded-full bg-warning/15 px-2 py-1 text-[11px] font-medium text-warning sm:inline-flex">
              Não aplicado
            </span>
          )}
          <button
            type="button"
            onClick={aplicar}
            disabled={isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-opacity hover:opacity-95 disabled:opacity-60"
          >
            <SlidersHorizontal className="size-4" />
            Aplicar
          </button>
          <button
            type="button"
            onClick={limpar}
            aria-label="Limpar filtros"
            title="Limpar filtros"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <RotateCcw className="size-4" />
            <span className="hidden lg:inline">Limpar</span>
          </button>
          <Link
            href="/relatorios"
            aria-label="Exportar relatório"
            title="Exportar relatório"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <Download className="size-4" />
            <span className="hidden lg:inline">Exportar</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

function SingleSelect({
  label,
  icon: Icon,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string
  icon: typeof CalendarRange
  value: string
  placeholder?: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const summary =
    placeholder ?? options.find((o) => o.value === value)?.label ?? '—'

  return (
    <div
      ref={ref}
      className="relative flex flex-col rounded-lg border border-border bg-card px-3 py-1.5"
    >
      <span className="text-[11px] leading-tight text-muted-foreground">
        {label}
      </span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className="flex w-full items-center justify-between gap-2 bg-transparent text-left text-[13px] font-medium text-foreground outline-none"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{summary}</span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg"
        >
          {options.map((o) => {
            const isSel = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={isSel}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className={`px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                  isSel ? 'font-medium text-primary' : 'text-foreground'
                }`}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
