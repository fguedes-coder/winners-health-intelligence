'use client'

import { useMemo, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { beneficiarioLabel, type BenefDisplay } from '@/lib/display-prefs'
import type { AutorizacaoGC } from '@/lib/gestao-conectada'
import { DocumentosGC } from '@/components/documentos-gc'

// Autorizações fora internação (exames SP/SADT, prorrogações, OPME, quimio,
// terapias…). Mostram o que cada pessoa está fazendo ANTES da conta chegar.

type Situacao = 'autorizada' | 'negada' | 'cancelada' | 'em_analise'
const SITUACAO: Record<Situacao, { rotulo: string; variant: 'default' | 'neutral' | 'success' | 'warning' | 'destructive' }> = {
  autorizada: { rotulo: 'Autorizada', variant: 'success' },
  negada: { rotulo: 'Negada', variant: 'destructive' },
  cancelada: { rotulo: 'Cancelada', variant: 'neutral' },
  em_analise: { rotulo: 'Em análise', variant: 'warning' },
}

// Mesma regra de situacaoAutorizacao() em lib/gestao-conectada (server-only).
function situacao(status: string | null): Situacao {
  const s = status ?? ''
  if (/negad/i.test(s)) return 'negada'
  if (/cancel/i.test(s)) return 'cancelada'
  if (/autoriz|liberad|aprovad/i.test(s)) return 'autorizada'
  return 'em_analise'
}

const data = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
const tipoDe = (a: AutorizacaoGC) => a.tipoRegistro ?? 'Não informado'
const procedimentos = (a: AutorizacaoGC) => {
  const d = a.procedimentos.map((p) => p['Descrição'] ?? p['Descricao'] ?? Object.values(p).join(' ')).filter(Boolean)
  return d.length ? d.slice(0, 2).join('; ') + (d.length > 2 ? ` (+${d.length - 2})` : '') : (a.material ?? '—')
}

export function AutorizacoesCard({
  autorizacoes,
  hoje,
  benefDisplay,
}: {
  autorizacoes: AutorizacaoGC[]
  hoje: string
  benefDisplay: BenefDisplay
}) {
  const [tipo, setTipo] = useState<string | null>(null)
  const [limite, setLimite] = useState(30)

  const r = useMemo(() => {
    const desde = (dias: number) => new Date(Date.parse(`${hoje}T12:00:00-03:00`) - dias * 86_400_000).toISOString()
    const d30 = desde(30)
    const d90 = desde(90)
    const porTipo = new Map<string, { total: number; d90: number; negadas: number; pessoas: Set<string> }>()
    for (const a of autorizacoes) {
      const t = tipoDe(a)
      const g = porTipo.get(t) ?? { total: 0, d90: 0, negadas: 0, pessoas: new Set<string>() }
      g.total++
      if ((a.aberturaEm ?? '') >= d90) g.d90++
      if (situacao(a.statusPortal) === 'negada') g.negadas++
      g.pessoas.add(a.carteirinha ?? a.numero)
      porTipo.set(t, g)
    }
    return {
      total: autorizacoes.length,
      ult30: autorizacoes.filter((a) => (a.aberturaEm ?? '') >= d30).length,
      negadas: autorizacoes.filter((a) => situacao(a.statusPortal) === 'negada').length,
      emAnalise: autorizacoes.filter((a) => situacao(a.statusPortal) === 'em_analise').length,
      pessoas: new Set(autorizacoes.map((a) => a.carteirinha ?? a.numero)).size,
      porTipo: [...porTipo.entries()].sort((a, b) => b[1].total - a[1].total),
    }
  }, [autorizacoes, hoje])

  const lista = tipo ? autorizacoes.filter((a) => tipoDe(a) === tipo) : autorizacoes

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="size-4 text-primary" /> Outras autorizações
        </CardTitle>
        <CardDescription>
          Exames e terapias (SP/SADT), prorrogações, OPME, quimio e radioterapia — tudo o que passa por autorização
          prévia, fora internação. Mostra o que cada pessoa está fazendo antes de a conta chegar. Últimos 12 meses.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {autorizacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma autorização lida ainda. O robô passa a ler o relatório de autorizações na próxima atualização e
            o histórico de cada vida na varredura semanal (de madrugada).
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                ['Autorizações (12 meses)', r.total],
                ['Últimos 30 dias', r.ult30],
                ['Pessoas', r.pessoas],
                ['Negadas', r.negadas],
                ['Em análise agora', r.emAnalise],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">{rotulo}</div>
                  <div className="text-xl font-semibold tabular-nums">{Number(valor).toLocaleString('pt-BR')}</div>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">12 meses</TableHead>
                    <TableHead className="text-right">90 dias</TableHead>
                    <TableHead className="text-right">Pessoas</TableHead>
                    <TableHead className="text-right">Negadas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.porTipo.map(([t, g]) => (
                    <TableRow
                      key={t}
                      className="cursor-pointer"
                      data-state={tipo === t ? 'selected' : undefined}
                      onClick={() => setTipo(tipo === t ? null : t)}
                    >
                      <TableCell className="font-medium">{t}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.total}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.d90}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.pessoas.size}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.negadas || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {tipo ? `Filtrando: ${tipo}` : 'Todas as autorizações'} · {lista.length}
              </span>
              {tipo && (
                <Button size="sm" variant="outline" onClick={() => setTipo(null)}>
                  Limpar filtro
                </Button>
              )}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Beneficiário</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Aberta em</TableHead>
                    <TableHead>Prestador</TableHead>
                    <TableHead>Procedimentos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.slice(0, limite).map((a) => {
                    const s = SITUACAO[situacao(a.statusPortal)]
                    return (
                      <TableRow key={a.numero}>
                        <TableCell>
                          <div className="font-medium">
                            {beneficiarioLabel(a.carteirinha ?? `manifestação ${a.numero}`, a.beneficiarioNome, benefDisplay)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {[a.tipoBeneficiario, a.empresa, a.plano].filter(Boolean).join(' · ') || '—'}
                          </div>
                          {a.saudeMental && (
                            <Badge variant="neutral" className="mt-1">
                              Saúde mental
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{tipoDe(a)}</TableCell>
                        <TableCell>
                          <Badge variant={s.variant}>{s.rotulo}</Badge>
                          {a.motivoNegativa && (
                            <div className="mt-1 max-w-48 whitespace-normal text-xs text-muted-foreground">{a.motivoNegativa}</div>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">{data(a.aberturaEm)}</TableCell>
                        <TableCell className="max-w-48 truncate">{a.prestador ?? '—'}</TableCell>
                        <TableCell className="max-w-80 whitespace-normal text-xs">
                          {procedimentos(a)}
                          {a.motivoMedico && <div className="mt-1 text-muted-foreground">{a.motivoMedico}</div>}
                          {a.documentos.length > 0 && (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-primary">Ver documentos ({a.documentos.length})</summary>
                              <div className="mt-2 min-w-72">
                                <DocumentosGC documentos={a.documentos} compacto />
                              </div>
                            </details>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            {lista.length > limite && (
              <Button variant="outline" size="sm" className="self-start" onClick={() => setLimite((l) => l + 50)}>
                Mostrar mais ({lista.length - limite})
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
