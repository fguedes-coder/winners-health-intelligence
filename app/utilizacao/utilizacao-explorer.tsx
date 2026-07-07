'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Activity,
  Brain,
  HeartPulse,
  Search,
  Stethoscope,
  TestTube,
  Ticket,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
import type { EventoDetalhado } from '@/lib/queries'
import {
  CATEGORIAS_GERENCIAIS,
  categoriaFromSlug,
  classificarEvento,
  formatCompetencia,
  subcategoriaSaudeMental,
  type CategoriaGerencial,
} from '@/lib/categorias'
import { RankingSaudeMental } from './ranking-saude-mental'

export type EventoCalc = EventoDetalhado & {
  categoria: CategoriaGerencial
  smSub: string | null
}

type Ordenacao =
  | 'valor'
  | 'eventos-recente'
  | 'prestador'
  | 'beneficiario'

const inputClass =
  'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring'

function fmtData(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
}

export function UtilizacaoExplorer({
  eventos,
}: {
  eventos: EventoDetalhado[]
}) {
  const sp = useSearchParams()

  // Pré-classifica cada evento (memo por referência de eventos)
  const classificados = useMemo<EventoCalc[]>(
    () =>
      eventos.map((e) => ({
        ...e,
        categoria: classificarEvento({
          servicoPrincipal: e.servicoPrincipal,
          servico: e.servico,
          grupoEstatistico: e.grupoEstatistico,
          categoriaAtendimento: e.categoriaAtendimento,
          internacao: e.internacao,
          saudeMental: e.saudeMental,
        }),
        smSub:
          e.saudeMental ||
          /PSIC|PSIQUIATR|NEUROPSIC/i.test(
            `${e.servico ?? ''} ${e.servicoPrincipal ?? ''}`,
          )
            ? subcategoriaSaudeMental(
                `${e.servicoPrincipal ?? ''} ${e.servico ?? ''}`,
              )
            : null,
      })),
    [eventos],
  )

  // Opções de filtro
  const opcoes = useMemo(() => {
    const meses = new Set<string>()
    const apolices = new Set<string>()
    const subs = new Map<string, string>()
    const planos = new Set<string>()
    for (const e of classificados) {
      if (e.competencia) meses.add(e.competencia)
      if (e.apoliceNumero) apolices.add(e.apoliceNumero)
      if (e.subCodigo) subs.set(e.subCodigo, e.subRazao ?? e.subCodigo)
      if (e.plano) planos.add(e.plano)
    }
    return {
      meses: [...meses].sort(),
      apolices: [...apolices].sort(),
      subs: [...subs.entries()].sort(),
      planos: [...planos].sort(),
    }
  }, [classificados])

  // Estado dos filtros, com valores iniciais dos drill-downs (URL)
  const [competencia, setCompetencia] = useState(sp.get('mes') ?? '')
  const [apolice, setApolice] = useState(sp.get('apolice') ?? '')
  const [sub, setSub] = useState(sp.get('sub') ?? '')
  const [tipo, setTipo] = useState<'todos' | 'titular' | 'dependente'>(
    (sp.get('tipo') as 'titular' | 'dependente') ?? 'todos',
  )
  const [internado, setInternado] = useState<'todos' | 'sim' | 'nao'>(
    sp.get('internado') === 'sim'
      ? 'sim'
      : sp.get('internado') === 'nao'
        ? 'nao'
        : 'todos',
  )
  const [categoria, setCategoria] = useState<CategoriaGerencial | ''>(
    () => categoriaFromSlug(sp.get('cat') ?? '') ?? '',
  )
  const [beneficiario, setBeneficiario] = useState(sp.get('benef') ?? '')
  const [prestador, setPrestador] = useState(sp.get('prestador') ?? '')
  const [servico, setServico] = useState('')
  const [valorMin, setValorMin] = useState('')
  const [valorMax, setValorMax] = useState('')
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('valor')

  const filtrados = useMemo(() => {
    const min = valorMin ? Number(valorMin) : null
    const max = valorMax ? Number(valorMax) : null
    const benefQ = beneficiario.trim().toLowerCase()
    const prestQ = prestador.trim().toLowerCase()
    const servQ = servico.trim().toLowerCase()

    const arr = classificados.filter((e) => {
      if (competencia && e.competencia !== competencia) return false
      if (apolice && e.apoliceNumero !== apolice) return false
      if (sub && e.subCodigo !== sub) return false
      if (tipo === 'titular' && !e.titular) return false
      if (tipo === 'dependente' && e.titular) return false
      if (internado === 'sim' && !e.internacao) return false
      if (internado === 'nao' && e.internacao) return false
      if (categoria && e.categoria !== categoria) return false
      if (
        benefQ &&
        !`${e.beneficiario} ${e.nome ?? ''}`.toLowerCase().includes(benefQ)
      )
        return false
      if (prestQ && !(e.prestadorNome ?? '').toLowerCase().includes(prestQ))
        return false
      if (
        servQ &&
        !`${e.servicoPrincipal ?? ''} ${e.servico ?? ''}`
          .toLowerCase()
          .includes(servQ)
      )
        return false
      if (min !== null && e.valorPago < min) return false
      if (max !== null && e.valorPago > max) return false
      return true
    })

    arr.sort((a, b) => {
      switch (ordenacao) {
        case 'valor':
          return b.valorPago - a.valorPago
        case 'eventos-recente':
          return (b.dataAtendimento ?? '').localeCompare(
            a.dataAtendimento ?? '',
          )
        case 'prestador':
          return (a.prestadorNome ?? '').localeCompare(b.prestadorNome ?? '')
        case 'beneficiario':
          return a.displayBeneficiario.localeCompare(b.displayBeneficiario)
        default:
          return 0
      }
    })
    return arr
  }, [
    classificados,
    competencia,
    apolice,
    sub,
    tipo,
    internado,
    categoria,
    beneficiario,
    prestador,
    servico,
    valorMin,
    valorMax,
    ordenacao,
  ])

  // KPIs sobre o conjunto filtrado
  const kpis = useMemo(() => {
    const vidas = new Set<string>()
    let valor = 0
    let internacoes = 0
    let consultas = 0
    let exames = 0
    let prontoSocorro = 0
    let saudeMental = 0
    let procedimentos = 0
    for (const e of filtrados) {
      vidas.add(e.beneficiario)
      valor += e.valorPago
      if (e.internacao) internacoes++
      if (e.categoria === 'Consultas') consultas++
      if (e.categoria === 'Exames') exames++
      if (e.categoria === 'Pronto-Socorro') prontoSocorro++
      if (e.categoria === 'Saúde Mental') saudeMental++
      if (e.categoria === 'Procedimentos') procedimentos++
    }
    const eventos = filtrados.length
    return {
      valor,
      eventos,
      vidas: vidas.size,
      internacoes,
      consultas,
      exames,
      prontoSocorro,
      saudeMental,
      procedimentos,
      ticketEvento: eventos ? valor / eventos : 0,
      ticketVida: vidas.size ? valor / vidas.size : 0,
    }
  }, [filtrados])

  // Agregação por categoria gerencial (cards clicáveis)
  const porCategoria = useMemo(() => {
    const map = new Map<string, { eventos: number; valor: number }>()
    for (const e of filtrados) {
      const cur = map.get(e.categoria) ?? { eventos: 0, valor: 0 }
      cur.eventos++
      cur.valor += e.valorPago
      map.set(e.categoria, cur)
    }
    return CATEGORIAS_GERENCIAIS.map((c) => ({
      nome: c,
      eventos: map.get(c)?.eventos ?? 0,
      valor: map.get(c)?.valor ?? 0,
    })).filter((c) => c.eventos > 0)
  }, [filtrados])

  const algumFiltro =
    competencia ||
    apolice ||
    sub ||
    tipo !== 'todos' ||
    internado !== 'todos' ||
    categoria ||
    beneficiario ||
    prestador ||
    servico ||
    valorMin ||
    valorMax

  function limparFiltros() {
    setCompetencia('')
    setApolice('')
    setSub('')
    setTipo('todos')
    setInternado('todos')
    setCategoria('')
    setBeneficiario('')
    setPrestador('')
    setServico('')
    setValorMin('')
    setValorMax('')
  }

  const cards = [
    { label: 'Valor Total Utilizado', value: formatBRL(kpis.valor), icon: Wallet },
    { label: 'Total de Eventos', value: formatNumber(kpis.eventos), icon: Activity },
    { label: 'Vidas com Utilização', value: formatNumber(kpis.vidas), icon: Users },
    { label: 'Internações', value: formatNumber(kpis.internacoes), icon: HeartPulse },
    { label: 'Consultas', value: formatNumber(kpis.consultas), icon: Stethoscope },
    { label: 'Exames', value: formatNumber(kpis.exames), icon: TestTube },
    { label: 'Pronto-Socorro', value: formatNumber(kpis.prontoSocorro), icon: Activity },
    { label: 'Saúde Mental', value: formatNumber(kpis.saudeMental), icon: Brain },
    { label: 'Procedimentos', value: formatNumber(kpis.procedimentos), icon: TrendingUp },
    { label: 'Ticket Médio / Evento', value: formatBRL(kpis.ticketEvento), icon: Ticket },
    { label: 'Ticket Médio / Vida', value: formatBRL(kpis.ticketVida), icon: Ticket },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground text-pretty">
          Auditoria completa da utilização da SulAmérica: identifique quem
          utilizou, o que utilizou, onde, quando, quanto custou e qual categoria
          gerou o custo. {formatNumber(eventos.length)} eventos importados.
        </p>
      </div>

      {/* Cards de indicadores */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <Card key={c.label} className="gap-0 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs text-muted-foreground text-pretty">
                  {c.label}
                </span>
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Icon className="size-4" />
                </div>
              </div>
              <div className="mt-2 text-xl font-semibold text-foreground tabular-nums">
                {c.value}
              </div>
            </Card>
          )
        })}
      </div>

      {/* Categorias gerenciais clicáveis */}
      <Card>
        <CardHeader>
          <CardTitle>Categorias Gerenciais</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {porCategoria.map((c) => {
              const ativa = categoria === c.nome
              return (
                <button
                  key={c.nome}
                  type="button"
                  onClick={() =>
                    setCategoria(ativa ? '' : (c.nome as CategoriaGerencial))
                  }
                  aria-pressed={ativa}
                  className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                    ativa
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background/40 hover:border-primary/50 hover:bg-muted/40'
                  }`}
                >
                  <span className="text-sm font-medium text-foreground text-pretty">
                    {c.nome}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatNumber(c.eventos)} eventos
                  </span>
                  <span className="text-sm font-semibold text-primary tabular-nums">
                    {formatBRL(c.valor)}
                  </span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Filtros e ordenação</CardTitle>
          {algumFiltro && (
            <button
              type="button"
              onClick={limparFiltros}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
              Limpar filtros
            </button>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <FilterField label="Competência">
              <select
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
                className={inputClass}
              >
                <option value="">Todas</option>
                {opcoes.meses.map((m) => (
                  <option key={m} value={m}>
                    {formatCompetencia(m)}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Apólice">
              <select
                value={apolice}
                onChange={(e) => setApolice(e.target.value)}
                className={inputClass}
              >
                <option value="">Todas</option>
                {opcoes.apolices.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Subestipulante">
              <select
                value={sub}
                onChange={(e) => setSub(e.target.value)}
                className={inputClass}
              >
                <option value="">Todos</option>
                {opcoes.subs.map(([cod, razao]) => (
                  <option key={cod} value={cod}>
                    {cod} - {razao}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Titular / Dependente">
              <select
                value={tipo}
                onChange={(e) =>
                  setTipo(e.target.value as 'todos' | 'titular' | 'dependente')
                }
                className={inputClass}
              >
                <option value="todos">Todos</option>
                <option value="titular">Titulares</option>
                <option value="dependente">Dependentes</option>
              </select>
            </FilterField>

            <FilterField label="Categoria">
              <select
                value={categoria}
                onChange={(e) =>
                  setCategoria(e.target.value as CategoriaGerencial | '')
                }
                className={inputClass}
              >
                <option value="">Todas</option>
                {CATEGORIAS_GERENCIAIS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Internado / Não internado">
              <select
                value={internado}
                onChange={(e) =>
                  setInternado(e.target.value as 'todos' | 'sim' | 'nao')
                }
                className={inputClass}
              >
                <option value="todos">Todos</option>
                <option value="sim">Somente internados</option>
                <option value="nao">Não internados</option>
              </select>
            </FilterField>

            <FilterField label="Beneficiário (nome ou carteirinha)">
              <input
                value={beneficiario}
                onChange={(e) => setBeneficiario(e.target.value)}
                placeholder="Buscar..."
                className={inputClass}
              />
            </FilterField>

            <FilterField label="Prestador">
              <input
                value={prestador}
                onChange={(e) => setPrestador(e.target.value)}
                placeholder="Buscar..."
                className={inputClass}
              />
            </FilterField>

            <FilterField label="Serviço">
              <input
                value={servico}
                onChange={(e) => setServico(e.target.value)}
                placeholder="Buscar serviço..."
                className={inputClass}
              />
            </FilterField>

            <FilterField label="Valor mínimo (R$)">
              <input
                type="number"
                value={valorMin}
                onChange={(e) => setValorMin(e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </FilterField>

            <FilterField label="Valor máximo (R$)">
              <input
                type="number"
                value={valorMax}
                onChange={(e) => setValorMax(e.target.value)}
                placeholder="Sem limite"
                className={inputClass}
              />
            </FilterField>

            <FilterField label="Ordenar por">
              <select
                value={ordenacao}
                onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
                className={inputClass}
              >
                <option value="valor">Maior valor utilizado</option>
                <option value="eventos-recente">Mais recente</option>
                <option value="prestador">Prestador (A-Z)</option>
                <option value="beneficiario">Beneficiário (A-Z)</option>
              </select>
            </FilterField>
          </div>
        </CardContent>
      </Card>

      {/* Ranking + Índice de Atenção — só na categoria Saúde Mental */}
      {categoria === 'Saúde Mental' && (
        <RankingSaudeMental eventos={filtrados} />
      )}

      {/* Detalhamento */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="size-4 text-primary" />
            Detalhamento dos eventos
            <Badge variant="neutral" className="ml-1">
              {formatNumber(filtrados.length)}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Beneficiário</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Subestipulante</TableHead>
                  <TableHead>Prestador</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead className="text-right">Atendimento</TableHead>
                  <TableHead className="text-right">Pagamento</TableHead>
                  <TableHead className="text-right">Competência</TableHead>
                  <TableHead className="text-right">Apresentado</TableHead>
                  <TableHead className="pr-6 text-right">Valor Pago</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      Nenhum evento corresponde aos filtros selecionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtrados.slice(0, 500).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="pl-6 font-medium text-foreground tabular-nums">
                        {e.displayBeneficiario}
                        {e.idade !== null && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {e.sexo ? `${e.sexo} · ` : ''}
                            {e.idade} anos
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={e.titular ? 'default' : 'neutral'}
                          className="text-[11px]"
                        >
                          {e.titular ? 'Titular' : 'Dependente'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.subCodigo ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-foreground">
                        {e.prestadorNome ?? '—'}
                      </TableCell>
                      <TableCell>
                        <span className="text-foreground">{e.categoria}</span>
                        {e.smSub && (
                          <span className="block text-xs text-muted-foreground">
                            {e.smSub}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <span className="block truncate text-foreground">
                          {e.servico || e.servicoPrincipal || '—'}
                        </span>
                        {e.servicoPrincipal &&
                          e.servico &&
                          e.servicoPrincipal !== e.servico && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {e.servicoPrincipal}
                            </span>
                          )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {fmtData(e.dataAtendimento)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {fmtData(e.dataPagamento)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {formatCompetencia(e.competencia)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {formatBRL(e.valorApresentado)}
                      </TableCell>
                      <TableCell className="pr-6 text-right font-medium text-foreground tabular-nums">
                        {formatBRL(e.valorPago)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {filtrados.length > 500 && (
            <p className="px-6 py-3 text-xs text-muted-foreground">
              Exibindo os 500 primeiros eventos. Refine os filtros para ver
              registros específicos.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function FilterField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
