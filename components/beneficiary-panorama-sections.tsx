'use client'

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Gauge,
  HeartPulse,
  Hospital,
  Microscope,
  PieChart,
  Pill,
  RefreshCw,
  Route,
  Siren,
  Sparkles,
  Stethoscope,
  Target,
  Trophy,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { UtilizacaoMensalChart } from '@/components/charts'
import { formatBRL, formatNumber } from '@/lib/data'
import { formatCompetencia } from '@/lib/categorias'
import { PRIORIDADE_META, ordinalPt } from '@/lib/risco'
import {
  RISCO_META,
  IMPACTO_META,
  INTERVENCAO_META,
  panoramaTitulo,
  panoramaSubtitulo,
  type PanoramaBeneficiario,
  type GrupoUtilizacao,
} from '@/lib/beneficiary-panorama'
import { BeneficiaryNarrative } from '@/components/beneficiary-narrative'
import { BeneficiaryIntervencao } from '@/components/beneficiary-intervencao'

export { panoramaTitulo, panoramaSubtitulo }

const REC_ICONES: Record<string, LucideIcon> = {
  'heart-pulse': HeartPulse,
  refresh: RefreshCw,
  route: Route,
  brain: Brain,
  clipboard: ClipboardList,
  pill: Pill,
  'trending-up': TrendingUp,
  target: Target,
}

const GRUPO_ICONES: Record<GrupoUtilizacao, LucideIcon> = {
  Internações: Hospital,
  'Pronto-Socorro': Siren,
  Consultas: Stethoscope,
  Exames: Microscope,
  'Saúde Mental': Brain,
  'Demais Utilizações': Activity,
}

const SEVERIDADE_BADGE = {
  info: 'neutral',
  atencao: 'warning',
  critico: 'destructive',
} as const

const SM_NIVEL_COR: Record<string, string> = {
  Baixo: 'var(--color-success, oklch(0.7 0.15 150))',
  Moderado: 'var(--color-warning, oklch(0.75 0.15 80))',
  Alto: 'var(--color-warning, oklch(0.7 0.18 55))',
  Crítico: 'var(--color-destructive)',
}

// "2025-05-12" -> "12/05/2025"; fallback para a competência formatada.
export function formatData(
  data: string | null,
  competencia: string | null,
): string {
  if (data) {
    const m = data.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${m[3]}/${m[2]}/${m[1]}`
    return data
  }
  return formatCompetencia(competencia)
}

function pct1(n: number): string {
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

// ===========================================================================
// Corpo do Panorama — conjunto de seções reutilizado pelo drawer e pela página.
// ===========================================================================
export function BeneficiaryPanoramaSections({
  p,
  anonimizado = false,
}: {
  p: PanoramaBeneficiario
  anonimizado?: boolean
}) {
  const k = p.kpis
  const meta = RISCO_META[k.faixa]
  const impactoMeta = IMPACTO_META[k.faixaImpacto]
  const intervMeta = INTERVENCAO_META[p.analise.prioridadeIntervencao.faixa]
  const sb = p.scoreBreakdown
  const sm = p.saudeMentalDetalhe

  const kpiCards = [
    { icon: Wallet, label: 'Valor Utilizado', value: formatBRL(k.valorTotal) },
    { icon: Activity, label: 'Eventos', value: formatNumber(k.eventos) },
    {
      icon: BarChart3,
      label: 'Participação',
      value: `${pct1(k.participacaoPct)}%`,
      hint: 'do custo da carteira',
    },
    {
      icon: Trophy,
      label: 'Ranking de Custo',
      value: k.ranking > 0 ? ordinalPt(k.ranking) : '—',
      hint: k.ranking > 0 ? `entre ${k.totalVidas} vidas` : undefined,
    },
    { icon: Hospital, label: 'Internações', value: formatNumber(k.internacoes) },
    { icon: Siren, label: 'Pronto-Socorro', value: formatNumber(k.prontoSocorro) },
    { icon: Stethoscope, label: 'Consultas', value: formatNumber(k.consultas) },
    { icon: Microscope, label: 'Exames', value: formatNumber(k.exames) },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Score + faixa */}
      <section>
        <div
          className="flex items-center justify-between rounded-xl border p-4"
          style={{
            borderColor: `color-mix(in oklch, ${meta.cor} 40%, transparent)`,
            backgroundColor: `color-mix(in oklch, ${meta.cor} 12%, transparent)`,
          }}
        >
          <div>
            <p className="text-xs text-muted-foreground">Score de Risco</p>
            <p
              className="text-3xl font-semibold tabular-nums"
              style={{ color: meta.cor }}
            >
              {k.score}
              <span className="text-base text-muted-foreground">/100</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium"
              style={{
                backgroundColor: `color-mix(in oklch, ${meta.cor} 22%, transparent)`,
                color: meta.cor,
              }}
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: meta.cor }}
              />
              {meta.label}
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: `color-mix(in oklch, ${impactoMeta.cor} 16%, transparent)`,
                color: impactoMeta.cor,
              }}
            >
              Impacto {impactoMeta.label}
            </span>
          </div>
        </div>
      </section>

      {/* Breakdown visual do score */}
      {sb.fatores.length > 0 && (
        <section className="rounded-xl border border-border bg-background/40 p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
            <Gauge className="size-4 text-primary" />
            Composição do Score
          </div>
          <p className="mb-3 text-xs text-muted-foreground text-pretty">
            Contribuição de cada fator para a pontuação de risco assistencial.
          </p>
          <div className="flex flex-col gap-2.5">
            {sb.fatores.map((f) => {
              const w = Math.min((f.pontos / 100) * 100, 100)
              return (
                <div key={f.chave}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-foreground">{f.label}</span>
                    <span className="font-medium tabular-nums text-muted-foreground">
                      +{Math.round(f.pontos)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${w}%`,
                        backgroundColor: meta.cor,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="text-muted-foreground">
              {sb.limitado
                ? `Soma dos fatores (${sb.scoreBruto}) limitada ao teto de 100`
                : 'Score final'}
            </span>
            <span
              className="font-semibold tabular-nums"
              style={{ color: meta.cor }}
            >
              {sb.score}/100
            </span>
          </div>
        </section>
      )}

      {/* Cards executivos */}
      <section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpiCards.map((c) => {
            const Icon = c.icon
            return (
              <div
                key={c.label}
                className="rounded-lg border border-border bg-background/40 p-3"
              >
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon className="size-3.5" />
                  {c.label}
                </div>
                <p className="mt-1 text-base font-semibold text-foreground tabular-nums">
                  {c.value}
                </p>
                {c.hint ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {c.hint}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      {/* Perfil de utilização (% por tipo) */}
      {p.perfilUtilizacao.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <PieChart className="size-4 text-primary" />
            Perfil de Utilização
          </h3>
          <div className="flex flex-col gap-3">
            {p.perfilUtilizacao.map((u) => {
              const Icon = GRUPO_ICONES[u.grupo]
              return (
                <div key={u.grupo}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-foreground">
                      <Icon className="size-3.5 text-muted-foreground" />
                      {u.grupo}
                      <span className="text-muted-foreground">
                        · {formatNumber(u.eventos)} evento(s)
                      </span>
                    </span>
                    <span className="font-medium tabular-nums text-foreground">
                      {pct1(u.pctValor)}%
                      <span className="ml-1 font-normal text-muted-foreground">
                        {formatBRL(u.valor)}
                      </span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(u.pctValor, 100)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Análise executiva automática */}
      <section className="rounded-xl border border-border bg-background/40 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <Sparkles className="size-4 text-primary" />
          Análise Executiva
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          {p.analise.insight}
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <AnaliseLinha
            titulo="Padrão de utilização"
            texto={p.analise.padraoUtilizacao}
          />
          <AnaliseLinha
            titulo="Evolução de custo"
            texto={p.analise.evolucaoCusto}
          />
          <AnaliseLinha
            titulo="Risco de continuidade"
            texto={p.analise.riscoContinuidade}
          />
        </div>

        {/* Prioridade de intervenção */}
        <div
          className="mt-4 rounded-lg border p-3"
          style={{
            borderColor: `color-mix(in oklch, ${intervMeta.cor} 40%, transparent)`,
            backgroundColor: `color-mix(in oklch, ${intervMeta.cor} 10%, transparent)`,
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Prioridade de Intervenção
            </span>
            <span
              className="text-sm font-semibold"
              style={{ color: intervMeta.cor }}
            >
              {intervMeta.label}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${p.analise.prioridadeIntervencao.valor}%`,
                backgroundColor: intervMeta.cor,
              }}
            />
          </div>
        </div>
      </section>

      {/* Principais fatores de risco */}
      {p.analise.fatores.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-medium text-foreground">
            Principais Fatores de Risco
          </h3>
          <div className="flex flex-wrap gap-2">
            {p.analise.fatores.map((f) => (
              <span
                key={f.chave}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-2.5 py-1 text-xs text-foreground"
              >
                <span className="size-1.5 rounded-full bg-primary" />
                {f.label}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Alertas */}
      {p.analise.alertas.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <AlertTriangle className="size-4 text-warning" />
            Alertas Identificados
            <Badge variant="neutral">{p.analise.alertas.length}</Badge>
          </h3>
          <ul className="flex flex-col gap-2.5">
            {p.analise.alertas.map((a) => (
              <li
                key={a.chave}
                className="rounded-lg border border-border bg-background/40 p-3"
              >
                <div className="mb-1">
                  <Badge variant={SEVERIDADE_BADGE[a.severidade]}>
                    {a.titulo}
                  </Badge>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
                  {a.descricao}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Detalhe de saúde mental */}
      {sm.total > 0 && (
        <section className="rounded-xl border border-border bg-background/40 p-4">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Brain className="size-4 text-primary" />
              Saúde Mental
            </div>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: `color-mix(in oklch, ${SM_NIVEL_COR[sm.nivel]} 16%, transparent)`,
                color: SM_NIVEL_COR[sm.nivel],
              }}
            >
              Atenção {sm.nivel}
            </span>
          </div>
          <p className="mb-3 text-xs text-muted-foreground text-pretty">
            Indicador de frequência de utilização — não representa diagnóstico
            clínico.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-card/40 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Stethoscope className="size-3.5" />
                Psiquiatria
              </div>
              <p className="mt-1 text-base font-semibold text-foreground tabular-nums">
                {formatNumber(sm.psiquiatria.eventos)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatBRL(sm.psiquiatria.valor)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card/40 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Brain className="size-3.5" />
                Psicoterapia / demais
              </div>
              <p className="mt-1 text-base font-semibold text-foreground tabular-nums">
                {formatNumber(sm.psicoterapia.eventos)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatBRL(sm.psicoterapia.valor)}
              </p>
            </div>
          </div>

          {sm.subcategorias.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {sm.subcategorias.map((s) => (
                <span
                  key={s.nome}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/40 px-2.5 py-1 text-xs text-foreground"
                >
                  {s.nome}
                  <span className="tabular-nums text-muted-foreground">
                    {formatNumber(s.eventos)}
                  </span>
                </span>
              ))}
            </div>
          )}

          {sm.timeline.length > 1 && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-muted-foreground">
                Evolução de utilização em saúde mental
              </p>
              <UtilizacaoMensalChart
                data={sm.timeline.map((t) => ({
                  mes: t.mes,
                  utilizado: t.valor,
                }))}
              />
            </div>
          )}
        </section>
      )}

      {/* Linha do tempo por competência */}
      <section>
        <h3 className="mb-3 text-sm font-medium text-foreground">
          Linha do Tempo de Utilização
        </h3>
        {p.timeline.length > 0 ? (
          <UtilizacaoMensalChart
            data={p.timeline.map((t) => ({ mes: t.mes, utilizado: t.valor }))}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Sem histórico por competência no recorte.
          </p>
        )}
      </section>

      {/* Ranking de prestadores */}
      {p.prestadores.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <Building2 className="size-4 text-primary" />
            Prestadores Mais Utilizados
          </h3>
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Prestador</th>
                    <th className="px-2 py-2 text-right font-medium">Eventos</th>
                    <th className="px-2 py-2 text-right font-medium">Valor</th>
                    <th className="px-4 py-2 text-right font-medium">
                      Participação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {p.prestadores.map((pr) => (
                    <tr
                      key={pr.nome}
                      className="border-b border-border/40 last:border-0"
                    >
                      <td className="px-4 py-2 text-foreground">{pr.nome}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                        {formatNumber(pr.eventos)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-foreground">
                        {formatBRL(pr.valor)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {pct1(pr.participacaoPct)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Histórico detalhado agrupado por tipo de utilização */}
      <section>
        <h3 className="mb-3 text-sm font-medium text-foreground">
          Histórico de Atendimentos
        </h3>
        {p.grupos.length > 0 ? (
          <div className="flex flex-col gap-4">
            {p.grupos.map((g) => {
              const Icon = GRUPO_ICONES[g.grupo]
              return (
                <div
                  key={g.grupo}
                  className="overflow-hidden rounded-xl border border-border"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Icon className="size-4 text-primary" />
                      {g.grupo}
                      <Badge variant="neutral" className="ml-1">
                        {g.eventos}
                      </Badge>
                    </span>
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {formatBRL(g.valor)}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[440px] border-collapse text-[13px]">
                      <thead>
                        <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="px-4 py-2 font-medium">Data</th>
                          <th className="px-2 py-2 font-medium">Procedimento</th>
                          <th className="px-2 py-2 font-medium">Prestador</th>
                          <th className="px-4 py-2 text-right font-medium">
                            Valor
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.atendimentos.map((a) => (
                          <tr
                            key={a.id}
                            className="border-b border-border/40 last:border-0"
                          >
                            <td className="whitespace-nowrap px-4 py-2 tabular-nums text-muted-foreground">
                              {formatData(a.data, a.competencia)}
                            </td>
                            <td className="px-2 py-2 text-foreground">
                              {a.procedimento}
                            </td>
                            <td className="px-2 py-2 text-muted-foreground">
                              {a.prestador ?? '—'}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-foreground">
                              {formatBRL(a.valor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum atendimento no recorte selecionado.
          </p>
        )}
      </section>

      {/* Ações recomendadas */}
      <section>
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <ClipboardCheck className="size-4 text-primary" />
          Ações Recomendadas
        </div>
        {p.analise.recomendacoes.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {p.analise.recomendacoes.map((r) => {
              const Icon = REC_ICONES[r.icone] ?? Sparkles
              const pMeta = PRIORIDADE_META[r.prioridade]
              return (
                <li
                  key={r.chave}
                  className="rounded-lg border border-border bg-background/40 p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Icon className="size-4 text-primary" />
                      {r.titulo}
                    </div>
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: `color-mix(in oklch, ${pMeta.cor} 18%, transparent)`,
                        color: pMeta.cor,
                      }}
                    >
                      <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: pMeta.cor }}
                      />
                      {pMeta.label}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
                    {r.descricao}
                  </p>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sem ações preventivas específicas no período. Manter acompanhamento
            de rotina.
          </p>
        )}
      </section>

      {/* Recomendação consolidada */}
      <section
        className="rounded-xl border p-4"
        style={{
          borderColor: `color-mix(in oklch, ${meta.cor} 35%, transparent)`,
          backgroundColor: `color-mix(in oklch, ${meta.cor} 8%, transparent)`,
        }}
      >
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
          <Sparkles className="size-4" style={{ color: meta.cor }} />
          Recomendação Consolidada
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          {p.analise.recomendacaoConsolidada}
        </p>
      </section>

      {/* Prioridade de Intervenção (P1–P4) + Potencial de Economia */}
      <BeneficiaryIntervencao p={p} />

      {/* Narrativa Assistencial contextual (Winners Decide IA) */}
      <BeneficiaryNarrative p={p} />
    </div>
  )
}

function AnaliseLinha({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="border-l-2 border-primary/40 pl-3">
      <p className="text-xs font-medium text-foreground">{titulo}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground text-pretty">
        {texto}
      </p>
    </div>
  )
}
