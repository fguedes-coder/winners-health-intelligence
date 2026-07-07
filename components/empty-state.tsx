import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  icon: LucideIcon
  title: string
  description: string
  actionHref?: string
  actionLabel?: string
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-4 p-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <Icon className="size-7" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold text-foreground text-balance">
          {title}
        </h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground text-pretty">
          {description}
        </p>
      </div>
      {actionHref && actionLabel && (
        <Link href={actionHref}>
          <Button>{actionLabel}</Button>
        </Link>
      )}
    </Card>
  )
}
