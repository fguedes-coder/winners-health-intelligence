'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { LgpdToggle } from '@/components/people/lgpd-toggle'
import { formatBRL } from '@/lib/data'
import type {
  AnalisePeople,
  ColaboradorAnalisado,
} from '@/lib/people-analytics/analise'
import { WHI_META } from '@/lib/people-analytics/analise'
import { cn } from '@/lib/utils'

type Ordenar = 'custo' | 'okr' | 'whi' | 'risco'
type FiltroStatus = 'todos' | 'aptos' | 'nao_aptos'
type FiltroVinculo = 'todos' | 'vinculados' | 'sem_vinculo'

const pct = (v: number, casas = 0) => `${v.toFixed(casas)}%`

export function RankingClient({ analise }: { analise: AnalisePeople }) {
  const [busca, setBusca] = useState('')
  const [ordenar, setOrdenar] = useState<Ordenar>('custo')
  const [status, setStatus] = useState<FiltroStatus>('todos')
  const [vinculo, setVinculo] = useState<FiltroVinculo>('todos')

  const linhas = useMemo(() => {
    let arr = [...analise.colaboradores]
    const q = busca.trim().toLowerCase()
    if (q) arr = arr.filter((c) => c.display.toLowerCase().includes(q))
    if (status === 'aptos') arr = arr.filter((c) => c.apto)
    if (status === 'nao_aptos') arr = arr.filter((c) => !c.apto)
    if (vinculo === 'vinculados') arr = arr.filter((c) => c.custoSaude != null)
    if (vinculo === 'sem_vinculo') arr = arr.filter((c) => c.custoSaude == null)

    arr.sort((a, b) => {
      switch (ordenar) {
        case 'okr':
          return (b.okr ?? -1) - (a.okr ?? -1)
        case 'whi':
          return (b.whi ?? -1) - (a.whi ?? -1)
        case 'risco':
          return (b.scoreRisco ?? -1) - (a.scoreRisco ?? -1)
        default:
          return (b.custoSaude ?? -1) - (a.custoSaude ?? -1)
      }
    })
    return arr
  }, [analise.colaboradores, busca, ordenar, status, vinculo])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Ranking Custo × Performance
          </h1>
          <p className="text-sm text-muted-foreground">
            {linhas.length} de {analise.cards.importados} colaboradores
          </p>
        </div>
        <LgpdToggle />
      </div>

      {/* Filtros */}
      <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Buscar</span>
          <span className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome do colaborador…"
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary/50"
            />
          </span>
        </label>
        <SelectBox
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as FiltroStatus)}
          options={[
            { value: 'todos', label: 'Todos' },
            { value: 'aptos', label: 'Aptos' },
            { value: 'nao_aptos', label: 'Não Aptos' },
          ]}
        />
        <SelectBox
          label="Vínculo"
          value={vinculo}
          onChange={(v) => setVinculo(v as FiltroVinculo)}
          options={[
            { value: 'todos', label: 'Todos' },
            { value: 'vinculados', label: 'Vinculados' },
            { value: 'sem_vinculo', label: 'Sem vínculo' },
          ]}
        />
        <SelectBox
          label="Ordenar por"
          value={ordenar}
          onChange={(v) => setOrdenar(v as Ordenar)}
          options={[
            { value: 'custo', label: 'Maior custo' },
            { value: 'okr', label: 'Maior OKR' },
            { value: 'whi', label: 'Maior WHI' },
            { value: 'risco', label: 'Maior risco' },
          ]}
        />
      </Card>

      {/* Tabela */}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">#</th>
                <th className="px-3 py-3 font-medium">Colaborador</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Vínculo</th>
                <th className="px-3 py-3 text-right font-medium">OKR</th>
                <th className="px-3 py-3 text-right font-medium">Custo Assist.</th>
                <th className="px-3 py-3 text-center font-medium">Risco</th>
                <th className="px-3 py-3 text-center font-medium">WHI</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((c, i) => (
                <Linha key={c.nome + i} c={c} pos={i + 1} />
              ))}
              {linhas.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-10 text-center text-sm text-muted-foreground"
                  >
                    Nenhum colaborador encontrado com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function Linha({ c, pos }: { c: ColaboradorAnalisado; pos: number }) {
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-muted/30">
      <td className="px-5 py-2.5 tabular-nums text-muted-foreground">{pos}</td>
      <td className="px-3 py-2.5 font-medium text-foreground">{c.display}</td>
      <td className="px-3 py-2.5">
        <Badge variant={c.apto ? 'success' : 'destructive'} className="text-[11px]">
          {c.status ?? '—'}
        </Badge>
      </td>
      <td className="px-3 py-2.5">
        {c.tipoMatch === 'sem_vinculo' ? (
          <span className="text-xs text-muted-foreground">Sem vínculo</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={cn(
                'size-2 rounded-full',
                c.tipoMatch === 'exato' ? 'bg-primary' : 'bg-amber-400',
              )}
            />
            {c.tipoMatch === 'exato'
              ? 'Exato'
              : `Aprox. ${c.similaridade != null ? pct(c.similaridade * 100) : ''}`}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
        {c.okr != null ? pct(c.okr * 100) : '—'}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
        {c.custoSaude != null ? formatBRL(c.custoSaude) : '—'}
      </td>
      <td className="px-3 py-2.5 text-center">
        {c.faixaRisco ? (
          <span className="text-xs text-muted-foreground">{c.faixaRisco}</span>
        ) : (
          '—'
        )}
      </td>
      <td className="px-3 py-2.5 text-center">
        <WhiChip valor={c.whi} />
      </td>
    </tr>
  )
}

function WhiChip({ valor }: { valor: number | null }) {
  if (valor == null) return <span className="text-muted-foreground">—</span>
  const classe =
    valor >= 80
      ? 'estrategico'
      : valor >= 60
        ? 'estavel'
        : valor >= 40
          ? 'atencao'
          : 'critico'
  return (
    <span
      className="inline-flex min-w-9 items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold text-background"
      style={{ backgroundColor: WHI_META[classe as keyof typeof WHI_META].cor }}
    >
      {valor}
    </span>
  )
}

function SelectBox({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
