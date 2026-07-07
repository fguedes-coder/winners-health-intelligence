'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Grid2x2,
  LayoutDashboard,
  Building2,
  Sparkles,
  ShieldCheck,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ITENS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: 'Dashboard Executivo', href: '/people-analytics', icon: LayoutDashboard },
  { label: 'Ranking Custo × Performance', href: '/people-analytics/ranking', icon: BarChart3 },
  { label: 'Matriz de Impacto', href: '/people-analytics/matriz', icon: Grid2x2 },
  { label: 'Análise por Área', href: '/people-analytics/areas', icon: Building2 },
  { label: 'Narrativa CEO', href: '/people-analytics/narrativa', icon: Sparkles },
  { label: 'Relatórios LGPD', href: '/people-analytics/relatorios', icon: ShieldCheck },
  { label: 'Importar Arquivo RH', href: '/people-analytics/importar', icon: Upload },
]

export function PeopleNav() {
  const pathname = usePathname()
  return (
    <nav className="flex flex-wrap gap-1.5 border-b border-border pb-3">
      {ITENS.map((item) => {
        const active = pathname === item.href
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
