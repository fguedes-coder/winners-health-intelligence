'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  BarChart3,
  Brain,
  Contact,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Radar,
  Settings,
  ShieldCheck,
  Stethoscope,
  Upload,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { WinnersLogo } from '@/components/winners-logo'

const navItems: {
  label: string
  href: string
  icon: typeof LayoutDashboard
  badge?: string
}[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Clientes', href: '/clientes', icon: Users },
  { label: 'Apólices', href: '/apolices', icon: ShieldCheck },
  { label: 'Sinistralidade', href: '/sinistralidade', icon: Activity },
  { label: 'Utilização', href: '/utilizacao', icon: Stethoscope },
  { label: 'Beneficiários', href: '/colaboradores', icon: Contact },
  {
    label: 'Jornada Assistencial',
    href: '/jornada-assistencial',
    icon: HeartPulse,
    badge: 'Novo',
  },
  { label: 'Radar de Risco', href: '/radar-risco', icon: Radar },
  {
    label: 'People Analytics',
    href: '/people-analytics',
    icon: BarChart3,
    badge: 'Novo',
  },
  { label: 'Winners Decide IA', href: '/winners-decide', icon: Brain },
  { label: 'Uploads', href: '/uploads', icon: Upload },
  { label: 'Relatórios', href: '/relatorios', icon: FileText },
  { label: 'Configurações', href: '/configuracoes', icon: Settings },
]

export function DashboardSidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
        <WinnersLogo size="sm" />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-sidebar-foreground">
            Winners Health
          </span>
          <span className="text-xs text-muted-foreground">Intelligence</span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {navItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/15 text-primary before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-primary'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
              )}
            >
              <Icon className="size-4.5 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  {item.badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="rounded-lg bg-sidebar-accent p-3">
          <p className="text-xs font-medium text-sidebar-foreground">
            Winners Corretora
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Plano Enterprise
          </p>
        </div>
      </div>
    </aside>
  )
}
