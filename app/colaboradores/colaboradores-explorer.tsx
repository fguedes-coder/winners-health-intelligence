'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Activity,
  Coins,
  HeartPulse,
  Pencil,
  RefreshCw,
  ScanSearch,
  Search,
  Upload,
  UserCheck,
  Users,
  UserX,
  Wallet,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
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
import type { ColaboradoresResult, ColaboradorRow } from '@/lib/queries'
import {
  importarNomes,
  importarVidas,
  mesclarVidas,
  salvarNome,
} from './actions'

type Modo = 'acumulado' | 'mes' | 'ano' | 'periodo'
type UtilFiltro = 'todos' | 'com' | 'sem'
type VinculoFiltro = 'todos' | 'titular' | 'dependente'
type SortKey = 'valor' | 'eventos' | 'nome' | 'idade'
type SortDir = 'asc' | 'desc'

const inputClass =
  'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring'

const MODOS: { value: Modo; label: string }[] = [
  { value: 'acumulado', label: 'Até hoje (acumulado)' },
  { value: 'mes', label: 'Mês' },
  { value: 'ano', label: 'Ano' },
  { value: 'periodo', label: 'Período personalizado' },
]

const pct = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// Converte competência "YYYY-MM" para "MM/YYYY" para exibição.
function formatarCompetencia(comp: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(comp)
  return m ? `${m[2]}/${m[1]}` : comp
}

export function ColaboradoresExplorer({
  data,
  modo,
  mes,
  ano,
  de,
  ate,
  buscaInicial = '',
}: {
  data: ColaboradoresResult
  modo: string
  mes: string
  ano: string
  de: string
  ate: string
  buscaInicial?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const fileVidasRef = useRef<HTMLInputElement>(null)
  const fileMesclarRef = useRef<HTMLInputElement>(null)
  const fileNomesRef = useRef<HTMLInputElement>(null)

  const [busca, setBusca] = useState(buscaInicial)
  const [utilFiltro, setUtilFiltro] = useState<UtilFiltro>('todos')
  const [vinculoFiltro, setVinculoFiltro] = useState<VinculoFiltro>('todos')
  const [sortKey, setSortKey] = useState<SortKey>('valor')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const [importMsg, setImportMsg] = useState<{
    tipo: 'ok' | 'erro'
    texto: string
  } | null>(null)
  const [importando, startImport] = useTransition()
  // Competência (YYYY-MM) da base de vidas a ser importada. Default: mês atual.
  const [competenciaVidas, setCompetenciaVidas] = useState<string>(() =>
    new Date().toISOString().slice(0, 7),
  )

  // Edição inline de nome
  const [editando, setEditando] = useState<string | null>(null)
  const [nomeEdit, setNomeEdit] = useState('')
  const [salvando, startSalvar] = useTransition()

  function aplicar(next: {
    modo?: Modo
    mes?: string
    ano?: string
    de?: string
    ate?: string
  }) {
    const params = new URLSearchParams()
    const m = (next.modo ?? modo) as Modo
    params.set('modo', m)
    if (m === 'mes' && (next.mes ?? mes)) params.set('mes', next.mes ?? mes)
    if (m === 'ano' && (next.ano ?? ano)) params.set('ano', next.ano ?? ano)
    if (m === 'periodo') {
      if (next.de ?? de) params.set('de', next.de ?? de)
      if (next.ate ?? ate) params.set('ate', next.ate ?? ate)
    }
    startTransition(() => {
      router.push(`/colaboradores?${params.toString()}`, { scroll: false })
    })
  }

  function handleArquivo(
    e: React.ChangeEvent<HTMLInputElement>,
    tipo: 'vidas' | 'nomes',
  ) {
    const file = e.target.files?.[0]
    if (!file) return

    // A base de vidas é sempre vinculada a uma competência. Reimportar uma
    // competência existente substitui a fotografia daquele mês (destrutivo).
    if (tipo === 'vidas') {
      if (!/^\d{4}-\d{2}$/.test(competenciaVidas)) {
        if (fileVidasRef.current) fileVidasRef.current.value = ''
        setImportMsg({
          tipo: 'erro',
          texto: 'Informe a competência (mês/ano) antes de importar a base de vidas.',
        })
        return
      }
      if (data.competenciasDisponiveis.includes(competenciaVidas)) {
        const ok = window.confirm(
          `Já existe uma base para a competência ${formatarCompetencia(competenciaVidas)}.\n\n` +
            'Reimportar irá substituir a fotografia oficial desse mês pelas vidas ' +
            'deste arquivo. As demais competências são preservadas. Continuar?',
        )
        if (!ok) {
          if (fileVidasRef.current) fileVidasRef.current.value = ''
          return
        }
      }
    }

    const formData = new FormData()
    formData.set('file', file)
    if (tipo === 'vidas') formData.set('competencia', competenciaVidas)
    setImportMsg(null)
    startImport(async () => {
      if (tipo === 'vidas') {
        const res = await importarVidas(formData)
        if (fileVidasRef.current) fileVidasRef.current.value = ''
        if (res.ok) {
          const cols = res.colunasDetectadas
            ? ` Colunas: ${Object.values(res.colunasDetectadas).join(', ')}.`
            : ''
          const removidos =
            res.removidos > 0
              ? ` (${res.removidos} vidas da versão anterior substituídas)`
              : ''
          setImportMsg({
            tipo: 'ok',
            texto: `Base da competência ${formatarCompetencia(res.competencia)} importada: ${res.total} vidas${removidos}.${cols}`,
          })
          router.refresh()
        } else {
          setImportMsg({ tipo: 'erro', texto: res.error ?? 'Falha na importação.' })
        }
        return
      }

      const res = await importarNomes(formData)
      if (fileNomesRef.current) fileNomesRef.current.value = ''
      if (res.ok) {
        const cols =
          'colunasDetectadas' in res && res.colunasDetectadas
            ? ` Colunas: ${Object.values(res.colunasDetectadas).join(', ')}.`
            : ''
        setImportMsg({
          tipo: 'ok',
          texto: `Importação concluída: ${res.inseridos} novos, ${res.atualizados} atualizados${
            res.ignorados > 0 ? `, ${res.ignorados} ignorados` : ''
          }.${cols}`,
        })
        router.refresh()
      } else {
        setImportMsg({ tipo: 'erro', texto: res.error ?? 'Falha na importação.' })
      }
    })
  }

  // Atualização (merge) na base ATIVA: corrige/atualiza os dados dos
  // beneficiários e adiciona os novos, sem criar novo mês nem duplicar.
  function handleMesclarVidas(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.set('file', file)
    setImportMsg(null)
    startImport(async () => {
      const res = await mesclarVidas(formData)
      if (fileMesclarRef.current) fileMesclarRef.current.value = ''
      if (res.ok) {
        const cols = res.colunasDetectadas
          ? ` Colunas: ${Object.values(res.colunasDetectadas).join(', ')}.`
          : ''
        setImportMsg({
          tipo: 'ok',
          texto: `Base ${formatarCompetencia(res.competencia)} atualizada: ${res.atualizados} atualizados, ${res.inseridos} novos, ${res.inalterados} sem mudança${
            res.ignorados > 0 ? `, ${res.ignorados} ignorados` : ''
          }${
            res.masterAtualizados > 0
              ? ` · ${res.masterAtualizados} no Cadastro Mestre`
              : ''
          }.${cols}`,
        })
        router.refresh()
      } else {
        setImportMsg({ tipo: 'erro', texto: res.error ?? 'Falha na atualização.' })
      }
    })
  }

  function iniciarEdicao(carteirinha: string, nomeAtual: string | null) {
    setEditando(carteirinha)
    setNomeEdit(nomeAtual ?? '')
  }

  function confirmarEdicao(carteirinha: string) {
    const nome = nomeEdit.trim()
    if (!nome) {
      setEditando(null)
      return
    }
    startSalvar(async () => {
      const res = await salvarNome(carteirinha, nome)
      setEditando(null)
      if (res.ok) router.refresh()
    })
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'nome' ? 'asc' : 'desc')
    }
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    let arr = data.colaboradores.filter((c) => {
      if (utilFiltro === 'com' && !c.utilizou) return false
      if (utilFiltro === 'sem' && c.utilizou) return false
      if (vinculoFiltro === 'titular' && c.vinculo !== 'TITULAR') return false
      if (vinculoFiltro === 'dependente' && c.vinculo !== 'DEPENDENTE')
        return false
      if (!q) return true
      return (
        (c.nome ?? '').toLowerCase().includes(q) ||
        c.carteirinha.toLowerCase().includes(q) ||
        (c.empresa ?? '').toLowerCase().includes(q) ||
        (c.plano ?? '').toLowerCase().includes(q) ||
        (c.cpf ?? '').toLowerCase().includes(q)
      )
    })

    const dir = sortDir === 'asc' ? 1 : -1
    arr = [...arr].sort((a, b) => {
      switch (sortKey) {
        case 'nome':
          return (
            dir *
            (a.nome ?? 'zzz').localeCompare(b.nome ?? 'zzz', 'pt-BR', {
              sensitivity: 'base',
            })
          )
        case 'idade':
          return dir * ((a.idade ?? -1) - (b.idade ?? -1))
        case 'eventos':
          return dir * (a.eventos - b.eventos)
        case 'valor':
        default:
          return dir * (a.valorUtilizado - b.valorUtilizado)
      }
    })
    return arr
  }, [busca, utilFiltro, vinculoFiltro, sortKey, sortDir, data.colaboradores])

  const periodoLabel =
    modo === 'mes' && mes
      ? formatCompetencia(mes)
      : modo === 'ano' && ano
        ? ano
        : modo === 'periodo' && (de || ate)
          ? `${de ? new Date(de + 'T00:00:00').toLocaleDateString('pt-BR') : '…'} – ${
              ate ? new Date(ate + 'T00:00:00').toLocaleDateString('pt-BR') : '…'
            }`
          : 'Acumulado (todas as competências)'

  // Link para o Diagnóstico de Base preservando o período selecionado.
  const diagnosticoHref = (() => {
    const p = new URLSearchParams()
    p.set('modo', modo)
    if (modo === 'mes' && mes) p.set('mes', mes)
    if (modo === 'ano' && ano) p.set('ano', ano)
    if (modo === 'periodo') {
      if (de) p.set('de', de)
      if (ate) p.set('ate', ate)
    }
    return `/colaboradores/diagnostico?${p.toString()}`
  })()

  return (
    <div className="flex flex-col gap-6">
      {/* Filtro de período */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Filtro de período
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {MODOS.map((m) => {
              const active = (modo as Modo) === m.value
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => aplicar({ modo: m.value })}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {m.label}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {modo === 'mes' && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Competência</span>
                <select
                  className={inputClass}
                  value={mes}
                  onChange={(e) => aplicar({ modo: 'mes', mes: e.target.value })}
                >
                  <option value="">Selecione…</option>
                  {data.mesesDisponiveis.map((m) => (
                    <option key={m} value={m}>
                      {formatCompetencia(m)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {modo === 'ano' && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Ano</span>
                <select
                  className={inputClass}
                  value={ano}
                  onChange={(e) => aplicar({ modo: 'ano', ano: e.target.value })}
                >
                  <option value="">Selecione…</option>
                  {data.anosDisponiveis.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {modo === 'periodo' && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">De</span>
                  <input
                    type="date"
                    className={inputClass}
                    value={de}
                    onChange={(e) =>
                      aplicar({ modo: 'periodo', de: e.target.value })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">At��</span>
                  <input
                    type="date"
                    className={inputClass}
                    value={ate}
                    onChange={(e) =>
                      aplicar({ modo: 'periodo', ate: e.target.value })
                    }
                  />
                </label>
              </>
            )}

            <p className="text-sm text-muted-foreground">
              Período: <span className="text-foreground">{periodoLabel}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* KPIs populacionais */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total de Vidas"
          value={formatNumber(data.totalVidas)}
          icon={Users}
          hint={
            data.temBaseVidas
              ? `${formatNumber(data.vidasCadastradas)} na base cadastral`
              : 'a partir da utilização'
          }
        />
        <StatCard
          label="Titulares"
          value={formatNumber(data.totalTitulares)}
          icon={UserCheck}
          hint={`${formatNumber(data.totalDependentes)} dependentes`}
        />
        <StatCard
          label="Com Utilização"
          value={formatNumber(data.vidasComUtilizacao)}
          icon={Activity}
          hint={`${pct(data.pctUtilizacao)}% da população`}
        />
        <StatCard
          label="Sem Utilização"
          value={formatNumber(data.vidasSemUtilizacao)}
          icon={UserX}
          hint="não utilizaram no período"
        />
        <StatCard
          label="Valor Utilizado"
          value={formatBRL(data.valorTotal)}
          icon={Coins}
          hint={`${formatNumber(data.eventosTotal)} eventos`}
        />
        <StatCard
          label="Custo / Vida"
          value={formatBRL(data.custoMedioVidaElegivel)}
          icon={Wallet}
          hint="por vida elegível"
        />
      </div>

      {data.temBaseVidas && data.utilizadoresForaDaBase > 0 && (
        <div className="flex flex-col gap-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500">
              <ScanSearch className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Diagnóstico de Base Elegível
              </p>
              <p className="mt-1 max-w-2xl text-pretty text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {formatNumber(data.utilizadoresForaDaBase)}
                </span>{' '}
                {data.utilizadoresForaDaBase === 1
                  ? 'beneficiário divergente teve utilização'
                  : 'beneficiários divergentes tiveram utilização'}{' '}
                no período mas não constam na base de vidas. Investigue quais são,
                o campo usado no vínculo e o motivo — e exporte a lista para Excel.
              </p>
            </div>
          </div>
          <Link
            href={diagnosticoHref}
            className={buttonVariants({ size: 'lg', className: 'shrink-0' })}
          >
            <ScanSearch className="size-4" />
            Ver Divergências
          </Link>
        </div>
      )}

      {/* Indicadores estratégicos */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <IndicadorCard
          titulo="Taxa de Utilização"
          valor={`${pct(data.pctUtilizacao)}%`}
          descricao={`${formatNumber(data.vidasComUtilizacao)} de ${formatNumber(
            data.totalVidas,
          )} vidas geraram eventos no período.`}
          icon={Activity}
        />
        <IndicadorCard
          titulo="Custo Médio por Vida Utilizada"
          valor={formatBRL(data.custoMedioVidaUtilizada)}
          descricao="Valor médio gasto entre as vidas que efetivamente utilizaram o plano."
          icon={HeartPulse}
        />
        <IndicadorCard
          titulo="Custo Médio por Evento"
          valor={formatBRL(data.custoMedioEvento)}
          descricao={`Média por utilização entre ${formatNumber(
            data.eventosTotal,
          )} eventos.`}
          icon={Wallet}
        />
      </div>

      {/* Distribuições da população */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <DistribCard titulo="Por faixa etária" itens={data.porFaixaEtaria} />
        <DistribCard titulo="Por vínculo" itens={data.porVinculo} />
        <DistribCard titulo="Por sexo" itens={data.porSexo} />
        <DistribCard titulo="Por plano" itens={data.porPlano} max={6} />
      </div>

      {/* Importações */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Base de vidas */}
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-foreground">
                  Base de vidas elegíveis
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  CSV/TXT com cabeçalho. As colunas são detectadas
                  automaticamente (Carteirinha, Nome, CPF, Tipo, Sexo,
                  Nascimento, Plano, Empresa, Adesão, Status), em qualquer ordem.
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="competencia-vidas"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Competência da base (mês/ano)
                </label>
                <input
                  id="competencia-vidas"
                  type="month"
                  value={competenciaVidas}
                  onChange={(e) => setCompetenciaVidas(e.target.value)}
                  className={`${inputClass} max-w-[12rem]`}
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Cada importação fica vinculada a esta competência e preservada no
                  histórico. Os dashboards usam sempre a competência mais recente como
                  base oficial ativa.
                </p>
              </div>
              {data.competenciaAtiva && (
                <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Base oficial ativa: {formatarCompetencia(data.competenciaAtiva)}
                  </span>
                  {data.competenciasDisponiveis.length > 1 && (
                    <>
                      {' · '}
                      {data.competenciasDisponiveis.length} competências no histórico:{' '}
                      {data.competenciasDisponiveis
                        .map((c) => formatarCompetencia(c))
                        .join(', ')}
                    </>
                  )}
                </div>
              )}
              <input
                ref={fileVidasRef}
                type="file"
                accept=".csv,.txt,text/plain,text/csv"
                className="hidden"
                onChange={(e) => handleArquivo(e, 'vidas')}
              />
              <input
                ref={fileMesclarRef}
                type="file"
                accept=".csv,.txt,text/plain,text/csv"
                className="hidden"
                onChange={handleMesclarVidas}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={importando}
                  className="w-fit"
                  onClick={() => fileVidasRef.current?.click()}
                >
                  <Upload className="size-4" />
                  {importando ? 'Importando…' : 'Importar base de vidas'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={importando}
                  className="w-fit border border-primary/40"
                  onClick={() => fileMesclarRef.current?.click()}
                  title="Atualiza os dados dos beneficiários na competência ativa e adiciona os novos, sem criar um novo mês nem duplicar."
                >
                  <RefreshCw className="size-4" />
                  {importando ? 'Processando…' : 'Atualizar base ativa (mesclar)'}
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Atualizar</span>{' '}
                mescla o arquivo na base ativa{' '}
                {data.competenciaAtiva
                  ? `(${formatarCompetencia(data.competenciaAtiva)})`
                  : ''}
                : corrige os dados de quem já existe e inclui os novos, sem criar
                outro mês e sem duplicar beneficiários. Campos em branco no
                arquivo não apagam os dados existentes.
              </p>
            </div>

            {/* Base de nomes */}
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-foreground">
                  Base de nomes (carteirinha → nome)
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Atalho rápido para identificar carteirinhas sem cadastro
                  completo. Formato{' '}
                  <span className="font-medium text-foreground">
                    carteirinha;nome
                  </span>{' '}
                  por linha.
                </p>
              </div>
              <input
                ref={fileNomesRef}
                type="file"
                accept=".csv,.txt,text/plain,text/csv"
                className="hidden"
                onChange={(e) => handleArquivo(e, 'nomes')}
              />
              <Button
                type="button"
                variant="outline"
                disabled={importando}
                className="w-fit"
                onClick={() => fileNomesRef.current?.click()}
              >
                <Upload className="size-4" />
                {importando ? 'Importando…' : 'Importar base de nomes'}
              </Button>
            </div>
          </div>

          {importMsg && (
            <p
              className={`rounded-md border px-3 py-2 text-sm ${
                importMsg.tipo === 'ok'
                  ? 'border-primary/40 bg-primary/10 text-foreground'
                  : 'border-destructive/40 bg-destructive/10 text-destructive'
              }`}
            >
              {importMsg.texto}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Busca + filtros */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className={`${inputClass} pl-9`}
              placeholder="Buscar por nome, carteirinha, CPF, empresa ou plano…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Utilização:
            </span>
            <FiltroChip
              ativo={utilFiltro === 'todos'}
              onClick={() => setUtilFiltro('todos')}
            >
              Todas
            </FiltroChip>
            <FiltroChip
              ativo={utilFiltro === 'com'}
              onClick={() => setUtilFiltro('com')}
            >
              Com utilização
            </FiltroChip>
            <FiltroChip
              ativo={utilFiltro === 'sem'}
              onClick={() => setUtilFiltro('sem')}
            >
              Sem utilização
            </FiltroChip>
            <span className="ml-3 text-xs font-medium text-muted-foreground">
              Vínculo:
            </span>
            <FiltroChip
              ativo={vinculoFiltro === 'todos'}
              onClick={() => setVinculoFiltro('todos')}
            >
              Todos
            </FiltroChip>
            <FiltroChip
              ativo={vinculoFiltro === 'titular'}
              onClick={() => setVinculoFiltro('titular')}
            >
              Titulares
            </FiltroChip>
            <FiltroChip
              ativo={vinculoFiltro === 'dependente'}
              onClick={() => setVinculoFiltro('dependente')}
            >
              Dependentes
            </FiltroChip>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">
            Beneficiários
            <Badge variant="neutral" className="ml-2">
              {formatNumber(filtrados.length)}
            </Badge>
          </CardTitle>
          {isPending && (
            <span className="text-xs text-muted-foreground">Atualizando…</span>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead
                    label="Beneficiário"
                    col="nome"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <TableHead>Carteirinha</TableHead>
                  <TableHead>Vínculo</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Empresa / Filial</TableHead>
                  <SortableHead
                    label="Idade"
                    col="idade"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortableHead
                    label="Utilizado"
                    col="valor"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortableHead
                    label="Eventos"
                    col="eventos"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="right"
                  />
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Nenhum beneficiário encontrado para os filtros aplicados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtrados.map((c) => (
                    <LinhaBeneficiario
                      key={c.carteirinha}
                      c={c}
                      editando={editando === c.carteirinha}
                      nomeEdit={nomeEdit}
                      salvando={salvando}
                      onNomeEdit={setNomeEdit}
                      onIniciarEdicao={iniciarEdicao}
                      onConfirmar={confirmarEdicao}
                      onCancelar={() => setEditando(null)}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function LinhaBeneficiario({
  c,
  editando,
  nomeEdit,
  salvando,
  onNomeEdit,
  onIniciarEdicao,
  onConfirmar,
  onCancelar,
}: {
  c: ColaboradorRow
  editando: boolean
  nomeEdit: string
  salvando: boolean
  onNomeEdit: (v: string) => void
  onIniciarEdicao: (carteirinha: string, nome: string | null) => void
  onConfirmar: (carteirinha: string) => void
  onCancelar: () => void
}) {
  return (
    <TableRow className={c.utilizou ? '' : 'opacity-70'}>
      <TableCell>
        {editando ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              className={`${inputClass} h-8 w-48`}
              value={nomeEdit}
              onChange={(e) => onNomeEdit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onConfirmar(c.carteirinha)
                if (e.key === 'Escape') onCancelar()
              }}
              placeholder="Nome do beneficiário"
            />
            <Button
              size="sm"
              className="h-8"
              disabled={salvando}
              onClick={() => onConfirmar(c.carteirinha)}
            >
              Salvar
            </Button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={onCancelar}
              aria-label="Cancelar"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <Link
            href={`/colaboradores/${encodeURIComponent(c.carteirinha)}`}
            className="group flex items-center gap-2"
          >
            <span
              className={
                c.nome
                  ? 'font-medium text-foreground group-hover:text-primary group-hover:underline'
                  : 'italic text-muted-foreground group-hover:text-primary'
              }
            >
              {c.nome ?? 'Nome não cadastrado'}
            </span>
          </Link>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {c.carteirinha}
      </TableCell>
      <TableCell>
        {c.vinculo === 'TITULAR' ? (
          <Badge variant="default" className="text-[10px]">
            Titular
          </Badge>
        ) : c.vinculo === 'DEPENDENTE' ? (
          <Badge variant="neutral" className="text-[10px]">
            Dependente
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-sm">{c.plano ?? '—'}</TableCell>
      <TableCell className="text-sm">{c.empresa ?? '—'}</TableCell>
      <TableCell className="text-right text-sm text-muted-foreground">
        {c.idade ?? '—'}
      </TableCell>
      <TableCell className="text-right font-medium">
        {c.valorUtilizado > 0 ? formatBRL(c.valorUtilizado) : '—'}
      </TableCell>
      <TableCell className="text-right text-muted-foreground">
        {c.eventos > 0 ? formatNumber(c.eventos) : '—'}
      </TableCell>
      <TableCell>
        {!editando && (
          <button
            type="button"
            className="text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => onIniciarEdicao(c.carteirinha, c.nome)}
            aria-label="Editar nome"
            title="Editar nome"
          >
            <Pencil className="size-4" />
          </button>
        )}
      </TableCell>
    </TableRow>
  )
}

function SortableHead({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align = 'left',
}: {
  label: string
  col: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sortKey === col
  return (
    <TableHead className={align === 'right' ? 'text-right' : ''}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
          align === 'right' ? 'flex-row-reverse' : ''
        } ${active ? 'text-foreground' : ''}`}
      >
        {label}
        {active ? (
          sortDir === 'asc' ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-50" />
        )}
      </button>
    </TableHead>
  )
}

function FiltroChip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        ativo
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:border-primary/50'
      }`}
    >
      {children}
    </button>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  hint: string
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-6">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <Icon className="size-4 text-primary" />
        </div>
        <span className="text-2xl font-semibold text-foreground">{value}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </CardContent>
    </Card>
  )
}

function IndicadorCard({
  titulo,
  valor,
  descricao,
  icon: Icon,
}: {
  titulo: string
  valor: string
  descricao: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-6">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary/10">
            <Icon className="size-4 text-primary" />
          </span>
          <span className="text-sm font-medium text-foreground">{titulo}</span>
        </div>
        <span className="text-2xl font-semibold text-foreground">{valor}</span>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {descricao}
        </p>
      </CardContent>
    </Card>
  )
}

function DistribCard({
  titulo,
  itens,
  max = 8,
}: {
  titulo: string
  itens: { chave: string; vidas: number; valor: number }[]
  max?: number
}) {
  const total = itens.reduce((s, i) => s + i.vidas, 0)
  const lista = itens.slice(0, max)
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {lista.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem dados.</p>
        ) : (
          lista.map((i) => {
            const p = total ? (i.vidas / total) * 100 : 0
            return (
              <div key={i.chave} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate text-foreground" title={i.chave}>
                    {i.chave}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatNumber(i.vidas)} · {pct(p)}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(p, 1.5)}%` }}
                  />
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
