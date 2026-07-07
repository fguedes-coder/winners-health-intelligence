'use client'

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
} from 'recharts'
import { cn } from '@/lib/utils'
import type {
  DistribuicaoWhi,
  QuadranteResumo,
  ClassificacaoWhi,
} from '@/lib/people-analytics/analise'
import { WHI_META } from '@/lib/people-analytics/analise'

const moeda = (v: number) =>
  v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })

// --- Gauge do Índice Winners (WHI) -----------------------------------------
export function WhiGauge({ valor }: { valor: number }) {
  const classe: ClassificacaoWhi =
    valor >= 80
      ? 'estrategico'
      : valor >= 60
        ? 'estavel'
        : valor >= 40
          ? 'atencao'
          : 'critico'
  const cor = WHI_META[classe].cor
  const dados = [
    { name: 'preenchido', value: valor },
    { name: 'resto', value: Math.max(0, 100 - valor) },
  ]

  return (
    <div className="relative flex items-center justify-center">
      <ResponsiveContainer width={200} height={200}>
        <PieChart>
          <Pie
            data={dados}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            innerRadius={70}
            outerRadius={92}
            stroke="none"
            paddingAngle={0}
          >
            <Cell fill={cor} />
            <Cell fill="oklch(0.27 0.02 160)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-foreground">{valor}</span>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {WHI_META[classe].label}
        </span>
      </div>
    </div>
  )
}

// --- Legenda de faixas do WHI ----------------------------------------------
export function WhiLegenda() {
  const linhas: { faixa: string; classe: ClassificacaoWhi }[] = [
    { faixa: '80 - 100', classe: 'estrategico' },
    { faixa: '60 - 79', classe: 'estavel' },
    { faixa: '40 - 59', classe: 'atencao' },
    { faixa: '0 - 39', classe: 'critico' },
  ]
  return (
    <ul className="flex flex-col gap-2">
      {linhas.map((l) => (
        <li key={l.classe} className="flex items-center gap-2 text-sm">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: WHI_META[l.classe].cor }}
          />
          <span className="tabular-nums text-muted-foreground">{l.faixa}</span>
          <span className="text-foreground">{WHI_META[l.classe].label}</span>
        </li>
      ))}
    </ul>
  )
}

// --- Distribuição de OKR (donut) -------------------------------------------
type FaixaOkr = { label: string; qtd: number; pct: number; cor: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderOkrLabel(props: any) {
  const cx = Number(props.cx)
  const cy = Number(props.cy)
  const midAngle = Number(props.midAngle)
  const innerRadius = Number(props.innerRadius)
  const outerRadius = Number(props.outerRadius)
  const percent = Number(props.percent)
  if (!percent || percent < 0.045) return null
  const RAD = Math.PI / 180
  const r = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + r * Math.cos(-midAngle * RAD)
  const y = cy + r * Math.sin(-midAngle * RAD)
  return (
    <text
      x={x}
      y={y}
      fill="oklch(0.98 0 0)"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={600}
    >
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  )
}

export function OkrDistribuicao({
  dados,
  total,
}: {
  dados: FaixaOkr[]
  total: number
}) {
  const chart = dados.filter((d) => d.qtd > 0)
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative shrink-0">
        <ResponsiveContainer width={190} height={190}>
          <PieChart>
            <Pie
              data={chart}
              dataKey="qtd"
              nameKey="label"
              innerRadius={56}
              outerRadius={90}
              stroke="none"
              paddingAngle={1.5}
              labelLine={false}
              label={renderOkrLabel}
            >
              {chart.map((d, i) => (
                <Cell key={i} fill={d.cor} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-1 flex-col gap-2.5 self-stretch sm:justify-center">
        {dados.map((d) => (
          <li
            key={d.label}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: d.cor }}
              />
              <span className="text-muted-foreground">{d.label}</span>
            </span>
            <span className="tabular-nums text-foreground">
              {d.qtd} ({d.pct.toFixed(1)}%)
            </span>
          </li>
        ))}
        <li className="mt-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
          Total: <span className="font-medium text-foreground">{total}</span>{' '}
          colaboradores
        </li>
      </ul>
    </div>
  )
}

// --- Distribuição do WHI (donut) -------------------------------------------
export function WhiDistribuicao({ dados }: { dados: DistribuicaoWhi[] }) {
  const total = dados.reduce((s, d) => s + d.vidas, 0)
  const chart = dados.filter((d) => d.vidas > 0)
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative">
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie
              data={chart.length ? chart : [{ label: 'vazio', vidas: 1 }]}
              dataKey="vidas"
              innerRadius={52}
              outerRadius={76}
              stroke="none"
              paddingAngle={2}
            >
              {(chart.length ? chart : [{ cor: 'oklch(0.27 0.02 160)' }]).map(
                (d, i) => (
                  <Cell key={i} fill={(d as DistribuicaoWhi).cor ?? 'oklch(0.27 0.02 160)'} />
                ),
              )}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-foreground">{total}</span>
          <span className="text-[10px] uppercase text-muted-foreground">vidas</span>
        </div>
      </div>
      <ul className="flex flex-1 flex-col gap-2">
        {dados.map((d) => (
          <li key={d.classe} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: d.cor }}
              />
              <span className="text-foreground">{d.label}</span>
            </span>
            <span className="tabular-nums text-muted-foreground">
              {d.vidas} ({d.pct.toFixed(1)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// --- Matriz de Impacto (2x2 OKR × Custo) -----------------------------------
export function MatrizImpacto({ quadrantes }: { quadrantes: QuadranteResumo[] }) {
  const byId = (id: QuadranteResumo['quadrante']) =>
    quadrantes.find((q) => q.quadrante === id)

  const celula = (
    id: QuadranteResumo['quadrante'],
    linha1: string,
    linha2: string,
    tituloBranco = false,
  ) => {
    const q = byId(id)
    const cor = q?.cor ?? 'oklch(0.6 0 0)'
    const tituloCor = tituloBranco ? 'oklch(0.98 0 0)' : cor
    return (
      <div
        className="flex min-h-[132px] flex-col justify-between p-4"
        style={{
          backgroundColor: `color-mix(in oklch, ${cor} 20%, var(--card))`,
        }}
      >
        <div className="flex flex-col leading-tight">
          <span
            className="text-sm font-bold"
            style={{ color: tituloCor }}
          >
            {linha1}
          </span>
          <span className="text-sm font-bold" style={{ color: tituloCor }}>
            {linha2}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground/90">
            {q?.vidas ?? 0} colaboradores
          </span>
          <span className="text-xs text-muted-foreground">
            {moeda(q?.custoTotal ?? 0)} ({(q?.pct ?? 0).toFixed(1)}%)
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      {/* Eixo Y */}
      <div className="flex flex-col items-center justify-between py-1 text-[11px] font-medium text-muted-foreground">
        <span>Alto</span>
        <span className="rotate-180 [writing-mode:vertical-rl]">
          Custo Assistencial
        </span>
        <span>Baixo</span>
      </div>
      <div className="flex-1">
        <div className="overflow-hidden rounded-xl border border-border/70">
          <div className="grid grid-cols-2 gap-px bg-border/70">
            {celula('alto_custo_baixo_okr', 'Alto Custo', 'Baixo OKR', true)}
            {celula('alto_custo_alto_okr', 'Alto Custo', 'Alto OKR')}
            {celula('baixo_custo_baixo_okr', 'Baixo Custo', 'Baixo OKR')}
            {celula('baixo_custo_alto_okr', 'Baixo Custo', 'Alto OKR')}
          </div>
        </div>
        {/* Eixo X */}
        <div className="mt-2 flex items-center justify-between px-1 text-[11px] font-medium text-muted-foreground">
          <span>Baixo</span>
          <span>OKR</span>
          <span>Alto</span>
        </div>
      </div>
    </div>
  )
}

// --- Barra de composição do WHI Score --------------------------------------
export function WhiComposicao() {
  const partes = [
    { label: 'OKR', pct: 50, cor: 'oklch(0.65 0.18 265)' },
    { label: 'Custo', pct: 30, cor: 'oklch(0.72 0.13 220)' },
    { label: 'Risco', pct: 20, cor: 'oklch(0.7 0.15 152)' },
  ]
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">
        Composição do Score
      </span>
      <div className="flex h-2 w-full overflow-hidden rounded-full">
        {partes.map((p) => (
          <div key={p.label} style={{ width: `${p.pct}%`, backgroundColor: p.cor }} />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {partes.map((p) => (
          <span key={p.label} className="flex items-center gap-1">
            <span
              className={cn('size-2 rounded-full')}
              style={{ backgroundColor: p.cor }}
            />
            {p.label} {p.pct}%
          </span>
        ))}
      </div>
    </div>
  )
}
