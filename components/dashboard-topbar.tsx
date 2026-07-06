'use client'

import { useRouter } from 'next/navigation'
import { Bell, LogOut, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { BenefDisplayToggle } from '@/components/benef-display-toggle'
import type { BenefDisplay } from '@/lib/display-prefs'

export function DashboardTopbar({
  title,
  benefDisplay,
  usuario,
}: {
  title: string
  benefDisplay: BenefDisplay
  usuario: { nome: string; cargo: string; iniciais: string }
}) {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold text-foreground">
          {title}
        </h1>
        <p className="hidden text-xs text-muted-foreground sm:block">
          Visão consolidada da carteira de saúde
        </p>
      </div>

      <div className="flex items-center gap-2">
        <BenefDisplayToggle value={benefDisplay} />

        <div className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 lg:flex">
          <Search className="size-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Buscar..."
            className="w-40 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        <Button variant="ghost" size="icon" aria-label="Notificações">
          <Bell className="size-4.5" />
        </Button>

        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1">
          <div className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {usuario.iniciais}
          </div>
          <div className="hidden flex-col leading-tight sm:flex">
            <span className="text-xs font-medium text-foreground">
              {usuario.nome}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {usuario.cargo}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          aria-label="Sair"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4.5" />
        </button>
      </div>
    </header>
  )
}
