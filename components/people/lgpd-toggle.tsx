'use client'

import { Eye, ShieldCheck } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { cn } from '@/lib/utils'

// Alterna entre modo Identificado e Anonimizado (LGPD) via query string `modo`,
// preservando os demais parâmetros da URL. Compartilhado por todas as telas
// do módulo People Analytics.
export function LgpdToggle() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const anonimizado = params.get('modo') === 'anonimizado'

  function toggle() {
    const next = new URLSearchParams(params.toString())
    if (anonimizado) next.delete('modo')
    else next.set('modo', 'anonimizado')
    const qs = next.toString()
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={anonimizado}
      title={
        anonimizado
          ? 'Dados anonimizados conforme LGPD — clique para identificar'
          : 'Dados identificados — clique para anonimizar (LGPD)'
      }
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
        anonimizado
          ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
          : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
        pending && 'opacity-60',
      )}
    >
      {anonimizado ? (
        <ShieldCheck className="size-4" />
      ) : (
        <Eye className="size-4" />
      )}
      {anonimizado ? 'LGPD: Anonimizado' : 'LGPD: Identificado'}
    </button>
  )
}
