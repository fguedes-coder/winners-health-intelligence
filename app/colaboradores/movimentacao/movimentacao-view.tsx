'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import {
  ArrowLeft,
  Download,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
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
import { formatCompetencia } from '@/lib/categorias'
import type { MovimentacaoCarteira, MovimentoTipo } from '@/lib/queries'

type Aba = 'SAIDA' | 'ENTRADA'

export function MovimentacaoView({
  data,
  querystring,
}: {
  data: MovimentacaoCarteira
  querystring: string
}) {
  const [aba, setAba] = useState<Aba>('SAIDA')
  const [competencia, setCompetencia] = useState<string>('todas')

  const pessoas = useMemo(
    () =>
      data.pessoas.filter(
        (p) =>
          p.movimento === aba &&
          (competencia === 'todas' || p.competencia === competencia),
      ),
    [data.pessoas, aba, competencia],
  )

  const ultimo = data.competencias[0] ?? null
  const saidasComUso = data.pessoas.filter(
    (p) => p.movimento === 'SAIDA' && p.eventos > 0,
  )
  const valorSaidas = saidasComUso.reduce((s, p) => s + p.valorUtilizado, 0)

  function exportar() {
    const linhas = pessoas.map((p) => ({
      Movimento: p.movimento === 'SAIDA' ? 'Saída' : 'Entrada',
      Competência: formatCompetencia(p.competencia),
      Carteirinha: p.carteirinha,
      Nome: p.nome ?? '',
      Tipo: p.tipo ?? '',
      Plano: p.plano ?? '',
      Empresa: p.empresa ?? '',
      Eventos: p.eventos,
      'Valor utilizado (R$)': Number(p.valorUtilizado.toFixed(2)),
      'Última utilização': p.ultimaUtilizacao
        ? formatCompetencia(p.ultimaUtilizacao)
        : '',
      'Competências na base': p.competenciasNaBase
        .map((c) => formatCompetencia(c))
        .join(', '),
    }))
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(linhas)
    ws['!cols'] = [
      { wch: 10 },
      { wch: 12 },
      { wch: 18 },
      { wch: 36 },
      { wch: 12 },
      { wch: 10 },
      { wch: 9 },
      { wch: 9 },
      { wch: 18 },
      { wch: 17 },
      { wch: 34 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'Movimentação')
    XLSX.writeFile(
      wb,
      `movimentacao-carteira-${new Date().toISOString().slice(0, 10)}.xlsx`,
    )
  }

  if (!data.temBase) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Nenhuma base de vidas importada ainda. A movimentação é calculada
          comparando as bases de duas competências.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/colaboradores?${querystring}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para Beneficiários
        </Link>
        <Button variant="outline" size="sm" onClick={exportar}>
          <Download className="size-4" />
          Exportar Excel
        </Button>
      </div>

      {/* Indicadores do mês mais recente */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Users className="size-4" />}
          label="Vidas na base atual"
          valor={formatNumber(ultimo?.vidas ?? 0)}
          nota={ultimo ? formatCompetencia(ultimo.competencia) : '—'}
        />
        <StatCard
          icon={<TrendingUp className="size-4 text-emerald-500" />}
          label="Entradas no último mês"
          valor={formatNumber(ultimo?.entradas ?? 0)}
          nota={
            ultimo?.anterior
              ? `vs. ${formatCompetencia(ultimo.anterior)}`
              : 'sem competência anterior'
          }
        />
        <StatCard
          icon={<TrendingDown className="size-4 text-destructive" />}
          label="Saídas no último mês"
          valor={formatNumber(ultimo?.saidas ?? 0)}
          nota={
            ultimo?.anterior
              ? `vs. ${formatCompetencia(ultimo.anterior)}`
              : 'sem competência anterior'
          }
        />
        <StatCard
          icon={<TrendingDown className="size-4 text-amber-500" />}
          label="Utilização de quem saiu"
          valor={formatBRL(valorSaidas)}
          nota={`${saidasComUso.length} pessoa(s) com uso antes de sair`}
        />
      </div>

      {/* Série por competência */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movimentação por competência</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Competência</TableHead>
                <TableHead className="text-right">Vidas</TableHead>
                <TableHead className="text-right">Entradas</TableHead>
                <TableHead className="text-right">Saídas</TableHead>
                <TableHead className="text-right">
                  Utilização de quem saiu
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.competencias.map((c) => (
                <TableRow key={c.competencia}>
                  <TableCell className="font-medium">
                    {formatCompetencia(c.competencia)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(c.vidas)}
                  </TableCell>
                  <TableCell className="text-right text-emerald-500">
                    {c.anterior ? `+${formatNumber(c.entradas)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right text-destructive">
                    {c.anterior ? `−${formatNumber(c.saidas)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.saidas > 0 ? formatBRL(c.valorDasSaidas) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            A primeira competência da série não tem entradas: não há mês anterior
            com que comparar. A utilização é acumulada de toda a série, não só do
            mês da saída — é ela que mostra quanto a pessoa vinha usando.
          </p>
        </CardContent>
      </Card>

      {/* Pessoas */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">
            {aba === 'SAIDA' ? 'Quem saiu' : 'Quem entrou'} (
            {formatNumber(pessoas.length)})
          </CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="todas">Todas as competências</option>
              {data.competencias
                .filter((c) => c.anterior)
                .map((c) => (
                  <option key={c.competencia} value={c.competencia}>
                    {formatCompetencia(c.competencia)}
                  </option>
                ))}
            </select>
            {(['SAIDA', 'ENTRADA'] as MovimentoTipo[]).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={aba === t ? 'default' : 'outline'}
                onClick={() => setAba(t as Aba)}
              >
                {t === 'SAIDA' ? 'Saídas' : 'Entradas'}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {pessoas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma movimentação neste recorte.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Competência</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">Eventos</TableHead>
                  <TableHead className="text-right">Utilização</TableHead>
                  <TableHead>Último uso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pessoas.map((p) => (
                  <TableRow key={`${p.movimento}-${p.competencia}-${p.carteirinha}`}>
                    <TableCell className="font-medium">
                      {p.nome ?? '(sem nome)'}
                    </TableCell>
                    <TableCell>{formatCompetencia(p.competencia)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.tipo ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.empresa ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(p.eventos)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {p.eventos > 0 ? formatBRL(p.valorUtilizado) : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.ultimaUtilizacao
                        ? formatCompetencia(p.ultimaUtilizacao)
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  icon,
  label,
  valor,
  nota,
}: {
  icon: React.ReactNode
  label: string
  valor: string
  nota: string
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </div>
        <p className="text-2xl font-semibold text-foreground">{valor}</p>
        <p className="text-xs text-muted-foreground">{nota}</p>
      </CardContent>
    </Card>
  )
}
