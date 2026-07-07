'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'

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

const MESES_CURTOS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

function mesCurto(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})$/)
  if (!m) return value
  return `${MESES_CURTOS[Number(m[2]) - 1]}/${m[1]}`
}

export function DashboardFilters({
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

  // Lê os valores atuais (separados por vírgula) de cada filtro
  function read(key: string): string[] {
    const raw = searchParams.get(key)
    if (!raw) return []
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const current = {
    apolice: read('apolice'),
    sub: read('sub'),
    plano: read('plano'),
    mes: read('mes'),
  }

  function setValues(key: string, values: string[]) {
    const params = new URLSearchParams(searchParams.toString())
    if (values.length) params.set(key, values.join(','))
    else params.delete(key)
    startTransition(() => {
      router.push(`/dashboard?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <div className={`flex flex-col gap-3 ${isPending ? 'opacity-60' : ''}`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MultiSelect
        label="Apólice"
        allLabel="Todas as apólices"
        selected={current.apolice}
        onChange={(v) => setValues('apolice', v)}
        options={apolices.map((a) => ({ value: a.numero, label: a.label }))}
      />
      <MultiSelect
        label="Subestipulante"
        allLabel="Todos os subestipulantes"
        selected={current.sub}
        onChange={(v) => setValues('sub', v)}
        options={subestipulantes.map((s) => ({
          value: s.codigo,
          label: s.label,
        }))}
      />
      <MultiSelect
        label="Plano"
        allLabel="Todos os planos"
        selected={current.plano}
        onChange={(v) => setValues('plano', v)}
        options={planos.map((p) => ({ value: p, label: p }))}
      />
      <MultiSelect
        label="Competência de referência"
        allLabel="Todas as competências"
        selected={current.mes}
        onChange={(v) => setValues('mes', v)}
        options={meses.map((m) => ({ value: m, label: mesLongo(m) }))}
        highlight
        shortcuts
      />
      </div>

      <CompetenciasSelecionadas
        meses={meses}
        selected={current.mes}
        onRemove={(value) =>
          setValues(
            'mes',
            current.mes.filter((m) => m !== value),
          )
        }
        onClear={() => setValues('mes', [])}
      />
    </div>
  )
}

// Exibe, no topo da tela, as competências atualmente selecionadas (ou "Todas").
export function CompetenciasSelecionadas({
  meses,
  selected,
  onRemove,
  onClear,
}: {
  meses: string[]
  selected: string[]
  onRemove: (value: string) => void
  onClear: () => void
}) {
  const todas = selected.length === 0 || selected.length === meses.length
  const ordenadas = [...selected].sort((a, b) => b.localeCompare(a))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">
        Competências analisadas:
      </span>
      {todas ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Check className="size-3" />
          Todas as competências
        </span>
      ) : (
        <>
          {ordenadas.map((m) => (
            <span
              key={m}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
            >
              <Check className="size-3" />
              {mesCurto(m)}
              <button
                type="button"
                onClick={() => onRemove(m)}
                aria-label={`Remover ${mesCurto(m)}`}
                className="rounded-full p-0.5 transition-colors hover:bg-primary/20"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Limpar
          </button>
        </>
      )}
    </div>
  )
}

export function MultiSelect({
  label,
  allLabel,
  selected,
  onChange,
  options,
  highlight,
  shortcuts,
  compact,
}: {
  label: string
  allLabel: string
  selected: string[]
  onChange: (values: string[]) => void
  options: { value: string; label: string }[]
  highlight?: boolean
  shortcuts?: boolean
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
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

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selecionados`

  return (
    <div
      ref={ref}
      className={`relative flex flex-col rounded-lg border bg-card transition-colors ${
        compact ? 'gap-0 px-3 py-1.5' : 'gap-1 rounded-xl px-4 py-2.5'
      } ${highlight ? 'border-primary/60' : 'border-border'}`}
    >
      <span
        className={`text-muted-foreground ${compact ? 'text-[11px] leading-tight' : 'text-xs'}`}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className={`flex w-full items-center justify-between gap-2 bg-transparent text-left font-medium text-foreground outline-none ${
          compact ? 'text-[13px]' : 'text-sm'
        }`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 right-0 top-full z-50 mt-2 flex max-h-72 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              {selected.length > 0
                ? `${selected.length} selecionado(s)`
                : 'Selecione uma ou mais opções'}
            </span>
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={selected.length === 0}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              <X className="size-3" />
              Limpar
            </button>
          </div>
          {shortcuts && (
            <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
              {[
                { label: 'Selecionar todas', n: 0 },
                { label: 'Últimos 3 meses', n: 3 },
                { label: 'Últimos 6 meses', n: 6 },
                { label: 'Últimos 12 meses', n: 12 },
              ].map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    const ordenadas = [...options].sort((a, b) =>
                      b.value.localeCompare(a.value),
                    )
                    onChange(
                      s.n === 0
                        ? options.map((o) => o.value)
                        : ordenadas.slice(0, s.n).map((o) => o.value),
                    )
                  }}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/5 hover:text-foreground"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <ul className="overflow-y-auto py-1">
            {options.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                Nenhuma opção disponível
              </li>
            )}
            {options.map((o) => {
              const isSel = selected.includes(o.value)
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    onClick={() => toggle(o.value)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                        isSel
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/40'
                      }`}
                    >
                      {isSel && <Check className="size-3" />}
                    </span>
                    <span className="truncate">{o.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
