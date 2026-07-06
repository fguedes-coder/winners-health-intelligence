'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatBRL } from '@/lib/data'

const axisProps = {
  stroke: 'var(--muted-foreground)',
  fontSize: 12,
  tickLine: false,
  axisLine: false,
}

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
  formatter?: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{label}</p>
      {payload.map((item) => (
        <div key={item.name} className="flex items-center gap-2">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-muted-foreground">{item.name}:</span>
          <span className="font-medium text-popover-foreground">
            {formatter ? formatter(item.value) : item.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export function SinistralidadeLineChart({
  data,
}: {
  data: { mes: string; sinistralidade: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="mes" {...axisProps} />
        <YAxis unit="%" domain={[60, 90]} {...axisProps} />
        <Tooltip
          content={<ChartTooltip formatter={(v) => `${v}%`} />}
          cursor={{ stroke: 'var(--border)' }}
        />
        <Line
          type="monotone"
          dataKey="sinistralidade"
          name="Sinistralidade"
          stroke="var(--chart-1)"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function FaturaUtilizadoChart({
  data,
}: {
  data: { mes: string; fatura: number; utilizado: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="gFatura" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gUtilizado" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="mes" {...axisProps} />
        <YAxis
          {...axisProps}
          tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`}
        />
        <Tooltip
          content={<ChartTooltip formatter={formatBRL} />}
          cursor={{ stroke: 'var(--border)' }}
        />
        <Area
          type="monotone"
          dataKey="fatura"
          name="Fatura"
          stroke="var(--chart-2)"
          strokeWidth={2}
          fill="url(#gFatura)"
        />
        <Area
          type="monotone"
          dataKey="utilizado"
          name="Utilizado"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#gUtilizado)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function DistribuicaoBarChart({
  data,
}: {
  data: { categoria: string; valor: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, left: 24, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis
          type="number"
          {...axisProps}
          tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`}
        />
        <YAxis type="category" dataKey="categoria" width={90} {...axisProps} />
        <Tooltip
          content={<ChartTooltip formatter={formatBRL} />}
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
        />
        <Bar dataKey="valor" name="Valor" radius={[0, 6, 6, 0]}>
          {data.map((_, index) => (
            <Cell key={index} fill="var(--chart-1)" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function UtilizacaoMensalChart({
  data,
}: {
  data: { mes: string; utilizado: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          vertical={false}
        />
        <XAxis dataKey="mes" {...axisProps} />
        <YAxis
          {...axisProps}
          tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`}
        />
        <Tooltip
          content={<ChartTooltip formatter={formatBRL} />}
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
        />
        <Bar
          dataKey="utilizado"
          name="Utilizado"
          fill="var(--chart-1)"
          radius={[6, 6, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function TopPrestadoresChart({
  data,
}: {
  data: { nome: string; atendimentos: number }[]
}) {
  const chartData = data
    .map((p) => ({
      nome: p.nome.replace(/^(Hospital|Clínica|Laboratório|Centro de|Clínica) /, ''),
      atendimentos: p.atendimentos,
    }))
    .sort((a, b) => b.atendimentos - a.atendimentos)

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 8, right: 16, left: 24, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          horizontal={false}
        />
        <XAxis
          type="number"
          {...axisProps}
          tickFormatter={(v) => v.toLocaleString('pt-BR')}
        />
        <YAxis type="category" dataKey="nome" width={120} {...axisProps} />
        <Tooltip
          content={<ChartTooltip formatter={(v) => v.toLocaleString('pt-BR')} />}
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
        />
        <Bar dataKey="atendimentos" name="Atendimentos" radius={[0, 6, 6, 0]}>
          {chartData.map((_, index) => (
            <Cell key={index} fill="var(--chart-2)" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function FaixaEtariaChart({
  data,
}: {
  data: { faixa: string; beneficiarios: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="faixa" {...axisProps} />
        <YAxis {...axisProps} />
        <Tooltip
          content={<ChartTooltip formatter={(v) => v.toLocaleString('pt-BR')} />}
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
        />
        <Bar
          dataKey="beneficiarios"
          name="Beneficiários"
          fill="var(--chart-1)"
          radius={[6, 6, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

// Cores semânticas das faixas de risco (convenção semáforo).
const RISCO = {
  saudavel: 'oklch(0.68 0.15 150)',
  atencao: 'var(--warning)',
  acima: 'var(--destructive)',
}

// Limiar inferior da faixa "Atenção". Acima do break-even = risco.
const SAUDAVEL_MAX = 65

function statusSinistralidade(v: number, breakEven: number) {
  if (v > breakEven) return { label: 'Acima do Break-even', cor: RISCO.acima }
  if (v >= SAUDAVEL_MAX) return { label: 'Atenção', cor: RISCO.atencao }
  return { label: 'Saudável', cor: RISCO.saudavel }
}

function EvolucaoTooltip({
  active,
  payload,
  label,
  breakEven,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
  breakEven: number
}) {
  if (!active || !payload?.length) return null
  const v = payload[0].value
  const st = statusSinistralidade(v, breakEven)
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium text-popover-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Sinistralidade:</span>
        <span className="font-medium text-popover-foreground">
          {v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Break-even:</span>
        <span className="font-medium text-popover-foreground">{breakEven}%</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: st.cor }}
        />
        <span className="font-medium" style={{ color: st.cor }}>
          {st.label}
        </span>
      </div>
    </div>
  )
}

export function EvolucaoSinistralidadeChart({
  data,
  breakEven = 70,
}: {
  data: { mes: string; valor: number }[]
  breakEven?: number
}) {
  const maxVal = data.reduce((m, d) => Math.max(m, d.valor), 0)
  // Domínio dinâmico: garante que o break-even e o maior ponto fiquem visíveis.
  const domainMax = Math.max(
    Math.ceil((Math.max(maxVal, breakEven) * 1.15) / 10) * 10,
    80,
  )
  const step =
    domainMax <= 100 ? 20 : domainMax <= 200 ? 40 : Math.ceil(domainMax / 250) * 50
  const ticks: number[] = []
  for (let t = 0; t <= domainMax; t += step) ticks.push(t)

  return (
    <div className="flex flex-col gap-3">
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart
          data={data}
          margin={{ top: 24, right: 12, left: -8, bottom: 0 }}
        >
          <defs>
            <linearGradient id="gEvolucao" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* Faixas de risco (fundo) */}
          <ReferenceArea
            y1={0}
            y2={SAUDAVEL_MAX}
            fill={RISCO.saudavel}
            fillOpacity={0.08}
            ifOverflow="extendDomain"
          />
          <ReferenceArea
            y1={SAUDAVEL_MAX}
            y2={breakEven}
            fill={RISCO.atencao}
            fillOpacity={0.12}
            ifOverflow="extendDomain"
          />
          <ReferenceArea
            y1={breakEven}
            y2={domainMax}
            fill={RISCO.acima}
            fillOpacity={0.1}
            ifOverflow="extendDomain"
          />
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis dataKey="mes" {...axisProps} />
          <YAxis unit="%" domain={[0, domainMax]} ticks={ticks} {...axisProps} />
          <Tooltip
            content={<EvolucaoTooltip breakEven={breakEven} />}
            cursor={{ stroke: 'var(--border)' }}
          />
          {/* Linha de break-even */}
          <ReferenceLine
            y={breakEven}
            stroke={RISCO.acima}
            strokeDasharray="5 4"
            strokeWidth={1.5}
            label={{
              value: `Break-even (${breakEven}%)`,
              position: 'insideTopRight',
              fill: 'var(--muted-foreground)',
              fontSize: 11,
            }}
          />
          <Area
            type="monotone"
            dataKey="valor"
            name="Sinistralidade"
            stroke="var(--chart-1)"
            strokeWidth={2.5}
            fill="url(#gEvolucao)"
            dot={{ r: 3, fill: 'var(--chart-1)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          >
            <LabelList
              dataKey="valor"
              position="top"
              offset={10}
              formatter={(v: unknown) =>
                `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
              }
              fontSize={11}
              fill="var(--muted-foreground)"
            />
          </Area>
        </AreaChart>
      </ResponsiveContainer>
      {/* Legenda das faixas de risco */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: RISCO.saudavel, opacity: 0.6 }}
          />
          Saudável (0–{SAUDAVEL_MAX}%)
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: RISCO.atencao, opacity: 0.6 }}
          />
          Atenção ({SAUDAVEL_MAX}–{breakEven}%)
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: RISCO.acima, opacity: 0.6 }}
          />
          Acima do Break-even
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-0 w-4 border-t-2 border-dashed"
            style={{ borderColor: RISCO.acima }}
          />
          Break-even ({breakEven}%)
        </span>
      </div>
    </div>
  )
}

export function UtilizacaoFaturaBarChart({
  data,
}: {
  data: { mes: string; utilizado: number; fatura: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
        barGap={4}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          vertical={false}
        />
        <XAxis dataKey="mes" {...axisProps} />
        <YAxis
          {...axisProps}
          tickFormatter={(v) => `${(v / 1000000).toFixed(0)}M`}
        />
        <Tooltip
          content={<ChartTooltip formatter={formatBRL} />}
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
        />
        <Bar
          dataKey="utilizado"
          name="Utilizado"
          fill="var(--chart-1)"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="fatura"
          name="Fatura"
          fill="var(--muted-foreground)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function CategoriaBarChart({
  data,
}: {
  data: { nome: string; valor: number; pct: number }[]
}) {
  const altura = Math.max(200, data.length * 44)
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          horizontal={false}
        />
        <XAxis
          type="number"
          {...axisProps}
          tickFormatter={(v) =>
            v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
          }
        />
        <YAxis
          type="category"
          dataKey="nome"
          width={150}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) =>
            v.length > 24 ? `${v.slice(0, 22)}…` : v
          }
        />
        <Tooltip
          content={
            <ChartTooltip
              formatter={(v) => formatBRL(v)}
            />
          }
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
        />
        <Bar dataKey="valor" name="Valor" radius={[0, 6, 6, 0]}>
          {data.map((_, index) => (
            <Cell key={index} fill="var(--chart-1)" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// =====================================================================
// Radar de Risco
// =====================================================================

// Donut de distribuição de risco (Baixo / Moderado / Alto / Crítico).
export function RiscoDonutChart({
  data,
  centerValue,
  centerLabel,
}: {
  data: { nome: string; valor: number; cor: string }[]
  centerValue: string
  centerLabel: string
}) {
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey="valor"
            nameKey="nome"
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={100}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((d, index) => (
              <Cell key={index} fill={d.cor} />
            ))}
          </Pie>
          <Tooltip
            content={
              <ChartTooltip formatter={(v) => `${v.toLocaleString('pt-BR')} vidas`} />
            }
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold text-foreground tabular-nums">
          {centerValue}
        </span>
        <span className="text-xs text-muted-foreground">{centerLabel}</span>
      </div>
    </div>
  )
}

// Linha temporal: vidas em risco (Alto + Crítico) por competência.
export function EvolucaoRiscoChart({
  data,
}: {
  data: { mes: string; vidas: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="gRisco" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--destructive)" stopOpacity={0.32} />
            <stop offset="95%" stopColor="var(--destructive)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          vertical={false}
        />
        <XAxis dataKey="mes" {...axisProps} />
        <YAxis allowDecimals={false} {...axisProps} />
        <Tooltip
          content={
            <ChartTooltip formatter={(v) => `${v.toLocaleString('pt-BR')} vidas`} />
          }
          cursor={{ stroke: 'var(--border)' }}
        />
        <Area
          type="monotone"
          dataKey="vidas"
          name="Vidas em risco"
          stroke="var(--destructive)"
          strokeWidth={2.5}
          fill="url(#gRisco)"
          dot={{ r: 3, fill: 'var(--destructive)', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// Ranking horizontal dos principais fatores de risco da carteira.
export function FatoresRiscoChart({
  data,
}: {
  data: { nome: string; valor: number }[]
}) {
  const altura = Math.max(200, data.length * 42)
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          horizontal={false}
        />
        <XAxis
          type="number"
          allowDecimals={false}
          {...axisProps}
          tickFormatter={(v) => v.toLocaleString('pt-BR')}
        />
        <YAxis
          type="category"
          dataKey="nome"
          width={160}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          content={
            <ChartTooltip
              formatter={(v) => `${v.toLocaleString('pt-BR')} vidas`}
            />
          }
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
        />
        <Bar dataKey="valor" name="Vidas afetadas" radius={[0, 6, 6, 0]}>
          {data.map((_, index) => (
            <Cell key={index} fill="var(--chart-1)" />
          ))}
          <LabelList
            dataKey="valor"
            position="right"
            offset={8}
            fontSize={11}
            fill="var(--muted-foreground)"
            formatter={(v: unknown) => Number(v).toLocaleString('pt-BR')}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function CategoriaDonutChart({
  data,
  centerValue,
  centerLabel,
}: {
  data: { nome: string; valor: number; cor: string }[]
  centerValue: string
  centerLabel: string
}) {
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            dataKey="valor"
            nameKey="nome"
            cx="50%"
            cy="50%"
            innerRadius={68}
            outerRadius={98}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((d, index) => (
              <Cell key={index} fill={d.cor} />
            ))}
          </Pie>
          <Tooltip
            content={<ChartTooltip formatter={(v) => `${v}%`} />}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold text-foreground">
          {centerValue}
        </span>
        <span className="text-xs text-muted-foreground">{centerLabel}</span>
      </div>
    </div>
  )
}
