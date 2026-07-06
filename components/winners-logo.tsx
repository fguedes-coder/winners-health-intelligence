import Image from 'next/image'
import { cn } from '@/lib/utils'

const sizeMap = {
  sm: 'size-9',
  md: 'size-10',
  lg: 'size-12',
}

const pxMap = {
  sm: 36,
  md: 40,
  lg: 48,
}

/**
 * Versão reduzida (escudo) do logo oficial Winners.
 * Usada na sidebar e como base do favicon.
 */
export function WinnersLogo({
  size = 'sm',
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  return (
    <Image
      src="/brand/winners-shield.png"
      alt="Winners Corretora de Seguros"
      width={pxMap[size]}
      height={pxMap[size]}
      priority
      className={cn('shrink-0 object-contain', sizeMap[size], className)}
    />
  )
}

const horizontalHeight = {
  sm: 28,
  md: 36,
  lg: 48,
}

/**
 * Versão horizontal do logo oficial Winners.
 * Usada na tela de login.
 */
export function WinnersHorizontal({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const h = horizontalHeight[size]
  return (
    <Image
      src="/brand/winners-horizontal.png"
      alt="Winners Corretora de Seguros"
      width={Math.round((h * 1936) / 658)}
      height={h}
      priority
      className={cn('w-auto object-contain', className)}
      style={{ height: h }}
    />
  )
}

export function WinnersWordmark({
  size = 'sm',
  subtitle = 'Health Intelligence',
}: {
  size?: 'sm' | 'md' | 'lg'
  subtitle?: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <WinnersLogo size={size} />
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold text-foreground">Winners</span>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>
    </div>
  )
}
