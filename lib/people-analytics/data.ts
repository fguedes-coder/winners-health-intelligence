import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getEventosDetalhados } from '@/lib/queries'
import { resumirRadar } from '@/lib/radar-agg'
import { normalizarNome, type RhColaborador } from './rh'
import {
  analisarPeople,
  type AnalisePeople,
  type VidaSaude,
} from './analise'

export type ImportacaoRh = {
  id: string
  arquivo_nome: string
  total_colaboradores: number
  total_aptos: number
  okr_medio: number
  similaridade_min: number
  ativo: boolean
  created_at: string
}

// Retorna o lote de importação RH ativo (o mais recente marcado como ativo).
export async function getImportacaoAtiva(): Promise<ImportacaoRh | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('rh_importacoes')
    .select('*')
    .eq('ativo', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as ImportacaoRh | null) ?? null
}

// Lista todas as importações (histórico, para a tela de importação).
export async function listarImportacoes(): Promise<ImportacaoRh[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('rh_importacoes')
    .select('*')
    .order('created_at', { ascending: false })
  return (data as ImportacaoRh[] | null) ?? []
}

// Carrega os colaboradores de um lote e normaliza para o núcleo de análise.
async function getColaboradoresRh(importacaoId: string): Promise<RhColaborador[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('rh_colaboradores')
    .select('*')
    .eq('importacao_id', importacaoId)
    .order('nome', { ascending: true })
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    nome: String(r.nome ?? ''),
    nomeNormalizado: String(r.nome_normalizado ?? normalizarNome(String(r.nome ?? ''))),
    status: (r.status as string) ?? null,
    okr: r.okr == null ? null : Number(r.okr),
    satisfacao: (r.satisfacao as string) ?? null,
    satisfacaoPct: r.satisfacao_pct == null ? null : Number(r.satisfacao_pct),
    profit: (r.profit as string) ?? null,
    profitPct: r.profit_pct == null ? null : Number(r.profit_pct),
    processo: (r.processo as string) ?? null,
    processoPct: r.processo_pct == null ? null : Number(r.processo_pct),
    cotacao: (r.cotacao as string) ?? null,
    cotacaoPct: r.cotacao_pct == null ? null : Number(r.cotacao_pct),
    cpf: (r.cpf as string) ?? null,
    matricula: (r.matricula as string) ?? null,
    cargo: (r.cargo as string) ?? null,
    area: (r.area as string) ?? null,
    gestor: (r.gestor as string) ?? null,
  }))
}

// Deriva o índice da base assistencial (todas as vidas) a partir dos eventos.
export async function getVidasSaude(): Promise<VidaSaude[]> {
  const eventos = await getEventosDetalhados()
  if (eventos.length === 0) return []
  // topN alto => todas as vidas no ranking; modo nominal para expor o nome real
  // (a anonimização do módulo é aplicada depois, sobre o colaborador RH).
  const resumo = resumirRadar(eventos, { topN: 100000, modo: 'nominal' })
  return resumo.top
    .filter((t) => t.nome && t.nome.trim())
    .map((t) => ({
      carteirinha: t.carteirinha,
      nome: t.nome as string,
      nomeNormalizado: normalizarNome(t.nome),
      valorTotal: t.valorTotal,
      score: t.score,
      faixa: t.faixa,
      participacaoPct: t.participacaoPct,
    }))
}

export type PeopleResult = {
  analise: AnalisePeople | null
  importacao: ImportacaoRh | null
  totalVidasSaude: number
}

// Loader completo do módulo People Analytics para um dado modo de privacidade.
export async function loadPeopleAnalytics(
  opts: { modo?: 'nominal' | 'anonimizado' } = {},
): Promise<PeopleResult> {
  const importacao = await getImportacaoAtiva()
  const vidas = await getVidasSaude()
  if (!importacao) {
    return { analise: null, importacao: null, totalVidasSaude: vidas.length }
  }
  const colaboradores = await getColaboradoresRh(importacao.id)
  const analise = analisarPeople(colaboradores, vidas, {
    similaridadeMin: Number(importacao.similaridade_min ?? 0.85),
    modo: opts.modo ?? 'nominal',
    arquivoNome: importacao.arquivo_nome,
  })
  return { analise, importacao, totalVidasSaude: vidas.length }
}

const moeda = (v: number) =>
  v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })

// Narrativa Executiva CEO — texto determinístico (sem IA), reproduzível a
// partir dos números do cruzamento. Retorna parágrafos prontos para render.
export function gerarNarrativaCeo(analise: AnalisePeople): string[] {
  const c = analise.cards
  if (c.importados === 0) return []

  const paras: string[] = []

  // Concentração de custo: % do custo nos 12% de maior custo entre vinculados.
  const vinculados = analise.colaboradores
    .filter((x) => x.custoSaude != null)
    .sort((a, b) => (b.custoSaude ?? 0) - (a.custoSaude ?? 0))
  const topN = Math.max(1, Math.round(vinculados.length * 0.12))
  const custoTop = vinculados.slice(0, topN).reduce((s, x) => s + (x.custoSaude ?? 0), 0)
  const pctConc = c.custoTotal > 0 ? (custoTop / c.custoTotal) * 100 : 0
  const pctTopVidas = vinculados.length > 0 ? (topN / vinculados.length) * 100 : 0

  paras.push(
    `Dos ${c.importados} colaboradores importados, ${c.vinculados} foram vinculados à base assistencial ` +
      `(${c.pctMatching.toFixed(1)}% de matching). O OKR médio da população é de ${(c.okrMedio * 100).toFixed(2)}% ` +
      `e o custo assistencial total dos vinculados soma ${moeda(c.custoTotal)}, ` +
      `com custo médio de ${moeda(c.custoMedio)} por colaborador.`,
  )

  paras.push(
    `Observa-se concentração de ${pctConc.toFixed(0)}% dos custos assistenciais em apenas ` +
      `${pctTopVidas.toFixed(0)}% dos colaboradores vinculados, indicando forte dependência de poucos casos de alto custo. ` +
      `O Índice WHI médio da carteira é ${c.whiMedio}, na faixa ` +
      `${c.whiMedio >= 80 ? 'Estratégica' : c.whiMedio >= 60 ? 'Estável' : c.whiMedio >= 40 ? 'de Atenção' : 'Crítica'}.`,
  )

  const criticos = analise.quadrantes.find((q) => q.quadrante === 'alto_custo_baixo_okr')
  if (criticos && criticos.vidas > 0) {
    paras.push(
      `Foram identificados ${criticos.vidas} colaboradores com elevado custo assistencial associado a baixo desempenho ` +
        `(${criticos.pct.toFixed(0)}% dos vinculados, ${moeda(criticos.custoTotal)} em custo), ` +
        `representando oportunidades de revisão estratégica e acompanhamento direcionado.`,
    )
  }

  const talentos = analise.quadrantes.find((q) => q.quadrante === 'alto_custo_alto_okr')
  if (talentos && talentos.vidas > 0) {
    paras.push(
      `Em contrapartida, ${talentos.vidas} colaboradores de alto desempenho concentram custo elevado ` +
        `(${moeda(talentos.custoTotal)}) — perfis estratégicos que demandam retenção e cuidado assistencial preventivo.`,
    )
  }

  return paras
}
