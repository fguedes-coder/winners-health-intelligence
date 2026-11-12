'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  BedDouble,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  Hourglass,
  RefreshCw,
} from 'lucide-react'
import { StatCard } from '@/components/stat-card'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { beneficiarioLabel, type BenefDisplay } from '@/lib/display-prefs'
import type { InternacaoGC, SituacaoInternacao, StatusColetaGC } from '@/lib/gestao-conectada'
import { cn } from '@/lib/utils'

const SITUACAO: Record<SituacaoInternacao, { rotulo: string; variant: 'default' | 'neutral' | 'success' | 'warning' | 'destructive' }> = {
  internado: { rotulo: 'Internado', variant: 'warning' },
  alta: { rotulo: 'Alta', variant: 'success' },
  aguardando: { rotulo: 'Autorizada, aguardando', variant: 'default' },
  em_analise: { rotulo: 'Em análise', variant: 'neutral' },
  negada: { rotulo: 'Negada', variant: 'destructive' },
  cancelada: { rotulo: 'Cancelada', variant: 'neutral' },
}

const FILTROS: { id: 'todas' | SituacaoInternacao; rotulo: string }[] = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'internado', rotulo: 'Internados' },
  { id: 'alta', rotulo: 'Com alta' },
  { id: 'em_analise', rotulo: 'Em análise' },
  { id: 'aguardando', rotulo: 'Aguardando' },
  { id: 'negada', rotulo: 'Negadas' },
]

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—')
const dataHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      })
    : ''
const mesRotulo = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`
const menosDias = (hoje: string, n: number) =>
  new Date(Date.parse(`${hoje}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10)
const urgente = (i: InternacaoGC) => /urg|emerg/i.test(i.carater ?? '')
const cirurgica = (i: InternacaoGC) => /cir[uú]rg/i.test(i.tipoInternacao ?? '')
const acimaDasDiarias = (i: InternacaoGC) =>
  i.situacao === 'internado' && i.dias != null && (i.diariasAutorizadas ?? 0) > 0 && i.dias > (i.diariasAutorizadas ?? 0)

export function InternacoesClient({
  internacoes,
  ultimaColeta,
  hoje,
  benefDisplay,
}: {
  internacoes: InternacaoGC[]
  ultimaColeta: StatusColetaGC
  hoje: string
  benefDisplay: BenefDisplay
}) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('todas')
  const [aberta, setAberta] = useState<string | null>(null)

  const nome = (i: InternacaoGC) => beneficiarioLabel(i.carteirinha ?? `manifestação ${i.numero}`, i.beneficiarioNome, benefDisplay)

  const r = useMemo(() => {
    const internados = internacoes
      .filter((i) => i.situacao === 'internado')
      .sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0))
    const andamento = internacoes.filter((i) => i.situacao === 'em_analise' || i.situacao === 'aguardando')
    const mesAtual = hoje.slice(0, 7)
    const desde60 = menosDias(hoje, 60)
    const confirmadas = internacoes.filter((i) => i.dataInternacao)
    const ult60 = confirmadas.filter((i) => (i.dataInternacao ?? '') >= desde60)
    const altas = confirmadas.filter((i) => i.situacao === 'alta' && i.dias != null)
    const permanencia = altas.length ? altas.reduce((s, i) => s + (i.dias ?? 0), 0) / altas.length : null
    const negadas60 = internacoes.filter((i) => i.situacao === 'negada' && (i.aberturaEm ?? '').slice(0, 10) >= desde60)

    const porMes = new Map<string, InternacaoGC[]>()
    for (const i of confirmadas) {
      const m = (i.dataInternacao ?? '').slice(0, 7)
      porMes.set(m, [...(porMes.get(m) ?? []), i])
    }
    const meses = [...porMes.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([mes, lista]) => {
        const comAlta = lista.filter((i) => i.situacao === 'alta' && i.dias != null)
        return {
          mes,
          total: lista.length,
          urgencia: lista.filter(urgente).length,
          cirurgicas: lista.filter(cirurgica).length,
          emCurso: lista.filter((i) => i.situacao === 'internado').length,
          permanencia: comAlta.length ? comAlta.reduce((s, i) => s + (i.dias ?? 0), 0) / comAlta.length : null,
          diarias: lista.reduce((s, i) => s + (i.dias ?? 0), 0),
        }
      })

    return {
      internados,
      andamento,
      noMes: confirmadas.filter((i) => (i.dataInternacao ?? '').startsWith(mesAtual)).length,
      ult60,
      permanencia,
      altas: altas.length,
      negadas60: negadas60.length,
      acima: internados.filter(acimaDasDiarias).length,
      meses,
    }
  }, [internacoes, hoje])

  const historico = internacoes
    .filter((i) => filtro === 'todas' || i.situacao === filtro)
    .sort((a, b) =>
      (b.dataInternacao ?? b.aberturaEm ?? '').localeCompare(a.dataInternacao ?? a.aberturaEm ?? ''),
    )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p>
          Fonte: SulAmérica Gestão Conectada.{' '}
          {ultimaColeta
            ? ultimaColeta.status === 'erro'
              ? `Última atualização falhou (${dataHora(ultimaColeta.quando)}): ${ultimaColeta.mensagem ?? ''}`
              : ultimaColeta.status === 'ok'
                ? `Atualizado em ${dataHora(ultimaColeta.quando)}.`
                : 'Atualização em andamento…'
            : ''}
        </p>
        <Link
          href="/configuracoes?aba=robos"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <RefreshCw className="size-3.5" /> Atualizar / configurar robô
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Internados agora"
          value={String(r.internados.length)}
          icon={BedDouble}
          hint={r.acima ? `${r.acima} acima das diárias autorizadas` : 'sem alta informada'}
        />
        <StatCard label="Internações no mês" value={String(r.noMes)} icon={CalendarDays} hint="pela data de internação" />
        <StatCard
          label="Últimos 60 dias"
          value={String(r.ult60.length)}
          icon={Clock}
          hint={`${r.ult60.filter(urgente).length} urgência · ${r.ult60.filter(cirurgica).length} cirúrgicas`}
        />
        <StatCard
          label="Permanência média"
          value={r.permanencia == null ? '—' : `${r.permanencia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`}
          icon={Hourglass}
          hint={`${r.altas} alta(s) consideradas`}
        />
        <StatCard
          label="Em análise / aguardando"
          value={String(r.andamento.length)}
          icon={AlertTriangle}
          hint={`${r.negadas60} negada(s) em 60 dias`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BedDouble className="size-4 text-primary" /> Internados agora
          </CardTitle>
          <CardDescription>
            Internações confirmadas pelo hospital e ainda sem alta. Dias contados da data de internação até hoje.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {r.internados.length === 0 ? (
            <p className="px-6 pb-2 text-sm text-muted-foreground">Ninguém internado no momento.</p>
          ) : (
            <TabelaInternacoes lista={r.internados} nome={nome} aberta={aberta} setAberta={setAberta} hoje={hoje} />
          )}
        </CardContent>
      </Card>

      {r.andamento.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Solicitações em andamento</CardTitle>
            <CardDescription>
              Pedidos de internação em análise pela SulAmérica ou autorizados e ainda não iniciados — custo que vem pela frente.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <TabelaInternacoes lista={r.andamento} nome={nome} aberta={aberta} setAberta={setAberta} hoje={hoje} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Por mês de internação</CardTitle>
          <CardDescription>
            Histórico acumulado pelo robô. O portal só mostra 60 dias; meses anteriores ao início da coleta não aparecem.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Internações</TableHead>
                <TableHead className="text-right">Urgência</TableHead>
                <TableHead className="text-right">Cirúrgicas</TableHead>
                <TableHead className="text-right">Em curso</TableHead>
                <TableHead className="text-right">Permanência média</TableHead>
                <TableHead className="text-right">Dias de internação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.meses.map((m) => (
                <TableRow key={m.mes}>
                  <TableCell className="font-medium">{mesRotulo(m.mes)}</TableCell>
                  <TableCell className="text-right">{m.total}</TableCell>
                  <TableCell className="text-right">{m.urgencia}</TableCell>
                  <TableCell className="text-right">{m.cirurgicas}</TableCell>
                  <TableCell className="text-right">{m.emCurso}</TableCell>
                  <TableCell className="text-right">
                    {m.permanencia == null ? '—' : `${m.permanencia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d`}
                  </TableCell>
                  <TableCell className="text-right">{m.diarias}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Todas as solicitações de internação</CardTitle>
          <CardDescription>Clique numa linha para ver hipótese diagnóstica, indicação clínica e procedimentos.</CardDescription>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                aria-pressed={filtro === f.id}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  filtro === f.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {f.rotulo}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {historico.length === 0 ? (
            <p className="px-6 pb-2 text-sm text-muted-foreground">Nada nesta situação.</p>
          ) : (
            <TabelaInternacoes lista={historico} nome={nome} aberta={aberta} setAberta={setAberta} hoje={hoje} />
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Dado de saúde sensível (LGPD art. 11) — uso restrito à gestão do contrato. Relatórios para a empresa saem
        sempre anonimizados.
      </p>
    </div>
  )
}

function TabelaInternacoes({
  lista,
  nome,
  aberta,
  setAberta,
  hoje,
}: {
  lista: InternacaoGC[]
  nome: (i: InternacaoGC) => string
  aberta: string | null
  setAberta: (n: string | null) => void
  hoje: string
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Beneficiário</TableHead>
          <TableHead>Situação</TableHead>
          <TableHead>Hospital</TableHead>
          <TableHead>Caráter / tipo</TableHead>
          <TableHead>Internação</TableHead>
          <TableHead>Alta</TableHead>
          <TableHead className="text-right">Dias</TableHead>
          <TableHead className="text-right">Diárias aut.</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lista.map((i) => {
          const expandida = aberta === i.numero
          const s = SITUACAO[i.situacao]
          return (
            <Fragment key={i.numero}>
              <TableRow className="cursor-pointer" onClick={() => setAberta(expandida ? null : i.numero)}>
                <TableCell className="pr-0 text-muted-foreground">
                  {expandida ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </TableCell>
                <TableCell>
                  <div className="font-medium text-foreground">{nome(i)}</div>
                  <div className="text-xs text-muted-foreground">
                    {[i.tipoBeneficiario, i.idade != null ? `${i.idade} anos` : null, i.empresa].filter(Boolean).join(' · ') || '—'}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={s.variant}>{s.rotulo}</Badge>
                </TableCell>
                <TableCell className="max-w-56 truncate" title={i.prestador ?? ''}>{i.prestador ?? '—'}</TableCell>
                <TableCell className="text-xs">
                  {i.carater ?? '—'}
                  <div className="text-muted-foreground">{i.tipoInternacao ?? ''}</div>
                </TableCell>
                <TableCell>{i.dataInternacao ? dataBR(i.dataInternacao) : <span className="text-muted-foreground">prev. {dataBR(i.dataPrevista)}</span>}</TableCell>
                <TableCell>{dataBR(i.dataAlta)}</TableCell>
                <TableCell className={cn('text-right', acimaDasDiarias(i) && 'font-semibold text-destructive')}>
                  {i.dias ?? '—'}
                  {acimaDasDiarias(i) && <AlertTriangle className="ml-1 inline size-3.5" />}
                </TableCell>
                <TableCell className="text-right">{i.diariasAutorizadas ?? '—'}</TableCell>
              </TableRow>
              {expandida && (
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableCell />
                  <TableCell colSpan={8} className="whitespace-normal">
                    <Detalhe i={i} hoje={hoje} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}

function Detalhe({ i, hoje }: { i: InternacaoGC; hoje: string }) {
  const campo = (rotulo: string, valor: string | number | null | undefined) => (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm text-foreground">{valor ?? '—'}</dd>
    </div>
  )
  return (
    <div className="flex flex-col gap-4 py-2">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {campo('Manifestação', i.numero)}
        {campo('Status no portal', i.statusPortal)}
        {campo('Aberta em', i.aberturaEm ? dataHora(i.aberturaEm) : null)}
        {campo('Médico solicitante', i.medico)}
        {campo('Regime', i.regime)}
        {campo('Acomodação', i.acomodacao)}
        {campo('Diárias solicitadas / autorizadas', `${i.diariasSolicitadas ?? '—'} / ${i.diariasAutorizadas ?? '—'}`)}
        {campo(
          i.situacao === 'internado' ? 'Dias internado (até hoje)' : 'Dias de internação',
          i.dias != null ? `${i.dias}${i.situacao === 'internado' ? ` (em ${dataBR(hoje)})` : ''}` : null,
        )}
      </dl>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Hipótese diagnóstica</p>
          <p className="whitespace-pre-line text-sm text-foreground">{i.hipoteseDiagnostica ?? 'não informada pelo prestador'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Indicação clínica</p>
          <p className="whitespace-pre-line text-sm text-foreground">{i.indicacaoClinica ?? '—'}</p>
        </div>
        {i.motivoNegativa && (
          <div>
            <p className="text-xs text-muted-foreground">Motivo da negativa</p>
            <p className="whitespace-pre-line text-sm text-foreground">{i.motivoNegativa}</p>
          </div>
        )}
      </div>

      <Lista titulo="Procedimentos e exames solicitados" itens={i.procedimentos} />
      <Lista titulo="Medicamentos" itens={i.medicamentos} />
      <Lista titulo="Manifestações relacionadas (prorrogações, complementos)" itens={i.relacionadas} />
    </div>
  )
}

function Lista({ titulo, itens }: { titulo: string; itens: Record<string, string>[] }) {
  if (!itens.length) return null
  const colunas = [...new Set(itens.flatMap((x) => Object.keys(x)))]
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{titulo}</p>
      <div className="overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              {colunas.map((c) => (
                <th key={c} className="px-3 py-2 text-left font-medium text-muted-foreground">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itens.map((x, k) => (
              <tr key={k} className="border-b border-border last:border-0">
                {colunas.map((c) => (
                  <td key={c} className="px-3 py-1.5">{x[c] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
