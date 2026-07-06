'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  FileWarning,
  IdCard,
  ScanSearch,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatBRL, formatNumber } from '@/lib/data'
import type {
  CampoVinculo,
  DiagnosticoBase,
  DivergenciaRow,
  QualidadeCadastral,
} from '@/lib/queries'

const pct = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const CAMPO_LABEL: Record<CampoVinculo, string> = {
  CARTEIRINHA: 'Carteirinha',
  CPF: 'CPF',
  NOME: 'Nome',
}

const CAMPO_ICON: Record<CampoVinculo, typeof CreditCard> = {
  CARTEIRINHA: CreditCard,
  CPF: IdCard,
  NOME: UserRound,
}

// Gera e baixa um arquivo compatível com Excel (CSV UTF-8 com BOM e ';').
function baixarExcel(nome: string, linhas: (string | number)[][]) {
  const csv = linhas
    .map((linha) =>
      linha
        .map((c) => {
          const s = String(c ?? '')
          return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(';'),
    )
    .join('\n')
  const blob = new Blob(['\ufeff' + csv], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string
  icon: typeof Users
  tone?: 'default' | 'danger' | 'success'
}) {
  const toneRing =
    tone === 'danger'
      ? 'border-destructive/40 bg-destructive/[0.06]'
      : tone === 'success'
        ? 'border-emerald-500/40 bg-emerald-500/[0.06]'
        : 'border-border bg-card'
  const iconTone =
    tone === 'danger'
      ? 'bg-destructive/15 text-destructive'
      : tone === 'success'
        ? 'bg-emerald-500/15 text-emerald-400'
        : 'bg-primary/10 text-primary'
  return (
    <div className={`rounded-xl border p-4 ${toneRing}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={`flex size-7 items-center justify-center rounded-lg ${iconTone}`}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function CampoBadge({ campo }: { campo: CampoVinculo }) {
  const Icon = CAMPO_ICON[campo]
  const cls =
    campo === 'NOME'
      ? 'border-sky-500/40 bg-sky-500/10 text-sky-400'
      : campo === 'CPF'
        ? 'border-violet-500/40 bg-violet-500/10 text-violet-400'
        : 'border-amber-500/40 bg-amber-500/10 text-amber-500'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      <Icon className="size-3" />
      {CAMPO_LABEL[campo]}
    </span>
  )
}

function QualidadeCadastralCard({ q }: { q: QualidadeCadastral }) {
  const barTone = (pct: number) =>
    pct >= 80
      ? 'bg-emerald-500'
      : pct >= 50
        ? 'bg-amber-500'
        : 'bg-destructive'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>Qualidade Cadastral da Base</span>
          <Badge variant="neutral" className="tabular-nums">
            {formatNumber(q.total)} beneficiários
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Completude dos campos cadastrais
          {q.competenciaAtiva ? ` (competência ${q.competenciaAtiva})` : ''}. A
          barra mostra o dado{' '}
          <span className="font-medium text-foreground">disponível</span>{' '}
          (cadastro + utilização); o traço claro indica o quanto vem apenas do{' '}
          <span className="font-medium text-foreground">cadastro</span>.
        </p>
        <div className="flex flex-col gap-3">
          {q.campos.map((c) => (
            <div key={c.chave} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-foreground">{c.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {pct(c.pct)}%
                  </span>
                  <span className="ml-1 text-xs">
                    ({formatNumber(c.preenchidos)}/{formatNumber(q.total)})
                  </span>
                </span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full ${barTone(c.pct)}`}
                  style={{ width: `${Math.min(100, c.pct)}%` }}
                />
              </div>
              {c.temFallbackUtilizacao && c.pct - c.pctCadastro > 0.05 && (
                <span className="text-xs text-muted-foreground">
                  Cadastro puro: {pct(c.pctCadastro)}% — os demais{' '}
                  {pct(c.pct - c.pctCadastro)}% vêm da utilização.
                </span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function DiagnosticoView({
  data,
  qualidade,
  querystring,
  periodoLabel,
}: {
  data: DiagnosticoBase
  qualidade: QualidadeCadastral
  querystring: string
  periodoLabel: string
}) {
  const [mostrar, setMostrar] = useState(false)
  const voltarHref = `/colaboradores${querystring ? `?${querystring}` : ''}`

  function exportar() {
    const linhas: (string | number)[][] = [
      ['Diagnóstico de Base Elegível — Divergências'],
      ['Período', periodoLabel],
      ['Gerado em', new Date().toLocaleString('pt-BR')],
      [],
      ['Resumo'],
      ['Vidas elegíveis (base)', data.totalVidasElegiveis],
      ['Utilizadores no período', data.totalUtilizadores],
      ['Conciliados', data.utilizadoresConciliados],
      ['Divergências', data.totalDivergencias],
      ['Valor em divergência (R$)', data.valorDivergente.toFixed(2)],
      ['% de conciliação', pct(data.pctConciliacao)],
      [],
      [
        '#',
        'Carteirinha',
        'Nome (utilização)',
        'Campo de vínculo',
        'Motivo da divergência',
        'Carteirinha sugerida',
        'Nome sugerido',
        'Plano',
        'Empresa',
        'Valor utilizado (R$)',
        'Eventos',
      ],
      ...data.divergencias.map((d, i) => [
        i + 1,
        d.carteirinha,
        d.nome ?? '',
        CAMPO_LABEL[d.campoVinculo],
        d.motivo,
        d.carteirinhaSugerida ?? '',
        d.nomeSugerido ?? '',
        d.plano ?? '',
        d.empresa ?? '',
        d.valorUtilizado.toFixed(2),
        d.eventos,
      ]),
    ]
    baixarExcel('diagnostico_divergencias.csv', linhas)
  }

  if (!data.temBaseVidas) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href={voltarHref}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para Beneficiários
        </Link>
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm">
          <FileWarning className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <p className="text-pretty text-muted-foreground">
            Nenhuma <span className="font-medium text-foreground">Base de Vidas Elegíveis</span>{' '}
            foi importada ainda. Importe a base cadastral em Beneficiários para
            habilitar o diagnóstico e a conciliação de divergências.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3">
        <Link
          href={voltarHref}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para Beneficiários
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
              <ScanSearch className="size-5 text-primary" />
              Diagnóstico de Base Elegível
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Conciliação da utilização com a Base de Vidas Elegíveis — período:{' '}
              <span className="text-foreground">{periodoLabel}</span>
            </p>
            {data.baseAtualizadaEm && (
              <p className="mt-1 text-xs text-muted-foreground">
                Base de Vidas Elegíveis atualizada em{' '}
                <span className="font-medium text-foreground">
                  {new Date(data.baseAtualizadaEm).toLocaleDateString('pt-BR')}
                </span>
                . Divergências podem indicar que a base precisa ser reimportada.
              </p>
            )}
          </div>
          <Button
            variant="outline"
            onClick={exportar}
            disabled={data.totalDivergencias === 0}
          >
            <Download className="size-4" />
            Exportar para Excel
          </Button>
        </div>
      </div>

      {/* KPIs de qualidade da base */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Vidas Elegíveis"
          value={formatNumber(data.totalVidasElegiveis)}
          hint="na base cadastral"
          icon={Users}
        />
        <StatCard
          label="Utilizadores"
          value={formatNumber(data.totalUtilizadores)}
          hint="com eventos no período"
          icon={Activity}
        />
        <StatCard
          label="Conciliados"
          value={formatNumber(data.utilizadoresConciliados)}
          hint={`${pct(data.pctConciliacao)}% dos utilizadores`}
          icon={BadgeCheck}
          tone="success"
        />
        <StatCard
          label="Divergências"
          value={formatNumber(data.totalDivergencias)}
          hint={`${pct(data.pctDivergencia)}% dos utilizadores`}
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          label="Valor em Divergência"
          value={formatBRL(data.valorDivergente)}
          hint={`${pct(data.pctValorDivergente)}% do valor utilizado`}
          icon={CreditCard}
          tone="danger"
        />
        <StatCard
          label="Cobertura Cadastral"
          value={`${pct(data.coberturaNome)}%`}
          hint={`${pct(data.coberturaCpf)}% com CPF`}
          icon={ShieldCheck}
        />
      </div>

      {/* Qualidade cadastral da base */}
      <QualidadeCadastralCard q={qualidade} />

      {/* Índice de qualidade / conciliação */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Índice de Conciliação da Base</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${Math.min(100, data.pctConciliacao)}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              <span className="font-semibold text-emerald-400">
                {formatNumber(data.utilizadoresConciliados)}
              </span>{' '}
              conciliados
            </span>
            <span className="text-muted-foreground">
              <span className="font-semibold text-destructive">
                {formatNumber(data.totalDivergencias)}
              </span>{' '}
              divergentes ({data.reconciliaveisPorNome} reconciliáveis por nome)
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Breakdown por motivo e por campo */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Divergências por motivo</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.porMotivo.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma divergência no período.
              </p>
            ) : (
              data.porMotivo.map((m) => (
                <div key={m.codigo} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {m.motivo}
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {formatBRL(m.valor)}
                  </span>
                  <Badge variant="neutral" className="tabular-nums">
                    {formatNumber(m.quantidade)}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campo utilizado no vínculo</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.porCampo.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma divergência no período.
              </p>
            ) : (
              data.porCampo.map((c) => (
                <div key={c.campo} className="flex items-center justify-between gap-3">
                  <CampoBadge campo={c.campo} />
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {formatBRL(c.valor)}
                  </span>
                  <Badge variant="neutral" className="tabular-nums">
                    {formatNumber(c.quantidade)}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ver Divergências */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">
            Registros divergentes ({formatNumber(data.totalDivergencias)})
          </h2>
          <Button
            variant={mostrar ? 'secondary' : 'default'}
            onClick={() => setMostrar((v) => !v)}
            disabled={data.totalDivergencias === 0}
          >
            {mostrar ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {mostrar ? 'Ocultar Divergências' : 'Ver Divergências'}
          </Button>
        </div>

        {mostrar && data.totalDivergencias > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Carteirinha</TableHead>
                      <TableHead>Nome (utilização)</TableHead>
                      <TableHead>Campo de vínculo</TableHead>
                      <TableHead>Motivo da divergência</TableHead>
                      <TableHead>Cadastro sugerido</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Eventos</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.divergencias.map((d: DivergenciaRow, i) => (
                      <TableRow key={d.carteirinha}>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-foreground">
                          {d.carteirinha}
                        </TableCell>
                        <TableCell className="text-foreground">
                          {d.nome ?? (
                            <span className="text-muted-foreground">— sem nome —</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <CampoBadge campo={d.campoVinculo} />
                        </TableCell>
                        <TableCell className="max-w-[260px] text-pretty text-muted-foreground">
                          {d.motivo}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {d.carteirinhaSugerida ? (
                            <span className="flex flex-col">
                              <span className="font-mono text-xs text-foreground">
                                {d.carteirinhaSugerida}
                              </span>
                              {d.nomeSugerido && (
                                <span className="text-xs">{d.nomeSugerido}</span>
                              )}
                            </span>
                          ) : d.nomeSugerido ? (
                            <span className="text-xs">{d.nomeSugerido}</span>
                          ) : (
                            <span className="text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {d.plano ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-foreground">
                          {formatBRL(d.valorUtilizado)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatNumber(d.eventos)}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/colaboradores?q=${encodeURIComponent(d.carteirinha)}`}
                            className="text-primary hover:underline"
                            title="Localizar na base e cadastrar/corrigir"
                          >
                            <ScanSearch className="size-4" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
