'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import {
  MultiSelect,
  CompetenciasSelecionadas,
} from '@/app/dashboard/dashboard-filters'

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

// Seletor de competências para a tela de Relatórios. Atualiza a URL (?mes=),
// fazendo o servidor recalcular o painel e o PDF apenas com as competências
// escolhidas. Reutiliza o multiselect e os chips do dashboard.
export function RelatoriosCompetenciaFiltro({ meses }: { meses: string[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const selected = (searchParams.get('mes') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  function setValues(values: string[]) {
    const params = new URLSearchParams(searchParams.toString())
    if (values.length) params.set('mes', values.join(','))
    else params.delete('mes')
    startTransition(() => {
      router.push(`/relatorios?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <div className={`flex flex-col gap-3 ${isPending ? 'opacity-60' : ''}`}>
      <div className="sm:max-w-xs">
        <MultiSelect
          label="Competência de referência"
          allLabel="Todas as competências"
          selected={selected}
          onChange={setValues}
          options={meses.map((m) => ({ value: m, label: mesLongo(m) }))}
          highlight
          shortcuts
        />
      </div>
      <CompetenciasSelecionadas
        meses={meses}
        selected={selected}
        onRemove={(value) => setValues(selected.filter((m) => m !== value))}
        onClear={() => setValues([])}
      />
    </div>
  )
}
