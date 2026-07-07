'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { IdCard, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { setBenefDisplay } from '@/app/actions/benef-display'
import type { BenefDisplay } from '@/lib/display-prefs'

const OPCOES: { mode: BenefDisplay; label: string; icon: typeof User }[] = [
  { mode: 'nome', label: 'Nome', icon: User },
  { mode: 'carteirinha', label: 'Carteirinha', icon: IdCard },
]

/**
 * Controle global (segmentado) para alternar como os beneficiários são exibidos
 * em todo o dashboard: pelo nome cadastrado ou pelo número da carteirinha.
 */
export function BenefDisplayToggle({ value }: { value: BenefDisplay }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function selecionar(mode: BenefDisplay) {
    if (mode === value || pending) return
    startTransition(async () => {
      await setBenefDisplay(mode)
      router.refresh()
    })
  }

  return (
    <div
      role="group"
      aria-label="Exibir beneficiários por"
      className="hidden items-center rounded-lg border border-border bg-card p-0.5 md:flex"
    >
      {OPCOES.map((o) => {
        const Icon = o.icon
        const active = value === o.mode
        return (
          <button
            key={o.mode}
            type="button"
            onClick={() => selecionar(o.mode)}
            disabled={pending}
            aria-pressed={active}
            title={`Exibir beneficiários por ${o.label.toLowerCase()}`}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
