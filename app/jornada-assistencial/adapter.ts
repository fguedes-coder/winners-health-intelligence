// ===========================================================================
// Jornada Assistencial — adaptador de dados reais (server-safe / puro)
//
// Converte os eventos de utilização reais (Supabase) no view-model usado pela
// tela de Jornada Assistencial. Reutiliza integralmente:
//   • resumirRadar()          -> score/faixa canônicos do Radar de Risco
//   • getBeneficiaryPanorama() -> visão clínica/financeira/estratégica
// Nenhuma regra de risco é recalculada aqui: apenas mapeamos o que o Radar e o
// Panorama já produzem para as estruturas visuais existentes.
// ===========================================================================

import type { EventoDetalhado } from '@/lib/queries'
import { resumirRadar, type ResumoRadar } from '@/lib/radar-agg'
import {
  getBeneficiaryPanorama,
  type GrupoUtilizacao,
} from '@/lib/beneficiary-panorama'
import { classificarImpacto, LIMIARES, type FaixaRisco } from '@/lib/risco'
import {
  Beneficiario,
  BeneficiarioResumo,
  CategoriaCusto,
  EventoJornada,
  JornadaKpis,
  Risco,
  TipoEvento,
} from './mock-data'
import type { CategoriaGerencial } from '@/lib/categorias'

// --- Mapeamentos de apoio ---------------------------------------------------

const FAIXA_RISCO: Record<FaixaRisco, Risco> = {
  baixo: 'Baixo',
  moderado: 'Moderado',
  alto: 'Alto',
  critico: 'Crítico',
}

// Cor por grupo de utilização (donut de categorias) — paleta do tema.
const COR_GRUPO: Record<GrupoUtilizacao, string> = {
  Internações: 'oklch(0.62 0.2 25)',
  'Pronto-Socorro': 'oklch(0.55 0.19 300)',
  Consultas: 'oklch(0.58 0.2 256)',
  Exames: 'oklch(0.7 0.16 55)',
  'Saúde Mental': 'oklch(0.68 0.15 150)',
  'Demais Utilizações': 'oklch(0.6 0.02 260)',
}

// Categoria gerencial -> tipo de evento (controla ícone/cor da timeline).
const CATEGORIA_TIPO: Record<CategoriaGerencial, TipoEvento> = {
  Internações: 'Internação',
  'Pronto-Socorro': 'Pronto Socorro',
  Consultas: 'Consulta',
  Exames: 'Exame',
  'Saúde Mental': 'Consulta',
  Procedimentos: 'Consulta',
  Terapias: 'Consulta',
  'Maternidade / Pré-Natal': 'Consulta',
  Medicamentos: 'Consulta',
  Materiais: 'Consulta',
  'Taxas Hospitalares': 'Internação',
  'Demais Utilizações': 'Consulta',
}

// --- Formatadores -----------------------------------------------------------

function iniciaisDe(label: string): string {
  const limpo = label.trim()
  if (!limpo) return '--'
  // Carteirinha numérica -> dois primeiros dígitos.
  if (/^\d+$/.test(limpo)) return limpo.slice(0, 2)
  const partes = limpo.split(/\s+/).filter(Boolean)
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

function sexoLabel(sexo: string | null): string {
  const s = (sexo ?? '').trim().toUpperCase()
  if (s.startsWith('M')) return 'Masculino'
  if (s.startsWith('F')) return 'Feminino'
  return '—'
}

// "2026-01-12" -> "12/01/2026"; "2026-01" -> "01/2026".
function dataBR(iso: string | null): string {
  if (!iso) return '—'
  const d = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (d) return `${d[3]}/${d[2]}/${d[1]}`
  const c = iso.match(/^(\d{4})-(\d{2})$/)
  if (c) return `${c[2]}/${c[1]}`
  return iso
}

// Texto relativo ("Há 2 meses") a partir de uma data ISO.
function haTexto(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 7 ? `${iso}-01` : iso)
  if (Number.isNaN(d.getTime())) return '—'
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (dias <= 0) return 'Recente'
  if (dias < 7) return `Há ${dias} dia${dias > 1 ? 's' : ''}`
  if (dias < 30) {
    const s = Math.floor(dias / 7)
    return `Há ${s} semana${s > 1 ? 's' : ''}`
  }
  if (dias < 365) {
    const m = Math.floor(dias / 30)
    return `Há ${m} ${m > 1 ? 'meses' : 'mês'}`
  }
  const a = Math.floor(dias / 365)
  return `Há ${a} ano${a > 1 ? 's' : ''}`
}

// --- Competências (seletor de meses) ----------------------------------------

// "2026-01" -> "01/2026".
export function competenciaLabel(comp: string): string {
  const m = comp.match(/^(\d{4})-(\d{2})$/)
  return m ? `${m[2]}/${m[1]}` : comp
}

// Lista de competências (YYYY-MM) presentes nos eventos, da mais recente
// para a mais antiga.
export function listarCompetencias(eventos: EventoDetalhado[]): string[] {
  const set = new Set<string>()
  for (const e of eventos) if (e.competencia) set.add(e.competencia)
  return [...set].sort((a, b) => b.localeCompare(a))
}

// Filtra eventos pelas competências selecionadas (vazio = todas).
export function filtrarPorCompetencias(
  eventos: EventoDetalhado[],
  competencias: string[],
): EventoDetalhado[] {
  if (competencias.length === 0) return eventos
  const alvo = new Set(competencias)
  return eventos.filter((e) => e.competencia && alvo.has(e.competencia))
}

// --- Resumo da carteira (KPIs + lista) --------------------------------------

export type JornadaResumo = {
  kpis: JornadaKpis
  lista: BeneficiarioResumo[]
  competenciaAtual: string
}

// Constrói KPIs e lista de beneficiários a partir do resumo canônico do Radar.
// `anonimizado` reutiliza o mesmo esquema LGPD do Radar (RISCO-001, ...).
export function resumirJornada(
  eventos: EventoDetalhado[],
  anonimizado = false,
): JornadaResumo {
  // topN alto para trazer TODA a carteira classificada com o score do Radar.
  const radar: ResumoRadar = resumirRadar(eventos, {
    topN: Number.MAX_SAFE_INTEGER,
    modo: anonimizado ? 'anonimizado' : 'nominal',
  })

  const lista: BeneficiarioResumo[] = radar.top.map((t) => {
    // Anonimizado → rótulo LGPD (RISCO-xxx). Nominal → nome real, caindo para
    // a carteirinha apenas quando o beneficiário ainda não tem nome cadastrado.
    const label = anonimizado ? t.display : (t.nome ?? t.carteirinha)
    return {
      id: t.carteirinha,
      nome: label,
      iniciais: iniciaisDe(label),
      carteirinha: t.carteirinha,
      risco: FAIXA_RISCO[t.faixa],
      custo: t.valorTotal,
      eventos: t.eventos,
      score: t.score,
    }
  })

  // Passe único para métricas que o resumo do Radar não expõe por vida
  // (reinternações e crescimento acelerado), usando os mesmos limiares.
  const internacoesPorBenef = new Map<string, number>()
  const compPorBenef = new Map<string, Map<string, number>>()
  let ultimaComp = ''
  for (const e of eventos) {
    if (e.internacao) {
      internacoesPorBenef.set(
        e.beneficiario,
        (internacoesPorBenef.get(e.beneficiario) ?? 0) + 1,
      )
    }
    if (e.competencia) {
      if (e.competencia > ultimaComp) ultimaComp = e.competencia
      let comps = compPorBenef.get(e.beneficiario)
      if (!comps) {
        comps = new Map()
        compPorBenef.set(e.beneficiario, comps)
      }
      comps.set(e.competencia, (comps.get(e.competencia) ?? 0) + e.valorPago)
    }
  }

  let reinternacoes = 0
  for (const n of internacoesPorBenef.values()) if (n >= 2) reinternacoes++

  let crescimento = 0
  for (const comps of compPorBenef.values()) {
    const ord = [...comps.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    if (ord.length >= 2) {
      const anterior = ord[ord.length - 2][1]
      const atual = ord[ord.length - 1][1]
      if (anterior > 0 && atual / anterior - 1 > LIMIARES.crescimentoCusto)
        crescimento++
    }
  }

  let altoCusto = 0
  for (const t of radar.top) {
    const impacto = classificarImpacto(t.participacaoPct)
    if (impacto === 'alto' || impacto === 'critico') altoCusto++
  }

  const kpis: JornadaKpis = {
    total: radar.total,
    criticas: radar.contagem.critico,
    reinternacoes,
    altoCusto,
    crescimento,
  }

  const competenciaAtual = ultimaComp
    ? `${ultimaComp.slice(5, 7)}/${ultimaComp.slice(0, 4)}`
    : '—'

  return { kpis, lista, competenciaAtual }
}

// --- Detalhe do beneficiário ------------------------------------------------

// Constrói o view-model completo do beneficiário selecionado a partir do
// Panorama (que já consolida timeline, custos, prestadores, score e análise).
export function construirBeneficiario(
  eventos: EventoDetalhado[],
  carteirinha: string,
  opts: { anonimizado?: boolean; displayLabel?: string } = {},
): Beneficiario | null {
  const p = getBeneficiaryPanorama(eventos, carteirinha)
  if (!p.encontrado) return null

  // Rótulo LGPD: no modo anonimizado usamos o identificador anônimo já
  // atribuído pelo resumo da carteira (RISCO-001, ...); caso contrário, o nome
  // real, caindo para a carteirinha só quando ainda não há nome cadastrado.
  const nome = opts.anonimizado
    ? (opts.displayLabel ?? p.carteirinha)
    : (p.nome ?? p.carteirinha)

  // Timeline: achata os atendimentos de todos os grupos, ordena por data e
  // classifica internações recorrentes como reinternação.
  const atendimentos = p.grupos
    .flatMap((g) => g.atendimentos)
    .sort((a, b) =>
      (a.data ?? a.competencia ?? '').localeCompare(b.data ?? b.competencia ?? ''),
    )

  let internCount = 0
  const timeline: EventoJornada[] = atendimentos.map((a) => {
    const isInternacao = a.internacao
    if (isInternacao) internCount++
    const reinternacao = isInternacao && internCount >= 2
    const tipo: TipoEvento = reinternacao
      ? 'Reinternação'
      : CATEGORIA_TIPO[a.categoria]
    return {
      data: dataBR(a.data ?? a.competencia),
      tipo,
      titulo: reinternacao ? 'Reinternação' : a.categoria,
      descricao: a.procedimento,
      prestador: a.prestador ?? 'Prestador não informado',
      valor: a.valor,
      destaque: reinternacao
        ? 'reinternacao'
        : isInternacao
          ? 'internacao'
          : undefined,
    }
  })

  const prestadoresDistintos = new Set(
    atendimentos.map((a) => (a.prestador ?? '').trim() || 'Prestador não informado'),
  ).size

  const datas = atendimentos
    .map((a) => a.data ?? a.competencia)
    .filter((d): d is string => Boolean(d))
    .sort((a, b) => a.localeCompare(b))
  const primeiro = datas[0] ?? null
  const ultimo = datas[datas.length - 1] ?? null

  const categorias: CategoriaCusto[] = p.perfilUtilizacao.map((g) => ({
    nome: g.grupo,
    pct: g.pctValor,
    valor: g.valor,
    cor: COR_GRUPO[g.grupo],
  }))

  const sinais =
    p.analise.alertas.length > 0
      ? p.analise.alertas.map((a) => a.titulo)
      : p.analise.fatores.map((f) => f.label)

  const fatoresRisco =
    p.analise.fatores.length > 0
      ? p.analise.fatores.map((f) => f.label)
      : ['Sem fatores de risco relevantes']

  const narrativa = [
    p.analise.insight,
    p.analise.padraoUtilizacao,
    p.analise.evolucaoCusto,
    p.analise.riscoContinuidade,
  ]
    .filter(Boolean)
    .join(' ')

  return {
    id: p.carteirinha,
    nome,
    iniciais: iniciaisDe(nome),
    carteirinha: p.carteirinha,
    risco: FAIXA_RISCO[p.kpis.faixa],
    custo: p.kpis.valorTotal,
    eventos: p.kpis.eventos,
    sexo: sexoLabel(p.sexo),
    idade: p.idade ?? 0,
    plano: p.plano ?? '—',
    tipo: p.tipoLabel,
    score: p.kpis.score,
    impactoFinanceiro: p.kpis.valorTotal,
    pctCarteira: p.kpis.participacaoPct,
    primeiroEvento: dataBR(primeiro),
    primeiroEventoHa: haTexto(primeiro),
    ultimoEvento: dataBR(ultimo),
    ultimoEventoHa: haTexto(ultimo),
    totalEventos: p.kpis.eventos,
    prestadoresUtilizados: prestadoresDistintos,
    timeline,
    evolucaoCustos: p.timeline.map((t) => ({ mes: t.mes, valor: t.valor })),
    categorias,
    sinais,
    narrativa,
    fatoresRisco,
    prestadores: p.prestadores.map((pr) => ({
      nome: pr.nome,
      atendimentos: pr.eventos,
      valor: pr.valor,
    })),
  }
}
