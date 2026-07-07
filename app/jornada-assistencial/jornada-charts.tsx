'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  formatBRL2 as formatBRL,
  type CategoriaCusto,
  type PontoCusto,
} from './mock-data'

const axisProps = {
  stroke: 'var(--muted-foreground)',
  fontSize: 12,
  tickLine: false,
  axisLine: false,
}

function CustoTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-[var(--chart-1)]" />
        <span className="text-muted-foreground">Custo:</span>
        <span className="font-medium text-popover-foreground">
          {formatBRL(payload[0].value)}
        </span>
      </div>
    </div>
  )
}

export function EvolucaoCustosChart({
  data,
  height = 220,
}: {
  data: PontoCusto[]
  height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 24, right: 16, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gJornadaCusto" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          vertical={false}
        />
        <XAxis dataKey="mes" {...axisProps} />
        <YAxis
          {...axisProps}
          tickFormatter={(v) => (v >= 1000 ? `${v / 1000}K` : String(v))}
        />
        <Tooltip
          content={<CustoTooltip />}
          cursor={{ stroke: 'var(--border)' }}
        />
        <Area
          type="monotone"
          dataKey="valor"
          name="Custo"
          stroke="var(--chart-1)"
          strokeWidth={2.5}
          fill="url(#gJornadaCusto)"
          dot={{ r: 4, fill: 'var(--chart-1)', strokeWidth: 0 }}
          activeDot={{ r: 6 }}
        >
          <LabelList
            dataKey="valor"
            position="top"
            offset={12}
            formatter={(v: unknown) =>
              Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
            }
            fontSize={11}
            fill="var(--muted-foreground)"
          />
        </Area>
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function CategoriaDonutChart({
  data,
  height = 200,
}: {
  data: CategoriaCusto[]
  height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="valor"
          nameKey="nome"
          cx="50%"
          cy="50%"
          innerRadius={54}
          outerRadius={82}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((d, index) => (
            <Cell key={index} fill={d.cor} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as CategoriaCusto
            return (
              <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: p.cor }}
                  />
                  <span className="text-muted-foreground">{p.nome}:</span>
                  <span className="font-medium text-popover-foreground">
                    {formatBRL(p.valor)}
                  </span>
                </div>
              </div>
            )
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
