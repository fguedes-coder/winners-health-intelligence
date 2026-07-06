import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function StatCard({
  label,
  value,
  icon: Icon,
  variation,
  invertVariation = false,
  hint,
  href,
}: {
  label: string
  value: string
  icon: LucideIcon
  variation?: number
  invertVariation?: boolean
  hint?: string
  href?: string
}) {
  const positive = variation !== undefined && variation >= 0
  // For metrics like sinistralidade, a decrease is "good"
  const good = invertVariation ? !positive : positive

  const card = (
    <Card
      className={cn(
        'gap-0 p-5',
        href &&
          'h-full transition-colors hover:border-primary/50 hover:bg-muted/30',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Icon className="size-4.5" />
        </div>
      </div>
      <div className="mt-3 text-2xl font-semibold text-foreground">{value}</div>
      <div className="mt-2 flex items-center gap-2">
        {variation !== undefined && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-medium',
              good ? 'text-primary' : 'text-destructive',
            )}
          >
            {positive ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownRight className="size-3.5" />
            )}
            {Math.abs(variation).toLocaleString('pt-BR')}%
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {hint ?? 'vs. mês anterior'}
        </span>
      </div>
    </Card>
  )

  if (href) {
    return (
      <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
        {card}
      </Link>
    )
  }
  return card
}
