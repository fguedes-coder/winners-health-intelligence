import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Importacao } from '@/app/uploads/actions'
import {
  classificarEvento,
  categoriaDinamica,
  subcategoriaDinamica,
} from '@/lib/categorias'
import { beneficiarioLabel } from '@/lib/display-prefs'
import { getBenefDisplay } from '@/lib/display-prefs-server'
import {
  loadMasterIndex,
  masterNaoRepresentados,
  type MasterCadastro,
} from '@/lib/cadastro-master/read'
import { normalizarNome } from '@/lib/people-analytics/rh'

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

// Mapa carteirinha -> nome (base auxiliar importada). Usado apenas para a
// forma de EXIBIÇÃO dos beneficiários; nunca afeta cálculos ou agrupamentos.
async function fetchNomesPorCarteirinha(
  supabase: SupabaseServer,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('beneficiario_nomes')
    .select('carteirinha, nome')
  return new Map(
    ((data ?? []) as { carteirinha: string; nome: string }[]).map((n) => [
      n.carteirinha,
      n.nome,
    ]),
  )
}

const MESES = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

// "2025-05" -> "Mai/2025"
export function formatCompetencia(value: string | null): string {
  if (!value) return '—'
  const m = value.match(/^(\d{4})-(\d{2})$/)
  if (!m) return value
  return `${MESES[Number(m[2]) - 1]}/${m[1]}`
}

// "2025-05" -> "Mai/25"
function competenciaCurta(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})$/)
  if (!m) return value
  return `${MESES[Number(m[2]) - 1]}/${m[1].slice(2)}`
}

export { competenciaCurta as mesCurto }

type RankRow = {
  nome: string
  // Carteirinha estável do beneficiário (usada em drill-down e como fallback).
  // Ausente para rankings de prestadores.
  carteirinha?: string
  detalhe?: string
  eventos: number
  valor: number
}
type CategoriaRow = { nome: string; valor: number; pct: number }
type FaixaRow = { faixa: string; beneficiarios: number }

export type PainelData = {
  competenciaAtual: string | null
  competenciasLista: string[]
  clientesAtivos: number
  apolicesAtivas: number
  beneficiarios: number
  titulares: number
  dependentes: number
  valorUtilizado: number
  valorFatura: number | null
  sinistralidade: number | null
  internacoes: number
  saudeMental: number
  totalEventos: number
  historico: {
    mes: string
    competencia: string
    utilizado: number
    fatura: number | null
    sinistralidade: number | null
  }[]
  topPrestadores: RankRow[]
  topUtilizadores: RankRow[]
  categorias: CategoriaRow[]
  faixaEtaria: FaixaRow[]
  ultimaImportacao: {
    arquivo: string | null
    enviadoEm: string | null
  } | null
}

function mergeRank(target: Map<string, RankRow>, rows: RankRow[] | undefined) {
  for (const r of rows ?? []) {
    const key = r.nome
    const cur = target.get(key)
    if (cur) {
      cur.eventos += r.eventos
      cur.valor += r.valor
    } else {
      target.set(key, { ...r })
    }
  }
}

const ORDEM_FAIXAS = ['0-18', '19-30', '31-45', '46-60', '60+', 'Não informado']

// Retorna os dados consolidados do painel a partir das importações
// confirmadas. Por padrão consolida TODAS as competências; quando `mes` é
// informado, recalcula considerando apenas as competências selecionadas.
export async function getPainel(
  filtros: { mes?: string[] } = {},
): Promise<PainelData | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('importacoes')
    .select('*')
    .eq('status', 'confirmado')
    .not('competencia', 'is', null)
    .order('competencia', { ascending: true })

  const importacoes = (data as Importacao[] | null) ?? []
  if (importacoes.length === 0) return null

  // Preferência global de exibição (Nome x Carteirinha) + base de nomes.
  const benefDisplayMode = await getBenefDisplay()
  const nomesPorCarteirinha = await fetchNomesPorCarteirinha(supabase)

  // Faturas cadastradas (valor + vidas por competência)
  const { data: faturasData } = await supabase
    .from('faturas')
    .select('competencia, valor')
  const faturaMap = new Map<string, number>()
  for (const f of (faturasData ?? []) as {
    competencia: string | null
    valor: number | null
  }[]) {
    if (f.competencia && f.valor !== null) {
      faturaMap.set(
        f.competencia,
        (faturaMap.get(f.competencia) ?? 0) + Number(f.valor),
      )
    }
  }

  // Lista de competências (únicas, ordenadas)
  const competenciasLista = [
    ...new Set(importacoes.map((i) => i.competencia!).filter(Boolean)),
  ].sort()

  // Competências efetivamente analisadas: as selecionadas (∩ disponíveis) ou,
  // na ausência de seleção, todas as competências confirmadas.
  const selSet = new Set(filtros.mes ?? [])
  const selecionadas =
    selSet.size > 0
      ? competenciasLista.filter((c) => selSet.has(c))
      : competenciasLista
  const selecionadasSet = new Set(
    selecionadas.length > 0 ? selecionadas : competenciasLista,
  )
  // Competência de referência = a mais recente entre as analisadas.
  const competenciaAtual =
    selecionadas[selecionadas.length - 1] ??
    competenciasLista[competenciasLista.length - 1]

  // Histórico por competência (soma da utilização entre clientes/apólices)
  const porCompetencia = new Map<string, number>()
  for (const imp of importacoes) {
    const c = imp.competencia!
    porCompetencia.set(
      c,
      (porCompetencia.get(c) ?? 0) + Number(imp.valor_total_utilizacao ?? 0),
    )
  }
  const historico = competenciasLista
    .filter((c) => selecionadasSet.has(c))
    .map((c) => {
      const util = porCompetencia.get(c) ?? 0
      const fatura = faturaMap.get(c) ?? null
      return {
        mes: competenciaCurta(c),
        competencia: c,
        utilizado: util,
        fatura,
        sinistralidade:
          fatura && fatura > 0
            ? Number(((util / fatura) * 100).toFixed(1))
            : null,
      }
    })

  // Snapshot consolidado das competências analisadas (pode haver vários arquivos)
  const atuais = importacoes.filter(
    (i) => i.competencia && selecionadasSet.has(i.competencia),
  )

  let beneficiarios = 0
  let titulares = 0
  let dependentes = 0
  let valorUtilizado = 0
  let internacoes = 0
  let saudeMental = 0
  let totalEventos = 0
  const prestMap = new Map<string, RankRow>()
  const utilMap = new Map<string, RankRow>()
  const catMap = new Map<string, number>()
  const faixaMap = new Map<string, number>()

  for (const imp of atuais) {
    beneficiarios += imp.total_beneficiarios ?? imp.total_vidas ?? 0
    titulares += imp.total_titulares ?? 0
    dependentes += imp.total_dependentes ?? 0
    valorUtilizado += Number(imp.valor_total_utilizacao ?? 0)
    internacoes += imp.total_internacoes ?? 0
    saudeMental += imp.total_saude_mental ?? 0
    totalEventos += imp.total_eventos ?? 0
    const resumo = imp.resumo
    mergeRank(prestMap, resumo?.topPrestadores)
    mergeRank(utilMap, resumo?.topUtilizadores)
    for (const cat of resumo?.categorias ?? []) {
      catMap.set(cat.nome, (catMap.get(cat.nome) ?? 0) + cat.valor)
    }
    for (const f of resumo?.faixaEtaria ?? []) {
      faixaMap.set(f.faixa, (faixaMap.get(f.faixa) ?? 0) + f.beneficiarios)
    }
  }

  const totalCat = [...catMap.values()].reduce((a, b) => a + b, 0)
  const categorias: CategoriaRow[] = [...catMap.entries()]
    .map(([nome, valor]) => ({
      nome,
      valor,
      pct: totalCat ? (valor / totalCat) * 100 : 0,
    }))
    .sort((a, b) => b.valor - a.valor)

  const faixaEtaria: FaixaRow[] = ORDEM_FAIXAS.filter((f) => faixaMap.has(f)).map(
    (faixa) => ({ faixa, beneficiarios: faixaMap.get(faixa) ?? 0 }),
  )

  const topPrestadores = [...prestMap.values()]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10)
  const topUtilizadores = [...utilMap.values()]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10)
    .map((u) => {
      // O resumo salvo identifica o utilizador por pessoaId no formato
      // `carteirinha/dv`. A base de nomes é cruzada apenas pela carteirinha,
      // então removemos o dígito verificador antes do lookup.
      const ident = u.carteirinha ?? u.nome
      const carteirinha = ident.split('/')[0]
      return {
        ...u,
        carteirinha,
        nome: beneficiarioLabel(
          carteirinha,
          nomesPorCarteirinha.get(carteirinha) ?? null,
          benefDisplayMode,
        ),
      }
    })

  // Contagens auxiliares
  const clientesAtivos = new Set(
    atuais.map((i) => i.cliente_id).filter(Boolean),
  ).size
  const apolicesAtivas = new Set(
    atuais.map((i) => i.apolice_numero).filter(Boolean),
  ).size

  const ultima = [...atuais].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  )[0]

  // Fatura consolidada = soma das faturas das competências analisadas.
  let valorFatura: number | null = null
  for (const c of selecionadas) {
    const f = faturaMap.get(c)
    if (f !== undefined) valorFatura = (valorFatura ?? 0) + f
  }
  const sinistralidade =
    valorFatura && valorFatura > 0
      ? Number(((valorUtilizado / valorFatura) * 100).toFixed(1))
      : null

  return {
    competenciaAtual,
    competenciasLista,
    clientesAtivos,
    apolicesAtivas,
    beneficiarios,
    titulares,
    dependentes,
    valorUtilizado,
    valorFatura,
    sinistralidade,
    internacoes,
    saudeMental,
    totalEventos,
    historico,
    topPrestadores,
    topUtilizadores,
    categorias,
    faixaEtaria,
    ultimaImportacao: ultima
      ? { arquivo: ultima.arquivo_nome, enviadoEm: ultima.created_at }
      : null,
  }
}

// =====================================================================
// Dashboard BI: agregações por mês/apólice/subestipulante/plano a partir
// dos eventos de utilização detalhados (tabela eventos_utilizacao).
// =====================================================================

export type DashboardFiltros = {
  apolice?: string[] // números de apólice selecionados
  sub?: string[] // códigos de subestipulante selecionados
  plano?: string[] // planos selecionados
  mes?: string[] // competências YYYY-MM selecionadas
  de?: string // YYYY-MM-DD (período início, por data de atendimento)
  ate?: string // YYYY-MM-DD (período fim)
}

type EventoRow = {
  apolice_id: string | null
  subestipulante_id: string | null
  cod_usuario: string | null
  tipo_beneficiario: string | null
  idade: number | null
  plano: string | null
  prestador_nome: string | null
  prestador_cnpj: string | null
  categoria_atendimento: string | null
  servico_principal: string | null
  servico: string | null
  grupo_estatistico: string | null
  valor_pago: number | null
  data_atendimento: string | null
  internacao: boolean | null
  saude_mental: boolean | null
  competencia: string | null
}

type ResumoCompetenciaRow = {
  competencia: string
  vidasAtivas: number | null
  vidasUtil: number
  pctUtil: number | null
  eventos: number
  valor: number
  sinistralidade: number | null
  internacoes: number
  saudeMental: number
}

type SubResumoRow = {
  codigo: string
  razao: string
  vidasAtivas: number | null
  vidasUtil: number
  eventos: number
  valor: number
  custoVida: number
  pct: number
}

type FaixaRowFull = {
  faixa: string
  vidas: number
  valor: number
  pctVidas: number
  pctValor: number
}

type TipoUtilRow = {
  tipo: string
  eventos: number
  pctEventos: number
  valor: number
  pctValor: number
}

// Categoria/subcategoria identificada dinamicamente nos campos do TXT.
export type SubcategoriaRow = {
  nome: string
  valor: number
  pct: number // participação no valor total utilizado
  eventos: number
}
export type CategoriaDetalhadaRow = {
  nome: string
  valor: number
  pct: number // participação no valor total utilizado
  eventos: number
  subcategorias: SubcategoriaRow[]
}

export type DashboardData = {
  hasData: boolean
  competenciaAtual: string | null
  opcoes: {
    apolices: { numero: string; label: string }[]
    subestipulantes: { codigo: string; label: string }[]
    planos: string[]
    meses: string[]
  }
  kpis: {
    vidasAtivas: number | null
    vidasComUtilizacao: number
    titulares: number
    dependentes: number
    subestipulantes: number
    eventos: number
    valorUtilizado: number
    valorFatura: number | null // soma das faturas das competências do recorte
    sinistralidadeConsolidada: number | null // utilização ÷ fatura × 100
    internacoes: number
    saudeMental: number
  }
  // Nº de competências distintas no recorte atual (para distinguir total x média)
  competenciasNoRecorte: number
  // Indicadores da carteira (dependem do cadastro de vidas por competência)
  vidas: {
    totalApolice: number | null // total de vidas da apólice (cadastro)
    cadastrada: boolean // há cadastro de vidas para o recorte atual?
    taxaUtilizacao: number | null // vidas c/ utilização ÷ total da apólice
    custoMedioVida: number | null // utilização ÷ total de vidas da apólice
    custoMedioUsuario: number | null // utilização ÷ vidas c/ utilização
  }
  evolucaoSinistralidade: { mes: string; valor: number }[]
  sinistralidadeDisponivel: boolean
  utilizacaoMensal: { mes: string; utilizado: number; fatura: number }[]
  categorias: { nome: string; valor: number; pct: number }[]
  // Categorias gerenciais (classificarEvento) completas — todas as 13 categorias
  // do plano gerencial, ordenadas da maior para a menor participação.
  categoriasGerenciais: { nome: string; valor: number; pct: number; eventos: number }[]
  // Resumo específico de Saúde Mental (card do dashboard executivo).
  // Diferencia beneficiários monitorados, utilizações (frequência), custo,
  // participação no custo total e tendência de custo vs. competência anterior.
  saudeMentalResumo: {
    beneficiarios: number
    utilizacoes: number
    custo: number
    pctCusto: number
    tendenciaPct: number | null
  }
  // Categorias e subcategorias identificadas dinamicamente no arquivo (todas).
  categoriasDetalhadas: CategoriaDetalhadaRow[]
  resumoCompetencia: ResumoCompetenciaRow[]
  topUtilizadores: RankRow[]
  topPrestadores: RankRow[]
  subestipulanteResumo: SubResumoRow[]
  faixaEtaria: FaixaRowFull[]
  tipoUtilizacao: TipoUtilRow[]
  periodo: { inicio: string | null; fim: string | null }
}

function faixaDaIdade(idade: number | null): string {
  if (idade === null) return 'Não informado'
  if (idade <= 18) return '00 - 18 anos'
  if (idade <= 30) return '19 - 30 anos'
  if (idade <= 45) return '31 - 45 anos'
  if (idade <= 60) return '46 - 60 anos'
  return '60+ anos'
}

const ORDEM_FAIXAS_FULL = [
  '00 - 18 anos',
  '19 - 30 anos',
  '31 - 45 anos',
  '46 - 60 anos',
  '60+ anos',
  'Não informado',
]

const CORES_CATEGORIA = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--muted-foreground)',
]

// Competência de FATURAMENTO: derivada da data de pagamento (AAAA-MM).
// É a base usada por todo o dashboard (filtros, cards e sinistralidade), pois
// o consolidado de cada mês deve casar com a fatura paga naquela competência.
// A data de atendimento é apenas o mês em que o serviço foi prestado e fica
// como fallback quando não há data de pagamento na linha.
function mesDoEvento(e: EventoRow): string | null {
  if (e.competencia && /^\d{4}-\d{2}$/.test(e.competencia)) return e.competencia
  if (e.data_atendimento && /^\d{4}-\d{2}/.test(e.data_atendimento))
    return e.data_atendimento.slice(0, 7)
  return null
}

export async function getDashboardData(
  filtros: DashboardFiltros = {},
): Promise<DashboardData> {
  const supabase = await createClient()

  // Preferência global de exibição (Nome x Carteirinha) + base de nomes.
  const benefDisplayMode = await getBenefDisplay()
  const nomesPorCarteirinha = await fetchNomesPorCarteirinha(supabase)

  // Apólices, subestipulantes e faturas (vidas + valor por competência)
  const [{ data: apolicesData }, { data: subsData }, { data: faturasData }] =
    await Promise.all([
      supabase.from('apolices').select('id, numero, cliente, vidas'),
      supabase
        .from('subestipulantes')
        .select('id, apolice_id, codigo, razao_social, vidas'),
      supabase.from('faturas').select('competencia, valor, vidas_ativas'),
    ])

  // Mapas por competência: vidas cadastradas e valor de fatura
  const vidasPorComp = new Map<string, number>()
  const faturaPorComp = new Map<string, number>()
  for (const f of (faturasData ?? []) as {
    competencia: string | null
    valor: number | null
    vidas_ativas: number | null
  }[]) {
    if (!f.competencia) continue
    if (f.vidas_ativas !== null) {
      vidasPorComp.set(
        f.competencia,
        (vidasPorComp.get(f.competencia) ?? 0) + Number(f.vidas_ativas),
      )
    }
    if (f.valor !== null) {
      faturaPorComp.set(
        f.competencia,
        (faturaPorComp.get(f.competencia) ?? 0) + Number(f.valor),
      )
    }
  }

  const apolices = (apolicesData ?? []) as {
    id: string
    numero: string | null
    cliente: string | null
    vidas: number | null
  }[]
  const subs = (subsData ?? []) as {
    id: string
    apolice_id: string | null
    codigo: string
    razao_social: string | null
    vidas: number | null
  }[]

  const apoliceById = new Map(apolices.map((a) => [a.id, a]))
  const subById = new Map(subs.map((s) => [s.id, s]))

  // Busca todos os eventos confirmados (paginado para passar do limite de 1000)
  const PAGE = 1000
  let from = 0
  const eventos: EventoRow[] = []
  for (;;) {
    const { data, error } = await supabase
      .from('eventos_utilizacao')
      .select(
        'apolice_id, subestipulante_id, cod_usuario, tipo_beneficiario, idade, plano, prestador_nome, prestador_cnpj, categoria_atendimento, servico_principal, servico, grupo_estatistico, valor_pago, data_atendimento, internacao, saude_mental, competencia',
      )
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    eventos.push(...(data as EventoRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }

  if (eventos.length === 0) {
    return {
      hasData: false,
      competenciaAtual: null,
      opcoes: { apolices: [], subestipulantes: [], planos: [], meses: [] },
      kpis: {
        vidasAtivas: null,
        vidasComUtilizacao: 0,
        titulares: 0,
        dependentes: 0,
        subestipulantes: 0,
        eventos: 0,
        valorUtilizado: 0,
        valorFatura: null,
        sinistralidadeConsolidada: null,
        internacoes: 0,
        saudeMental: 0,
      },
      competenciasNoRecorte: 0,
      vidas: {
        totalApolice: null,
        cadastrada: false,
        taxaUtilizacao: null,
        custoMedioVida: null,
        custoMedioUsuario: null,
      },
      evolucaoSinistralidade: [],
      sinistralidadeDisponivel: false,
      utilizacaoMensal: [],
      categorias: [],
      categoriasGerenciais: [],
      saudeMentalResumo: {
        beneficiarios: 0,
        utilizacoes: 0,
        custo: 0,
        pctCusto: 0,
        tendenciaPct: null,
      },
      categoriasDetalhadas: [],
      resumoCompetencia: [],
      topUtilizadores: [],
      topPrestadores: [],
      subestipulanteResumo: [],
      faixaEtaria: [],
      tipoUtilizacao: [],
      periodo: { inicio: null, fim: null },
    }
  }

  // Opções de filtro a partir do universo completo
  const mesesSet = new Set<string>()
  const planosSet = new Set<string>()
  const apolicesNumSet = new Set<string>()
  const subsCodSet = new Set<string>()
  for (const e of eventos) {
    const m = mesDoEvento(e)
    if (m) mesesSet.add(m)
    if (e.plano) planosSet.add(e.plano)
    const ap = e.apolice_id ? apoliceById.get(e.apolice_id) : null
    if (ap?.numero) apolicesNumSet.add(ap.numero)
    const sub = e.subestipulante_id ? subById.get(e.subestipulante_id) : null
    if (sub?.codigo) subsCodSet.add(sub.codigo)
  }
  const mesesLista = [...mesesSet].sort()
  // Mostra a competência apenas quando há exatamente uma selecionada
  const competenciaAtual =
    filtros.mes && filtros.mes.length === 1 ? filtros.mes[0] : null

  // Aplica filtros (seleção individual ou múltipla por filtro)
  const filtrados = eventos.filter((e) => {
    if (filtros.apolice && filtros.apolice.length > 0) {
      const ap = e.apolice_id ? apoliceById.get(e.apolice_id) : null
      if (!ap?.numero || !filtros.apolice.includes(ap.numero)) return false
    }
    if (filtros.sub && filtros.sub.length > 0) {
      const sub = e.subestipulante_id ? subById.get(e.subestipulante_id) : null
      if (!sub?.codigo || !filtros.sub.includes(sub.codigo)) return false
    }
    if (filtros.plano && filtros.plano.length > 0) {
      if (!e.plano || !filtros.plano.includes(e.plano)) return false
    }
    if (filtros.mes && filtros.mes.length > 0) {
      const m = mesDoEvento(e)
      if (!m || !filtros.mes.includes(m)) return false
    }
    if (filtros.de && (!e.data_atendimento || e.data_atendimento < filtros.de))
      return false
    if (
      filtros.ate &&
      (!e.data_atendimento || e.data_atendimento > filtros.ate)
    )
      return false
    return true
  })

  // KPIs
  const pessoas = new Set<string>()
  const titularesSet = new Set<string>()
  const dependentesSet = new Set<string>()
  const subsAtivos = new Set<string>()
  let valorUtilizado = 0
  let internacoes = 0
  let saudeMental = 0
  let periodoInicio: string | null = null
  let periodoFim: string | null = null

  const prestMap = new Map<string, RankRow>()
  const utilMap = new Map<string, RankRow>()
  const catMap = new Map<string, { eventos: number; valor: number }>()
  // Categorias dinâmicas (campos reais do TXT) com subcategorias aninhadas.
  const catDetMap = new Map<
    string,
    {
      eventos: number
      valor: number
      subs: Map<string, { eventos: number; valor: number }>
    }
  >()
  const idadePorPessoa = new Map<string, number | null>()
  const tipoPorPessoa = new Map<string, boolean>() // true = titular

  // Estruturas por competência
  const compMap = new Map<
    string,
    {
      pessoas: Set<string>
      eventos: number
      valor: number
      internacoes: number
      saudeMental: number
      saudeMentalValor: number
    }
  >()
  // Agregados de Saúde Mental (categoria gerencial) para o card executivo.
  const smBenef = new Set<string>()
  let smUtilizacoes = 0
  let smCusto = 0
  // Estruturas por subestipulante
  const subAgg = new Map<
    string,
    { pessoas: Set<string>; eventos: number; valor: number }
  >()
  // Faixa etária: vidas por faixa e valor por faixa
  const faixaValor = new Map<string, number>()

  for (const e of filtrados) {
    const pid = e.cod_usuario || 'SEM_COD'
    pessoas.add(pid)
    const ehTitular = (e.tipo_beneficiario ?? '')
      .toUpperCase()
      .includes('TITULAR')
    if (ehTitular) titularesSet.add(pid)
    else dependentesSet.add(pid)
    if (!tipoPorPessoa.has(pid)) tipoPorPessoa.set(pid, ehTitular)
    if (!idadePorPessoa.has(pid)) idadePorPessoa.set(pid, e.idade)

    const valor = Number(e.valor_pago ?? 0)
    valorUtilizado += valor
    if (e.internacao) internacoes++
    if (e.saude_mental) saudeMental++

    if (e.data_atendimento) {
      if (!periodoInicio || e.data_atendimento < periodoInicio)
        periodoInicio = e.data_atendimento
      if (!periodoFim || e.data_atendimento > periodoFim)
        periodoFim = e.data_atendimento
    }

    const sub = e.subestipulante_id ? subById.get(e.subestipulante_id) : null
    if (sub?.codigo) subsAtivos.add(sub.codigo)

    // Prestador
    if (e.prestador_nome) {
      const k = e.prestador_cnpj || e.prestador_nome
      const cur = prestMap.get(k) ?? { nome: e.prestador_nome, eventos: 0, valor: 0 }
      cur.eventos++
      cur.valor += valor
      prestMap.set(k, cur)
    }

    // Utilizador
    const tipo = ehTitular ? 'Titular' : 'Dependente'
    const detalhe = [tipo, e.idade ? `${e.idade}a` : '']
      .filter(Boolean)
      .join(' · ')
    const u = utilMap.get(pid) ?? {
      nome: pid,
      carteirinha: pid,
      detalhe,
      eventos: 0,
      valor: 0,
    }
    u.eventos++
    u.valor += valor
    utilMap.set(pid, u)

    // Categoria gerencial (alinhada à guia Utilização)
    const cat = classificarEvento({
      servicoPrincipal: e.servico_principal,
      servico: e.servico,
      grupoEstatistico: e.grupo_estatistico,
      categoriaAtendimento: e.categoria_atendimento,
      internacao: e.internacao,
      saudeMental: e.saude_mental,
    })
    const c = catMap.get(cat) ?? { eventos: 0, valor: 0 }
    c.eventos++
    c.valor += valor
    catMap.set(cat, c)

    // Agregados de Saúde Mental (categoria gerencial), alinhados à Utilização.
    if (cat === 'Saúde Mental') {
      smBenef.add(pid)
      smUtilizacoes++
      smCusto += valor
    }

    // Categoria/subcategoria dinâmica (rótulos reais do arquivo, sem "Outros")
    const catDinNome = categoriaDinamica({
      servicoPrincipal: e.servico_principal,
      servico: e.servico,
      categoriaAtendimento: e.categoria_atendimento,
    })
    const subDinNome = subcategoriaDinamica({
      servicoPrincipal: e.servico_principal,
      servico: e.servico,
      categoriaAtendimento: e.categoria_atendimento,
    })
    const cd =
      catDetMap.get(catDinNome) ??
      { eventos: 0, valor: 0, subs: new Map<string, { eventos: number; valor: number }>() }
    cd.eventos++
    cd.valor += valor
    const sd = cd.subs.get(subDinNome) ?? { eventos: 0, valor: 0 }
    sd.eventos++
    sd.valor += valor
    cd.subs.set(subDinNome, sd)
    catDetMap.set(catDinNome, cd)

    // Por competência
    const mes = mesDoEvento(e)
    if (mes) {
      const cm =
        compMap.get(mes) ??
        {
          pessoas: new Set<string>(),
          eventos: 0,
          valor: 0,
          internacoes: 0,
          saudeMental: 0,
          saudeMentalValor: 0,
        }
      cm.pessoas.add(pid)
      cm.eventos++
      cm.valor += valor
      if (e.internacao) cm.internacoes++
      if (e.saude_mental) cm.saudeMental++
      if (cat === 'Saúde Mental') cm.saudeMentalValor += valor
      compMap.set(mes, cm)
    }

    // Por subestipulante
    if (sub?.codigo) {
      const sa =
        subAgg.get(sub.codigo) ??
        { pessoas: new Set<string>(), eventos: 0, valor: 0 }
      sa.pessoas.add(pid)
      sa.eventos++
      sa.valor += valor
      subAgg.set(sub.codigo, sa)
    }
  }

  // Faixa etária: valor por faixa (somando eventos por pessoa)
  for (const e of filtrados) {
    const pid = e.cod_usuario || 'SEM_COD'
    const faixa = faixaDaIdade(idadePorPessoa.get(pid) ?? e.idade)
    faixaValor.set(faixa, (faixaValor.get(faixa) ?? 0) + Number(e.valor_pago ?? 0))
  }
  const faixaVidas = new Map<string, number>()
  for (const [pid, idade] of idadePorPessoa) {
    void pid
    const faixa = faixaDaIdade(idade)
    faixaVidas.set(faixa, (faixaVidas.get(faixa) ?? 0) + 1)
  }
  const totalVidasFaixa = [...faixaVidas.values()].reduce((a, b) => a + b, 0)
  const faixaEtaria: FaixaRowFull[] = ORDEM_FAIXAS_FULL.filter((f) =>
    faixaVidas.has(f),
  ).map((faixa) => ({
    faixa,
    vidas: faixaVidas.get(faixa) ?? 0,
    valor: faixaValor.get(faixa) ?? 0,
    pctVidas: totalVidasFaixa
      ? ((faixaVidas.get(faixa) ?? 0) / totalVidasFaixa) * 100
      : 0,
    pctValor: valorUtilizado
      ? ((faixaValor.get(faixa) ?? 0) / valorUtilizado) * 100
      : 0,
  }))

  // Categorias (donut + tabela tipo de utilização)
  const totalEventos = filtrados.length
  const catArr = [...catMap.entries()]
    .map(([nome, v]) => ({ nome, eventos: v.eventos, valor: v.valor }))
    .sort((a, b) => b.valor - a.valor)
  const principais = catArr.slice(0, 5)
  const resto = catArr.slice(5)
  const restoValor = resto.reduce((a, c) => a + c.valor, 0)
  const restoEventos = resto.reduce((a, c) => a + c.eventos, 0)
  const categorias = principais.map((c) => ({
    nome: c.nome,
    valor: c.valor,
    pct: valorUtilizado ? (c.valor / valorUtilizado) * 100 : 0,
  }))
  if (restoValor > 0) {
    categorias.push({
      nome: 'Demais',
      valor: restoValor,
      pct: valorUtilizado ? (restoValor / valorUtilizado) * 100 : 0,
    })
  }

  // Categorias gerenciais COMPLETAS (todas as categorias de classificarEvento,
  // sem colapsar em "Demais"), ordenadas da maior para a menor participação.
  const categoriasGerenciais = catArr.map((c) => ({
    nome: c.nome,
    valor: c.valor,
    eventos: c.eventos,
    pct: valorUtilizado ? (c.valor / valorUtilizado) * 100 : 0,
  }))

  // Categorias dinâmicas completas (todas, com subcategorias). Sem "Outros".
  const categoriasDetalhadas: CategoriaDetalhadaRow[] = [...catDetMap.entries()]
    .map(([nome, v]) => ({
      nome,
      valor: v.valor,
      eventos: v.eventos,
      pct: valorUtilizado ? (v.valor / valorUtilizado) * 100 : 0,
      subcategorias: [...v.subs.entries()]
        .map(([sn, sv]) => ({
          nome: sn,
          valor: sv.valor,
          eventos: sv.eventos,
          pct: valorUtilizado ? (sv.valor / valorUtilizado) * 100 : 0,
        }))
        .sort((a, b) => b.valor - a.valor),
    }))
    .sort((a, b) => b.valor - a.valor)
  const tipoUtilizacao: TipoUtilRow[] = principais.map((c) => ({
    tipo: c.nome,
    eventos: c.eventos,
    pctEventos: totalEventos ? (c.eventos / totalEventos) * 100 : 0,
    valor: c.valor,
    pctValor: valorUtilizado ? (c.valor / valorUtilizado) * 100 : 0,
  }))
  if (restoValor > 0) {
    tipoUtilizacao.push({
      tipo: 'Demais',
      eventos: restoEventos,
      pctEventos: totalEventos ? (restoEventos / totalEventos) * 100 : 0,
      valor: restoValor,
      pctValor: valorUtilizado ? (restoValor / valorUtilizado) * 100 : 0,
    })
  }

  // Resumo por competência (ordenado)
  const resumoCompetencia: ResumoCompetenciaRow[] = [...compMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([mes, v]) => {
      const vidasComp = vidasPorComp.get(mes) ?? null
      const faturaComp = faturaPorComp.get(mes) ?? null
      return {
        competencia: mes,
        vidasAtivas: vidasComp,
        vidasUtil: v.pessoas.size,
        pctUtil:
          vidasComp && vidasComp > 0
            ? Number(((v.pessoas.size / vidasComp) * 100).toFixed(1))
            : null,
        eventos: v.eventos,
        valor: v.valor,
        sinistralidade:
          faturaComp && faturaComp > 0
            ? Number(((v.valor / faturaComp) * 100).toFixed(1))
            : null,
        internacoes: v.internacoes,
        saudeMental: v.saudeMental,
      }
    })

  // Tendência de custo de Saúde Mental: última competência vs. anterior.
  const compsOrdenadas = [...compMap.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  )
  const smUlt = compsOrdenadas.at(-1)?.[1].saudeMentalValor
  const smPen = compsOrdenadas.at(-2)?.[1].saudeMentalValor
  const smTendenciaPct =
    smUlt !== undefined && smPen !== undefined && smPen > 0
      ? Number((((smUlt - smPen) / smPen) * 100).toFixed(1))
      : null
  const saudeMentalResumo = {
    beneficiarios: smBenef.size,
    utilizacoes: smUtilizacoes,
    custo: smCusto,
    pctCusto: valorUtilizado
      ? Number(((smCusto / valorUtilizado) * 100).toFixed(1))
      : 0,
    tendenciaPct: smTendenciaPct,
  }

  // Subestipulante resumo
  const subestipulanteResumo: SubResumoRow[] = [...subAgg.entries()]
    .map(([codigo, v]) => {
      const meta = subs.find((s) => s.codigo === codigo)
      return {
        codigo,
        razao: meta?.razao_social ?? codigo,
        vidasAtivas: null,
        vidasUtil: v.pessoas.size,
        eventos: v.eventos,
        valor: v.valor,
        custoVida: v.pessoas.size ? v.valor / v.pessoas.size : 0,
        pct: valorUtilizado ? (v.valor / valorUtilizado) * 100 : 0,
      }
    })
    .sort((a, b) => b.valor - a.valor)

  // Evolução (utilização x fatura mensal) — base para gráficos
  const utilizacaoMensal = resumoCompetencia.map((r) => ({
    mes: competenciaCurta(r.competencia),
    utilizado: r.valor,
    fatura: faturaPorComp.get(r.competencia) ?? 0,
  }))
  // Sinistralidade disponível quando há fatura cadastrada no recorte
  const sinistralidadeDisponivel = resumoCompetencia.some(
    (r) => r.sinistralidade !== null,
  )
  const evolucaoSinistralidade = resumoCompetencia.map((r) => ({
    mes: competenciaCurta(r.competencia),
    valor: r.sinistralidade ?? 0,
  }))

  // Indicadores da carteira: total de vidas vem do cadastro por competência.
  // Para que numerador e denominador sejam coerentes, as taxas/custos por vida
  // usam SOMENTE as competências do recorte que possuem cadastro de vidas —
  // a média de vidas como denominador e a utilização/usuários dessas mesmas
  // competências como numerador.
  const compsComCadastro = resumoCompetencia
    .map((r) => r.competencia)
    .filter((c) => typeof vidasPorComp.get(c) === 'number')

  const vidasCadastradas = compsComCadastro.map((c) => vidasPorComp.get(c)!)
  const vidasAtivas =
    vidasCadastradas.length > 0
      ? Math.round(
          vidasCadastradas.reduce((a, b) => a + b, 0) /
            vidasCadastradas.length,
        )
      : null

  // Utilização e vidas com uso restritas às competências com cadastro
  const pessoasComCadastro = new Set<string>()
  let valorComCadastro = 0
  for (const c of compsComCadastro) {
    const bucket = compMap.get(c)
    if (!bucket) continue
    valorComCadastro += bucket.valor
    for (const p of bucket.pessoas) pessoasComCadastro.add(p)
  }

  // Custo médio por usuário usa todo o recorte (não depende do cadastro)
  const vidas = {
    totalApolice: vidasAtivas,
    cadastrada: vidasCadastradas.length > 0,
    taxaUtilizacao:
      vidasAtivas && vidasAtivas > 0
        ? Number(((pessoasComCadastro.size / vidasAtivas) * 100).toFixed(1))
        : null,
    custoMedioVida:
      vidasAtivas && vidasAtivas > 0
        ? Number((valorComCadastro / vidasAtivas).toFixed(2))
        : null,
    custoMedioUsuario:
      pessoas.size > 0
        ? Number((valorUtilizado / pessoas.size).toFixed(2))
        : null,
  }

  // Fatura consolidada = soma das faturas das competências do recorte atual.
  // Sinistralidade consolidada = utilização total ÷ fatura total × 100.
  let valorFatura: number | null = null
  for (const r of resumoCompetencia) {
    const f = faturaPorComp.get(r.competencia)
    if (f !== undefined) valorFatura = (valorFatura ?? 0) + f
  }
  const sinistralidadeConsolidada =
    valorFatura && valorFatura > 0
      ? Number(((valorUtilizado / valorFatura) * 100).toFixed(1))
      : null

  return {
    hasData: true,
    competenciaAtual,
    competenciasNoRecorte: resumoCompetencia.length,
    opcoes: {
      apolices: [...apolicesNumSet].sort().map((numero) => {
        const a = apolices.find((x) => x.numero === numero)
        return { numero, label: a?.cliente ? `${numero} - ${a.cliente}` : numero }
      }),
      subestipulantes: [...subsCodSet].sort().map((codigo) => {
        const s = subs.find((x) => x.codigo === codigo)
        return {
          codigo,
          label: s?.razao_social ? `${codigo} - ${s.razao_social}` : codigo,
        }
      }),
      planos: [...planosSet].sort(),
      meses: mesesLista,
    },
    kpis: {
      vidasAtivas,
      vidasComUtilizacao: pessoas.size,
      titulares: titularesSet.size,
      dependentes: dependentesSet.size,
      subestipulantes: subsAtivos.size,
      eventos: filtrados.length,
      valorUtilizado,
      valorFatura,
      sinistralidadeConsolidada,
      internacoes,
      saudeMental,
    },
    vidas,
    evolucaoSinistralidade,
    sinistralidadeDisponivel,
    utilizacaoMensal,
    categorias,
    categoriasGerenciais,
    saudeMentalResumo,
    categoriasDetalhadas,
    resumoCompetencia,
    topUtilizadores: [...utilMap.values()]
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10)
      .map((u) => ({
        ...u,
        nome: beneficiarioLabel(
          u.carteirinha ?? u.nome,
          nomesPorCarteirinha.get(u.carteirinha ?? u.nome) ?? null,
          benefDisplayMode,
        ),
      })),
    topPrestadores: [...prestMap.values()]
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10),
    subestipulanteResumo,
    faixaEtaria,
    tipoUtilizacao,
    periodo: { inicio: periodoInicio, fim: periodoFim },
  }
}

export const CORES_DONUT = CORES_CATEGORIA

// =====================================================================
// Subestipulantes por apólice (para a tela de Apólices expansível).
// =====================================================================

export type SubestipulanteDetalhe = {
  codigo: string
  razao: string
  vidasUtil: number
  eventos: number
  valor: number
}

export async function getSubestipulantesPorApolice(): Promise<
  Record<string, SubestipulanteDetalhe[]>
> {
  const supabase = await createClient()

  const { data: subsData } = await supabase
    .from('subestipulantes')
    .select('id, apolice_id, codigo, razao_social, vidas')

  const subs = (subsData ?? []) as {
    id: string
    apolice_id: string | null
    codigo: string
    razao_social: string | null
    vidas: number | null
  }[]
  if (subs.length === 0) return {}

  const subById = new Map(subs.map((s) => [s.id, s]))

  // Agrega eventos por subestipulante (paginado)
  const PAGE = 1000
  let from = 0
  const agg = new Map<
    string,
    { pessoas: Set<string>; eventos: number; valor: number }
  >()
  for (;;) {
    const { data, error } = await supabase
      .from('eventos_utilizacao')
      .select('subestipulante_id, cod_usuario, valor_pago')
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    for (const e of data as {
      subestipulante_id: string | null
      cod_usuario: string | null
      valor_pago: number | null
    }[]) {
      if (!e.subestipulante_id) continue
      const cur =
        agg.get(e.subestipulante_id) ??
        { pessoas: new Set<string>(), eventos: 0, valor: 0 }
      cur.pessoas.add(e.cod_usuario || 'SEM_COD')
      cur.eventos++
      cur.valor += Number(e.valor_pago ?? 0)
      agg.set(e.subestipulante_id, cur)
    }
    if (data.length < PAGE) break
    from += PAGE
  }

  const result: Record<string, SubestipulanteDetalhe[]> = {}
  for (const s of subs) {
    if (!s.apolice_id) continue
    const a = agg.get(s.id)
    const det: SubestipulanteDetalhe = {
      codigo: s.codigo,
      razao: s.razao_social ?? s.codigo,
      vidasUtil: a?.pessoas.size ?? 0,
      eventos: a?.eventos ?? 0,
      valor: a?.valor ?? 0,
    }
    ;(result[s.apolice_id] ??= []).push(det)
  }
  for (const k of Object.keys(result)) {
    result[k].sort((a, b) => b.valor - a.valor)
  }
  return result
}

// =====================================================================
// Eventos detalhados (guia UTILIZAÇÃO) — uma linha por evento do TXT, com
// dados da apólice/subestipulante resolvidos para auditoria completa.
// =====================================================================

export type EventoDetalhado = {
  id: string
  apoliceNumero: string | null
  apoliceCliente: string | null
  subCodigo: string | null
  subRazao: string | null
  // Carteirinha (cod_usuario) — identificador estável usado em filtros/cálculos.
  beneficiario: string
  // Nome cadastrado na base auxiliar (null se não houver).
  nome: string | null
  // Rótulo já resolvido conforme a preferência global (Nome x Carteirinha).
  displayBeneficiario: string
  tipoBeneficiario: string
  titular: boolean
  sexo: string | null
  idade: number | null
  plano: string | null
  prestadorNome: string | null
  prestadorCnpj: string | null
  servicoPrincipal: string | null
  servico: string | null
  grupoEstatistico: string | null
  categoriaAtendimento: string | null
  internacao: boolean
  saudeMental: boolean
  valorApresentado: number
  valorPago: number
  valorCopart: number
  valorEmpresa: number
  dataAtendimento: string | null
  dataPagamento: string | null
  competencia: string | null
}

export async function getEventosDetalhados(): Promise<EventoDetalhado[]> {
  const supabase = await createClient()

  // Preferência global de exibição (Nome x Carteirinha) + base de nomes.
  const benefDisplayMode = await getBenefDisplay()
  const nomesPorCarteirinha = await fetchNomesPorCarteirinha(supabase)

  const [{ data: apolicesData }, { data: subsData }] = await Promise.all([
    supabase.from('apolices').select('id, numero, cliente'),
    supabase.from('subestipulantes').select('id, codigo, razao_social'),
  ])
  const apoliceById = new Map(
    ((apolicesData ?? []) as {
      id: string
      numero: string | null
      cliente: string | null
    }[]).map((a) => [a.id, a]),
  )
  const subById = new Map(
    ((subsData ?? []) as {
      id: string
      codigo: string
      razao_social: string | null
    }[]).map((s) => [s.id, s]),
  )

  const PAGE = 1000
  let from = 0
  const out: EventoDetalhado[] = []
  for (;;) {
    const { data, error } = await supabase
      .from('eventos_utilizacao')
      .select(
        'id, apolice_id, subestipulante_id, cod_usuario, tipo_beneficiario, sexo, idade, plano, prestador_nome, prestador_cnpj, servico_principal, servico, grupo_estatistico, categoria_atendimento, internacao, saude_mental, valor_apresentado, valor_pago, valor_copart, valor_empresa, data_atendimento, data_pagamento, competencia',
      )
      .order('data_atendimento', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    for (const e of data as Record<string, unknown>[]) {
      const ap = e.apolice_id ? apoliceById.get(e.apolice_id as string) : null
      const sub = e.subestipulante_id
        ? subById.get(e.subestipulante_id as string)
        : null
      const tipo = String(e.tipo_beneficiario ?? '')
      const carteirinha = String(e.cod_usuario ?? '—')
      const nome = nomesPorCarteirinha.get(carteirinha) ?? null
      out.push({
        id: String(e.id),
        apoliceNumero: ap?.numero ?? null,
        apoliceCliente: ap?.cliente ?? null,
        subCodigo: sub?.codigo ?? null,
        subRazao: sub?.razao_social ?? null,
        beneficiario: carteirinha,
        nome,
        displayBeneficiario: beneficiarioLabel(carteirinha, nome, benefDisplayMode),
        tipoBeneficiario: tipo,
        titular: tipo.toUpperCase().includes('TITULAR'),
        sexo: (e.sexo as string) ?? null,
        idade: e.idade === null ? null : Number(e.idade),
        plano: (e.plano as string) ?? null,
        prestadorNome: (e.prestador_nome as string) ?? null,
        prestadorCnpj: (e.prestador_cnpj as string) ?? null,
        servicoPrincipal: (e.servico_principal as string) ?? null,
        servico: (e.servico as string) ?? null,
        grupoEstatistico: (e.grupo_estatistico as string) ?? null,
        categoriaAtendimento: (e.categoria_atendimento as string) ?? null,
        internacao: Boolean(e.internacao),
        saudeMental: Boolean(e.saude_mental),
        valorApresentado: Number(e.valor_apresentado ?? 0),
        valorPago: Number(e.valor_pago ?? 0),
        valorCopart: Number(e.valor_copart ?? 0),
        valorEmpresa: Number(e.valor_empresa ?? 0),
        dataAtendimento: (e.data_atendimento as string) ?? null,
        dataPagamento: (e.data_pagamento as string) ?? null,
        competencia: (e.competencia as string) ?? null,
      })
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

// =====================================================================
// Colaboradores: agrega a utilização por carteirinha (cod_usuario) no
// período selecionado e cruza com a tabela auxiliar de nomes.
// =====================================================================

export type ColaboradorFiltros = {
  // Modo de período (todos consideram a data de pagamento/competência)
  mes?: string // YYYY-MM
  ano?: string // YYYY
  de?: string // YYYY-MM-DD (período personalizado)
  ate?: string // YYYY-MM-DD
  // sem nada => acumulado (tudo)
}

export type VinculoNorm = 'TITULAR' | 'DEPENDENTE' | null

export type ColaboradorRow = {
  carteirinha: string
  nome: string | null
  cpf: string | null
  plano: string | null
  empresa: string | null // subestipulante (razão social) ou cliente da apólice
  subCodigo: string | null
  tipoBeneficiario: string | null
  titular: boolean
  vinculo: VinculoNorm
  sexo: string | null // M | F | null
  dataNascimento: string | null // YYYY-MM-DD (fonte: master -> vidas)
  idade: number | null
  status: string | null // ATIVO | INATIVO | null
  cadastrado: boolean // existe na base de vidas elegíveis
  utilizou: boolean // teve eventos no período
  valorUtilizado: number
  eventos: number
}

export type DistribItem = {
  chave: string
  vidas: number
  valor: number
  eventos: number
}

export type ColaboradoresResult = {
  colaboradores: ColaboradorRow[]
  // Universo populacional
  totalVidas: number
  totalTitulares: number
  totalDependentes: number
  totalSemClassificacao: number
  vidasComUtilizacao: number
  vidasSemUtilizacao: number
  vidasCadastradas: number // presentes na base de vidas elegíveis
  utilizadoresForaDaBase: number // tiveram eventos mas não estão no cadastro
  temBaseVidas: boolean
  // Competência (YYYY-MM) da base de vidas oficial ativa (a mais recente)
  competenciaAtiva: string | null
  // Competências disponíveis (histórico), da mais recente para a mais antiga
  competenciasDisponiveis: string[]
  // Financeiro / utilização
  valorTotal: number
  eventosTotal: number
  pctUtilizacao: number // vidasComUtilizacao / totalVidas * 100
  custoMedioVidaElegivel: number // valorTotal / totalVidas
  custoMedioVidaUtilizada: number // valorTotal / vidasComUtilizacao
  custoMedioEvento: number // valorTotal / eventosTotal
  // Distribuições estratégicas
  porFaixaEtaria: DistribItem[]
  porSexo: DistribItem[]
  porPlano: DistribItem[]
  porVinculo: DistribItem[]
  // compat
  totalCarteirinhas: number
  totalComNome: number
  totalSemNome: number
  // opções de filtro
  mesesDisponiveis: string[] // YYYY-MM
  anosDisponiveis: string[] // YYYY
}

type VidaCadastro = {
  carteirinha: string
  nome: string | null
  cpf: string | null
  tipo: string | null
  sexo: string | null
  data_nascimento: string | null
  plano: string | null
  empresa: string | null
  data_adesao: string | null
  status: string | null
}

// Retorna o primeiro valor "de verdade" (ignora null, undefined e strings
// vazias/espaços). A base cadastral costuma gravar campos ausentes como ''
// e o operador ?? não trata '' como ausente — daí a necessidade deste helper.
function coalesceStr(
  ...valores: (string | null | undefined)[]
): string | null {
  for (const v of valores) {
    if (v != null && v.toString().trim() !== '') return v.toString().trim()
  }
  return null
}

// Normaliza o vínculo (titular x dependente) a partir de um rótulo livre.
function normalizarVinculo(tipo: string | null | undefined): VinculoNorm {
  if (!tipo) return null
  const t = tipo.toString().toUpperCase()
  if (t.includes('TITULAR') || t.trim() === 'T') return 'TITULAR'
  if (
    t.includes('DEPEND') ||
    t.includes('CONJUGE') ||
    t.includes('CÔNJUGE') ||
    t.includes('FILH') ||
    t.includes('AGREGAD') ||
    t.trim() === 'D'
  ) {
    return 'DEPENDENTE'
  }
  return null
}

// Calcula idade (anos completos) a partir de uma data ISO de nascimento.
function calcularIdade(nascimento: string | null): number | null {
  if (!nascimento) return null
  const d = new Date(nascimento)
  if (Number.isNaN(d.getTime())) return null
  const hoje = new Date()
  let idade = hoje.getFullYear() - d.getFullYear()
  const m = hoje.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) idade--
  if (idade < 0 || idade > 120) return null
  return idade
}

// Lista as competências (YYYY-MM) presentes na base de vidas, da mais recente
// para a mais antiga. A primeira é a base oficial ativa.
async function listarCompetenciasVidas(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string[]> {
  const { data } = await supabase
    .from('beneficiario_vidas')
    .select('competencia')
    .order('competencia', { ascending: false })
  const set = new Set<string>()
  for (const r of (data ?? []) as { competencia: string | null }[]) {
    if (r.competencia) set.add(r.competencia)
  }
  return [...set]
}

export async function getColaboradores(
  filtros: ColaboradorFiltros = {},
): Promise<ColaboradoresResult> {
  const supabase = await createClient()

  // Competências disponíveis e a competência oficial ativa (a mais recente).
  const competenciasDisponiveis = await listarCompetenciasVidas(supabase)
  const competenciaAtiva = competenciasDisponiveis[0] ?? null

  const vidasQuery = supabase
    .from('beneficiario_vidas')
    .select(
      'carteirinha, nome, cpf, tipo, sexo, data_nascimento, plano, empresa, data_adesao, status',
    )
  if (competenciaAtiva) vidasQuery.eq('competencia', competenciaAtiva)

  const [
    { data: apolicesData },
    { data: subsData },
    { data: nomesData },
    { data: vidasData },
    masterIndex,
  ] = await Promise.all([
    supabase.from('apolices').select('id, numero, cliente'),
    supabase.from('subestipulantes').select('id, codigo, razao_social'),
    supabase.from('beneficiario_nomes').select('carteirinha, nome'),
    vidasQuery,
    loadMasterIndex(supabase),
  ])

  const apoliceById = new Map(
    ((apolicesData ?? []) as { id: string; cliente: string | null }[]).map(
      (a) => [a.id, a],
    ),
  )
  const subById = new Map(
    ((subsData ?? []) as {
      id: string
      codigo: string
      razao_social: string | null
    }[]).map((s) => [s.id, s]),
  )
  const nomePorCarteirinha = new Map(
    ((nomesData ?? []) as { carteirinha: string; nome: string }[]).map((n) => [
      n.carteirinha.trim(),
      n.nome,
    ]),
  )
  const vidaPorCarteirinha = new Map<string, VidaCadastro>(
    ((vidasData ?? []) as VidaCadastro[]).map((v) => [
      v.carteirinha.trim(),
      v,
    ]),
  )
  const temBaseVidas = vidaPorCarteirinha.size > 0

  type Acc = {
    carteirinha: string
    plano: string | null
    empresa: string | null
    subCodigo: string | null
    tipoBeneficiario: string | null
    valor: number
    eventos: number
  }
  const mapa = new Map<string, Acc>()
  const mesesSet = new Set<string>()
  const anosSet = new Set<string>()

  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('eventos_utilizacao')
      .select(
        'apolice_id, subestipulante_id, cod_usuario, tipo_beneficiario, plano, valor_pago, data_pagamento, competencia',
      )
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    for (const e of data as Record<string, unknown>[]) {
      const comp =
        (e.competencia as string) ||
        ((e.data_pagamento as string) ?? '').slice(0, 7)
      const dataRef = (e.data_pagamento as string) ?? null

      // Opções de filtro (sempre com base no universo completo)
      if (comp && /^\d{4}-\d{2}$/.test(comp)) {
        mesesSet.add(comp)
        anosSet.add(comp.slice(0, 4))
      }

      // Aplica filtros de período
      if (filtros.mes && comp !== filtros.mes) continue
      if (filtros.ano && comp.slice(0, 4) !== filtros.ano) continue
      if (filtros.de && (!dataRef || dataRef < filtros.de)) continue
      if (filtros.ate && (!dataRef || dataRef > filtros.ate)) continue

      const cart = String(e.cod_usuario ?? '').trim()
      if (!cart) continue

      const ap = e.apolice_id ? apoliceById.get(e.apolice_id as string) : null
      const sub = e.subestipulante_id
        ? subById.get(e.subestipulante_id as string)
        : null
      const empresa = sub?.razao_social ?? ap?.cliente ?? null
      const tipo = (e.tipo_beneficiario as string) ?? null

      const cur = mapa.get(cart)
      if (cur) {
        cur.valor += Number(e.valor_pago ?? 0)
        cur.eventos += 1
        if (!cur.plano && e.plano) cur.plano = e.plano as string
        if (!cur.empresa && empresa) cur.empresa = empresa
        if (!cur.subCodigo && sub?.codigo) cur.subCodigo = sub.codigo
        if (!cur.tipoBeneficiario && tipo) cur.tipoBeneficiario = tipo
      } else {
        mapa.set(cart, {
          carteirinha: cart,
          plano: (e.plano as string) ?? null,
          empresa,
          subCodigo: sub?.codigo ?? null,
          tipoBeneficiario: tipo,
          valor: Number(e.valor_pago ?? 0),
          eventos: 1,
        })
      }
    }
    if (data.length < PAGE) break
    from += PAGE
  }

  // Universo = base de vidas elegíveis ∪ carteirinhas que utilizaram ∪ pessoas
  // que existem SÓ no Cadastro Mestre. IMPORTANTE: a carteirinha do master pode
  // diferir da usada em vidas/eventos, mas casar por CPF/nome. Por isso NÃO
  // adicionamos as carteirinhas do master ao universo — apenas os registros que
  // não estão representados na população real viram linhas novas (via chave
  // sintética). Os demais só enriquecem a linha existente (resolve por CPF/nome).
  const cartConhecidas = new Set<string>([
    ...vidaPorCarteirinha.keys(),
    ...mapa.keys(),
  ])
  const cpfConhecidos = new Set<string>()
  const nomesConhecidos = new Set<string>()
  for (const v of vidaPorCarteirinha.values()) {
    const c = (v.cpf ?? '').replace(/\D/g, '')
    if (c) cpfConhecidos.add(c)
    if (v.nome) nomesConhecidos.add(normalizarNome(v.nome))
  }
  for (const nome of nomePorCarteirinha.values()) {
    if (nome) nomesConhecidos.add(normalizarNome(nome))
  }

  const sinteticoPorChave = new Map<string, MasterCadastro>()
  for (const m of masterNaoRepresentados(masterIndex, {
    carteirinhas: cartConhecidas,
    cpfs: cpfConhecidos,
    nomesNorm: nomesConhecidos,
  })) {
    sinteticoPorChave.set(`master:${m.id}`, m)
  }

  const universo = new Set<string>([
    ...vidaPorCarteirinha.keys(),
    ...mapa.keys(),
    ...sinteticoPorChave.keys(),
  ])

  const colaboradores: ColaboradorRow[] = [...universo].map((cart) => {
    const sintetico = sinteticoPorChave.get(cart)
    const util = sintetico ? undefined : mapa.get(cart)
    const vida = sintetico ? undefined : vidaPorCarteirinha.get(cart)
    // Precedência cadastral: master -> vidas -> eventos.
    const master =
      sintetico ??
      masterIndex.resolve({
        carteirinha: cart,
        cpf: vida?.cpf ?? null,
        nomeNorm: vida?.nome ? normalizarNome(vida.nome) : null,
      })
    const dataNascimento = coalesceStr(
      master?.dataNascimento,
      vida?.data_nascimento,
    )
    const idade = calcularIdade(dataNascimento)
    const tipoFinal = coalesceStr(
      master?.tipo,
      vida?.tipo,
      util?.tipoBeneficiario,
    )
    const vinculo = normalizarVinculo(tipoFinal)
    return {
      carteirinha: cart,
      nome: coalesceStr(master?.nome, vida?.nome, nomePorCarteirinha.get(cart)),
      cpf: coalesceStr(master?.cpf, vida?.cpf),
      // Plano/empresa: o master costuma trazer apenas CÓDIGOS numéricos; a
      // utilização e a base de vidas trazem nomes legíveis. Preferimos o valor
      // legível e só caímos no master quando não há outra fonte.
      plano: coalesceStr(util?.plano, vida?.plano, master?.plano),
      empresa: coalesceStr(util?.empresa, vida?.empresa, master?.empresa),
      subCodigo: util?.subCodigo ?? null,
      tipoBeneficiario: tipoFinal,
      titular: vinculo === 'TITULAR',
      vinculo,
      sexo: coalesceStr(master?.sexo, vida?.sexo),
      dataNascimento,
      idade,
      status:
        coalesceStr(master?.status, vida?.status) ?? (util ? 'ATIVO' : null),
      cadastrado: !!master || !!vida,
      utilizou: !!util,
      valorUtilizado: util?.valor ?? 0,
      eventos: util?.eventos ?? 0,
    }
  })

  colaboradores.sort((x, y) => y.valorUtilizado - x.valorUtilizado)

  // ---- População de referência ----
  // Quando há Base de Vidas Elegíveis importada, o total populacional é a
  // própria base (independe de utilização). Sem base, usamos as carteirinhas
  // observadas na utilização como aproximação da população.
  // Há base de referência quando existe Cadastro Mestre OU Base de Vidas.
  const temBase = temBaseVidas || masterIndex.temMaster
  // Total de Vidas considera SOMENTE a Base de Vidas Elegíveis (competência
  // ativa). O Cadastro Mestre e a utilização apenas COMPLEMENTAM dados — não
  // aumentam a população. Sem base de vidas, cai para o cadastro (master) e,
  // por fim, para todo o recorte observado na utilização.
  const vidasCadastradas = colaboradores.filter((c) =>
    vidaPorCarteirinha.has(c.carteirinha),
  ).length
  const populacao = temBaseVidas
    ? colaboradores.filter((c) => vidaPorCarteirinha.has(c.carteirinha))
    : temBase
      ? colaboradores.filter((c) => c.cadastrado)
      : colaboradores

  // ---- KPIs populacionais ----
  const totalVidas = populacao.length
  const totalTitulares = populacao.filter(
    (c) => c.vinculo === 'TITULAR',
  ).length
  const totalDependentes = populacao.filter(
    (c) => c.vinculo === 'DEPENDENTE',
  ).length
  // Vidas na base ativa sem tipo Titular/Dependente identificável.
  const totalSemClassificacao = populacao.filter(
    (c) => c.vinculo !== 'TITULAR' && c.vinculo !== 'DEPENDENTE',
  ).length
  // Vidas com utilização = TODOS os utilizadores distintos no período, mesmo os
  // que não constam no cadastro (carteirinhas órfãs ainda contam como utilização).
  const vidasComUtilizacao = colaboradores.filter((c) => c.utilizou).length
  // Utilizadores que tiveram eventos mas não estão na Base de Vidas (inconsistência).
  const utilizadoresForaDaBase = temBase
    ? colaboradores.filter((c) => c.utilizou && !c.cadastrado).length
    : 0
  // Financeiro: considera TODA a utilização do período (inclusive eventuais
  // carteirinhas sem cadastro na base), para não subestimar o custo.
  const valorTotal = colaboradores.reduce((s, c) => s + c.valorUtilizado, 0)
  const eventosTotal = colaboradores.reduce((s, c) => s + c.eventos, 0)
  const totalComNome = populacao.filter((c) => c.nome).length

  // ---- Distribuições (sobre a população de referência) ----
  function agrupar(
    chaveDe: (c: ColaboradorRow) => string,
    ordenar?: (a: DistribItem, b: DistribItem) => number,
  ): DistribItem[] {
    const m = new Map<string, DistribItem>()
    for (const c of populacao) {
      const k = chaveDe(c)
      const cur = m.get(k) ?? { chave: k, vidas: 0, valor: 0, eventos: 0 }
      cur.vidas += 1
      cur.valor += c.valorUtilizado
      cur.eventos += c.eventos
      m.set(k, cur)
    }
    const arr = [...m.values()]
    arr.sort(ordenar ?? ((a, b) => b.valor - a.valor))
    return arr
  }

  const porFaixaEtaria = agrupar(
    (c) => faixaDaIdade(c.idade),
    (a, b) =>
      ORDEM_FAIXAS_FULL.indexOf(a.chave) - ORDEM_FAIXAS_FULL.indexOf(b.chave),
  )
  const porSexo = agrupar((c) =>
    c.sexo === 'M' ? 'Masculino' : c.sexo === 'F' ? 'Feminino' : 'Não informado',
  )
  const porPlano = agrupar((c) => c.plano ?? 'Não informado')
  const porVinculo = agrupar((c) =>
    c.vinculo === 'TITULAR'
      ? 'Titular'
      : c.vinculo === 'DEPENDENTE'
        ? 'Dependente'
        : 'Não informado',
  )

  return {
    colaboradores,
    totalVidas,
    totalTitulares,
    totalDependentes,
    totalSemClassificacao,
    vidasComUtilizacao,
    vidasSemUtilizacao: Math.max(0, totalVidas - vidasComUtilizacao),
    vidasCadastradas,
    utilizadoresForaDaBase,
    temBaseVidas,
    valorTotal,
    eventosTotal,
    pctUtilizacao: totalVidas ? (vidasComUtilizacao / totalVidas) * 100 : 0,
    custoMedioVidaElegivel: totalVidas ? valorTotal / totalVidas : 0,
    custoMedioVidaUtilizada: vidasComUtilizacao
      ? valorTotal / vidasComUtilizacao
      : 0,
    custoMedioEvento: eventosTotal ? valorTotal / eventosTotal : 0,
    porFaixaEtaria,
    porSexo,
    porPlano,
    porVinculo,
    totalCarteirinhas: totalVidas,
    totalComNome,
    totalSemNome: totalVidas - totalComNome,
    competenciaAtiva,
    competenciasDisponiveis,
    mesesDisponiveis: [...mesesSet].sort(),
    anosDisponiveis: [...anosSet].sort(),
  }
}

// =====================================================================
// Diagnóstico da Base Elegível: identifica beneficiários com utilização
// que NÃO constam na base de vidas elegíveis (divergências), tentando
// reconciliar por Carteirinha → CPF → Nome e classificando o motivo.
// =====================================================================

export type CampoVinculo = 'CARTEIRINHA' | 'CPF' | 'NOME'

export type DivergenciaCodigo =
  | 'CARTEIRINHA_NAO_LOCALIZADA'
  | 'NOME_DIVERGENTE'
  | 'NOME_AMBIGUO'
  | 'SEM_IDENTIFICACAO'

export type DivergenciaRow = {
  carteirinha: string
  nome: string | null
  plano: string | null
  empresa: string | null
  valorUtilizado: number
  eventos: number
  // Campo que permitiu (ou seria usado para) o vínculo com a base elegível.
  campoVinculo: CampoVinculo
  motivoCodigo: DivergenciaCodigo
  motivo: string
  // Sugestão de cadastro correspondente encontrado por outro campo.
  carteirinhaSugerida: string | null
  nomeSugerido: string | null
}

export type DiagnosticoMotivo = {
  codigo: DivergenciaCodigo
  motivo: string
  quantidade: number
  valor: number
}

export type DiagnosticoBase = {
  temBaseVidas: boolean
  // Universo
  totalVidasElegiveis: number
  totalUtilizadores: number
  utilizadoresConciliados: number
  totalDivergencias: number
  // Financeiro
  valorUtilizadoTotal: number
  valorDivergente: number
  eventosDivergentes: number
  // Percentuais de qualidade
  pctConciliacao: number
  pctDivergencia: number
  pctValorDivergente: number
  coberturaNome: number // % de vidas elegíveis com nome preenchido
  coberturaCpf: number // % de vidas elegíveis com CPF preenchido
  reconciliaveisPorNome: number // divergências que batem por nome
  // Detalhe
  divergencias: DivergenciaRow[]
  porMotivo: DiagnosticoMotivo[]
  porCampo: { campo: CampoVinculo; quantidade: number; valor: number }[]
  // Data da última atualização da Base de Vidas Elegíveis (ISO) ou null.
  baseAtualizadaEm: string | null
  // opções de filtro
  mesesDisponiveis: string[]
  anosDisponiveis: string[]
}

// Normaliza um texto para comparação (maiúsculas, sem acentos, espaços colapsados).
function normalizarTexto(v: string | null | undefined): string {
  if (!v) return ''
  return v
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const MOTIVO_LABEL: Record<DivergenciaCodigo, string> = {
  CARTEIRINHA_NAO_LOCALIZADA: 'Carteirinha não localizada na base elegível',
  NOME_DIVERGENTE: 'Carteirinha divergente (nome localizado com outra carteirinha)',
  NOME_AMBIGUO: 'Nome corresponde a mais de um cadastro (ambíguo)',
  SEM_IDENTIFICACAO: 'Sem identificação: carteirinha não localizada e sem nome',
}

export async function getDiagnosticoBase(
  filtros: ColaboradorFiltros = {},
): Promise<DiagnosticoBase> {
  const supabase = await createClient()

  // Usa sempre a competência oficial ativa (a mais recente) como base elegível.
  const competenciaAtiva = (await listarCompetenciasVidas(supabase))[0] ?? null
  const vidasQuery = supabase
    .from('beneficiario_vidas')
    .select('carteirinha, nome, cpf, updated_at')
  if (competenciaAtiva) vidasQuery.eq('competencia', competenciaAtiva)

  const [
    { data: apolicesData },
    { data: subsData },
    { data: nomesData },
    { data: vidasData },
    masterIndex,
  ] = await Promise.all([
    supabase.from('apolices').select('id, numero, cliente'),
    supabase.from('subestipulantes').select('id, codigo, razao_social'),
    supabase.from('beneficiario_nomes').select('carteirinha, nome'),
    vidasQuery,
    loadMasterIndex(supabase),
  ])

  // Data da última atualização da base de vidas elegíveis.
  const baseAtualizadaEm =
    ((vidasData ?? []) as { updated_at: string | null }[]).reduce<string | null>(
      (max, v) => (v.updated_at && (!max || v.updated_at > max) ? v.updated_at : max),
      null,
    )

  const apoliceById = new Map(
    ((apolicesData ?? []) as { id: string; cliente: string | null }[]).map((a) => [
      a.id,
      a,
    ]),
  )
  const subById = new Map(
    ((subsData ?? []) as {
      id: string
      codigo: string
      razao_social: string | null
    }[]).map((s) => [s.id, s]),
  )
  const nomePorCarteirinha = new Map(
    ((nomesData ?? []) as { carteirinha: string; nome: string }[]).map((n) => [
      n.carteirinha.trim(),
      n.nome,
    ]),
  )

  type VidaMini = { carteirinha: string; nome: string | null; cpf: string | null }
  const vidasRaw = ((vidasData ?? []) as VidaMini[]).map((v) => ({
    ...v,
    carteirinha: v.carteirinha.trim(),
  }))
  const temBaseVidas = vidasRaw.length > 0

  // O Cadastro Mestre também compõe a base elegível (amplia a população), mas
  // SÓ com pessoas que ainda não estão na base de vidas. Como a carteirinha do
  // master pode diferir da de vidas embora o CPF/nome casem, deduplicamos por
  // carteirinha, CPF e nome para não inflar a base com registros repetidos.
  const cartVidas = new Set(vidasRaw.map((v) => v.carteirinha))
  const cpfVidas = new Set<string>()
  const nomeVidas = new Set<string>()
  for (const v of vidasRaw) {
    const c = (v.cpf ?? '').replace(/\D/g, '')
    if (c) cpfVidas.add(c)
    if (v.nome) nomeVidas.add(normalizarNome(v.nome))
  }
  const vidasMaster: VidaMini[] = masterNaoRepresentados(masterIndex, {
    carteirinhas: cartVidas,
    cpfs: cpfVidas,
    nomesNorm: nomeVidas,
  }).map((m) => ({
    carteirinha: (m.carteirinha ?? '').trim() || `master:${m.id}`,
    nome: m.nome,
    cpf: m.cpf,
  }))
  const vidas = [...vidasRaw, ...vidasMaster]
  const vidaPorCarteirinha = new Map<string, VidaMini>(
    vidas.map((v) => [v.carteirinha, v]),
  )
  const temBase = temBaseVidas || masterIndex.temMaster

  // Índices de reconciliação (nome/cpf → carteirinhas na base elegível).
  const porNome = new Map<string, VidaMini[]>()
  const porCpf = new Map<string, VidaMini[]>()
  let comNome = 0
  let comCpf = 0
  for (const v of vidas) {
    if (v.nome && v.nome.trim()) {
      comNome++
      const k = normalizarTexto(v.nome)
      if (k) porNome.set(k, [...(porNome.get(k) ?? []), v])
    }
    const cpfDigits = (v.cpf ?? '').replace(/\D/g, '')
    if (cpfDigits) {
      comCpf++
      porCpf.set(cpfDigits, [...(porCpf.get(cpfDigits) ?? []), v])
    }
  }

  // Agrega utilização por carteirinha no período selecionado.
  type Acc = {
    carteirinha: string
    plano: string | null
    empresa: string | null
    valor: number
    eventos: number
  }
  const mapa = new Map<string, Acc>()
  const mesesSet = new Set<string>()
  const anosSet = new Set<string>()

  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('eventos_utilizacao')
      .select(
        'apolice_id, subestipulante_id, cod_usuario, plano, valor_pago, data_pagamento, competencia',
      )
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    for (const e of data as Record<string, unknown>[]) {
      const comp =
        (e.competencia as string) ||
        ((e.data_pagamento as string) ?? '').slice(0, 7)
      const dataRef = (e.data_pagamento as string) ?? null

      if (comp && /^\d{4}-\d{2}$/.test(comp)) {
        mesesSet.add(comp)
        anosSet.add(comp.slice(0, 4))
      }

      if (filtros.mes && comp !== filtros.mes) continue
      if (filtros.ano && comp.slice(0, 4) !== filtros.ano) continue
      if (filtros.de && (!dataRef || dataRef < filtros.de)) continue
      if (filtros.ate && (!dataRef || dataRef > filtros.ate)) continue

      const cart = String(e.cod_usuario ?? '').trim()
      if (!cart) continue

      const ap = e.apolice_id ? apoliceById.get(e.apolice_id as string) : null
      const sub = e.subestipulante_id
        ? subById.get(e.subestipulante_id as string)
        : null
      const empresa = sub?.razao_social ?? ap?.cliente ?? null

      const cur = mapa.get(cart)
      if (cur) {
        cur.valor += Number(e.valor_pago ?? 0)
        cur.eventos += 1
        if (!cur.plano && e.plano) cur.plano = e.plano as string
        if (!cur.empresa && empresa) cur.empresa = empresa
      } else {
        mapa.set(cart, {
          carteirinha: cart,
          plano: (e.plano as string) ?? null,
          empresa,
          valor: Number(e.valor_pago ?? 0),
          eventos: 1,
        })
      }
    }
    if (data.length < PAGE) break
    from += PAGE
  }

  const totalUtilizadores = mapa.size
  let utilizadoresConciliados = 0
  let valorUtilizadoTotal = 0

  const divergencias: DivergenciaRow[] = []
  for (const acc of mapa.values()) {
    valorUtilizadoTotal += acc.valor
    const naBase = vidaPorCarteirinha.has(acc.carteirinha)
    if (naBase) {
      utilizadoresConciliados++
      continue
    }
    // Divergente: tenta reconciliar por nome (utilização não traz CPF).
    const nome = nomePorCarteirinha.get(acc.carteirinha) ?? null
    const chaveNome = normalizarTexto(nome)
    const matchNome = chaveNome ? porNome.get(chaveNome) ?? [] : []

    let campoVinculo: CampoVinculo = 'CARTEIRINHA'
    let motivoCodigo: DivergenciaCodigo = 'CARTEIRINHA_NAO_LOCALIZADA'
    let carteirinhaSugerida: string | null = null
    let nomeSugerido: string | null = null

    if (matchNome.length === 1) {
      campoVinculo = 'NOME'
      motivoCodigo = 'NOME_DIVERGENTE'
      carteirinhaSugerida = matchNome[0].carteirinha
      nomeSugerido = matchNome[0].nome
    } else if (matchNome.length > 1) {
      campoVinculo = 'NOME'
      motivoCodigo = 'NOME_AMBIGUO'
      nomeSugerido = matchNome[0].nome
    } else if (!nome) {
      motivoCodigo = 'SEM_IDENTIFICACAO'
    } else {
      motivoCodigo = 'CARTEIRINHA_NAO_LOCALIZADA'
    }

    divergencias.push({
      carteirinha: acc.carteirinha,
      nome,
      plano: acc.plano,
      empresa: acc.empresa,
      valorUtilizado: acc.valor,
      eventos: acc.eventos,
      campoVinculo,
      motivoCodigo,
      motivo: MOTIVO_LABEL[motivoCodigo],
      carteirinhaSugerida,
      nomeSugerido,
    })
  }

  divergencias.sort((a, b) => b.valorUtilizado - a.valorUtilizado)

  const valorDivergente = divergencias.reduce((s, d) => s + d.valorUtilizado, 0)
  const eventosDivergentes = divergencias.reduce((s, d) => s + d.eventos, 0)
  const reconciliaveisPorNome = divergencias.filter(
    (d) => d.campoVinculo === 'NOME',
  ).length

  // Breakdown por motivo.
  const motivoMap = new Map<DivergenciaCodigo, DiagnosticoMotivo>()
  for (const d of divergencias) {
    const cur =
      motivoMap.get(d.motivoCodigo) ??
      ({
        codigo: d.motivoCodigo,
        motivo: MOTIVO_LABEL[d.motivoCodigo],
        quantidade: 0,
        valor: 0,
      } satisfies DiagnosticoMotivo)
    cur.quantidade += 1
    cur.valor += d.valorUtilizado
    motivoMap.set(d.motivoCodigo, cur)
  }
  const porMotivo = [...motivoMap.values()].sort((a, b) => b.quantidade - a.quantidade)

  // Breakdown por campo de v��nculo.
  const campoMap = new Map<CampoVinculo, { campo: CampoVinculo; quantidade: number; valor: number }>()
  for (const d of divergencias) {
    const cur =
      campoMap.get(d.campoVinculo) ??
      { campo: d.campoVinculo, quantidade: 0, valor: 0 }
    cur.quantidade += 1
    cur.valor += d.valorUtilizado
    campoMap.set(d.campoVinculo, cur)
  }
  const porCampo = [...campoMap.values()].sort((a, b) => b.quantidade - a.quantidade)

  const totalVidasElegiveis = vidaPorCarteirinha.size

  return {
    temBaseVidas: temBase,
    totalVidasElegiveis,
    totalUtilizadores,
    utilizadoresConciliados,
    totalDivergencias: divergencias.length,
    valorUtilizadoTotal,
    valorDivergente,
    eventosDivergentes,
    pctConciliacao: totalUtilizadores
      ? (utilizadoresConciliados / totalUtilizadores) * 100
      : 0,
    pctDivergencia: totalUtilizadores
      ? (divergencias.length / totalUtilizadores) * 100
      : 0,
    pctValorDivergente: valorUtilizadoTotal
      ? (valorDivergente / valorUtilizadoTotal) * 100
      : 0,
    coberturaNome: totalVidasElegiveis
      ? (comNome / totalVidasElegiveis) * 100
      : 0,
    coberturaCpf: totalVidasElegiveis
      ? (comCpf / totalVidasElegiveis) * 100
      : 0,
    reconciliaveisPorNome,
    divergencias,
    porMotivo,
    porCampo,
    baseAtualizadaEm,
    mesesDisponiveis: [...mesesSet].sort(),
    anosDisponiveis: [...anosSet].sort(),
  }
}

// =====================================================================
// Perfil individual do beneficiário (uma carteirinha): dados cadastrais +
// indicadores de utilização + categorias gerenciais (donut) + evolução.
// =====================================================================

export type BeneficiarioPerfil = {
  carteirinha: string
  nome: string | null
  cpf: string | null
  vinculo: VinculoNorm
  tipoBeneficiario: string | null
  sexo: string | null
  idade: number | null
  dataNascimento: string | null
  plano: string | null
  empresa: string | null
  dataAdesao: string | null
  status: string | null
  cadastrado: boolean
  // utilização
  valorTotal: number
  eventosTotal: number
  custoMedioEvento: number
  categoriasGerenciais: {
    nome: string
    valor: number
    pct: number
    eventos: number
  }[]
  evolucaoMensal: { competencia: string; valor: number; eventos: number }[]
  mesesAtivos: number
} | null

export async function getBeneficiarioPerfil(
  carteirinha: string,
): Promise<BeneficiarioPerfil> {
  const cart = carteirinha.trim()
  if (!cart) return null

  const supabase = await createClient()

  const [
    { data: vidaArr },
    { data: nomeArr },
    { data: apolicesData },
    { data: subsData },
    masterIndex,
  ] = await Promise.all([
    supabase
      .from('beneficiario_vidas')
      .select(
        'carteirinha, nome, cpf, tipo, sexo, data_nascimento, plano, empresa, data_adesao, status',
      )
      .eq('carteirinha', cart)
      // Usa a versão mais recente (competência oficial ativa) do cadastro.
      .order('competencia', { ascending: false })
      .limit(1),
    supabase
      .from('beneficiario_nomes')
      .select('nome')
      .eq('carteirinha', cart)
      .limit(1),
    supabase.from('apolices').select('id, cliente'),
    supabase.from('subestipulantes').select('id, razao_social'),
    loadMasterIndex(supabase),
  ])

  const apoliceById = new Map(
    ((apolicesData ?? []) as { id: string; cliente: string | null }[]).map(
      (a) => [a.id, a],
    ),
  )
  const subById = new Map(
    ((subsData ?? []) as { id: string; razao_social: string | null }[]).map(
      (s) => [s.id, s],
    ),
  )

  const vida = (vidaArr?.[0] as VidaCadastro | undefined) ?? null
  const nomeFallback = (nomeArr?.[0] as { nome: string } | undefined)?.nome
  // Cadastro Mestre (maior precedência): resolve por carteirinha -> CPF -> nome.
  const master = masterIndex.resolve({
    carteirinha: cart,
    cpf: vida?.cpf ?? null,
    nomeNorm: vida?.nome ? normalizarNome(vida.nome) : null,
  })

  // Agrega TODOS os eventos da carteirinha (acumulado histórico).
  const catMap = new Map<string, { valor: number; eventos: number }>()
  const mesMap = new Map<string, { valor: number; eventos: number }>()
  let valorTotal = 0
  let eventosTotal = 0
  // Preferimos os valores legíveis da utilização; caímos no cadastro depois.
  let planoUtil: string | null = null
  let tipoUtil: string | null = null
  let empresaUtil: string | null = null
  let sexoUtil: string | null = null

  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('eventos_utilizacao')
      .select(
        'valor_pago, competencia, data_pagamento, plano, tipo_beneficiario, sexo, apolice_id, subestipulante_id, servico_principal, servico, grupo_estatistico, categoria_atendimento, internacao, saude_mental',
      )
      .eq('cod_usuario', cart)
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    for (const e of data as Record<string, unknown>[]) {
      const valor = Number(e.valor_pago ?? 0)
      valorTotal += valor
      eventosTotal += 1
      if (!planoUtil) planoUtil = coalesceStr(e.plano as string)
      if (!tipoUtil) tipoUtil = coalesceStr(e.tipo_beneficiario as string)
      if (!sexoUtil) sexoUtil = coalesceStr(e.sexo as string)
      if (!empresaUtil) {
        const ap = e.apolice_id
          ? apoliceById.get(e.apolice_id as string)
          : null
        const sub = e.subestipulante_id
          ? subById.get(e.subestipulante_id as string)
          : null
        empresaUtil = coalesceStr(sub?.razao_social, ap?.cliente)
      }

      const comp =
        (e.competencia as string) ||
        ((e.data_pagamento as string) ?? '').slice(0, 7)
      if (comp && /^\d{4}-\d{2}$/.test(comp)) {
        const mm = mesMap.get(comp) ?? { valor: 0, eventos: 0 }
        mm.valor += valor
        mm.eventos += 1
        mesMap.set(comp, mm)
      }

      const cat = classificarEvento({
        servicoPrincipal: (e.servico_principal as string | null) ?? null,
        servico: (e.servico as string | null) ?? null,
        grupoEstatistico: (e.grupo_estatistico as string | null) ?? null,
        categoriaAtendimento: (e.categoria_atendimento as string | null) ?? null,
        internacao: (e.internacao as boolean | null) ?? null,
        saudeMental: (e.saude_mental as boolean | null) ?? null,
      })
      const c = catMap.get(cat) ?? { valor: 0, eventos: 0 }
      c.valor += valor
      c.eventos += 1
      catMap.set(cat, c)
    }
    if (data.length < PAGE) break
    from += PAGE
  }

  // Se não há cadastro (mestre ou vidas) nem utilização, a carteirinha não existe.
  if (!master && !vida && eventosTotal === 0 && !nomeFallback) return null

  const categoriasGerenciais = [...catMap.entries()]
    .map(([nome, v]) => ({
      nome,
      valor: v.valor,
      eventos: v.eventos,
      pct: valorTotal ? (v.valor / valorTotal) * 100 : 0,
    }))
    .sort((a, b) => b.valor - a.valor)

  const evolucaoMensal = [...mesMap.entries()]
    .map(([competencia, v]) => ({
      competencia,
      valor: v.valor,
      eventos: v.eventos,
    }))
    .sort((a, b) => a.competencia.localeCompare(b.competencia))

  // Fonte consolidada com precedência master -> vidas -> eventos.
  const tipoFinal = coalesceStr(master?.tipo, vida?.tipo, tipoUtil)
  return {
    carteirinha: cart,
    nome: coalesceStr(master?.nome, vida?.nome, nomeFallback),
    cpf: coalesceStr(master?.cpf, vida?.cpf),
    vinculo: normalizarVinculo(tipoFinal),
    tipoBeneficiario: tipoFinal,
    sexo: coalesceStr(master?.sexo, vida?.sexo, sexoUtil),
    idade: calcularIdade(
      coalesceStr(master?.dataNascimento, vida?.data_nascimento),
    ),
    dataNascimento: coalesceStr(master?.dataNascimento, vida?.data_nascimento),
    // Plano/empresa: prefere o valor legível (utilização/vida) ao código do master.
    plano: coalesceStr(planoUtil, vida?.plano, master?.plano),
    empresa: coalesceStr(empresaUtil, vida?.empresa, master?.empresa),
    dataAdesao: coalesceStr(master?.dataAdesao, vida?.data_adesao),
    status:
      coalesceStr(master?.status, vida?.status) ??
      (eventosTotal > 0 ? 'ATIVO' : null),
    cadastrado: !!master || !!vida,
    valorTotal,
    eventosTotal,
    custoMedioEvento: eventosTotal ? valorTotal / eventosTotal : 0,
    categoriasGerenciais,
    evolucaoMensal,
    mesesAtivos: mesMap.size,
  }
}

// =====================================================================
// Qualidade cadastral da base de beneficiários
//
// Mede a completude dos campos cadastrais da Base de Vidas Elegíveis
// (competência oficial ativa). Para os campos que também existem na
// utilização (sexo, empresa, plano, tipo), reporta dois números:
//   - pctCadastro: preenchido apenas na base cadastral (dado bruto)
//   - pct: preenchido após consolidar com a utilização (dado disponível)
// Assim fica explícito o quanto a base depende da utilização para exibir
// os dados na tela. Não altera nenhuma regra de negócio.
// =====================================================================

export type QualidadeCampo = {
  chave: string
  label: string
  preenchidos: number // consolidado (cadastro + utilização)
  pct: number // consolidado
  pctCadastro: number // apenas beneficiario_vidas
  temFallbackUtilizacao: boolean
}

export type QualidadeCadastral = {
  temBaseVidas: boolean
  total: number // total de beneficiários (população de referência)
  competenciaAtiva: string | null
  campos: QualidadeCampo[]
}

export async function getQualidadeCadastral(): Promise<QualidadeCadastral> {
  const supabase = await createClient()

  const competenciasDisponiveis = await listarCompetenciasVidas(supabase)
  const competenciaAtiva = competenciasDisponiveis[0] ?? null

  const vidasQuery = supabase
    .from('beneficiario_vidas')
    .select(
      'carteirinha, cpf, tipo, sexo, data_nascimento, plano, empresa, data_adesao',
    )
  if (competenciaAtiva) vidasQuery.eq('competencia', competenciaAtiva)

  const [
    { data: apolicesData },
    { data: subsData },
    { data: vidasData },
    masterIndex,
  ] = await Promise.all([
    supabase.from('apolices').select('id, cliente'),
    supabase.from('subestipulantes').select('id, razao_social'),
    vidasQuery,
    loadMasterIndex(supabase),
  ])

  const apoliceById = new Map(
    ((apolicesData ?? []) as { id: string; cliente: string | null }[]).map(
      (a) => [a.id, a],
    ),
  )
  const subById = new Map(
    ((subsData ?? []) as { id: string; razao_social: string | null }[]).map(
      (s) => [s.id, s],
    ),
  )

  type VidaQ = {
    carteirinha: string
    cpf: string | null
    tipo: string | null
    sexo: string | null
    data_nascimento: string | null
    plano: string | null
    empresa: string | null
    data_adesao: string | null
  }
  const vidas = ((vidasData ?? []) as VidaQ[]).map((v) => ({
    ...v,
    carteirinha: (v.carteirinha ?? '').trim(),
  }))
  const vidaPorCarteirinha = new Map(vidas.map((v) => [v.carteirinha, v]))
  const temBaseVidas = vidaPorCarteirinha.size > 0

  // Disponibilidade dos campos via utilização (primeiro valor não vazio).
  type Util = {
    sexo: string | null
    plano: string | null
    tipo: string | null
    empresa: string | null
  }
  const utilPorCarteirinha = new Map<string, Util>()
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('eventos_utilizacao')
      .select(
        'cod_usuario, sexo, plano, tipo_beneficiario, apolice_id, subestipulante_id',
      )
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    for (const e of data as Record<string, unknown>[]) {
      const cart = String(e.cod_usuario ?? '').trim()
      if (!cart) continue
      const cur = utilPorCarteirinha.get(cart) ?? {
        sexo: null,
        plano: null,
        tipo: null,
        empresa: null,
      }
      if (!cur.sexo) cur.sexo = coalesceStr(e.sexo as string)
      if (!cur.plano) cur.plano = coalesceStr(e.plano as string)
      if (!cur.tipo) cur.tipo = coalesceStr(e.tipo_beneficiario as string)
      if (!cur.empresa) {
        const ap = e.apolice_id
          ? apoliceById.get(e.apolice_id as string)
          : null
        const sub = e.subestipulante_id
          ? subById.get(e.subestipulante_id as string)
          : null
        cur.empresa = coalesceStr(sub?.razao_social, ap?.cliente)
      }
      utilPorCarteirinha.set(cart, cur)
    }
    if (data.length < PAGE) break
    from += PAGE
  }

  // População de referência: base de vidas ∪ pessoas que existem SÓ no Cadastro
  // Mestre. A carteirinha do master pode diferir da de vidas/eventos mas casar
  // por CPF; por isso deduplicamos por carteirinha/CPF (evita contagem dupla)
  // em vez de adicionar todas as carteirinhas do master ao universo.
  const cartConhecidas = new Set<string>(vidaPorCarteirinha.keys())
  const cpfConhecidos = new Set<string>()
  for (const v of vidaPorCarteirinha.values()) {
    const c = (v.cpf ?? '').replace(/\D/g, '')
    if (c) cpfConhecidos.add(c)
  }
  const sinteticoPorChave = new Map<string, MasterCadastro>()
  for (const m of masterNaoRepresentados(masterIndex, {
    carteirinhas: cartConhecidas,
    cpfs: cpfConhecidos,
  })) {
    sinteticoPorChave.set(`master:${m.id}`, m)
  }
  const temBase = temBaseVidas || masterIndex.temMaster
  const universo = temBase
    ? [
        ...new Set<string>([
          ...vidaPorCarteirinha.keys(),
          ...sinteticoPorChave.keys(),
        ]),
      ]
    : [...utilPorCarteirinha.keys()]
  const total = universo.length

  // Definição dos campos e de onde cada um pode ser obtido. "cadastro" agora
  // consolida Cadastro Mestre (maior precedência) + Base de Vidas.
  const defs: {
    chave: string
    label: string
    fallback: boolean
    master: (m: MasterCadastro | null) => string | null | undefined
    cadastro: (v: VidaQ | undefined) => string | null | undefined
    util: (u: Util | undefined) => string | null | undefined
  }[] = [
    {
      chave: 'cpf',
      label: 'CPF',
      fallback: false,
      master: (m) => m?.cpf,
      cadastro: (v) => v?.cpf,
      util: () => null,
    },
    {
      chave: 'sexo',
      label: 'Sexo',
      fallback: true,
      master: (m) => m?.sexo,
      cadastro: (v) => v?.sexo,
      util: (u) => u?.sexo,
    },
    {
      chave: 'data_nascimento',
      label: 'Data de nascimento',
      fallback: false,
      master: (m) => m?.dataNascimento,
      cadastro: (v) => v?.data_nascimento,
      util: () => null,
    },
    {
      chave: 'empresa',
      label: 'Empresa',
      fallback: true,
      master: (m) => m?.empresa,
      cadastro: (v) => v?.empresa,
      util: (u) => u?.empresa,
    },
    {
      chave: 'plano',
      label: 'Plano',
      fallback: true,
      master: (m) => m?.plano,
      cadastro: (v) => v?.plano,
      util: (u) => u?.plano,
    },
    {
      chave: 'tipo',
      label: 'Tipo (titular/dependente)',
      fallback: true,
      master: (m) => m?.tipo,
      cadastro: (v) => v?.tipo,
      util: (u) => u?.tipo,
    },
    {
      chave: 'data_adesao',
      label: 'Data de adesão',
      fallback: false,
      master: (m) => m?.dataAdesao,
      cadastro: (v) => v?.data_adesao,
      util: () => null,
    },
    {
      chave: 'data_admissao',
      label: 'Data de admissão',
      fallback: false,
      master: (m) => m?.dataAdmissao,
      cadastro: () => null,
      util: () => null,
    },
    {
      chave: 'email',
      label: 'E-mail',
      fallback: false,
      master: (m) => m?.email,
      cadastro: () => null,
      util: () => null,
    },
    {
      chave: 'telefone',
      label: 'Telefone',
      fallback: false,
      master: (m) => m?.telefone,
      cadastro: () => null,
      util: () => null,
    },
  ]

  const campos: QualidadeCampo[] = defs.map((d) => {
    let cadastro = 0
    let consolidado = 0
    for (const cart of universo) {
      const sintetico = sinteticoPorChave.get(cart)
      const v = sintetico ? undefined : vidaPorCarteirinha.get(cart)
      const u = sintetico ? undefined : utilPorCarteirinha.get(cart)
      const m: MasterCadastro | null =
        sintetico ??
        masterIndex.resolve({
          carteirinha: cart,
          cpf: v?.cpf ?? null,
          nomeNorm: null,
        }) ??
        null
      const temCadastro =
        coalesceStr(d.master(m)) != null || coalesceStr(d.cadastro(v)) != null
      const temConsolidado = temCadastro || coalesceStr(d.util(u)) != null
      if (temCadastro) cadastro++
      if (temConsolidado) consolidado++
    }
    return {
      chave: d.chave,
      label: d.label,
      preenchidos: consolidado,
      pct: total ? (consolidado / total) * 100 : 0,
      pctCadastro: total ? (cadastro / total) * 100 : 0,
      temFallbackUtilizacao: d.fallback,
    }
  })

  return { temBaseVidas: temBase, total, competenciaAtiva, campos }
}
