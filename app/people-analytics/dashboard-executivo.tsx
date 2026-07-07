'use client'

import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  Calendar,
  CheckCircle2,
  CloudUpload,
  DollarSign,
  GitCompareArrows,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  UserCheck,
  UserX,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { StatCard } from '@/components/stat-card'
import { HeaderControls } from '@/components/people/header-controls'
import {
  MatrizImpacto,
  OkrDistribuicao,
  WhiComposicao,
  WhiGauge,
  WhiLegenda,
} from '@/components/people/people-visuals'
import { formatBRL } from '@/lib/data'
import type { AnalisePeople } from '@/lib/people-analytics/analise'
import { WHI_META } from '@/lib/people-analytics/analise'
import type { ImportacaoRh } from '@/lib/people-analytics/data'

const pct = (v: number, casas = 1) => `${v.toFixed(casas)}%`

// Cores da distribuição de OKR (do pior para o melhor desempenho).
const FAIXAS_OKR = [
  { label: '0%', min: 0, max: 0, cor: 'oklch(0.62 0.2 25)' },
  { label: '(0-25%]', min: 0.0001, max: 0.25, cor: 'oklch(0.72 0.17 52)' },
  { label: '(25-50%]', min: 0.25, max: 0.5, cor: 'oklch(0.78 0.15 78)' },
  { label: '(50-75%]', min: 0.5, max: 0.75, cor: 'oklch(0.72 0.15 130)' },
  { label: '(75-100%]', min: 0.75, max: 1.0001, cor: 'oklch(0.7 0.15 152)' },
]

function pearson(pares: [number, number][]): number {
  const n = pares.length
  if (n < 2) return 0
  const mx = pares.reduce((s, [x]) => s + x, 0) / n
  const my = pares.reduce((s, [, y]) => s + y, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (const [x, y] of pares) {
    num += (x - mx) * (y - my)
    dx += (x - mx) ** 2
    dy += (y - my) ** 2
  }
  const den = Math.sqrt(dx * dy)
  return den === 0 ? 0 : num / den
}

function fmtDataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function DashboardExecutivo({
  analise,
  anonimizado,
  importacao,
  narrativa,
  meses,
  mesAtual,
}: {
  analise: AnalisePeople
  anonimizado: boolean
  importacao: ImportacaoRh
  narrativa: string[]
  meses: { valor: string; label: string }[]
  mesAtual: string
}) {
  const { cards, colaboradores, quadrantes } = analise
  const naoAptos = colaboradores.filter((c) => !c.apto).length
  const aptos = cards.importados - naoAptos
  const total = cards.importados

  // Distribuição de OKR por faixa.
  const distOkr = FAIXAS_OKR.map((f) => {
    const itens = colaboradores.filter((c) => {
      const v = c.okr ?? 0
      if (f.max === 0) return v === 0
      return v > f.min && v <= f.max
    })
    return {
      label: f.label,
      cor: f.cor,
      qtd: itens.length,
      pct: total > 0 ? (itens.length / total) * 100 : 0,
    }
  })

  // Ranking Top 10 por custo assistencial.
  const vinculados = colaboradores.filter((c) => c.custoSaude != null)
  const top10 = [...vinculados]
    .sort((a, b) => (b.custoSaude ?? 0) - (a.custoSaude ?? 0))
    .slice(0, 10)

  // --- Insights (calculados sobre os dados reais) ---
  const ordCusto = [...vinculados].sort(
    (a, b) => (b.custoSaude ?? 0) - (a.custoSaude ?? 0),
  )
  const topN = Math.max(1, Math.round(ordCusto.length * 0.12))
  const custoTop = ordCusto
    .slice(0, topN)
    .reduce((s, c) => s + (c.custoSaude ?? 0), 0)
  const pctConcentracao = cards.custoTotal > 0 ? (custoTop / cards.custoTotal) * 100 : 0
  const pctTopVidas = ordCusto.length > 0 ? (topN / ordCusto.length) * 100 : 0

  const altoCustoBaixoOkr =
    quadrantes.find((q) => q.quadrante === 'alto_custo_baixo_okr')?.vidas ?? 0

  const okrAptos = media(
    colaboradores.filter((c) => c.apto).map((c) => c.okr),
  )
  const okrNaoAptos = media(
    colaboradores.filter((c) => !c.apto).map((c) => c.okr),
  )

  const correl = pearson(
    vinculados
      .filter((c) => c.okr != null && c.custoSaude != null)
      .map((c) => [c.okr as number, c.custoSaude as number] as [number, number]),
  )
  const forcaCorrel =
    Math.abs(correl) >= 0.7
      ? 'forte'
      : Math.abs(correl) >= 0.3
        ? 'moderada'
        : 'fraca'

  return (
    <div className="flex flex-col gap-5">
      {/* Cabeçalho com controles funcionais */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Dashboard Executivo
          </h1>
          <p className="text-sm text-muted-foreground">
            Cruzamento de dados RH (OKR) × Saúde
          </p>
        </div>
        <HeaderControls meses={meses} mesAtual={mesAtual} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Colaboradores"
          value={total.toLocaleString('pt-BR')}
          icon={Users}
          hint="100% da base"
        />
        <StatCard
          label="Aptos"
          value={aptos.toLocaleString('pt-BR')}
          icon={UserCheck}
          hint={`${pct(total > 0 ? (aptos / total) * 100 : 0)} da base`}
        />
        <StatCard
          label="Não Aptos"
          value={naoAptos.toLocaleString('pt-BR')}
          icon={UserX}
          hint={`${pct(total > 0 ? (naoAptos / total) * 100 : 0)} da base`}
        />
        <StatCard
          label="OKR Médio"
          value={pct(cards.okrMedio * 100, 2)}
          icon={Target}
          hint="Média geral"
        />
        <StatCard
          label="Custo Assistencial"
          value={formatBRL(cards.custoTotal)}
          icon={TrendingUp}
          hint="Total vinculado"
        />
        <StatCard
          label="Custo Médio p/ Colab."
          value={formatBRL(cards.custoMedio)}
          icon={DollarSign}
          hint="Média vinculados"
        />
      </div>

      {/* Linha 1: Distribuição OKR + Matriz + WHI */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="gap-0 p-5">
          <h2 className="text-sm font-semibold text-foreground">
            Distribuição de OKR
          </h2>
          <div className="mt-4">
            <OkrDistribuicao dados={distOkr} total={total} />
          </div>
        </Card>

        <Card className="gap-0 p-5">
          <h2 className="text-sm font-semibold text-foreground">
            Matriz de Impacto (Custo Assistencial × OKR)
          </h2>
          <div className="mt-4">
            <MatrizImpacto quadrantes={quadrantes} />
          </div>
        </Card>

        <Card className="gap-0 p-5">
          <h2 className="text-sm font-semibold text-foreground">
            Índice Winners (WHI Score)
          </h2>
          <p className="mt-1 text-xs text-muted-foreground text-pretty">
            Score que combina OKR, Custo Assistencial e Risco Futuro.
          </p>
          <div className="mt-2 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <WhiGauge valor={cards.whiMedio} />
            <WhiLegenda />
          </div>
          <div className="mt-4 border-t border-border/60 pt-4">
            <WhiComposicao />
          </div>
        </Card>
      </div>

      {/* Linha 2: Ranking + Insights + Narrativa CEO */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Ranking Top 10 */}
        <Card className="gap-0 p-0">
          <div className="flex items-center justify-between p-5 pb-3">
            <h2 className="text-sm font-semibold text-foreground">
              Ranking — Top 10 Maior Custo Assistencial
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border/60 text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Colaborador</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">OKR</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Custo Assist.
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Custo Médio/mês
                  </th>
                  <th className="px-3 py-2 text-center font-medium">WHI Score</th>
                </tr>
              </thead>
              <tbody>
                {top10.map((c, i) => (
                  <tr
                    key={c.nome + i}
                    className="border-b border-border/40 last:border-0"
                  >
                    <td className="px-5 py-2 tabular-nums text-muted-foreground">
                      {i + 1}
                    </td>
                    <td className="px-3 py-2 font-medium text-foreground">
                      {c.display}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={c.apto ? 'success' : 'destructive'}
                        className="text-[11px]"
                      >
                        {c.status ?? '—'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {c.okr != null ? pct(c.okr * 100, 0) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {formatBRL(c.custoSaude ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {formatBRL((c.custoSaude ?? 0) / 12)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <WhiChip valor={c.whi} />
                    </td>
                  </tr>
                ))}
                {top10.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-8 text-center text-sm text-muted-foreground"
                    >
                      Nenhum colaborador vinculado à base assistencial.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="p-5 pt-3">
            <Link
              href="/people-analytics/ranking"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Ver ranking completo <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </Card>

        {/* Insights Principais */}
        <Card className="gap-0 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="size-4 text-primary" />
            Insights Principais
          </h2>
          <ul className="mt-4 flex flex-col gap-4 text-sm">
            <Insight
              icon={Sparkles}
              texto={`${pctTopVidas.toFixed(0)}% dos colaboradores concentram ${pctConcentracao.toFixed(0)}% do custo assistencial total.`}
            />
            <Insight
              icon={UserX}
              texto={`${altoCustoBaixoOkr} colaboradores estão no quadrante de Alto Custo e Baixo OKR.`}
            />
            <Insight
              icon={Target}
              texto={`Colaboradores Aptos possuem OKR médio ${pct(okrAptos * 100)} vs ${pct(okrNaoAptos * 100)} dos Não Aptos.`}
            />
            <Insight
              icon={GitCompareArrows}
              texto={`Correlação OKR × Custo: ${correl.toFixed(2).replace('.', ',')} (correlação ${forcaCorrel} ${correl < 0 ? 'negativa' : 'positiva'}).`}
            />
          </ul>
        </Card>

        {/* Narrativa para o CEO */}
        <Card className="gap-0 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="size-4" />
            Narrativa para o CEO
          </h2>
          <div className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
            {narrativa.slice(0, 2).map((p, i) => (
              <p key={i} className="text-pretty">
                {p}
              </p>
            ))}
          </div>
          <Link
            href={`/people-analytics/narrativa${anonimizado ? '?modo=anonimizado' : ''}`}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Gerar narrativa completa com IA
            <Sparkles className="size-4" />
          </Link>
        </Card>
      </div>

      {/* Linha 3: Importar + Última Importação + Relatórios LGPD */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Importar Arquivo RH */}
        <Card className="gap-0 p-5">
          <h2 className="text-sm font-semibold text-foreground">
            Importar Arquivo RH (OKR)
          </h2>
          <p className="mt-1 text-xs text-muted-foreground text-pretty">
            Faça o upload do arquivo Excel com os dados de OKR e performance.
          </p>
          <Link
            href="/people-analytics/importar"
            className="mt-4 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-muted/30"
          >
            <CloudUpload className="size-6 text-muted-foreground" />
            <span className="text-sm text-foreground">
              Arraste e solte o arquivo aqui ou clique para selecionar
            </span>
            <span className="text-xs text-muted-foreground">
              Formatos aceitos: .xlsx, .xls
            </span>
          </Link>
        </Card>

        {/* Última Importação */}
        <Card className="gap-0 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Calendar className="size-4 text-primary" />
            Última Importação
          </h2>
          <dl className="mt-4 flex flex-col gap-2 text-sm">
            <div className="flex flex-col">
              <dt className="text-xs text-muted-foreground">Data</dt>
              <dd className="text-foreground">
                {fmtDataHora(importacao.created_at)}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-xs text-muted-foreground">Arquivo</dt>
              <dd className="truncate text-foreground" title={importacao.arquivo_nome}>
                {importacao.arquivo_nome}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-xs text-muted-foreground">Registros</dt>
              <dd className="text-foreground">
                {importacao.total_colaboradores.toLocaleString('pt-BR')}{' '}
                colaboradores
              </dd>
            </div>
          </dl>
          <div className="mt-4">
            <Badge
              variant="success"
              className="inline-flex items-center gap-1.5"
            >
              <CheckCircle2 className="size-3.5" />
              Importação realizada com sucesso
            </Badge>
          </div>
        </Card>

        {/* Relatórios LGPD */}
        <Card className="gap-0 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="size-4 text-primary" />
            Relatórios LGPD
          </h2>
          <p className="mt-1 text-xs text-muted-foreground text-pretty">
            Gere relatórios anonimizados ou identificados conforme a necessidade.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <Link
              href="/people-analytics/relatorios?modo=anonimizado"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-muted/30"
            >
              <ShieldCheck className="size-4" />
              Relatório Anonimizado
            </Link>
            <Link
              href="/people-analytics/relatorios"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-muted/30"
            >
              <Users className="size-4" />
              Relatório Identificado
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}

function media(valores: (number | null)[]): number {
  const v = valores.filter((x): x is number => x != null)
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0
}

function Insight({
  icon: Icon,
  texto,
}: {
  icon: typeof Activity
  texto: string
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Icon className="size-3.5" />
      </span>
      <span className="text-muted-foreground text-pretty">{texto}</span>
    </li>
  )
}

function WhiChip({ valor }: { valor: number | null }) {
  if (valor == null) return <span className="text-muted-foreground">—</span>
  const classe =
    valor >= 80
      ? 'estrategico'
      : valor >= 60
        ? 'estavel'
        : valor >= 40
          ? 'atencao'
          : 'critico'
  return (
    <span
      className="inline-flex min-w-9 items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold text-background"
      style={{ backgroundColor: WHI_META[classe as keyof typeof WHI_META].cor }}
    >
      {valor}
    </span>
  )
}
