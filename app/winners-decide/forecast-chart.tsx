'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const axisProps = {
  stroke: 'var(--muted-foreground)',
  fontSize: 12,
  tickLine: false,
  axisLine: false,
}

export type ForecastPonto = {
  mes: string
  historico: number | null
  projecao: number | null
}

function Tip({
  active,
  payload,
  label,
  sufixo,
  moeda,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number | null; color: string }>
  label?: string
  sufixo?: string
  moeda?: boolean
}) {
  if (!active || !payload?.length) return null
  const fmt = (v: number) =>
    moeda
      ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
      : `${v}${sufixo ?? ''}`
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{label}</p>
      {payload
        .filter((i) => i.value !== null && i.value !== undefined)
        .map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-muted-foreground">{item.name}:</span>
            <span className="font-medium text-popover-foreground">{fmt(item.value as number)}</span>
          </div>
        ))}
    </div>
  )
}

// Gráfico de linha com histórico (sólido) + projeção (tracejado). O ponto de
// junção é duplicado para as duas séries se conectarem visualmente.
export function ForecastChart({
  data,
  sufixo,
  moeda,
}: {
  data: ForecastPonto[]
  sufixo?: string
  moeda?: boolean
}) {
  const tickFmt = (v: number) =>
    moeda ? `${(v / 1000).toFixed(0)}k` : `${v}${sufixo ?? ''}`

  // Índice do primeiro ponto de projeção (para a linha de referência).
  const idxProj = data.findIndex((d) => d.projecao !== null)
  const divisor = idxProj > 0 ? data[idxProj - 1]?.mes : undefined

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="mes" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={tickFmt} width={44} />
        <Tooltip
          content={<Tip sufixo={sufixo} moeda={moeda} />}
          cursor={{ stroke: 'var(--border)' }}
        />
        {divisor && (
          <ReferenceLine
            x={divisor}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            label={{ value: 'projeção', position: 'insideTopRight', fill: 'var(--muted-foreground)', fontSize: 10 }}
          />
        )}
        <Line
          type="monotone"
          dataKey="historico"
          name="Histórico"
          stroke="var(--chart-1)"
          strokeWidth={2.5}
          dot={{ r: 3 }}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="projecao"
          name="Projeção"
          stroke="var(--chart-4)"
          strokeWidth={2.5}
          strokeDasharray="6 4"
          dot={{ r: 3 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
