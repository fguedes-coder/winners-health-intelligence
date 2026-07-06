'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Activity,
  AlertTriangle,
  ShieldAlert,
  Siren,
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
import {
  EvolucaoRiscoChart,
  FatoresRiscoChart,
  RiscoDonutChart,
} from '@/components/charts'
import { formatBRL, formatNumber } from '@/lib/data'
import type { EventoDetalhado } from '@/lib/queries'
import {
  classificarEvento,
  formatCompetencia,
  mesCurto,
  type CategoriaGerencial,
} from '@/lib/categorias'
import {
  calcularScore,
  classificarRisco,
  gerarAlertas,
  gerarInsightExecutivo,
  FAIXAS_ORDEM,
  LIMIARES,
  RISCO_META,
  type AlertaRisco,
  type FaixaRisco,
  type FatorRisco,
} from '@/lib/risco'
import { BeneficiaryPanoramaDrawer } from '@/components/beneficiary-panorama-drawer'

const inputClass =
  'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring'

const CORES_CATEGORIA = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--muted-foreground)',
]

// Categorias exibidas na distribuição do painel detalhado.
const CATEGORIAS_PAINEL: CategoriaGerencial[] = [
  'Internações',
  'Consultas',
  'Exames',
  'Medicamentos',
  'Procedimentos',
  'Saúde Mental',
]

export type CategoriaValor = {
  nome: string
  valor: number
  eventos: number
  cor: string
}

export type TimelinePonto = {
  mes: string
  competencia: string
  valor: number
  eventos: number
}

export type BeneficiarioRisco = {
  carteirinha: string
  display: string
  nome: string | null
  titular: boolean
  tipoLabel: string
  idade: number | null
  sexo: string | null
  plano: string | null
  cliente: string | null
  apolice: string | null
  eventos: number
  valorTotal: number
  internacoes: number
  prontoSocorro: number
  saudeMental: number
  categoriasDistintas: number
  score: number
  faixa: FaixaRisco
  fatores: FatorRisco[]
  alertas: AlertaRisco[]
  insight: string
  porCategoria: CategoriaValor[]
  timeline: TimelinePonto[]
}

function RiscoDot({ faixa }: { faixa: FaixaRisco }) {
  return (
    <span
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: RISCO_META[faixa].cor }}
      aria-hidden
    />
  )
}

export function RadarExplorer({ eventos }: { eventos: EventoDetalhado[] }) {
  const sp = useSearchParams()

  // Pré-classifica cada evento pela categoria gerencial (mesma regra da Utilização).
  const classificados = useMemo(
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
      })),
    [eventos],
  )

  // Opções de filtro (contexto global do sistema)
  const opcoes = useMemo(() => {
    const clientes = new Set<string>()
    const apolices = new Set<string>()
    const subs = new Map<string, string>()
    const planos = new Set<string>()
    const meses = new Set<string>()
    for (const e of classificados) {
      if (e.apoliceCliente) clientes.add(e.apoliceCliente)
      if (e.apoliceNumero) apolices.add(e.apoliceNumero)
      if (e.subCodigo) subs.set(e.subCodigo, e.subRazao ?? e.subCodigo)
      if (e.plano) planos.add(e.plano)
      if (e.competencia) meses.add(e.competencia)
    }
    return {
      clientes: [...clientes].sort(),
      apolices: [...apolices].sort(),
      subs: [...subs.entries()].sort(),
      planos: [...planos].sort(),
      meses: [...meses].sort(),
    }
  }, [classificados])

  const [cliente, setCliente] = useState(sp.get('cliente') ?? '')
  const [apolice, setApolice] = useState(sp.get('apolice') ?? '')
  const [sub, setSub] = useState(sp.get('sub') ?? '')
  const [plano, setPlano] = useState(sp.get('plano') ?? '')
  const [competencia, setCompetencia] = useState(sp.get('mes') ?? '')
  const [faixaFiltro, setFaixaFiltro] = useState<FaixaRisco | ''>('')
  // Guarda apenas o identificador interno seguro (carteirinha) do beneficiário.
  const [selecionado, setSelecionado] = useState<string | null>(null)

  const filtrados = useMemo(
    () =>
      classificados.filter((e) => {
        if (cliente && e.apoliceCliente !== cliente) return false
        if (apolice && e.apoliceNumero !== apolice) return false
        if (sub && e.subCodigo !== sub) return false
        if (plano && e.plano !== plano) return false
        if (competencia && e.competencia !== competencia) return false
        return true
      }),
    [classificados, cliente, apolice, sub, plano, competencia],
  )

  // Agrega os eventos por beneficiário e calcula o score de risco.
  const beneficiarios = useMemo<BeneficiarioRisco[]>(() => {
    // Competência mais recente do recorte (para "internação recente").
    const ultimaComp = filtrados.reduce<string | null>((max, e) => {
      if (!e.competencia) return max
      return !max || e.competencia > max ? e.competencia : max
    }, null)

    type Agg = {
      ev: (typeof filtrados)[number]
      eventos: number
      valorTotal: number
      internacoes: number
      internacaoRecente: boolean
      prontoSocorro: number
      saudeMental: number
      procedimentosAltoCusto: number
      medicamentosAltoCusto: number
      categorias: Set<string>
      porCategoria: Map<string, { valor: number; eventos: number }>
      porComp: Map<string, { valor: number; eventos: number }>
    }

    const mapa = new Map<string, Agg>()
    for (const e of filtrados) {
      const key = e.beneficiario
      let a = mapa.get(key)
      if (!a) {
        a = {
          ev: e,
          eventos: 0,
          valorTotal: 0,
          internacoes: 0,
          internacaoRecente: false,
          prontoSocorro: 0,
          saudeMental: 0,
          procedimentosAltoCusto: 0,
          medicamentosAltoCusto: 0,
          categorias: new Set(),
          porCategoria: new Map(),
          porComp: new Map(),
        }
        mapa.set(key, a)
      }
      a.eventos++
      a.valorTotal += e.valorPago
      a.categorias.add(e.categoria)
      if (e.internacao) {
        a.internacoes++
        if (ultimaComp && e.competencia === ultimaComp) a.internacaoRecente = true
      }
      if (e.categoria === 'Pronto-Socorro') a.prontoSocorro++
      if (e.categoria === 'Saúde Mental' || e.saudeMental) a.saudeMental++
      if (
        e.categoria === 'Procedimentos' &&
        e.valorPago >= LIMIARES.procedimentoAltoCusto
      )
        a.procedimentosAltoCusto++
      if (
        e.categoria === 'Medicamentos' &&
        e.valorPago >= LIMIARES.medicamentoAltoCusto
      )
        a.medicamentosAltoCusto++

      const cat = a.porCategoria.get(e.categoria) ?? { valor: 0, eventos: 0 }
      cat.valor += e.valorPago
      cat.eventos++
      a.porCategoria.set(e.categoria, cat)

      if (e.competencia) {
        const c = a.porComp.get(e.competencia) ?? { valor: 0, eventos: 0 }
        c.valor += e.valorPago
        c.eventos++
        a.porComp.set(e.competencia, c)
      }
    }

    // Média de pronto-socorro da carteira (para alerta de uso excessivo).
    const totalVidas = mapa.size
    let somaPS = 0
    for (const a of mapa.values()) somaPS += a.prontoSocorro
    const mediaPS = totalVidas ? somaPS / totalVidas : 0

    const out: BeneficiarioRisco[] = []
    for (const [carteirinha, a] of mapa) {
      const comps = [...a.porComp.entries()].sort((x, y) =>
        x[0].localeCompare(y[0]),
      )
      // Crescimento acelerado: última competência vs. anterior (> +50%).
      let crescimentoAcelerado = false
      if (comps.length >= 2) {
        const anterior = comps[comps.length - 2][1].valor
        const atual = comps[comps.length - 1][1].valor
        if (anterior > 0 && atual / anterior - 1 > LIMIARES.crescimentoCusto)
          crescimentoAcelerado = true
      }

      const { score, faixa, fatores } = calcularScore({
        internacoes: a.internacoes,
        reinternacao: a.internacoes >= 2,
        prontoSocorro: a.prontoSocorro,
        saudeMental: a.saudeMental,
        procedimentosAltoCusto: a.procedimentosAltoCusto,
        medicamentosAltoCusto: a.medicamentosAltoCusto,
        crescimentoAcelerado,
        categoriasDistintas: a.categorias.size,
      })

      const alertas = gerarAlertas({
        score,
        internacaoRecente: a.internacaoRecente,
        prontoSocorro: a.prontoSocorro,
        mediaProntoSocorroCarteira: mediaPS,
        crescimentoAcelerado,
        numFatores: fatores.length,
      })

      const insight = gerarInsightExecutivo({ faixa, fatores, alertas })

      const porCategoria: CategoriaValor[] = CATEGORIAS_PAINEL.map((nome, i) => ({
        nome,
        valor: a.porCategoria.get(nome)?.valor ?? 0,
        eventos: a.porCategoria.get(nome)?.eventos ?? 0,
        cor: CORES_CATEGORIA[i % CORES_CATEGORIA.length],
      })).filter((c) => c.eventos > 0)

      const timeline: TimelinePonto[] = comps.map(([competencia, v]) => ({
        competencia,
        mes: mesCurto(competencia),
        valor: v.valor,
        eventos: v.eventos,
      }))

      out.push({
        carteirinha,
        display: a.ev.displayBeneficiario,
        nome: a.ev.nome,
        titular: a.ev.titular,
        tipoLabel: a.ev.titular ? 'Titular' : 'Dependente',
        idade: a.ev.idade,
        sexo: a.ev.sexo,
        plano: a.ev.plano,
        cliente: a.ev.apoliceCliente,
        apolice: a.ev.apoliceNumero,
        eventos: a.eventos,
        valorTotal: a.valorTotal,
        internacoes: a.internacoes,
        prontoSocorro: a.prontoSocorro,
        saudeMental: a.saudeMental,
        categoriasDistintas: a.categorias.size,
        score,
        faixa,
        fatores,
        alertas,
        insight,
        porCategoria,
        timeline,
      })
    }

    out.sort((x, y) => y.score - x.score || y.valorTotal - x.valorTotal)
    return out
  }, [filtrados])

  // Aplica o filtro de faixa (clique nos KPIs) apenas à listagem/tabela.
  const listados = useMemo(
    () =>
      faixaFiltro
        ? beneficiarios.filter((b) => b.faixa === faixaFiltro)
        : beneficiarios,
    [beneficiarios, faixaFiltro],
  )

  // KPIs e distribuições da carteira monitorada.
  const resumo = useMemo(() => {
    const contagem: Record<FaixaRisco, number> = {
      baixo: 0,
      moderado: 0,
      alto: 0,
      critico: 0,
    }
    let impactoFinanceiro = 0
    const fatorMap = new Map<string, number>()

    for (const b of beneficiarios) {
      contagem[b.faixa]++
      if (b.faixa === 'alto' || b.faixa === 'critico') {
        impactoFinanceiro += b.valorTotal
      }
      for (const f of b.fatores) {
        fatorMap.set(f.chave, (fatorMap.get(f.chave) ?? 0) + 1)
      }
    }

    // Evolução do risco: vidas em alto/crítico com utilização em cada competência.
    const evoAcc = new Map<string, Set<string>>()
    for (const b of beneficiarios) {
      if (b.faixa !== 'alto' && b.faixa !== 'critico') continue
      for (const t of b.timeline) {
        const set = evoAcc.get(t.competencia) ?? new Set<string>()
        set.add(b.carteirinha)
        evoAcc.set(t.competencia, set)
      }
    }
    const evolucao = [...evoAcc.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([competencia, set]) => ({
        mes: mesCurto(competencia),
        vidas: set.size,
      }))

    const rotulos: Record<string, string> = {
      internacoes: 'Internações',
      reinternacao: 'Reinternações',
      prontoSocorro: 'Pronto-Socorro',
      saudeMental: 'Saúde Mental',
      procedimentos: 'Procedimentos',
      medicamentos: 'Medicamentos',
      crescimento: 'Crescimento de Custo',
      multiCategoria: 'Múltiplas Categorias',
    }
    const fatores = [...fatorMap.entries()]
      .map(([chave, valor]) => ({ nome: rotulos[chave] ?? chave, valor }))
      .sort((a, b) => b.valor - a.valor)

    const distribuicao = FAIXAS_ORDEM.map((f) => ({
      nome: RISCO_META[f].labelCurto,
      valor: contagem[f],
      cor: RISCO_META[f].cor,
    })).filter((d) => d.valor > 0)

    return {
      total: beneficiarios.length,
      contagem,
      impactoFinanceiro,
      distribuicao,
      fatores,
      evolucao,
      emRisco: contagem.alto + contagem.critico,
    }
  }, [beneficiarios])

  const algumFiltro =
    cliente || apolice || sub || plano || competencia || faixaFiltro

  function limparFiltros() {
    setCliente('')
    setApolice('')
    setSub('')
    setPlano('')
    setCompetencia('')
    setFaixaFiltro('')
  }

  const kpis = [
    {
      key: 'total' as const,
      label: 'Beneficiários Monitorados',
      value: formatNumber(resumo.total),
      hint: 'Vidas com utilização analisada',
      icon: Users,
      cor: 'var(--primary)',
      faixa: '' as FaixaRisco | '',
    },
    {
      key: 'baixo' as const,
      label: 'Risco Baixo',
      value: formatNumber(resumo.contagem.baixo),
      hint: 'Score 0 – 39',
      icon: ShieldAlert,
      cor: RISCO_META.baixo.cor,
      faixa: 'baixo' as FaixaRisco,
    },
    {
      key: 'moderado' as const,
      label: 'Risco Moderado',
      value: formatNumber(resumo.contagem.moderado),
      hint: 'Score 40 – 69',
      icon: Activity,
      cor: RISCO_META.moderado.cor,
      faixa: 'moderado' as FaixaRisco,
    },
    {
      key: 'alto' as const,
      label: 'Alto Risco',
      value: formatNumber(resumo.contagem.alto),
      hint: 'Score 70 – 84',
      icon: AlertTriangle,
      cor: RISCO_META.alto.cor,
      faixa: 'alto' as FaixaRisco,
    },
    {
      key: 'critico' as const,
      label: 'Risco Crítico',
      value: formatNumber(resumo.contagem.critico),
      hint: 'Score 85 – 100',
      icon: Siren,
      cor: RISCO_META.critico.cor,
      faixa: 'critico' as FaixaRisco,
    },
    {
      key: 'impacto' as const,
      label: 'Potencial Impacto Financeiro',
      value: formatBRL(resumo.impactoFinanceiro),
      hint: 'Custo de vidas em alto/crítico',
      icon: Wallet,
      cor: 'var(--destructive)',
      faixa: '' as FaixaRisco | '',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground text-pretty">
          Gestão preventiva e monitoramento de utilização: o Radar identifica
          padrões que indicam maior probabilidade de aumento de custo
          assistencial futuro. Não gera diagnósticos médicos —{' '}
          {formatNumber(resumo.total)} vidas monitoradas no recorte atual.
        </p>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => {
          const Icon = k.icon
          const clicavel = k.faixa !== ''
          const ativo = clicavel && faixaFiltro === k.faixa
          return (
            <button
              key={k.key}
              type="button"
              disabled={!clicavel}
              onClick={() =>
                clicavel &&
                setFaixaFiltro(ativo ? '' : (k.faixa as FaixaRisco))
              }
              aria-pressed={ativo}
              className={`flex flex-col rounded-xl border bg-card p-4 text-left transition-colors ${
                clicavel ? 'cursor-pointer hover:border-primary/50' : ''
              } ${ativo ? 'border-primary ring-1 ring-primary/40' : 'border-border'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs text-muted-foreground text-pretty">
                  {k.label}
                </span>
                <div
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `color-mix(in oklch, ${k.cor} 18%, transparent)`, color: k.cor }}
                >
                  <Icon className="size-4" />
                </div>
              </div>
              <div
                className="mt-2 text-xl font-semibold tabular-nums"
                style={{ color: k.faixa ? k.cor : 'var(--foreground)' }}
              >
                {k.value}
              </div>
              <span className="mt-1 text-xs text-muted-foreground">{k.hint}</span>
            </button>
          )
        })}
      </div>

      {/* Filtros globais */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Filtros</CardTitle>
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <FilterField label="Cliente">
              <select
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                className={inputClass}
              >
                <option value="">Todos</option>
                {opcoes.clientes.map((c) => (
                  <option key={c} value={c}>
                    {c}
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

            <FilterField label="Plano">
              <select
                value={plano}
                onChange={(e) => setPlano(e.target.value)}
                className={inputClass}
              >
                <option value="">Todos</option>
                {opcoes.planos.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </FilterField>

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
          </div>
        </CardContent>
      </Card>

      {/* Gráficos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Distribuição de Risco</CardTitle>
          </CardHeader>
          <CardContent>
            {resumo.distribuicao.length > 0 ? (
              <>
                <RiscoDonutChart
                  data={resumo.distribuicao}
                  centerValue={formatNumber(resumo.total)}
                  centerLabel="vidas"
                />
                <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs">
                  {FAIXAS_ORDEM.map((f) => (
                    <span
                      key={f}
                      className="flex items-center gap-1.5 text-muted-foreground"
                    >
                      <RiscoDot faixa={f} />
                      {RISCO_META[f].labelCurto} ({resumo.contagem[f]})
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <SemDados />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evolução do Risco</CardTitle>
          </CardHeader>
          <CardContent>
            {resumo.evolucao.length > 0 ? (
              <EvolucaoRiscoChart data={resumo.evolucao} />
            ) : (
              <SemDados texto="Sem vidas em alto/crítico no recorte." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Principais Fatores de Risco</CardTitle>
          </CardHeader>
          <CardContent>
            {resumo.fatores.length > 0 ? (
              <FatoresRiscoChart data={resumo.fatores} />
            ) : (
              <SemDados />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabela principal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-primary" />
            Beneficiários com Maior Risco Assistencial
            <Badge variant="neutral" className="ml-1">
              {formatNumber(listados.length)}
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
                  <TableHead className="text-right">Idade</TableHead>
                  <TableHead className="text-right">Eventos</TableHead>
                  <TableHead className="text-right">Valor Utilizado</TableHead>
                  <TableHead className="text-right">Intern.</TableHead>
                  <TableHead className="text-right">PS</TableHead>
                  <TableHead className="text-right">S. Mental</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Classificação</TableHead>
                  <TableHead className="pr-6">Alertas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listados.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      Nenhum beneficiário corresponde aos filtros selecionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  listados.slice(0, 300).map((b) => {
                    const meta = RISCO_META[b.faixa]
                    return (
                      <TableRow
                        key={b.carteirinha}
                        onClick={() => setSelecionado(b.carteirinha)}
                        className="cursor-pointer"
                      >
                        <TableCell className="pl-6 font-medium text-foreground">
                          {b.display}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={b.titular ? 'default' : 'neutral'}
                            className="text-[11px]"
                          >
                            {b.tipoLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {b.idade ?? '—'}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {formatNumber(b.eventos)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-foreground tabular-nums">
                          {formatBRL(b.valorTotal)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {b.internacoes}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {b.prontoSocorro}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {b.saudeMental}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className="inline-flex min-w-9 items-center justify-center rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums"
                            style={{
                              backgroundColor: `color-mix(in oklch, ${meta.cor} 20%, transparent)`,
                              color: meta.cor,
                            }}
                          >
                            {b.score}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                            <RiscoDot faixa={b.faixa} />
                            {meta.labelCurto}
                          </span>
                        </TableCell>
                        <TableCell className="pr-6">
                          {b.alertas.length > 0 ? (
                            <Badge variant="neutral" className="gap-1">
                              <AlertTriangle className="size-3" />
                              {b.alertas.length}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {listados.length > 300 && (
            <p className="px-6 py-3 text-xs text-muted-foreground">
              Exibindo os 300 beneficiários de maior risco. Refine os filtros
              para análises específicas.
            </p>
          )}
        </CardContent>
      </Card>

      <BeneficiaryPanoramaDrawer
        beneficiaryId={selecionado}
        eventos={eventos}
        filtros={{ cliente, apolice, sub, plano, mes: competencia }}
        onClose={() => setSelecionado(null)}
      />
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

function SemDados({ texto = 'Sem dados para o recorte atual.' }: { texto?: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
      {texto}
    </div>
  )
}

// Reexport para consumo tipado externo, se necessário.
export { classificarRisco }
