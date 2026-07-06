'use client'

import { ChevronDown, RefreshCw } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { cn } from '@/lib/utils'
import { LgpdToggle } from './lgpd-toggle'

// Controles do cabeçalho do Dashboard Executivo — seletor de competência,
// botão "Atualizar dados" e o toggle LGPD. Todos funcionais.
export function HeaderControls({
  meses,
  mesAtual,
}: {
  meses: { valor: string; label: string }[]
  mesAtual: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  function selecionarMes(valor: string) {
    const next = new URLSearchParams(params.toString())
    if (valor) next.set('mes', valor)
    else next.delete('mes')
    const qs = next.toString()
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  function atualizar() {
    startTransition(() => router.refresh())
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <select
          aria-label="Competência"
          value={mesAtual}
          onChange={(e) => selecionarMes(e.target.value)}
          className="h-10 appearance-none rounded-lg border border-border bg-card pl-3 pr-9 text-sm font-medium text-foreground transition-colors hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {meses.map((m) => (
            <option key={m.valor} value={m.valor}>
              {m.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      <button
        type="button"
        onClick={atualizar}
        disabled={pending}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground',
          pending && 'opacity-60',
        )}
      >
        <RefreshCw className={cn('size-4', pending && 'animate-spin')} />
        Atualizar dados
      </button>

      <LgpdToggle />
    </div>
  )
}
