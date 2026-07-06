import Link from 'next/link'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatBRL, formatNumber } from '@/lib/data'
import { formatCompetencia, type DashboardData } from '@/lib/queries'

function pctLabel(v: number | null): string {
  if (v === null) return '—'
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

export function DashboardTables({
  data,
  drill,
}: {
  data: DashboardData
  drill?: (extra?: Record<string, string>) => string
}) {
  const { kpis } = data

  const totalSubVidas = data.subestipulanteResumo.reduce(
    (a, s) => a + s.vidasUtil,
    0,
  )
  const totalSubEventos = data.subestipulanteResumo.reduce(
    (a, s) => a + s.eventos,
    0,
  )
  const totalSubValor = data.subestipulanteResumo.reduce(
    (a, s) => a + s.valor,
    0,
  )

  const totalFaixaVidas = data.faixaEtaria.reduce((a, f) => a + f.vidas, 0)
  const totalFaixaValor = data.faixaEtaria.reduce((a, f) => a + f.valor, 0)

  const totalTipoEventos = data.tipoUtilizacao.reduce((a, t) => a + t.eventos, 0)
  const totalTipoValor = data.tipoUtilizacao.reduce((a, t) => a + t.valor, 0)

  return (
    <div className="flex flex-col gap-4">
      {/* Resumo por Competência */}
      <Card>
        <CardHeader>
          <CardTitle>Resumo por Competência</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Competência</TableHead>
                  <TableHead className="text-right">Vidas Ativas</TableHead>
                  <TableHead className="text-right">Vidas c/ Util.</TableHead>
                  <TableHead className="text-right">% Util.</TableHead>
                  <TableHead className="text-right">Eventos</TableHead>
                  <TableHead className="text-right">Valor Utilizado</TableHead>
                  <TableHead className="text-right">Sinistralidade</TableHead>
                  <TableHead className="text-right">Internações</TableHead>
                  <TableHead className="pr-6 text-right">Saúde Mental</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.resumoCompetencia.map((r) => (
                  <TableRow key={r.competencia}>
                    <TableCell className="pl-6 font-medium text-foreground">
                      {formatCompetencia(r.competencia)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {r.vidasAtivas === null ? '—' : formatNumber(r.vidasAtivas)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(r.vidasUtil)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pctLabel(r.pctUtil)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(r.eventos)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatBRL(r.valor)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {pctLabel(r.sinistralidade)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(r.internacoes)}
                    </TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">
                      {formatNumber(r.saudeMental)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-6 font-semibold">
                    Total / Geral
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {kpis.vidasAtivas === null
                      ? '—'
                      : formatNumber(kpis.vidasAtivas)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatNumber(kpis.vidasComUtilizacao)}
                  </TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatNumber(kpis.eventos)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatBRL(kpis.valorUtilizado)}
                  </TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatNumber(kpis.internacoes)}
                  </TableCell>
                  <TableCell className="pr-6 text-right font-semibold tabular-nums">
                    {formatNumber(kpis.saudeMental)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Top 10 Utilizadores e Prestadores */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Maiores Utilizadores (R$)</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6 w-10">#</TableHead>
                  <TableHead>Beneficiário</TableHead>
                  <TableHead className="text-right">Eventos</TableHead>
                  <TableHead className="pr-6 text-right">Utilizado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topUtilizadores.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Sem dados no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.topUtilizadores.map((u, i) => (
                    <TableRow key={`${u.carteirinha ?? u.nome}-${i}`}>
                      <TableCell className="pl-6 text-muted-foreground tabular-nums">
                        {i + 1}
                      </TableCell>
                      <TableCell>
                        {drill ? (
                          <Link
                            href={drill({ benef: u.carteirinha ?? u.nome })}
                            className="font-medium text-foreground hover:text-primary hover:underline"
                          >
                            {u.nome}
                          </Link>
                        ) : (
                          <span className="font-medium text-foreground">
                            {u.nome}
                          </span>
                        )}
                        {u.detalhe && (
                          <span className="block text-xs text-muted-foreground">
                            {u.detalhe}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(u.eventos)}
                      </TableCell>
                      <TableCell className="pr-6 text-right font-medium tabular-nums">
                        {formatBRL(u.valor)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 10 Prestadores (R$)</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6 w-10">#</TableHead>
                  <TableHead>Prestador</TableHead>
                  <TableHead className="text-right">Atend.</TableHead>
                  <TableHead className="pr-6 text-right">Utilizado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topPrestadores.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Sem dados no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.topPrestadores.map((p, i) => (
                    <TableRow key={`${p.nome}-${i}`}>
                      <TableCell className="pl-6 text-muted-foreground tabular-nums">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {drill ? (
                          <Link
                            href={drill({ prestador: p.nome })}
                            className="hover:text-primary hover:underline"
                          >
                            {p.nome}
                          </Link>
                        ) : (
                          p.nome
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(p.eventos)}
                      </TableCell>
                      <TableCell className="pr-6 text-right font-medium tabular-nums">
                        {formatBRL(p.valor)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Subestipulante e Faixa Etária e Tipo de Utilização */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Utilização por Subestipulante (R$)</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Subestipulante</TableHead>
                    <TableHead className="text-right">Vidas Ativas</TableHead>
                    <TableHead className="text-right">Vidas c/ Util.</TableHead>
                    <TableHead className="text-right">Eventos</TableHead>
                    <TableHead className="text-right">Utilizado</TableHead>
                    <TableHead className="text-right">Custo/Vida</TableHead>
                    <TableHead className="pr-6 text-right">% Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.subestipulanteResumo.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        Sem dados no período.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.subestipulanteResumo.map((s) => (
                      <TableRow key={s.codigo}>
                        <TableCell className="pl-6">
                          <span className="font-medium text-foreground">
                            {s.codigo}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {s.razao}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {s.vidasAtivas === null
                            ? '—'
                            : formatNumber(s.vidasAtivas)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(s.vidasUtil)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(s.eventos)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatBRL(s.valor)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBRL(s.custoVida)}
                        </TableCell>
                        <TableCell className="pr-6 text-right tabular-nums">
                          {s.pct.toLocaleString('pt-BR', {
                            maximumFractionDigits: 1,
                          })}
                          %
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {data.subestipulanteResumo.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="pl-6 font-semibold">Total</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        —
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatNumber(totalSubVidas)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatNumber(totalSubEventos)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatBRL(totalSubValor)}
                      </TableCell>
                      <TableCell className="text-right">—</TableCell>
                      <TableCell className="pr-6 text-right font-semibold">
                        100%
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Utilização por Faixa Etária (R$)</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Faixa Etária</TableHead>
                  <TableHead className="text-right">Vidas</TableHead>
                  <TableHead className="text-right">% Total</TableHead>
                  <TableHead className="text-right">Utilizado</TableHead>
                  <TableHead className="pr-6 text-right">% Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.faixaEtaria.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Sem dados no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.faixaEtaria.map((f) => (
                    <TableRow key={f.faixa}>
                      <TableCell className="pl-6 font-medium text-foreground">
                        {f.faixa}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(f.vidas)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {f.pctVidas.toLocaleString('pt-BR', {
                          maximumFractionDigits: 1,
                        })}
                        %
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatBRL(f.valor)}
                      </TableCell>
                      <TableCell className="pr-6 text-right text-muted-foreground tabular-nums">
                        {f.pctValor.toLocaleString('pt-BR', {
                          maximumFractionDigits: 1,
                        })}
                        %
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {data.faixaEtaria.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell className="pl-6 font-semibold">Total</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatNumber(totalFaixaVidas)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      100%
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatBRL(totalFaixaValor)}
                    </TableCell>
                    <TableCell className="pr-6 text-right font-semibold">
                      100%
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tipo de Utilização</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Tipo</TableHead>
                  <TableHead className="text-right">Eventos</TableHead>
                  <TableHead className="text-right">% Total</TableHead>
                  <TableHead className="text-right">Utilizado</TableHead>
                  <TableHead className="pr-6 text-right">% Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.tipoUtilizacao.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Sem dados no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.tipoUtilizacao.map((t) => (
                    <TableRow key={t.tipo}>
                      <TableCell className="pl-6 font-medium text-foreground">
                        {t.tipo}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(t.eventos)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {t.pctEventos.toLocaleString('pt-BR', {
                          maximumFractionDigits: 1,
                        })}
                        %
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatBRL(t.valor)}
                      </TableCell>
                      <TableCell className="pr-6 text-right text-muted-foreground tabular-nums">
                        {t.pctValor.toLocaleString('pt-BR', {
                          maximumFractionDigits: 1,
                        })}
                        %
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {data.tipoUtilizacao.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell className="pl-6 font-semibold">Total</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatNumber(totalTipoEventos)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      100%
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatBRL(totalTipoValor)}
                    </TableCell>
                    <TableCell className="pr-6 text-right font-semibold">
                      100%
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
